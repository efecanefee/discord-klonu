using DiscordClone.Api.Hubs;
using DiscordClone.Api.Data;
using DiscordClone.Api.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using Resend;
using Microsoft.Extensions.DependencyInjection;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.UseUrls("http://0.0.0.0:" + (Environment.GetEnvironmentVariable("PORT") ?? "5098"));

builder.Services.AddOpenApi();
builder.Services.AddControllers(); // REST API Controller'larını ekliyoruz (AuthController için)
builder.Services.AddSignalR();
builder.Services.AddHttpClient(); // Dosya yüklemede Supabase Storage'a istek için

// Email & Resend
builder.Services.AddResend(options =>
{
    options.ApiToken = builder.Configuration["Resend:ApiKey"] ?? "re_fallback";
});
builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddScoped<IRoomAuthorizationService, RoomAuthorizationService>();

// JWT Kimlik Doğrulama Konfigürasyonu
var jwtKey = builder.Configuration["Jwt:Key"] ?? "SuperSecretKey123!_DiscordClone_UpdatedForForceLogout_2026";
var key = Encoding.ASCII.GetBytes(jwtKey);

builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = false; // Geliştirme ortamında false, production'da true olmalı
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(key),
        ValidateIssuer = false,
        ValidateAudience = false,
        ValidateLifetime = true,
        ClockSkew = TimeSpan.Zero
    };

    // SignalR'ın URL Query parametresinden (access_token) JWT'yi alması için özel event:
    options.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            var accessToken = context.Request.Query["access_token"];
            var path = context.HttpContext.Request.Path;
            if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/hub/chat"))
            {
                context.Token = accessToken;
            }
            return Task.CompletedTask;
        }
    };
});

// PostgreSQL — Supabase
var rawConnectionString = Environment.GetEnvironmentVariable("DATABASE_URL")
    ?? throw new Exception("DATABASE_URL environment variable eksik!");

// Supabase bazen URI formatında bağlantı dizisi verir (postgresql://user:pass@host:port/db?params)
// Npgsql bilinmeyen URI parametrelerini (ör. "no ipv6") kaldıramaz, bu yüzden
// URI'ı manuel ayrıştırıp Npgsql'nin anlayacağı Key=Value formatına çeviriyoruz.
string npgsqlConnectionString;
if (rawConnectionString.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase) ||
    rawConnectionString.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase))
{
    var uri = new Uri(rawConnectionString);
    var userInfo = uri.UserInfo.Split(':', 2);
    var host = uri.Host;
    var port = uri.Port > 0 ? uri.Port : 5432;
    var database = uri.AbsolutePath.TrimStart('/');
    var user = Uri.UnescapeDataString(userInfo[0]);
    var password = userInfo.Length > 1 ? Uri.UnescapeDataString(userInfo[1]) : "";

    npgsqlConnectionString =
        $"Host={host};Port={port};Database={database};Username={user};Password={password};" +
        "sslmode=require;Trust Server Certificate=true;Pooling=false;Max Auto Prepare=0;";
}
else
{
    // Zaten Key=Value formatındaysa — sadece SSL ve Pooling ayarlarını ekle
    npgsqlConnectionString = rawConnectionString.Contains("sslmode", StringComparison.OrdinalIgnoreCase)
        ? rawConnectionString
        : rawConnectionString.TrimEnd(';') + ";sslmode=require;Trust Server Certificate=true;";
    
    if (!npgsqlConnectionString.Contains("Pooling=false", StringComparison.OrdinalIgnoreCase))
        npgsqlConnectionString = npgsqlConnectionString.TrimEnd(';') + ";Pooling=false;Max Auto Prepare=0;";
}

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(npgsqlConnectionString, sqlOptions =>
    {
        sqlOptions.EnableRetryOnFailure(
            maxRetryCount: 5,
            maxRetryDelay: TimeSpan.FromSeconds(5),
            errorCodesToAdd: null);
    }));

builder.Services.AddHostedService<MessageCleanupService>();
builder.Services.AddHostedService<KeepAliveService>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins(
            "https://sandalyecimetin.vercel.app",
            "http://localhost:5173",
            "http://127.0.0.1:5173")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();

// Supabase'de tablo yoksa otomatik oluştur
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    try
    {
        // Önceden oluşturulmuş DB varsa bu komut hiçbir şey yapmaz
        try { await db.Database.EnsureCreatedAsync(); } catch { }

        // 1. Users tablosunu oluştur
        try {
            await db.Database.ExecuteSqlRawAsync(@"
                CREATE TABLE IF NOT EXISTS users (
                    id text NOT NULL,
                    username text NOT NULL,
                    email text NOT NULL,
                    password_hash text NOT NULL,
                    created_at timestamp with time zone NOT NULL,
                    CONSTRAINT ""PK_users"" PRIMARY KEY (id)
                );
            ");
        } catch { }

        // Profile fields for Users
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE users ADD COLUMN first_name text DEFAULT '';"); } catch { }
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE users ADD COLUMN last_name text DEFAULT '';"); } catch { }
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE users ADD COLUMN avatar_id text DEFAULT 'default';"); } catch { }

        // 2. user_id kolonunu ekle (Varsa hata verir, atlar)
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE messages ADD COLUMN user_id text;"); } catch { }
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE messages ADD COLUMN avatar_id text DEFAULT 'default';"); } catch { }

        // 3. Yabancı anahtarı ekle (Varsa atlar)
        try { await db.Database.ExecuteSqlRawAsync(@"ALTER TABLE messages ADD CONSTRAINT ""FK_messages_users_user_id"" FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL;"); } catch { }

        // 4. İndeksleri oluştur (Varsa atlar)
        try { await db.Database.ExecuteSqlRawAsync(@"CREATE INDEX ""IX_messages_user_id"" ON messages (user_id);"); } catch { }
        try { await db.Database.ExecuteSqlRawAsync(@"CREATE UNIQUE INDEX ""IX_users_email"" ON users (email);"); } catch { }
        try { await db.Database.ExecuteSqlRawAsync(@"CREATE UNIQUE INDEX ""IX_users_username"" ON users (username);"); } catch { }

        // 5. Yeni kolonlar — mesaj düzenleme ve dosya ekleri (Varsa atlar)
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE messages ADD COLUMN is_edited boolean NOT NULL DEFAULT false;"); } catch { }
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE messages ADD COLUMN file_url text;"); } catch { }
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE messages ADD COLUMN file_name text;"); } catch { }
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE messages ADD COLUMN reply_to_id bigint;"); } catch { }
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE messages ADD COLUMN is_deleted boolean NOT NULL DEFAULT false;"); } catch { }

        // 6. User için yeni kolonlar (Varsa atlar)
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE users ADD COLUMN is_verified boolean NOT NULL DEFAULT true;"); } catch { }
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE users ADD COLUMN verification_token text;"); } catch { }
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE users ADD COLUMN verification_expires timestamp with time zone;"); } catch { }
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE users ADD COLUMN reset_password_token text;"); } catch { }
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE users ADD COLUMN reset_password_expires timestamp with time zone;"); } catch { }

        // Şimdilik tüm kullanıcıları sorgusuz sualsiz doğrulanmış (verified) yap
        try { await db.Database.ExecuteSqlRawAsync("UPDATE users SET is_verified = true;"); } catch { }

        // 7. Rooms tablosunu oluştur
        try {
            await db.Database.ExecuteSqlRawAsync(@"
                CREATE TABLE IF NOT EXISTS rooms (
                    id serial NOT NULL,
                    name text NOT NULL,
                    type text NOT NULL DEFAULT 'text',
                    description text,
                    created_by text NOT NULL DEFAULT '',
                    created_at timestamp with time zone NOT NULL DEFAULT now(),
                    CONSTRAINT ""PK_rooms"" PRIMARY KEY (id)
                );
            ");
        } catch { }

        // Unique index on room name
        try { await db.Database.ExecuteSqlRawAsync(@"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_rooms_name"" ON rooms (name);"); } catch { }

        // Gizli oda + oda kodu alanları (Oda Sistemi Yenileme)
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false;"); } catch { }
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_code varchar(8);"); } catch { }
        try { await db.Database.ExecuteSqlRawAsync(@"CREATE UNIQUE INDEX IF NOT EXISTS ""IX_rooms_room_code"" ON rooms (room_code);"); } catch { }

        // Seed: Varsayılan odaları ekle (varsa atla)
        try { await db.Database.ExecuteSqlRawAsync("INSERT INTO rooms (name, type, description, created_by) VALUES ('Ana Salon', 'text', 'Sohbet Odası', 'system') ON CONFLICT (name) DO NOTHING;"); } catch { }
        try { await db.Database.ExecuteSqlRawAsync("INSERT INTO rooms (name, type, description, created_by) VALUES ('Müzik Odası', 'text', 'Dinleme Odası', 'system') ON CONFLICT (name) DO NOTHING;"); } catch { }

        // ============ ROL SİSTEMİ (Özellik 6) ============
        // Sahiplik username yerine userId üzerinden tutulur
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS created_by_user_id text;"); } catch { }
        // Mevcut odalar için username → userId eşleştir (sistem odaları hariç, onlar null kalır)
        try { await db.Database.ExecuteSqlRawAsync(@"
            UPDATE rooms SET created_by_user_id = u.id
            FROM users u
            WHERE rooms.created_by_user_id IS NULL AND rooms.created_by = u.username;
        "); } catch { }

        // Oda üyeleri / rolleri tablosu
        try { await db.Database.ExecuteSqlRawAsync(@"
            CREATE TABLE IF NOT EXISTS room_members (
                room_id int NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                role text NOT NULL DEFAULT 'member',
                joined_at timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT ""PK_room_members"" PRIMARY KEY (room_id, user_id)
            );
        "); } catch { }

        // Oda yasakları tablosu
        try { await db.Database.ExecuteSqlRawAsync(@"
            CREATE TABLE IF NOT EXISTS room_bans (
                room_id int NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
                user_id text NOT NULL,
                banned_by text NOT NULL,
                reason text,
                banned_at timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT ""PK_room_bans"" PRIMARY KEY (room_id, user_id)
            );
        "); } catch { }

        // Mevcut odaların kurucularını owner olarak room_members'a yaz
        try { await db.Database.ExecuteSqlRawAsync(@"
            INSERT INTO room_members (room_id, user_id, role)
            SELECT id, created_by_user_id, 'owner' FROM rooms WHERE created_by_user_id IS NOT NULL
            ON CONFLICT (room_id, user_id) DO NOTHING;
        "); } catch { }

        // 8. Users tablosuna Faz 1 ve Faz 2 DM/Durum alanlarını ekle
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen timestamp with time zone NOT NULL DEFAULT now();"); } catch { }
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_status text NOT NULL DEFAULT 'online';"); } catch { }
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_status_message text;"); } catch { }
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE users ADD COLUMN IF NOT EXISTS show_last_seen boolean NOT NULL DEFAULT true;"); } catch { }

        // 9. Direct Messages tablosunu oluştur
        try {
            await db.Database.ExecuteSqlRawAsync(@"
                CREATE TABLE IF NOT EXISTS direct_messages (
                    id bigserial NOT NULL,
                    sender_id text NOT NULL,
                    receiver_id text NOT NULL,
                    content text NOT NULL,
                    created_at timestamp with time zone NOT NULL DEFAULT now(),
                    is_read boolean NOT NULL DEFAULT false,
                    is_edited boolean NOT NULL DEFAULT false,
                    is_deleted boolean NOT NULL DEFAULT false,
                    reply_to_id bigint NULL,
                    file_url text NULL,
                    file_name text NULL,
                    CONSTRAINT ""PK_direct_messages"" PRIMARY KEY (id)
                );
            ");
        } catch { }
        // Performans için indeksler
        try { await db.Database.ExecuteSqlRawAsync(@"CREATE INDEX IF NOT EXISTS ""IX_direct_messages_sender_id"" ON direct_messages (sender_id);"); } catch { }
        try { await db.Database.ExecuteSqlRawAsync(@"CREATE INDEX IF NOT EXISTS ""IX_direct_messages_receiver_id"" ON direct_messages (receiver_id);"); } catch { }

        // 10. Soundboard: kullanıcıya özel sesler
        try {
            await db.Database.ExecuteSqlRawAsync(@"
                CREATE TABLE IF NOT EXISTS user_sounds (
                    id bigserial NOT NULL,
                    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    name text NOT NULL,
                    url text NOT NULL,
                    created_at timestamptz NOT NULL DEFAULT now(),
                    CONSTRAINT ""PK_user_sounds"" PRIMARY KEY (id)
                );
            ");
        } catch { }
        try { await db.Database.ExecuteSqlRawAsync(@"CREATE INDEX IF NOT EXISTS ""IX_user_sounds_user_id"" ON user_sounds (user_id);"); } catch { }

    }
    catch (Exception ex)
    {
        var startupLogger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
        startupLogger.LogError(ex, "[Startup] Veritabanı başlatılamadı.");
    }
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseHttpsRedirection();
}

app.UseRouting();
app.UseCors("AllowFrontend");
app.UseStaticFiles(); // uploads klasörü için

app.UseAuthentication(); // Kimlik Doğrulamayı etkinleştir
app.UseAuthorization();  // Yetkilendirmeyi etkinleştir

app.MapControllers(); // /api/auth/* uç noktalarını eşle

app.MapGet("/api/stats/active-users", () =>
    Results.Ok(new { count = ChatAndSignalingHub.GetActiveUserCount() }))
   .RequireCors("AllowFrontend");

app.MapGet("/api/rooms/{roomId}/users", (string roomId) =>
    Results.Ok(ChatAndSignalingHub.GetUsersInRoom(roomId)))
   .RequireCors("AllowFrontend");

app.MapHub<ChatAndSignalingHub>("/hub/chat");

app.MapGet("/api/test-db", async (AppDbContext db) =>
{
    try
    {
        var msg = new DiscordClone.Api.Models.ChatMessage
        {
            RoomId = "test_room",
            UserId = "test_user",
            Username = "test_user",
            AvatarId = "default",
            Text = "test message",
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            IsDeleted = false
        };
        db.Messages.Add(msg);
        await db.SaveChangesAsync();
        return Microsoft.AspNetCore.Http.Results.Ok("Success! Message ID: " + msg.Id);
    }
    catch (Exception ex)
    {
        return Microsoft.AspNetCore.Http.Results.BadRequest(ex.InnerException?.Message ?? ex.Message);
    }
});

app.Run();
