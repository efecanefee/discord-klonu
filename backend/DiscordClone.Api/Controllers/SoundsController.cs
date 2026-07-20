using System.Security.Claims;
using DiscordClone.Api.Data;
using DiscordClone.Api.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DiscordClone.Api.Controllers
{
    // Soundboard: kullanıcının kişisel ses efektleri (yükleme /api/upload üzerinden).
    [ApiController]
    [Route("api/sounds")]
    [Authorize]
    public class SoundsController : ControllerBase
    {
        private const int MaxSoundsPerUser = 10;
        private readonly AppDbContext _db;

        public SoundsController(AppDbContext db)
        {
            _db = db;
        }

        [HttpGet]
        public async Task<IActionResult> GetMySounds()
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null) return Unauthorized();

            var sounds = await _db.UserSounds
                .Where(s => s.UserId == userId)
                .OrderBy(s => s.CreatedAt)
                .Select(s => new { s.Id, s.Name, s.Url })
                .ToListAsync();
            return Ok(sounds);
        }

        public class AddSoundDto
        {
            public string Name { get; set; } = string.Empty;
            public string Url { get; set; } = string.Empty;
        }

        [HttpPost]
        public async Task<IActionResult> AddSound([FromBody] AddSoundDto request)
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null) return Unauthorized();

            var name = (request.Name ?? "").Trim();
            var url = (request.Url ?? "").Trim();
            if (name.Length == 0 || name.Length > 32) return BadRequest("Ses adı 1-32 karakter olmalı.");
            if (url.Length == 0 || url.Length > 500 || !url.StartsWith("http")) return BadRequest("Geçersiz ses adresi.");

            var count = await _db.UserSounds.CountAsync(s => s.UserId == userId);
            if (count >= MaxSoundsPerUser) return BadRequest($"En fazla {MaxSoundsPerUser} ses yükleyebilirsin.");

            var sound = new UserSound { UserId = userId, Name = name, Url = url, CreatedAt = DateTime.UtcNow };
            _db.UserSounds.Add(sound);
            await _db.SaveChangesAsync();
            return Ok(new { sound.Id, sound.Name, sound.Url });
        }

        [HttpDelete("{id:long}")]
        public async Task<IActionResult> DeleteSound(long id)
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null) return Unauthorized();

            var sound = await _db.UserSounds.FirstOrDefaultAsync(s => s.Id == id && s.UserId == userId);
            if (sound == null) return NotFound();

            _db.UserSounds.Remove(sound);
            await _db.SaveChangesAsync();
            return NoContent();
        }
    }
}
