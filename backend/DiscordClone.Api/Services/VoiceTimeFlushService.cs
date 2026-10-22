using DiscordClone.Api.Hubs;

namespace DiscordClone.Api.Services
{
    // Seste kalanların süresini birkaç dakikada bir veritabanına yazar:
    // böylece canlı sıralama güncel kalır ve sunucu yeniden başlarsa en fazla birkaç dakika kaybolur.
    public class VoiceTimeFlushService : BackgroundService
    {
        private static readonly TimeSpan Interval = TimeSpan.FromMinutes(2);
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<VoiceTimeFlushService> _logger;

        public VoiceTimeFlushService(IServiceScopeFactory scopeFactory, ILogger<VoiceTimeFlushService> logger)
        {
            _scopeFactory = scopeFactory;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            using var timer = new PeriodicTimer(Interval);
            while (await timer.WaitForNextTickAsync(stoppingToken))
            {
                var pending = ChatAndSignalingHub.TakeActiveVoiceTime();
                if (pending.Count == 0) continue;
                try
                {
                    using var scope = _scopeFactory.CreateScope();
                    var stats = scope.ServiceProvider.GetRequiredService<IWeeklyStatsService>();
                    foreach (var (userId, from, to) in pending)
                        await stats.AddVoiceTimeAsync(userId, from, to);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "[WeeklyStats] Ses süreleri yazılamadı.");
                }
            }
        }
    }
}
