namespace DiscordClone.Api.Models
{
    // Kullanıcı engelleme: engellenen kişi DM atamaz, mesajları istemcide gizlenir.
    public class UserBlock
    {
        public string BlockerId { get; set; } = string.Empty;
        public string BlockedId { get; set; } = string.Empty;
        public long CreatedAt { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    }

    // Bildirim susturma. TargetKey: "dm:<kullanıcıId>" ya da "room:<mesaj anahtarı>".
    // UntilMs null = ben açana kadar.
    public class UserMute
    {
        public string UserId { get; set; } = string.Empty;
        public string TargetKey { get; set; } = string.Empty;
        public long? UntilMs { get; set; }
    }

    // DM listesinde en üste sabitlenen sohbetler
    public class DmPin
    {
        public string UserId { get; set; } = string.Empty;
        public string OtherUserId { get; set; } = string.Empty;
        public long CreatedAt { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    }

    // Kaydedilen mesaj. Oda mesajları 7 gün sonra silindiği için içerik kopyalanır.
    public class SavedMessage
    {
        public long Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public string Kind { get; set; } = "room"; // "room" | "dm"
        public string Location { get; set; } = string.Empty; // oda/kişi adı (gösterim)
        public string Author { get; set; } = string.Empty;
        public string AuthorAvatarId { get; set; } = "default";
        public string Text { get; set; } = string.Empty;
        public string? FileUrl { get; set; }
        public string? FileName { get; set; }
        public long MessageTs { get; set; }
        public long SavedAt { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    }

    public class MuteDto
    {
        public string Key { get; set; } = string.Empty;
        // null = süresiz, 0 = susturmayı kaldır, >0 = dakika
        public int? Minutes { get; set; }
    }

    public class SaveMessageDto
    {
        public string Kind { get; set; } = "room";
        public string Location { get; set; } = string.Empty;
        public string Author { get; set; } = string.Empty;
        public string? AuthorAvatarId { get; set; }
        public string Text { get; set; } = string.Empty;
        public string? FileUrl { get; set; }
        public string? FileName { get; set; }
        public long MessageTs { get; set; }
    }
}
