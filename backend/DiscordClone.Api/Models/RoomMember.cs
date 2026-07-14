namespace DiscordClone.Api.Models
{
    // Oda üyeliği ve rolü. role: "owner" | "moderator" | "member"
    public class RoomMember
    {
        public int RoomId { get; set; }
        public string UserId { get; set; } = string.Empty;
        public string Role { get; set; } = "member";
        public DateTime JoinedAt { get; set; } = DateTime.UtcNow;
    }

    // Oda yasağı (ban). Yasaklı kullanıcı odaya tekrar giremez.
    public class RoomBan
    {
        public int RoomId { get; set; }
        public string UserId { get; set; } = string.Empty;
        public string BannedBy { get; set; } = string.Empty;
        public string? Reason { get; set; }
        public DateTime BannedAt { get; set; } = DateTime.UtcNow;
    }

    // Rol sabitleri — tek yerde tut (magic string hatalarını önler)
    public static class RoomRoles
    {
        public const string Owner = "owner";
        public const string Moderator = "moderator";
        public const string Member = "member";
    }
}
