using DiscordClone.Api.Data;
using DiscordClone.Api.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace DiscordClone.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class BadgesController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly IWeeklyStatsService _stats;

        public BadgesController(AppDbContext db, IWeeklyStatsService stats)
        {
            _db = db;
            _stats = stats;
        }

        // Geçen haftanın rozet sahipleri + bu haftanın şu anki liderleri
        [HttpGet("weekly")]
        public async Task<IActionResult> GetWeekly()
        {
            var thisWeek = WeekClock.CurrentWeekStartUtc();
            var earned = await _stats.GetBadgesAsync(thisWeek.AddDays(-7));
            var leaders = await _stats.GetBadgesAsync(thisWeek);
            return Ok(new
            {
                weekStart = thisWeek,
                weekEnd = thisWeek.AddDays(7),
                definitions = WeeklyStatsService.Badges,
                earned = earned.Holders,
                leaders = leaders.Holders,
            });
        }

        // Profil kartı: kullanıcının rozetleri ve bu haftaki istatistikleri
        [HttpGet("users/{id}")]
        public async Task<IActionResult> GetForUser(string id)
        {
            if (!await _db.Users.AnyAsync(u => u.Id == id)) return NotFound();

            var thisWeek = WeekClock.CurrentWeekStartUtc();
            var earned = await _stats.GetBadgesAsync(thisWeek.AddDays(-7));
            var leaders = await _stats.GetBadgesAsync(thisWeek);
            var stats = await _stats.GetUserStatsAsync(id, thisWeek);
            return Ok(new
            {
                weekStart = thisWeek,
                weekEnd = thisWeek.AddDays(7),
                earned = earned.Holders.Where(h => h.UserId == id),
                leading = leaders.Holders.Where(h => h.UserId == id),
                stats,
            });
        }
    }
}
