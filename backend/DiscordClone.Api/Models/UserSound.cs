namespace DiscordClone.Api.Models
{
    // Soundboard: bir kullanıcının yüklediği ses efekti (mp3/ogg URL'i).
    // Ortak ses kütüphanesinin satırıdır; IsPublic ise Ses Mağazası'nda herkes görür.
    public class UserSound
    {
        public long Id { get; set; }
        public string UserId { get; set; } = string.Empty; // yükleyen
        public string Name { get; set; } = string.Empty;
        public string Url { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public bool IsPublic { get; set; } = true;
        // Yükleyen sildi ama başkaları soundboard'una eklemişti: onlarda kalır, mağazadan kalkar.
        public bool IsDeleted { get; set; }
        // Soundboard'da kaç kez çalındı ("En çok çalınanlar" için)
        public long PlayCount { get; set; }
    }

    // Kişisel soundboard: kullanıcının mağazadan eklediği (başkasına ait) sesler.
    public class SoundboardSave
    {
        public string UserId { get; set; } = string.Empty;
        public long SoundId { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    // Kullanıcının favori işaretlediği soundboard sesleri (soundboard'da en başta durur).
    public class SoundFavorite
    {
        public string UserId { get; set; } = string.Empty;
        public long SoundId { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
