using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using DiscordClone.Api.Data;

namespace DiscordClone.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class DirectMessagesController : ControllerBase
    {
        private readonly AppDbContext _db;

        public DirectMessagesController(AppDbContext db)
        {
            _db = db;
        }

        /// <summary>
        /// İki kullanıcı arasındaki mesaj geçmişini getirir
        /// </summary>
        [HttpGet("{otherUserId}")]
        public async Task<IActionResult> GetDirectMessages(string otherUserId)
        {
            var currentUsername = User.Identity?.Name;
            if (string.IsNullOrEmpty(currentUsername)) return Unauthorized();

            var currentUser = await _db.Users.FirstOrDefaultAsync(u => u.Username == currentUsername);
            if (currentUser == null) return Unauthorized();

            var currentUserId = currentUser.Id;

            var twoWeeksAgo = DateTime.UtcNow.AddDays(-14);

            var messages = await _db.DirectMessages
                .Where(m => 
                    ((m.SenderId == currentUserId && m.ReceiverId == otherUserId) ||
                    (m.SenderId == otherUserId && m.ReceiverId == currentUserId)) &&
                    m.CreatedAt >= twoWeeksAgo && !m.IsDeleted)
                .OrderByDescending(m => m.CreatedAt)
                .Take(200) // Son 200 mesaj (en yeni 200)
                .ToListAsync();

            messages.Reverse(); // Kronolojik sıraya çevir

            return Ok(messages);
        }

        /// <summary>
        /// Kullanıcının son konuştuğu kişileri getirir
        /// </summary>
        [HttpGet("recent")]
        public async Task<IActionResult> GetRecentDMs()
        {
            var currentUsername = User.Identity?.Name;
            if (string.IsNullOrEmpty(currentUsername)) return Unauthorized();

            var currentUser = await _db.Users.FirstOrDefaultAsync(u => u.Username == currentUsername);
            if (currentUser == null) return Unauthorized();

            var currentUserId = currentUser.Id;

            // En son mesajlaşılan kullanıcıları bul (en yeni mesaj sırasına göre)
            var recentUserIds = await _db.DirectMessages
                .Where(m => m.SenderId == currentUserId || m.ReceiverId == currentUserId)
                .GroupBy(m => m.SenderId == currentUserId ? m.ReceiverId : m.SenderId)
                .Select(g => new { UserId = g.Key, LastMessageAt = g.Max(m => m.CreatedAt) })
                .OrderByDescending(x => x.LastMessageAt)
                .Take(20)
                .Select(x => x.UserId)
                .ToListAsync();

            var recentUsers = await _db.Users
                .Where(u => recentUserIds.Contains(u.Id))
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

            // Sıralamayı korumak için LINQ ile bellekte sırala
            var sortedUsers = recentUserIds
                .Select(id => recentUsers.FirstOrDefault(u => u.Id == id))
                .Where(u => u != null)
                .ToList();

            return Ok(sortedUsers);
        }
    }
}
