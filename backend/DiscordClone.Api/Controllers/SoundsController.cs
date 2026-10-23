using System.Security.Claims;
using DiscordClone.Api.Data;
using DiscordClone.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DiscordClone.Api.Controllers
{
    // Soundboard + Ses Mağazası.
    // user_sounds ortak ses kütüphanesidir (yükleme /api/upload üzerinden, sonra buraya kaydedilir).
    // Kişisel soundboard = kullanıcının kendi yükledikleri + mağazadan ekledikleri (soundboard_saves).
    [ApiController]
    [Route("api/sounds")]
    [Authorize]
    public class SoundsController : ControllerBase
    {
        private const int MaxSoundsPerUser = 20;   // kendi yüklediği
        private const int MaxSavedPerUser = 30;    // mağazadan eklediği
        private const int StorePageSize = 30;
        private readonly AppDbContext _db;

        public SoundsController(AppDbContext db)
        {
            _db = db;
        }

        private string? CurrentUserId => User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        // Kişisel soundboard: favoriler en başta; sonra kendi seslerim, sonra mağazadan eklediklerim.
        [HttpGet]
        public async Task<IActionResult> GetMySounds()
        {
            var userId = CurrentUserId;
            if (userId == null) return Unauthorized();

            var own = await _db.UserSounds
                .Where(s => s.UserId == userId && !s.IsDeleted)
                .OrderBy(s => s.CreatedAt)
                .Select(s => new
                {
                    s.Id, s.Name, s.Url, s.IsPublic,
                    IsMine = true,
                    UploaderUsername = (string?)null,
                    SaveCount = _db.SoundboardSaves.Count(x => x.SoundId == s.Id),
                    s.PlayCount,
                    IsFavorite = _db.SoundFavorites.Any(f => f.UserId == userId && f.SoundId == s.Id),
                })
                .ToListAsync();

            var saved = await (
                from sv in _db.SoundboardSaves
                where sv.UserId == userId
                join s in _db.UserSounds on sv.SoundId equals s.Id
                join u in _db.Users on s.UserId equals u.Id into uploaders
                from u in uploaders.DefaultIfEmpty()
                orderby sv.CreatedAt
                select new
                {
                    s.Id, s.Name, s.Url, s.IsPublic,
                    IsMine = false,
                    UploaderUsername = u != null ? u.Username : null,
                    SaveCount = 0,
                    s.PlayCount,
                    IsFavorite = _db.SoundFavorites.Any(f => f.UserId == userId && f.SoundId == s.Id),
                })
                .ToListAsync();

            // OrderBy kararlıdır: favoriler öne geçer, geri kalan sıra korunur
            return Ok(own.Concat(saved).OrderBy(x => x.IsFavorite ? 0 : 1));
        }

        public class AddSoundDto
        {
            public string Name { get; set; } = string.Empty;
            public string Url { get; set; } = string.Empty;
            public bool? IsPublic { get; set; }
        }

        [HttpPost]
        public async Task<IActionResult> AddSound([FromBody] AddSoundDto request)
        {
            var userId = CurrentUserId;
            if (userId == null) return Unauthorized();

            var name = (request.Name ?? "").Trim();
            var url = (request.Url ?? "").Trim();
            if (name.Length == 0 || name.Length > 32) return BadRequest("Ses adı 1-32 karakter olmalı.");
            if (url.Length == 0 || url.Length > 500 || !url.StartsWith("http")) return BadRequest("Geçersiz ses adresi.");

            var count = await _db.UserSounds.CountAsync(s => s.UserId == userId && !s.IsDeleted);
            if (count >= MaxSoundsPerUser) return BadRequest($"En fazla {MaxSoundsPerUser} ses yükleyebilirsin.");

            var sound = new UserSound
            {
                UserId = userId, Name = name, Url = url,
                IsPublic = request.IsPublic ?? true,
                CreatedAt = DateTime.UtcNow,
            };
            _db.UserSounds.Add(sound);
            await _db.SaveChangesAsync();
            return Ok(new { sound.Id, sound.Name, sound.Url, sound.IsPublic, IsMine = true, UploaderUsername = (string?)null, SaveCount = 0, PlayCount = 0L, IsFavorite = false });
        }

        // Kendi sesimse: siler (başkaları eklediyse onlarda kalır, mağazadan kalkar).
        // Mağazadan eklediğimse: yalnızca soundboard'umdan çıkarır.
        [HttpDelete("{id:long}")]
        public async Task<IActionResult> DeleteSound(long id)
        {
            var userId = CurrentUserId;
            if (userId == null) return Unauthorized();

            var sound = await _db.UserSounds.FirstOrDefaultAsync(s => s.Id == id && s.UserId == userId && !s.IsDeleted);
            if (sound != null)
            {
                var savedByOthers = await _db.SoundboardSaves.AnyAsync(x => x.SoundId == id);
                if (savedByOthers)
                {
                    sound.IsDeleted = true;
                    sound.IsPublic = false;
                    _db.SoundFavorites.RemoveRange(_db.SoundFavorites.Where(f => f.UserId == userId && f.SoundId == id));
                }
                else
                {
                    _db.UserSounds.Remove(sound);
                }
                await _db.SaveChangesAsync();
                return NoContent();
            }

            var save = await _db.SoundboardSaves.FirstOrDefaultAsync(x => x.UserId == userId && x.SoundId == id);
            if (save == null) return NotFound();
            _db.SoundboardSaves.Remove(save);
            _db.SoundFavorites.RemoveRange(_db.SoundFavorites.Where(f => f.UserId == userId && f.SoundId == id));
            await _db.SaveChangesAsync();
            await PurgeIfOrphanedAsync(id);
            return NoContent();
        }

        public class VisibilityDto
        {
            public bool IsPublic { get; set; }
        }

        // Kendi sesimi mağazada göster / gizle.
        [HttpPatch("{id:long}/visibility")]
        public async Task<IActionResult> SetVisibility(long id, [FromBody] VisibilityDto request)
        {
            var userId = CurrentUserId;
            if (userId == null) return Unauthorized();

            var sound = await _db.UserSounds.FirstOrDefaultAsync(s => s.Id == id && s.UserId == userId && !s.IsDeleted);
            if (sound == null) return NotFound();
            sound.IsPublic = request.IsPublic;
            await _db.SaveChangesAsync();
            return Ok(new { sound.Id, sound.IsPublic });
        }

        // Soundboard'umdaki bir sesi favorile / favoriden çıkar.
        [HttpPut("{id:long}/favorite")]
        public async Task<IActionResult> AddFavorite(long id)
        {
            var userId = CurrentUserId;
            if (userId == null) return Unauthorized();

            var onBoard = await _db.UserSounds.AnyAsync(s => s.Id == id && s.UserId == userId && !s.IsDeleted)
                || await _db.SoundboardSaves.AnyAsync(x => x.UserId == userId && x.SoundId == id);
            if (!onBoard) return NotFound();

            if (!await _db.SoundFavorites.AnyAsync(f => f.UserId == userId && f.SoundId == id))
            {
                _db.SoundFavorites.Add(new SoundFavorite { UserId = userId, SoundId = id, CreatedAt = DateTime.UtcNow });
                await _db.SaveChangesAsync();
            }
            return NoContent();
        }

        [HttpDelete("{id:long}/favorite")]
        public async Task<IActionResult> RemoveFavorite(long id)
        {
            var userId = CurrentUserId;
            if (userId == null) return Unauthorized();

            var fav = await _db.SoundFavorites.FirstOrDefaultAsync(f => f.UserId == userId && f.SoundId == id);
            if (fav != null)
            {
                _db.SoundFavorites.Remove(fav);
                await _db.SaveChangesAsync();
            }
            return NoContent();
        }

        // ============ SES MAĞAZASI ============

        // Herkese açık sesler; yükleyen bilgisi ve kaç kişinin eklediğiyle.
        // sort: "new" (varsayılan) | "popular" (en çok eklenen) | "played" (en çok çalınan);
        // q: ses adı veya yükleyen adı araması.
        [HttpGet("store")]
        public async Task<IActionResult> GetStore([FromQuery] string? q, [FromQuery] string? sort, [FromQuery] int page = 1)
        {
            var userId = CurrentUserId;
            if (userId == null) return Unauthorized();
            if (page < 1) page = 1;

            var query =
                from s in _db.UserSounds
                where s.IsPublic && !s.IsDeleted
                join u in _db.Users on s.UserId equals u.Id
                select new
                {
                    s.Id, s.Name, s.Url, s.CreatedAt,
                    UploaderId = u.Id,
                    UploaderUsername = u.Username,
                    UploaderAvatarId = u.AvatarId,
                    SaveCount = _db.SoundboardSaves.Count(x => x.SoundId == s.Id),
                    s.PlayCount,
                    IsSaved = _db.SoundboardSaves.Any(x => x.SoundId == s.Id && x.UserId == userId),
                    IsMine = s.UserId == userId,
                };

            var term = (q ?? "").Trim();
            if (term.Length > 0)
            {
                if (term.Length > 50) term = term[..50];
                var pattern = "%" + term.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_") + "%";
                query = query.Where(x => EF.Functions.ILike(x.Name, pattern) || EF.Functions.ILike(x.UploaderUsername, pattern));
            }

            query = sort switch
            {
                "popular" => query.OrderByDescending(x => x.SaveCount).ThenByDescending(x => x.PlayCount).ThenByDescending(x => x.Id),
                "played" => query.OrderByDescending(x => x.PlayCount).ThenByDescending(x => x.SaveCount).ThenByDescending(x => x.Id),
                _ => query.OrderByDescending(x => x.CreatedAt).ThenByDescending(x => x.Id),
            };

            var items = await query
                .Skip((page - 1) * StorePageSize)
                .Take(StorePageSize + 1)
                .ToListAsync();

            return Ok(new
            {
                Items = items.Take(StorePageSize),
                HasMore = items.Count > StorePageSize,
            });
        }

        // Mağazadaki bir sesi kendi soundboard'uma ekle.
        [HttpPost("{id:long}/save")]
        public async Task<IActionResult> SaveSound(long id)
        {
            var userId = CurrentUserId;
            if (userId == null) return Unauthorized();

            var sound = await _db.UserSounds.FirstOrDefaultAsync(s => s.Id == id && s.IsPublic && !s.IsDeleted);
            if (sound == null) return NotFound("Ses bulunamadı.");
            if (sound.UserId == userId) return BadRequest("Bu ses zaten senin.");

            if (await _db.SoundboardSaves.AnyAsync(x => x.UserId == userId && x.SoundId == id))
                return NoContent();

            var savedCount = await _db.SoundboardSaves.CountAsync(x => x.UserId == userId);
            if (savedCount >= MaxSavedPerUser) return BadRequest($"Mağazadan en fazla {MaxSavedPerUser} ses ekleyebilirsin.");

            _db.SoundboardSaves.Add(new SoundboardSave { UserId = userId, SoundId = id, CreatedAt = DateTime.UtcNow });
            await _db.SaveChangesAsync();
            return NoContent();
        }

        // Mağaza ekranından soundboard'dan çıkar.
        [HttpDelete("{id:long}/save")]
        public async Task<IActionResult> UnsaveSound(long id)
        {
            var userId = CurrentUserId;
            if (userId == null) return Unauthorized();

            var save = await _db.SoundboardSaves.FirstOrDefaultAsync(x => x.UserId == userId && x.SoundId == id);
            if (save == null) return NoContent();
            _db.SoundboardSaves.Remove(save);
            _db.SoundFavorites.RemoveRange(_db.SoundFavorites.Where(f => f.UserId == userId && f.SoundId == id));
            await _db.SaveChangesAsync();
            await PurgeIfOrphanedAsync(id);
            return NoContent();
        }

        // Yükleyeni silmiş ve artık kimsenin soundboard'unda olmayan sesi tamamen kaldır.
        private async Task PurgeIfOrphanedAsync(long soundId)
        {
            var sound = await _db.UserSounds.FirstOrDefaultAsync(s => s.Id == soundId && s.IsDeleted);
            if (sound == null) return;
            if (await _db.SoundboardSaves.AnyAsync(x => x.SoundId == soundId)) return;
            _db.UserSounds.Remove(sound);
            await _db.SaveChangesAsync();
        }
    }
}
