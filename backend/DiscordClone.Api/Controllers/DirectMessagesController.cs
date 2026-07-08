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

            var messages = await _db.DirectMessages
                .Where(m => 
                    (m.SenderId == currentUserId && m.ReceiverId == otherUserId) ||
                    (m.SenderId == otherUserId && m.ReceiverId == currentUserId))
                .OrderBy(m => m.CreatedAt)
                .Take(100) // Son 100 mesaj
                .ToListAsync();

            return Ok(messages);
        }
    }
}
