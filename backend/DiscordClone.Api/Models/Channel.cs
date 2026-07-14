namespace DiscordClone.Api.Models
{
    public class Channel
    {
        public int Id { get; set; }
        public int RoomId { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Type { get; set; } = "text"; // "text" veya "voice"
        public int Position { get; set; } = 0;

        // SignalR grup / messages.room_id anahtarı.
        // Varsayılan metin kanalı için = oda adı (geriye dönük uyumluluk).
        // Ses kanalı ve sonradan eklenen kanallar için = "voice:{roomId}" / "ch:{id}".
        public string MessageKey { get; set; } = string.Empty;

        public string CreatedBy { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    public class CreateChannelDto
    {
        public string Name { get; set; } = string.Empty;
        public string Type { get; set; } = "text";
    }
}
