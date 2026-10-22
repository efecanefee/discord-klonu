using System.Security.Claims;
using DiscordClone.Api.Data;
using DiscordClone.Api.Hubs;
using DiscordClone.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace DiscordClone.Api.Controllers
{
    // Ana ekran not akışı: herkese açık kısa notlar ve tarihli evet/hayır
    // oylamaları. Cevap yazma yok; yalnızca oy ve emoji tepkisi. Her değişiklik
    // SignalR ile tüm bağlı istemcilere yayınlanır (ana ekran odaya girmeden de
    // hub'a bağlıdır).
    [ApiController]
    [Route("api/feed")]
    [Authorize]
    public class FeedController : ControllerBase
    {
        private const int MaxTextLength = 280;
        private const int PageSize = 20;
        private const int MaxPageSize = 50;
        // Aynı kullanıcının art arda gönderi atması (flood) için alt sınır
        private const long MinPostIntervalMs = 10_000;

        private readonly AppDbContext _db;
        private readonly IHubContext<ChatAndSignalingHub> _hubContext;

        public FeedController(AppDbContext db, IHubContext<ChatAndSignalingHub> hubContext)
        {
            _db = db;
            _hubContext = hubContext;
        }

        private string? CurrentUserId => User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        private string? CurrentUsername => User.Identity?.Name;

        private static long NowMs => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        /// <summary>
        /// Akış: en yeniden eskiye. "before" verilirse o id'den eskiler (sonsuz kaydırma).
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> GetFeed([FromQuery] long? before = null, [FromQuery] int limit = PageSize)
        {
            limit = Math.Clamp(limit, 1, MaxPageSize);

            var query = _db.FeedPosts.AsNoTracking();
            if (before.HasValue) query = query.Where(p => p.Id < before.Value);

            var posts = await query
                .OrderByDescending(p => p.Id)
                .Take(limit + 1)
                .ToListAsync();

            var hasMore = posts.Count > limit;
            if (hasMore) posts.RemoveAt(posts.Count - 1);

            var items = await BuildDtosAsync(posts);
            return Ok(new { items, hasMore });
        }

        [HttpPost]
        public async Task<IActionResult> CreatePost([FromBody] CreateFeedPostDto dto)
        {
            var userId = CurrentUserId;
            var username = CurrentUsername;
            if (string.IsNullOrEmpty(userId) || string.IsNullOrEmpty(username)) return Unauthorized();

            var text = (dto.Text ?? string.Empty).Trim();
            if (text.Length == 0) return BadRequest(new { message = "Boş not paylaşılamaz." });
            if (text.Length > MaxTextLength) return BadRequest(new { message = $"En fazla {MaxTextLength} karakter yazabilirsin." });

            var kind = dto.Kind == FeedPostKinds.Poll ? FeedPostKinds.Poll : FeedPostKinds.Note;
            long? eventAt = null;
            if (kind == FeedPostKinds.Poll)
            {
                if (!dto.EventAt.HasValue) return BadRequest(new { message = "Oylama için tarih ve saat seç." });
                // Birkaç dakikalık saat kaymasına tolerans; geçmişe oylama açılmaz
                if (dto.EventAt.Value < NowMs - 5 * 60_000) return BadRequest(new { message = "Geçmiş bir zamana oylama açılamaz." });
                if (dto.EventAt.Value > NowMs + 365L * 24 * 3600_000) return BadRequest(new { message = "Tarih en fazla bir yıl sonrası olabilir." });
                eventAt = dto.EventAt.Value;
            }

            var lastAt = await _db.FeedPosts
                .Where(p => p.UserId == userId)
                .OrderByDescending(p => p.Id)
                .Select(p => (long?)p.CreatedAt)
                .FirstOrDefaultAsync();
            if (lastAt.HasValue && NowMs - lastAt.Value < MinPostIntervalMs)
                return StatusCode(429, new { message = "Biraz yavaş, birkaç saniye sonra tekrar dene." });

            var post = new FeedPost
            {
                UserId = userId,
                Username = username,
                Kind = kind,
                Text = text,
                EventAt = eventAt,
                CreatedAt = NowMs
            };
            _db.FeedPosts.Add(post);
            await _db.SaveChangesAsync();

            var result = (await BuildDtosAsync(new List<FeedPost> { post })).First();
            await _hubContext.Clients.All.SendAsync("FeedPostCreated", result);
            return Ok(result);
        }

        /// <summary>
        /// Gönderiyi sil (yalnızca sahibi). Oylar ve tepkiler ON DELETE CASCADE ile gider.
        /// </summary>
        [HttpDelete("{id:long}")]
        public async Task<IActionResult> DeletePost(long id)
        {
            var userId = CurrentUserId;
            if (string.IsNullOrEmpty(userId)) return Unauthorized();

            var post = await _db.FeedPosts.FirstOrDefaultAsync(p => p.Id == id);
            if (post == null) return NotFound();
            if (post.UserId != userId) return Forbid();

            await _db.FeedPollVotes.Where(v => v.PostId == id).ExecuteDeleteAsync();
            await _db.FeedReactions.Where(r => r.PostId == id).ExecuteDeleteAsync();
            _db.FeedPosts.Remove(post);
            await _db.SaveChangesAsync();

            await _hubContext.Clients.All.SendAsync("FeedPostDeleted", id);
            return NoContent();
        }

        /// <summary>
        /// Oy ver. Aynı seçeneğe tekrar basmak oyu geri alır; diğerine basmak oyu değiştirir.
        /// Etkinlik saati geçen oylama kilitlenir.
        /// </summary>
        [HttpPost("{id:long}/vote")]
        public async Task<IActionResult> Vote(long id, [FromBody] FeedVoteDto dto)
        {
            var userId = CurrentUserId;
            var username = CurrentUsername;
            if (string.IsNullOrEmpty(userId) || string.IsNullOrEmpty(username)) return Unauthorized();
            if (dto.Choice != "yes" && dto.Choice != "no") return BadRequest(new { message = "Geçersiz seçim." });

            var post = await _db.FeedPosts.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id);
            if (post == null) return NotFound();
            if (post.Kind != FeedPostKinds.Poll) return BadRequest(new { message = "Bu bir oylama değil." });
            if (post.EventAt.HasValue && post.EventAt.Value < NowMs)
                return BadRequest(new { message = "Bu oylamanın süresi doldu." });

            var existing = await _db.FeedPollVotes.FirstOrDefaultAsync(v => v.PostId == id && v.UserId == userId);
            if (existing == null)
            {
                _db.FeedPollVotes.Add(new FeedPollVote { PostId = id, UserId = userId, Username = username, Choice = dto.Choice });
            }
            else if (existing.Choice == dto.Choice)
            {
                _db.FeedPollVotes.Remove(existing);
            }
            else
            {
                existing.Choice = dto.Choice;
                existing.Username = username;
                existing.CreatedAt = NowMs;
            }
            // Unique index yarışında (çift tık) sessizce yut — set zaten doğru
            try { await _db.SaveChangesAsync(); } catch (DbUpdateException) { }

            var votes = await GetVotesAsync(id);
            await _hubContext.Clients.All.SendAsync("FeedVotesUpdated", id, votes);
            return Ok(votes);
        }

        /// <summary>
        /// Emoji tepkisi ekle/kaldır (toggle). Gönderinin güncel tam seti yayınlanır.
        /// </summary>
        [HttpPost("{id:long}/reactions")]
        public async Task<IActionResult> ToggleReaction(long id, [FromBody] FeedReactionDto dto)
        {
            var userId = CurrentUserId;
            var username = CurrentUsername;
            if (string.IsNullOrEmpty(userId) || string.IsNullOrEmpty(username)) return Unauthorized();
            var emoji = dto.Emoji ?? string.Empty;
            if (string.IsNullOrWhiteSpace(emoji) || emoji.Length > 16) return BadRequest();

            if (!await _db.FeedPosts.AnyAsync(p => p.Id == id)) return NotFound();

            var existing = await _db.FeedReactions
                .FirstOrDefaultAsync(r => r.PostId == id && r.UserId == userId && r.Emoji == emoji);
            if (existing != null)
            {
                _db.FeedReactions.Remove(existing);
                await _db.SaveChangesAsync();
            }
            else
            {
                _db.FeedReactions.Add(new FeedReaction { PostId = id, UserId = userId, Username = username, Emoji = emoji });
                try { await _db.SaveChangesAsync(); } catch (DbUpdateException) { }
            }

            var reactions = await GetReactionsAsync(id);
            await _hubContext.Clients.All.SendAsync("FeedReactionUpdated", id, reactions);
            return Ok(reactions);
        }

        // --- yardımcılar ---

        private async Task<object> GetVotesAsync(long postId)
        {
            var rows = await _db.FeedPollVotes.AsNoTracking()
                .Where(v => v.PostId == postId)
                .OrderBy(v => v.CreatedAt)
                .ToListAsync();
            return ShapeVotes(rows);
        }

        private static object ShapeVotes(IEnumerable<FeedPollVote> rows) => new
        {
            yes = rows.Where(v => v.Choice == "yes").Select(v => v.Username).ToList(),
            no = rows.Where(v => v.Choice == "no").Select(v => v.Username).ToList()
        };

        private async Task<object> GetReactionsAsync(long postId)
        {
            var rows = await _db.FeedReactions.AsNoTracking()
                .Where(r => r.PostId == postId)
                .ToListAsync();
            return ShapeReactions(rows);
        }

        // Emojiler ilk eklenme sırasına göre — chip'ler yer değiştirip zıplamasın
        private static List<object> ShapeReactions(IEnumerable<FeedReaction> rows) => rows
            .GroupBy(r => r.Emoji)
            .OrderBy(g => g.Min(r => r.Id))
            .Select(g => (object)new { emoji = g.Key, count = g.Count(), usernames = g.Select(x => x.Username).ToList() })
            .ToList();

        private async Task<List<object>> BuildDtosAsync(List<FeedPost> posts)
        {
            if (posts.Count == 0) return new List<object>();

            var ids = posts.Select(p => p.Id).ToList();
            var userIds = posts.Select(p => p.UserId).Distinct().ToList();

            // Avatar her zaman güncel profilden okunur (kullanıcı sonradan değiştirmiş olabilir)
            var avatars = await _db.Users.AsNoTracking()
                .Where(u => userIds.Contains(u.Id))
                .Select(u => new { u.Id, u.AvatarId })
                .ToDictionaryAsync(u => u.Id, u => u.AvatarId);

            var votes = await _db.FeedPollVotes.AsNoTracking()
                .Where(v => ids.Contains(v.PostId))
                .OrderBy(v => v.CreatedAt)
                .ToListAsync();
            var reactions = await _db.FeedReactions.AsNoTracking()
                .Where(r => ids.Contains(r.PostId))
                .ToListAsync();

            return posts.Select(p => (object)new
            {
                id = p.Id,
                userId = p.UserId,
                username = p.Username,
                avatarId = avatars.TryGetValue(p.UserId, out var a) ? a : "default",
                kind = p.Kind,
                text = p.Text,
                eventAt = p.EventAt,
                createdAt = p.CreatedAt,
                votes = p.Kind == FeedPostKinds.Poll ? ShapeVotes(votes.Where(v => v.PostId == p.Id)) : null,
                reactions = ShapeReactions(reactions.Where(r => r.PostId == p.Id))
            }).ToList();
        }
    }
}
