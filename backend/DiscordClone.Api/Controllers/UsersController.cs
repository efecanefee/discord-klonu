using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using DiscordClone.Api.Data;

namespace DiscordClone.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class UsersController : ControllerBase
    {
        private readonly AppDbContext _db;

        public UsersController(AppDbContext db)
        {
            _db = db;
        }

        /// <summary>
        /// Sistemdeki tüm kullanıcıları listele (DM arama için)
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> GetUsers()
        {
            var currentUserUsername = User.Identity?.Name;

            var users = await _db.Users
                .Where(u => u.IsVerified) // Sadece doğrulanmış kullanıcıları getir
                .OrderByDescending(u => u.CustomStatus == "online")
                .ThenByDescending(u => u.LastSeen)
                .Select(u => new
                {
                    u.Id,
                    u.Username,
                    u.FirstName,
                    u.LastName,
                    u.AvatarId,
                    u.CustomStatus,
                    u.LastSeen
                })
                .ToListAsync();

            return Ok(users);
        }

        /// <summary>
        /// Sadece şu an online olan doğrulanmış kullanıcıların isimlerini getirir (Tooltip için)
        /// </summary>
        [HttpGet("online")]
        public async Task<IActionResult> GetOnlineUsers()
        {
            var onlineUsers = await _db.Users
                .Where(u => u.IsVerified && u.CustomStatus == "online")
                .OrderBy(u => u.Username)
                .Select(u => u.Username)
                .ToListAsync();

            return Ok(onlineUsers);
        }
    }
}
