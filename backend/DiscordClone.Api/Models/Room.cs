namespace DiscordClone.Api.Models
{
    public class Room
    {
        public int Id { get; set; }
        public string Name { get; set; } = string.Empty;
        public string Type { get; set; } = "text"; // "text" veya "voice"
        public string? Description { get; set; }
        public string CreatedBy { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public bool IsPrivate { get; set; } = false;
        public string? RoomCode { get; set; }
    }

    public class CreateRoomDto
    {
        public string Name { get; set; } = string.Empty;
        public string Type { get; set; } = "text";
        public string? Description { get; set; }
        public bool IsPrivate { get; set; } = false;
    }
}
