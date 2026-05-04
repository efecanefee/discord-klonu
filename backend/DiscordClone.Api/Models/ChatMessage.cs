namespace DiscordClone.Api.Models
{
    public class ChatMessage
    {
        public long Id { get; set; }
        public string RoomId { get; set; } = "";
        public string Username { get; set; } = "";
        public string Text { get; set; } = "";
        public long Timestamp { get; set; }
        public bool IsDeleted { get; set; } = false;
    }
}
