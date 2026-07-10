namespace DiscordClone.Api.Models
{
    public class ChatMessage
    {
        public long Id { get; set; }
        public string RoomId { get; set; } = "";
        public string Username { get; set; } = ""; // Geriye dönük uyumluluk için
        public string AvatarId { get; set; } = "default";
        public string Text { get; set; } = "";
        public long Timestamp { get; set; }
        public bool IsDeleted { get; set; } = false;

        public string? UserId { get; set; }
        public User? User { get; set; }

        // Mesaj düzenleme
        public bool IsEdited { get; set; } = false;

        // Dosya/resim ekleri
        public string? FileUrl { get; set; }
        public string? FileName { get; set; }

        public long? ReplyToId { get; set; }
    }
}
