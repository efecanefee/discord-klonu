namespace DiscordClone.Api.Models
{
    // Ana ekrandaki not akışı: kısa not ya da tarihli evet/hayır oylaması.
    // Zamanlar epoch ms (message_reactions ile aynı) — saat dilimi derdi yok.
    public class FeedPost
    {
        public long Id { get; set; }
        public string UserId { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Kind { get; set; } = FeedPostKinds.Note;
        public string Text { get; set; } = string.Empty;
        public long? EventAt { get; set; }
        public long CreatedAt { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        // Oylama: etkinlik yaklaşınca "Evet" diyenlere hatırlatma gönderildi mi
        public bool Reminded { get; set; }
    }

    public static class FeedPostKinds
    {
        public const string Note = "note";
        public const string Poll = "poll";
    }

    // Oylamada kullanıcı başına tek oy: "yes" | "no".
    public class FeedPollVote
    {
        public long Id { get; set; }
        public long PostId { get; set; }
        public string UserId { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Choice { get; set; } = string.Empty;
        public long CreatedAt { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    }

    // Akış gönderilerine emoji tepkisi. Username tooltip için denormalize tutulur.
    public class FeedReaction
    {
        public long Id { get; set; }
        public long PostId { get; set; }
        public string UserId { get; set; } = string.Empty;
        public string Username { get; set; } = string.Empty;
        public string Emoji { get; set; } = string.Empty;
        public long CreatedAt { get; set; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    }

    public class CreateFeedPostDto
    {
        public string Kind { get; set; } = FeedPostKinds.Note;
        public string Text { get; set; } = string.Empty;
        public long? EventAt { get; set; }
    }

    public class FeedVoteDto
    {
        public string Choice { get; set; } = string.Empty;
    }

    public class FeedReactionDto
    {
        public string Emoji { get; set; } = string.Empty;
    }
}
