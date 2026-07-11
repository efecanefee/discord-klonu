using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using DiscordClone.Api.Data;
using DiscordClone.Api.Hubs;
using DiscordClone.Api.Models;

namespace DiscordClone.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class RoomsController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly IHubContext<ChatAndSignalingHub> _hubContext;

        public RoomsController(AppDbContext db, IHubContext<ChatAndSignalingHub> hubContext)
        {
            _db = db;
            _hubContext = hubContext;
        }

        /// <summary>
        /// Tüm odaları listele
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> GetRooms()
        {
            var rooms = await _db.Rooms
                .Where(r => !r.IsPrivate)
                .OrderBy(r => r.CreatedAt)
                .Select(r => new
                {
                    r.Id,
                    r.Name,
                    r.Type,
                    r.Description,
                    r.CreatedBy,
                    r.CreatedAt,
                    r.IsPrivate,
                    r.RoomCode
                })
                .ToListAsync();

            return Ok(rooms);
        }

        /// <summary>
        /// Yeni oda oluştur
        /// </summary>
        [HttpPost]
        public async Task<IActionResult> CreateRoom([FromBody] CreateRoomDto dto)
        {
            // Validasyon
            if (string.IsNullOrWhiteSpace(dto.Name))
                return BadRequest("Oda adı boş olamaz.");

            if (dto.Name.Length > 50)
                return BadRequest("Oda adı en fazla 50 karakter olabilir.");

            var type = dto.Type?.ToLower() ?? "text";
            if (type != "text" && type != "voice")
                return BadRequest("Oda türü 'text' veya 'voice' olmalıdır.");

            if (dto.Description?.Length > 200)
                return BadRequest("Açıklama en fazla 200 karakter olabilir.");

            // Aynı isimde oda var mı kontrol et
            var exists = await _db.Rooms.AnyAsync(r => r.Name == dto.Name.Trim());
            if (exists)
                return BadRequest("Bu isimde bir oda zaten mevcut.");

            var username = User.Identity?.Name ?? "unknown";

            var roomCode = Guid.NewGuid().ToString("N").Substring(0, 6).ToUpper();

            var room = new Room
            {
                Name = dto.Name.Trim(),
                Type = type,
                Description = dto.Description?.Trim(),
                CreatedBy = username,
                CreatedAt = DateTime.UtcNow,
                IsPrivate = dto.IsPrivate,
                RoomCode = roomCode
            };

            _db.Rooms.Add(room);
            await _db.SaveChangesAsync();

            var roomData = new
            {
                room.Id,
                room.Name,
                room.Type,
                room.Description,
                room.CreatedBy,
                room.CreatedAt,
                room.IsPrivate,
                room.RoomCode
            };

            // SignalR ile tüm bağlı istemcilere yeni oda bilgisini yayınla
            await _hubContext.Clients.All.SendAsync("RoomCreated", roomData);

            return Created($"/api/rooms/{room.Id}", roomData);
        }

        /// <summary>
        /// Oda sil (sadece oda sahibi)
        /// </summary>
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteRoom(int id)
        {
            var currentUsername = User.Identity?.Name;
            if (string.IsNullOrEmpty(currentUsername)) return Unauthorized();

            var room = await _db.Rooms.FindAsync(id);
            if (room == null) return NotFound("Oda bulunamadı.");

            if (room.CreatedBy != currentUsername)
                return Forbid();

            // Odaya ait mesajları sil
            var roomMessages = _db.Messages.Where(m => m.RoomId == room.Name);
            _db.Messages.RemoveRange(roomMessages);
            
            _db.Rooms.Remove(room);
            await _db.SaveChangesAsync();

            // SignalR ile tüm bağlı istemcilere oda silindiğini bildir
            await _hubContext.Clients.All.SendAsync("RoomDeleted", id);

            return NoContent();
        }

        /// <summary>
        /// Oda ara (kod veya isim ile)
        /// </summary>
        [HttpGet("search")]
        public async Task<IActionResult> SearchRooms([FromQuery] string query)
        {
            if (string.IsNullOrWhiteSpace(query))
                return BadRequest("Arama terimi gerekli.");

            var trimmed = query.Trim();
            
            // Önce oda koduna göre tam eşleşme ara (gizli odalar dahil)
            var codeMatch = await _db.Rooms
                .Where(r => r.RoomCode == trimmed.ToUpper())
                .Select(r => new { r.Id, r.Name, r.Type, r.Description, r.CreatedBy, r.CreatedAt, r.IsPrivate, r.RoomCode })
                .FirstOrDefaultAsync();
            
            if (codeMatch != null)
                return Ok(new[] { codeMatch });

            // İsme göre ara (sadece açık odalar)
            var nameMatches = await _db.Rooms
                .Where(r => !r.IsPrivate && r.Name.Contains(trimmed))
                .OrderBy(r => r.Name)
                .Take(20)
                .Select(r => new { r.Id, r.Name, r.Type, r.Description, r.CreatedBy, r.CreatedAt, r.IsPrivate, r.RoomCode })
                .ToListAsync();
            
            return Ok(nameMatches);
        }
    }
}
