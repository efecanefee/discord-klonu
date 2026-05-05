using DiscordClone.Api.Hubs;
using DiscordClone.Api.Data;
using DiscordClone.Api.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.UseUrls("http://0.0.0.0:" + (Environment.GetEnvironmentVariable("PORT") ?? "5098"));

builder.Services.AddOpenApi();
builder.Services.AddSignalR();

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

    // Render IPv6 desteklemiyor — DNS'i IPv4'e zorla
    try
    {
        var addresses = await System.Net.Dns.GetHostAddressesAsync(host);
        var ipv4 = addresses.FirstOrDefault(a =>
            a.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork);
        if (ipv4 != null)
            host = ipv4.ToString();
    }
    catch { /* DNS başarısız olursa orijinal host'u kullanmaya devam et */ }

    npgsqlConnectionString =
        $"Host={host};Port={port};Database={database};Username={user};Password={password};" +
        "sslmode=require;Trust Server Certificate=true;";
}
else
{
    // Zaten Key=Value formatındaysa — sadece SSL ekle
    npgsqlConnectionString = rawConnectionString.Contains("sslmode", StringComparison.OrdinalIgnoreCase)
        ? rawConnectionString
        : rawConnectionString.TrimEnd(';') + ";sslmode=require;Trust Server Certificate=true;";
}

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(npgsqlConnectionString));

builder.Services.AddHostedService<MessageCleanupService>();

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
        await db.Database.EnsureCreatedAsync();
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

app.MapGet("/api/stats/active-users", () =>
    Results.Ok(new { count = ChatAndSignalingHub.GetActiveUserCount() }))
   .RequireCors("AllowFrontend");

app.MapHub<ChatAndSignalingHub>("/hub/chat");

app.Run();
