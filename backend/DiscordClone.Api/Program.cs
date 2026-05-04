using DiscordClone.Api.Hubs;
using DiscordClone.Api.Data;
using DiscordClone.Api.Services;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.UseUrls("http://0.0.0.0:" + (Environment.GetEnvironmentVariable("PORT") ?? "5098"));

builder.Services.AddOpenApi();
builder.Services.AddSignalR();

// PostgreSQL — Supabase
var connectionString = Environment.GetEnvironmentVariable("DATABASE_URL")
    ?? throw new Exception("DATABASE_URL environment variable eksik!");

// Supabase SSL gerektirir — connection string'e SSL parametresi ekle
var sslConnectionString = connectionString.Contains("sslmode", StringComparison.OrdinalIgnoreCase)
    ? connectionString
    : connectionString.TrimEnd(';') + ";sslmode=require;Trust Server Certificate=true";

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(sslConnectionString));

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
