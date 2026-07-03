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

// Email & Resend
builder.Services.AddResend(options =>
{
    options.ApiToken = builder.Configuration["Resend:ApiKey"] ?? "re_fallback";
});
builder.Services.AddScoped<IEmailService, EmailService>();

// JWT Kimlik Doğrulama Konfigürasyonu
var jwtKey = builder.Configuration["Jwt:Key"] ?? "VarsayilanCokGizliAnahtarDegistirilmeli123!";
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

        // 6. User için yeni kolonlar (Varsa atlar)
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE users ADD COLUMN is_verified boolean NOT NULL DEFAULT false;"); } catch { }
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE users ADD COLUMN verification_token text;"); } catch { }
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE users ADD COLUMN verification_expires timestamp with time zone;"); } catch { }
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE users ADD COLUMN reset_password_token text;"); } catch { }
        try { await db.Database.ExecuteSqlRawAsync("ALTER TABLE users ADD COLUMN reset_password_expires timestamp with time zone;"); } catch { }

        // Eski kullanıcıları mağdur etmemek için, verification_token'ı olmayanları otomatik onaylanmış say
        try { await db.Database.ExecuteSqlRawAsync("UPDATE users SET is_verified = true WHERE verification_token IS NULL;"); } catch { }

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

app.Run();
