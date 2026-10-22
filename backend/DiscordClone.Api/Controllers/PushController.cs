using System.Security.Claims;
using DiscordClone.Api.Data;
using DiscordClone.Api.Models;
using DiscordClone.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DiscordClone.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class PushController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly IPushNotificationService _push;

        public PushController(AppDbContext db, IPushNotificationService push)
        {
            _db = db;
            _push = push;
        }

        // İstemci aboneliği bu anahtarla açar; null ise sunucuda push kapalıdır.
        [HttpGet("public-key")]
        [AllowAnonymous]
        public IActionResult GetPublicKey() => Ok(new { enabled = _push.IsEnabled, publicKey = _push.PublicKey });

        [HttpPost("subscribe")]
        public async Task<IActionResult> Subscribe([FromBody] PushSubscribeDto dto)
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null) return Unauthorized();
            if (!_push.IsEnabled) return StatusCode(503, "Push bildirimleri sunucuda kapalı.");
            if (!Uri.TryCreate(dto.Endpoint, UriKind.Absolute, out var uri) || uri.Scheme != "https"
                || dto.Endpoint.Length > 1000 || string.IsNullOrEmpty(dto.Keys.P256dh) || string.IsNullOrEmpty(dto.Keys.Auth)
                || dto.Keys.P256dh.Length > 200 || dto.Keys.Auth.Length > 100)
                return BadRequest("Geçersiz abonelik.");

            // Aynı tarayıcı başka hesapla girmişse abonelik yeni kullanıcıya geçer
            var existing = await _db.PushSubscriptions.FirstOrDefaultAsync(s => s.Endpoint == dto.Endpoint);
            if (existing != null)
            {
                existing.UserId = userId;
                existing.P256dh = dto.Keys.P256dh;
                existing.Auth = dto.Keys.Auth;
            }
            else
            {
                // Bir kullanıcı için makul bir cihaz sınırı
                var count = await _db.PushSubscriptions.CountAsync(s => s.UserId == userId);
                if (count >= 10)
                {
                    var oldest = await _db.PushSubscriptions.Where(s => s.UserId == userId).OrderBy(s => s.CreatedAt).FirstAsync();
                    _db.PushSubscriptions.Remove(oldest);
                }
                _db.PushSubscriptions.Add(new PushSubscriptionEntry
                {
                    UserId = userId,
                    Endpoint = dto.Endpoint,
                    P256dh = dto.Keys.P256dh,
                    Auth = dto.Keys.Auth
                });
            }
            await _db.SaveChangesAsync();
            return Ok();
        }

        [HttpPost("unsubscribe")]
        public async Task<IActionResult> Unsubscribe([FromBody] PushUnsubscribeDto dto)
        {
            var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            if (userId == null) return Unauthorized();
            await _db.PushSubscriptions.Where(s => s.Endpoint == dto.Endpoint && s.UserId == userId).ExecuteDeleteAsync();
            return Ok();
        }
    }
}
