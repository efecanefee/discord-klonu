using System.Net;
using System.Text.Json;
using DiscordClone.Api.Data;
using Microsoft.EntityFrameworkCore;
using WebPush;

namespace DiscordClone.Api.Services
{
    public record PushPayload(string Title, string Body, string? Tag = null, string? Url = null, string? Icon = null);

    public interface IPushNotificationService
    {
        bool IsEnabled { get; }
        string? PublicKey { get; }
        // Bildirimi kullanıcının tüm cihazlarına arka planda gönderir; çağıranı bekletmez.
        void SendToUsers(IEnumerable<string> userIds, PushPayload payload);
    }

    // VAPID anahtarları yoksa (Vapid__PublicKey / Vapid__PrivateKey) push sessizce kapalıdır.
    public class PushNotificationService : IPushNotificationService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly ILogger<PushNotificationService> _logger;
        private readonly VapidDetails? _vapid;
        private readonly WebPushClient _client = new();

        private static readonly JsonSerializerOptions JsonOptions = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };

        public PushNotificationService(IServiceScopeFactory scopeFactory, ILogger<PushNotificationService> logger, VapidDetails? vapid)
        {
            _scopeFactory = scopeFactory;
            _logger = logger;
            _vapid = vapid;
        }

        public bool IsEnabled => _vapid != null;
        public string? PublicKey => _vapid?.PublicKey;

        public void SendToUsers(IEnumerable<string> userIds, PushPayload payload)
        {
            if (_vapid == null) return;
            var ids = userIds.Where(id => !string.IsNullOrEmpty(id)).Distinct().ToList();
            if (ids.Count == 0) return;
            _ = Task.Run(() => SendAsync(ids, payload));
        }

        private async Task SendAsync(List<string> userIds, PushPayload payload)
        {
            try
            {
                using var scope = _scopeFactory.CreateScope();
                var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

                // Rahatsız Etmeyin modundaki kullanıcılara push gönderilmez
                var dndIds = await db.Users
                    .Where(u => userIds.Contains(u.Id) && u.CustomStatus == "dnd")
                    .Select(u => u.Id)
                    .ToListAsync();
                var targets = userIds.Except(dndIds).ToList();
                if (targets.Count == 0) return;

                var subs = await db.PushSubscriptions.Where(s => targets.Contains(s.UserId)).ToListAsync();
                var json = JsonSerializer.Serialize(payload, JsonOptions);
                var expired = new List<long>();

                foreach (var sub in subs)
                {
                    try
                    {
                        await _client.SendNotificationAsync(new PushSubscription(sub.Endpoint, sub.P256dh, sub.Auth), json, _vapid);
                    }
                    catch (WebPushException ex) when (ex.StatusCode is HttpStatusCode.Gone or HttpStatusCode.NotFound)
                    {
                        expired.Add(sub.Id); // Tarayıcı aboneliği iptal etmiş
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "[Push] Bildirim gönderilemedi.");
                    }
                }

                if (expired.Count > 0)
                    await db.PushSubscriptions.Where(s => expired.Contains(s.Id)).ExecuteDeleteAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[Push] Gönderim hatası.");
            }
        }
    }
}
