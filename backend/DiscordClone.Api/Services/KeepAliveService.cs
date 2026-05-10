namespace DiscordClone.Api.Services
{
    public class KeepAliveService : BackgroundService
    {
        private readonly ILogger<KeepAliveService> _logger;

        public KeepAliveService(ILogger<KeepAliveService> logger)
        {
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            var url = Environment.GetEnvironmentVariable("RENDER_EXTERNAL_URL") 
                      ?? "https://discord-klonu.onrender.com";
            
            using var client = new HttpClient();
            
            while (!stoppingToken.IsCancellationRequested)
            {
                try
                {
                    await client.GetAsync($"{url}/api/stats/active-users", stoppingToken);
                    _logger.LogInformation("[KeepAlive] Ping gönderildi.");
                }
                catch (Exception ex)
                {
                    _logger.LogWarning($"[KeepAlive] Ping hatası: {ex.Message}");
                }

                // 14 dakikada bir ping at (Render 15 dakikada uyuyor)
                await Task.Delay(TimeSpan.FromMinutes(14), stoppingToken);
            }
        }
    }
}
