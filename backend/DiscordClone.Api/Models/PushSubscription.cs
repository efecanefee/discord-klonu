namespace DiscordClone.Api.Models
{
    // Tarayıcının Web Push aboneliği (bir kullanıcının birden fazla cihazı olabilir)
    public class PushSubscriptionEntry
    {
        public long Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public string Endpoint { get; set; } = string.Empty;
        public string P256dh { get; set; } = string.Empty;
        public string Auth { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    public class PushSubscribeDto
    {
        public string Endpoint { get; set; } = string.Empty;
        public PushKeysDto Keys { get; set; } = new();
    }

    public class PushKeysDto
    {
        public string P256dh { get; set; } = string.Empty;
        public string Auth { get; set; } = string.Empty;
    }

    public class PushUnsubscribeDto
    {
        public string Endpoint { get; set; } = string.Empty;
    }
}
