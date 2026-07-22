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

            // En son mesajlaşılan kullanıcıları bul (Gönderen veya alan)
            var recentUserIds = await _db.DirectMessages
                .Where(m => m.SenderId == currentUserId || m.ReceiverId == currentUserId)
                .OrderByDescending(m => m.CreatedAt)
                .Select(m => m.SenderId == currentUserId ? m.ReceiverId : m.SenderId)
                .Distinct()
                .Take(20)
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

        /// <summary>
        /// Kişi başına okunmamış DM sayıları (login sonrası rozetleri doldurmak için)
        /// </summary>
        [HttpGet("unread-counts")]
        public async Task<IActionResult> GetUnreadCounts()
        {
            var currentUsername = User.Identity?.Name;
            if (string.IsNullOrEmpty(currentUsername)) return Unauthorized();

            var currentUser = await _db.Users.FirstOrDefaultAsync(u => u.Username == currentUsername);
            if (currentUser == null) return Unauthorized();

            var counts = await _db.DirectMessages
                .Where(m => m.ReceiverId == currentUser.Id && !m.IsRead && !m.IsDeleted)
                .GroupBy(m => m.SenderId)
                .Select(g => new { otherUserId = g.Key, count = g.Count() })
                .ToListAsync();

            return Ok(counts);
        }

        /// <summary>
        /// Bir kişiden gelen okunmamış DM'leri okundu işaretle (REST — hub'daki
        /// MarkMessagesAsRead ile aynı iş; bağlantı olmayan akışlar için)
        /// </summary>
        [HttpPost("mark-read/{otherUserId}")]
        public async Task<IActionResult> MarkRead(string otherUserId)
        {
            var currentUsername = User.Identity?.Name;
            if (string.IsNullOrEmpty(currentUsername)) return Unauthorized();

            var currentUser = await _db.Users.FirstOrDefaultAsync(u => u.Username == currentUsername);
            if (currentUser == null) return Unauthorized();

            var unread = await _db.DirectMessages
                .Where(m => m.SenderId == otherUserId && m.ReceiverId == currentUser.Id && !m.IsRead)
                .ToListAsync();
            if (unread.Count > 0)
            {
                foreach (var m in unread) m.IsRead = true;
                await _db.SaveChangesAsync();
            }
            return NoContent();
        }
    }
}
