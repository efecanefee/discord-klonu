using DiscordClone.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace DiscordClone.Api.Services
{
    public class MessageCleanupService : BackgroundService
    {
        private readonly IServiceProvider _services;
        private readonly ILogger<MessageCleanupService> _logger;

        public MessageCleanupService(IServiceProvider services, ILogger<MessageCleanupService> logger)
        {
            _services = services;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    using var scope = _services.CreateScope();
                    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

                    var oneWeekAgo = DateTimeOffset.UtcNow.AddDays(-7).ToUnixTimeMilliseconds();
                    var deleted = await db.Messages
                        .Where(m => m.Timestamp < oneWeekAgo)
                        .ExecuteDeleteAsync(stoppingToken);

                    if (deleted > 0)
                        _logger.LogInformation($"[Cleanup] {deleted} eski mesaj silindi.");
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "[Cleanup] Hata oluştu.");
                }

                await Task.Delay(TimeSpan.FromHours(6), stoppingToken);
            }
        }
    }
}
