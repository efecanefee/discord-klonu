using DiscordClone.Api.Data;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace DiscordClone.Api.Services
{
    // Haftalık rozetler: hafta Türkiye saatiyle Pazartesi 00:00'da başlar.
    // "earned" = geçen haftanın kazananları (hafta boyu profilde kalır),
    // "leaders" = bu hafta şu an önde olanlar (canlı yarış).
    public static class WeekClock
    {
        // Türkiye 2016'dan beri sabit UTC+3 (yaz saati yok)
        private static readonly TimeSpan TrOffset = TimeSpan.FromHours(3);

        public static DateTime WeekStartUtc(DateTime utc)
        {
            var local = utc + TrOffset;
            var daysSinceMonday = ((int)local.DayOfWeek + 6) % 7;
            var mondayLocal = local.Date.AddDays(-daysSinceMonday);
            return DateTime.SpecifyKind(mondayLocal - TrOffset, DateTimeKind.Utc);
        }

        public static DateTime CurrentWeekStartUtc() => WeekStartUtc(DateTime.UtcNow);

        // Gece Kuşu: Türkiye saatiyle 00:00–05:00
        public static bool IsNight(DateTime utc) => (utc + TrOffset).Hour < 5;
    }

    public record BadgeDefinition(string Key, string Emoji, string Title, string Description, long Min);

    public record BadgeHolder(string Key, string Emoji, string Title, string Description,
        string UserId, string Username, string AvatarId, long Value);

    public record WeeklyBadges(DateTime WeekStart, DateTime WeekEnd, List<BadgeHolder> Holders);

    public record WeeklyUserStats(long VoiceSeconds, long Messages, long Reactions, long NightMessages);

    public interface IWeeklyStatsService
    {
        Task AddVoiceTimeAsync(string userId, DateTime fromUtc, DateTime toUtc);
        Task CountMessageAsync(string? userId);
        Task CountReactionAsync(string? userId, int delta);
        Task<WeeklyBadges> GetBadgesAsync(DateTime weekStartUtc);
        Task<WeeklyUserStats> GetUserStatsAsync(string userId, DateTime weekStartUtc);
    }

    // Oda mesajları 7 gün sonra silindiği için sayılar mesaj tablosundan değil,
    // gönderim anında artırılan user_weekly_stats sayaçlarından okunur.
    public class WeeklyStatsService : IWeeklyStatsService
    {
        public static readonly BadgeDefinition[] Badges =
        {
            new("voice", "🎙️", "Ses Kralı", "Haftanın en çok seste kalanı", 10 * 60),
            new("messages", "💬", "Geveze", "Haftanın en çok mesaj atanı", 20),
            new("reactions", "🔥", "Tepki Ustası", "Haftanın en çok tepki bırakanı", 10),
            new("night", "🦉", "Gece Kuşu", "Gece 00.00–05.00 arası en çok yazan", 5),
        };

        // Rozet anahtarı -> sütun (sabit liste; kullanıcı girdisi SQL'e girmez)
        private static readonly Dictionary<string, string> Columns = new()
        {
            ["voice"] = "voice_seconds",
            ["messages"] = "messages",
            ["reactions"] = "reactions",
            ["night"] = "night_messages",
        };

        private readonly AppDbContext _db;
        private readonly IMemoryCache _cache;

        public WeeklyStatsService(AppDbContext db, IMemoryCache cache)
        {
            _db = db;
            _cache = cache;
        }

        public class MetricRow
        {
            public string UserId { get; set; } = string.Empty;
            public long Value { get; set; }
        }

        public class StatsRow
        {
            public long VoiceSeconds { get; set; }
            public long Messages { get; set; }
            public long Reactions { get; set; }
            public long NightMessages { get; set; }
        }

        public async Task AddVoiceTimeAsync(string userId, DateTime fromUtc, DateTime toUtc)
        {
            if (string.IsNullOrEmpty(userId) || toUtc <= fromUtc) return;

            // Hafta sınırını aşan oturumu iki haftaya böl
            var cursor = fromUtc;
            while (cursor < toUtc)
            {
                var weekStart = WeekClock.WeekStartUtc(cursor);
                var weekEnd = weekStart.AddDays(7);
                var segmentEnd = toUtc < weekEnd ? toUtc : weekEnd;
                var seconds = (long)(segmentEnd - cursor).TotalSeconds;
                if (seconds > 0)
                    await Increment(userId, weekStart, seconds, 0, 0, 0);
                cursor = segmentEnd;
            }
        }

        public async Task CountMessageAsync(string? userId)
        {
            if (string.IsNullOrEmpty(userId)) return;
            var now = DateTime.UtcNow;
            await Increment(userId, WeekClock.WeekStartUtc(now), 0, 1, 0, WeekClock.IsNight(now) ? 1 : 0);
        }

        public async Task CountReactionAsync(string? userId, int delta)
        {
            if (string.IsNullOrEmpty(userId) || delta == 0) return;
            await Increment(userId, WeekClock.CurrentWeekStartUtc(), 0, 0, delta, 0);
        }

        private Task Increment(string userId, DateTime weekStart, long voice, long messages, long reactions, long night) =>
            _db.Database.ExecuteSqlInterpolatedAsync($@"
                INSERT INTO user_weekly_stats (user_id, week_start, voice_seconds, messages, reactions, night_messages)
                VALUES ({userId}, {weekStart}, {voice}, {messages}, GREATEST({reactions}, 0), {night})
                ON CONFLICT (user_id, week_start) DO UPDATE SET
                    voice_seconds = user_weekly_stats.voice_seconds + EXCLUDED.voice_seconds,
                    messages = user_weekly_stats.messages + EXCLUDED.messages,
                    reactions = GREATEST(user_weekly_stats.reactions + {reactions}, 0),
                    night_messages = user_weekly_stats.night_messages + EXCLUDED.night_messages;");

        public async Task<WeeklyBadges> GetBadgesAsync(DateTime weekStartUtc)
        {
            var weekEnd = weekStartUtc.AddDays(7);
            var isPast = weekEnd <= DateTime.UtcNow;
            var cacheKey = $"weekly-badges:{weekStartUtc:O}";
            if (_cache.TryGetValue(cacheKey, out WeeklyBadges? cached) && cached != null) return cached;

            var winners = new List<(BadgeDefinition Def, MetricRow Row)>();
            foreach (var def in Badges)
            {
                var column = Columns[def.Key];
                // Sütun adı sabit listeden gelir; değerler parametreli
                var top = await _db.Database.SqlQueryRaw<MetricRow>(
                        $@"SELECT user_id AS ""UserId"", {column} AS ""Value"" FROM user_weekly_stats WHERE week_start = {{0}}",
                        weekStartUtc)
                    .OrderByDescending(r => r.Value).ThenBy(r => r.UserId)
                    .FirstOrDefaultAsync();
                if (top != null && top.Value >= def.Min) winners.Add((def, top));
            }

            var ids = winners.Select(w => w.Row.UserId).Distinct().ToList();
            var users = await _db.Users.AsNoTracking()
                .Where(u => ids.Contains(u.Id))
                .Select(u => new { u.Id, u.Username, u.AvatarId })
                .ToDictionaryAsync(u => u.Id);

            var holders = winners
                .Where(w => users.ContainsKey(w.Row.UserId))
                .Select(w => new BadgeHolder(w.Def.Key, w.Def.Emoji, w.Def.Title, w.Def.Description,
                    w.Row.UserId, users[w.Row.UserId].Username, users[w.Row.UserId].AvatarId, w.Row.Value))
                .ToList();

            var result = new WeeklyBadges(weekStartUtc, weekEnd, holders);
            // Biten hafta değişmez; süren hafta kısa aralıklarla tazelenir
            _cache.Set(cacheKey, result, isPast ? TimeSpan.FromHours(6) : TimeSpan.FromMinutes(2));
            return result;
        }

        public async Task<WeeklyUserStats> GetUserStatsAsync(string userId, DateTime weekStartUtc)
        {
            var row = await _db.Database.SqlQuery<StatsRow>($@"
                    SELECT voice_seconds AS ""VoiceSeconds"", messages AS ""Messages"",
                           reactions AS ""Reactions"", night_messages AS ""NightMessages""
                    FROM user_weekly_stats WHERE user_id = {userId} AND week_start = {weekStartUtc}")
                .FirstOrDefaultAsync();
            return row == null
                ? new WeeklyUserStats(0, 0, 0, 0)
                : new WeeklyUserStats(row.VoiceSeconds, row.Messages, row.Reactions, row.NightMessages);
        }
    }
}
