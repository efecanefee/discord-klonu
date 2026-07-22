namespace DiscordClone.Api.Models
{
    // Oda mesajlarına emoji tepkisi. Username tooltip için denormalize tutulur.
    public class MessageReaction
    {
        public long Id { get; set; }
        public long MessageId { get; set; }
        public string UserId { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Emoji { get; set; } = string.Empty;
        public long CreatedAt { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    }
}
