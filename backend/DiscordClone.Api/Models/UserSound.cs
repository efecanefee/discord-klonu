namespace DiscordClone.Api.Models
{
    // Soundboard: kullanıcının yüklediği kişisel ses efekti (mp3/ogg URL'i).
    public class UserSound
    {
        public long Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string Url { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
