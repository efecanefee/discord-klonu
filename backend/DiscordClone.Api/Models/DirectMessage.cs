namespace DiscordClone.Api.Models
{
    public class DirectMessage
    {
        public long Id { get; set; }
        public string SenderId { get; set; } = string.Empty;
        public string ReceiverId { get; set; } = string.Empty;
        public string Content { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        
        // Faz 1: Sadece metin bazlı DM için basit alanlar
        public bool IsRead { get; set; } = false;
        
        // Faz 2 ve 3 için ayrılmış alanlar
        public bool IsEdited { get; set; } = false;
        public bool IsDeleted { get; set; } = false;
        public long? ReplyToId { get; set; }
        public string? FileUrl { get; set; }
        public string? FileName { get; set; }
    }

    public class CreateDirectMessageDto
    {
        public string ReceiverId { get; set; } = string.Empty;
        public string Content { get; set; } = string.Empty;
    }
}
