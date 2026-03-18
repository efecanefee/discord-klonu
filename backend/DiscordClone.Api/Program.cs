using DiscordClone.Api.Hubs;

var builder = WebApplication.CreateBuilder(args);

// Bind to Render.com dynamic PORT
builder.WebHost.UseUrls("http://0.0.0.0:" + (Environment.GetEnvironmentVariable("PORT") ?? "5098"));

// Add services to the container.
builder.Services.AddOpenApi();
builder.Services.AddSignalR();

// Configure CORS for frontend
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy.WithOrigins("https://sandalyecimetin.vercel.app", "http://localhost:5173", "http://127.0.0.1:5173") // Production and Localhost boundaries
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseHttpsRedirection(); // HTTPS is handled by Render's load balancer in production
}

app.UseRouting();
app.UseCors("AllowFrontend");

app.MapGet("/api/stats/active-users", () => Results.Ok(new { count = ChatAndSignalingHub.GetActiveUserCount() }))
   .RequireCors("AllowFrontend");

app.MapHub<ChatAndSignalingHub>("/hub/chat");

app.Run();
