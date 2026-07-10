using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.SignalR;
using DiscordClone.Api.Data;
using DiscordClone.Api.Models;
using DiscordClone.Api.Hubs;
using System.Security.Claims;

namespace DiscordClone.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class UsersController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly IHubContext<ChatAndSignalingHub> _hubContext;

        public UsersController(AppDbContext db, IHubContext<ChatAndSignalingHub> hubContext)
        {
            _db = db;
            _hubContext = hubContext;
        }

        [HttpGet]
        public async Task<IActionResult> GetUsers()
        {
            var currentUserUsername = User.Identity?.Name;

            var users = await _db.Users
                .Where(u => u.IsVerified)
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
                    u.CustomStatusMessage,
                    LastSeen = u.ShowLastSeen ? u.LastSeen : (DateTime?)null
                })
                .ToListAsync();

            return Ok(users);
        }

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

        [HttpPut("status")]
        public async Task<IActionResult> UpdateStatus([FromBody] UpdateStatusDto dto)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (userId == null) return Unauthorized();

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null) return NotFound();

            user.CustomStatus = dto.CustomStatus;
            user.CustomStatusMessage = dto.CustomStatusMessage;
            user.LastSeen = DateTime.UtcNow;

            await _db.SaveChangesAsync();

            // Broadcast status to everyone
            await _hubContext.Clients.All.SendAsync("UserStatusChanged", new
            {
                userId = user.Id,
                status = user.CustomStatus,
                message = user.CustomStatusMessage,
                lastSeen = user.ShowLastSeen ? user.LastSeen : (DateTime?)null
            });

            return Ok();
        }

        [HttpPut("privacy")]
        public async Task<IActionResult> UpdatePrivacy([FromBody] UpdatePrivacyDto dto)
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (userId == null) return Unauthorized();

            var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
            if (user == null) return NotFound();

            user.ShowLastSeen = dto.ShowLastSeen;
            await _db.SaveChangesAsync();

            // Broadcast so UI updates last seen visibility
            await _hubContext.Clients.All.SendAsync("UserStatusChanged", new
            {
                userId = user.Id,
                status = user.CustomStatus,
                message = user.CustomStatusMessage,
                lastSeen = user.ShowLastSeen ? user.LastSeen : (DateTime?)null
            });

            return Ok();
        }
    }
}
