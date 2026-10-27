using System.Security.Claims;
using DiscordClone.Api.Data;
using DiscordClone.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DiscordClone.Api.Controllers
{
    // Kişisel sohbet tercihleri: engellenenler, susturulan oda/DM'ler,
    // sabitlenen DM'ler ve kaydedilen mesajlar. Hepsi yalnızca sahibine görünür.
    [ApiController]
    [Route("api/me")]
    [Authorize]
    public class MePrefsController : ControllerBase
    {
        private const int MaxSaved = 500;
        private const int MaxSavedTextLength = 4000;
        private const int MaxMuteMinutes = 60 * 24 * 365;

        private readonly AppDbContext _db;

        public MePrefsController(AppDbContext db) => _db = db;

        private string? CurrentUserId => User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        private static long NowMs => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        [HttpGet("prefs")]
        public async Task<IActionResult> GetPrefs()
        {
            var me = CurrentUserId;
            if (me == null) return Unauthorized();

            var blocked = await _db.UserBlocks.AsNoTracking()
                .Where(b => b.BlockerId == me)
                .Join(_db.Users, b => b.BlockedId, u => u.Id, (b, u) => new { id = u.Id, username = u.Username, avatarId = u.AvatarId })
                .ToListAsync();

            // Karşı tarafın beni engellediği kişiler: DM kutusunu kapatmak için
            var blockedBy = await _db.UserBlocks.AsNoTracking()
                .Where(b => b.BlockedId == me)
                .Select(b => b.BlockerId)
                .ToListAsync();

            var now = NowMs;
            var mutes = await _db.UserMutes.AsNoTracking()
                .Where(m => m.UserId == me && (m.UntilMs == null || m.UntilMs > now))
                .Select(m => new { key = m.TargetKey, until = m.UntilMs })
                .ToListAsync();

            var pinnedDms = await _db.DmPins.AsNoTracking()
                .Where(p => p.UserId == me)
                .OrderBy(p => p.CreatedAt)
                .Select(p => p.OtherUserId)
                .ToListAsync();

            return Ok(new { blocked, blockedBy, mutes, pinnedDms });
        }

        // ---------- Engelleme ----------

        [HttpPost("blocks/{userId}")]
        public async Task<IActionResult> Block(string userId)
        {
            var me = CurrentUserId;
            if (me == null) return Unauthorized();
            if (userId == me) return BadRequest("Kendini engelleyemezsin.");
            if (!await _db.Users.AnyAsync(u => u.Id == userId)) return NotFound();

            if (!await _db.UserBlocks.AnyAsync(b => b.BlockerId == me && b.BlockedId == userId))
            {
                _db.UserBlocks.Add(new UserBlock { BlockerId = me, BlockedId = userId });
                // Engellenen sohbet sabitli kalmasın
                var pin = await _db.DmPins.FindAsync(me, userId);
                if (pin != null) _db.DmPins.Remove(pin);
                await _db.SaveChangesAsync();
            }
            return NoContent();
        }

        [HttpDelete("blocks/{userId}")]
        public async Task<IActionResult> Unblock(string userId)
        {
            var me = CurrentUserId;
            if (me == null) return Unauthorized();
            var row = await _db.UserBlocks.FindAsync(me, userId);
            if (row != null)
            {
                _db.UserBlocks.Remove(row);
                await _db.SaveChangesAsync();
            }
            return NoContent();
        }

        // ---------- Bildirim susturma ----------

        [HttpPut("mutes")]
        public async Task<IActionResult> SetMute([FromBody] MuteDto dto)
        {
            var me = CurrentUserId;
            if (me == null) return Unauthorized();
            var key = dto.Key?.Trim() ?? "";
            if (key.Length is 0 or > 300 || !(key.StartsWith("dm:") || key.StartsWith("room:")))
                return BadRequest("Geçersiz hedef.");

            var row = await _db.UserMutes.FindAsync(me, key);
            if (dto.Minutes == 0)
            {
                if (row != null) _db.UserMutes.Remove(row);
                await _db.SaveChangesAsync();
                return Ok(new { key, muted = false, until = (long?)null });
            }

            long? until = dto.Minutes is int min ? NowMs + (long)Math.Clamp(min, 1, MaxMuteMinutes) * 60_000 : null;
            if (row == null) _db.UserMutes.Add(new UserMute { UserId = me, TargetKey = key, UntilMs = until });
            else row.UntilMs = until;
            await _db.SaveChangesAsync();
            return Ok(new { key, muted = true, until });
        }

        // ---------- DM sabitleme ----------

        [HttpPut("pins/{userId}")]
        public async Task<IActionResult> PinDm(string userId)
        {
            var me = CurrentUserId;
            if (me == null) return Unauthorized();
            if (userId == me || !await _db.Users.AnyAsync(u => u.Id == userId)) return NotFound();
            if (await _db.DmPins.FindAsync(me, userId) == null)
            {
                _db.DmPins.Add(new DmPin { UserId = me, OtherUserId = userId });
                await _db.SaveChangesAsync();
            }
            return NoContent();
        }

        [HttpDelete("pins/{userId}")]
        public async Task<IActionResult> UnpinDm(string userId)
        {
            var me = CurrentUserId;
            if (me == null) return Unauthorized();
            var row = await _db.DmPins.FindAsync(me, userId);
            if (row != null)
            {
                _db.DmPins.Remove(row);
                await _db.SaveChangesAsync();
            }
            return NoContent();
        }

        // ---------- Kaydedilen mesajlar ----------

        [HttpGet("saved")]
        public async Task<IActionResult> GetSaved()
        {
            var me = CurrentUserId;
            if (me == null) return Unauthorized();
            var items = await _db.SavedMessages.AsNoTracking()
                .Where(s => s.UserId == me)
                .OrderByDescending(s => s.SavedAt)
                .Take(MaxSaved)
                .ToListAsync();
            return Ok(items);
        }

        [HttpPost("saved")]
        public async Task<IActionResult> Save([FromBody] SaveMessageDto dto)
        {
            var me = CurrentUserId;
            if (me == null) return Unauthorized();
            var text = (dto.Text ?? "").Trim();
            if (text.Length == 0 && string.IsNullOrWhiteSpace(dto.FileUrl)) return BadRequest("Boş mesaj kaydedilemez.");
            if (text.Length > MaxSavedTextLength) text = text[..MaxSavedTextLength];

            // Aynı mesaj iki kez kaydedilmesin
            var existing = await _db.SavedMessages.AsNoTracking()
                .FirstOrDefaultAsync(s => s.UserId == me && s.MessageTs == dto.MessageTs && s.Author == dto.Author && s.Text == text);
            if (existing != null) return Ok(existing);

            if (await _db.SavedMessages.CountAsync(s => s.UserId == me) >= MaxSaved)
                return BadRequest($"En fazla {MaxSaved} mesaj kaydedebilirsin.");

            var row = new SavedMessage
            {
                UserId = me,
                Kind = dto.Kind == "dm" ? "dm" : "room",
                Location = Truncate(dto.Location, 120),
                Author = Truncate(dto.Author, 64),
                AuthorAvatarId = Truncate(dto.AuthorAvatarId ?? "default", 300),
                Text = text,
                FileUrl = string.IsNullOrWhiteSpace(dto.FileUrl) ? null : Truncate(dto.FileUrl, 1000),
                FileName = string.IsNullOrWhiteSpace(dto.FileName) ? null : Truncate(dto.FileName, 255),
                MessageTs = dto.MessageTs,
            };
            _db.SavedMessages.Add(row);
            await _db.SaveChangesAsync();
            return Ok(row);
        }

        [HttpDelete("saved/{id:long}")]
        public async Task<IActionResult> Unsave(long id)
        {
            var me = CurrentUserId;
            if (me == null) return Unauthorized();
            var row = await _db.SavedMessages.FirstOrDefaultAsync(s => s.Id == id && s.UserId == me);
            if (row != null)
            {
                _db.SavedMessages.Remove(row);
                await _db.SaveChangesAsync();
            }
            return NoContent();
        }

        private static string Truncate(string? s, int max) => string.IsNullOrEmpty(s) ? "" : (s.Length > max ? s[..max] : s);
    }
}
