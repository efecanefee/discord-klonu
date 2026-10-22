using DiscordClone.Api.Data;
using DiscordClone.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace DiscordClone.Api.Services
{
    // Tarihli oylamalarda etkinlik saati yaklaşınca "Evet" diyenlere Web Push
    // hatırlatması gönderir. Her oylama için yalnızca bir kez (reminded bayrağı).
    public class FeedReminderService : BackgroundService
    {
        // Etkinlikten ne kadar önce hatırlatılır
        private static readonly TimeSpan LeadTime = TimeSpan.FromMinutes(15);
        // Sunucu uyuyup geç uyandıysa bu kadar geç kalmış etkinlik için hâlâ hatırlat
        private static readonly TimeSpan GraceAfter = TimeSpan.FromMinutes(10);
        private static readonly TimeSpan Interval = TimeSpan.FromMinutes(1);

        private readonly IServiceProvider _services;
        private readonly IPushNotificationService _push;
        private readonly ILogger<FeedReminderService> _logger;

        public FeedReminderService(IServiceProvider services, IPushNotificationService push, ILogger<FeedReminderService> logger)
        {
            _services = services;
            _push = push;
            _logger = logger;
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            while (!stoppingToken.IsCancellationRequested)
            {
                if (_push.IsEnabled)
                {
                    try
                    {
                        await SendDueRemindersAsync(stoppingToken);
                    }
                    catch (Exception ex) when (ex is not OperationCanceledException)
                    {
                        _logger.LogError(ex, "[FeedReminder] Hata oluştu.");
                    }
                }

                await Task.Delay(Interval, stoppingToken);
            }
        }

        private async Task SendDueRemindersAsync(CancellationToken ct)
        {
            using var scope = _services.CreateScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var until = now + (long)LeadTime.TotalMilliseconds;
            var since = now - (long)GraceAfter.TotalMilliseconds;

            var lead = (long)LeadTime.TotalMilliseconds;
            var candidates = await db.FeedPosts
                .Where(p => p.Kind == FeedPostKinds.Poll && !p.Reminded
                            && p.EventAt != null && p.EventAt <= until && p.EventAt >= since)
                .ToListAsync(ct);
            // Etkinliğe 15 dk'dan az kala açılan oylama hemen değil, etkinlik
            // saatinde hatırlatılır — yoksa daha kimse oy vermeden "hatırlatılmış" olur.
            var due = candidates
                .Where(p => (p.EventAt!.Value - p.CreatedAt < lead ? p.EventAt.Value : p.EventAt.Value - lead) <= now)
                .ToList();
            if (due.Count == 0) return;

            foreach (var post in due)
            {
                var yesIds = await db.FeedPollVotes
                    .Where(v => v.PostId == post.Id && v.Choice == "yes")
                    .Select(v => v.UserId)
                    .ToListAsync(ct);

                var minutesLeft = (int)Math.Round((post.EventAt!.Value - now) / 60000.0);
                var when = minutesLeft > 0 ? $"{minutesLeft} dk sonra başlıyor" : "Şimdi başlıyor";
                _push.SendToUsers(yesIds, new PushPayload(
                    Title: $"⏰ {when}",
                    Body: $"{post.Username}: {post.Text}",
                    Tag: $"feed-poll-{post.Id}",
                    Url: "/"));

                post.Reminded = true;
            }

            await db.SaveChangesAsync(ct);
            _logger.LogInformation($"[FeedReminder] {due.Count} oylama için hatırlatma gönderildi.");
        }
    }
}
