using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using DiscordClone.Api.Data;
using DiscordClone.Api.Hubs;
using DiscordClone.Api.Models;
using DiscordClone.Api.Services;
using System.Security.Claims;

namespace DiscordClone.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class RoomsController : ControllerBase
    {
        private readonly AppDbContext _db;
        private readonly IHubContext<ChatAndSignalingHub> _hubContext;
        private readonly IRoomAuthorizationService _roomAuth;

        public RoomsController(AppDbContext db, IHubContext<ChatAndSignalingHub> hubContext, IRoomAuthorizationService roomAuth)
        {
            _db = db;
            _hubContext = hubContext;
            _roomAuth = roomAuth;
        }

        private string? CurrentUserId => User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

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
            var userId = CurrentUserId;

            var roomCode = Guid.NewGuid().ToString("N").Substring(0, 6).ToUpper();

            var room = new Room
            {
                Name = dto.Name.Trim(),
                Type = type,
                Description = dto.Description?.Trim(),
                CreatedBy = username,
                CreatedByUserId = userId,
                CreatedAt = DateTime.UtcNow,
                IsPrivate = dto.IsPrivate,
                RoomCode = roomCode
            };

            _db.Rooms.Add(room);
            await _db.SaveChangesAsync();

            // Kurucuyu owner olarak üye tablosuna ekle
            if (!string.IsNullOrEmpty(userId))
            {
                _db.RoomMembers.Add(new RoomMember { RoomId = room.Id, UserId = userId, Role = RoomRoles.Owner });
                await _db.SaveChangesAsync();
            }

            // Oda oluşunca varsayılan 2 kanal: metin (#genel) + ses (Sesli Sohbet)
            var channels = CreateDefaultChannels(room, username);
            _db.Channels.AddRange(channels);
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
                room.RoomCode,
                channels = channels.Select(c => new { c.Id, c.Name, c.Type, c.Position, c.MessageKey })
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
            var currentUserId = CurrentUserId;
            if (string.IsNullOrEmpty(currentUsername)) return Unauthorized();

            var room = await _db.Rooms.FindAsync(id);
            if (room == null) return NotFound("Oda bulunamadı.");

            // Sahiplik userId üzerinden; eski (userId'siz) odalarda username'e düş
            var isOwner = !string.IsNullOrEmpty(room.CreatedByUserId)
                ? room.CreatedByUserId == currentUserId
                : room.CreatedBy == currentUsername;
            if (!isOwner)
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

        // ============ KANALLAR (Özellik 8 — Faz 1) ============

        /// <summary>
        /// Bir odanın varsayılan metin + ses kanallarını üretir.
        /// Metin kanalının anahtarı = oda adı (mevcut mesajlarla uyumlu kalması için).
        /// </summary>
        private static List<Channel> CreateDefaultChannels(Room room, string createdBy)
        {
            return new List<Channel>
            {
                new Channel
                {
                    RoomId = room.Id,
                    Name = "genel",
                    Type = "text",
                    Position = 0,
                    MessageKey = room.Name,
                    CreatedBy = createdBy,
                    CreatedAt = DateTime.UtcNow
                },
                new Channel
                {
                    RoomId = room.Id,
                    Name = "Sesli Sohbet",
                    Type = "voice",
                    Position = 1,
                    MessageKey = $"voice:{room.Id}",
                    CreatedBy = createdBy,
                    CreatedAt = DateTime.UtcNow
                }
            };
        }

        /// <summary>
        /// Bir odanın kanallarını listele. Kanal yoksa (eski oda) varsayılanları üretip döner.
        /// </summary>
        [HttpGet("{roomId}/channels")]
        public async Task<IActionResult> GetChannels(int roomId)
        {
            var room = await _db.Rooms.FindAsync(roomId);
            if (room == null) return NotFound("Oda bulunamadı.");

            var channels = await _db.Channels
                .Where(c => c.RoomId == roomId)
                .OrderBy(c => c.Position).ThenBy(c => c.Id)
                .ToListAsync();

            // Kanal sistemi öncesi oluşturulmuş odalar için tembel geri-doldurma
            if (channels.Count == 0)
            {
                channels = CreateDefaultChannels(room, room.CreatedBy);
                _db.Channels.AddRange(channels);
                await _db.SaveChangesAsync();
            }

            return Ok(channels.Select(c => new { c.Id, c.Name, c.Type, c.Position, c.MessageKey }));
        }

        // ============ ROL SİSTEMİ (Özellik 6) ============

        public class UpdateRoomDto { public string? Description { get; set; } }

        /// <summary>
        /// Oda ayarlarını güncelle (açıklama). Yalnızca kurucu.
        /// Not: Oda adı SignalR grup anahtarı + mesaj room_id olduğundan burada değiştirilmez.
        /// </summary>
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateRoom(int id, [FromBody] UpdateRoomDto dto)
        {
            if (CurrentUserId == null) return Unauthorized();
            if (!await _roomAuth.IsOwnerAsync(id, CurrentUserId)) return Forbid();

            if (dto.Description?.Length > 200)
                return BadRequest("Açıklama en fazla 200 karakter olabilir.");

            var room = await _db.Rooms.FindAsync(id);
            if (room == null) return NotFound("Oda bulunamadı.");

            room.Description = dto.Description?.Trim();
            await _db.SaveChangesAsync();

            await _hubContext.Clients.All.SendAsync("RoomUpdated", new { room.Id, room.Description });
            return Ok(new { room.Id, room.Description });
        }

        /// <summary>
        /// Oda üyeleri + rolleri (owner → moderator → member sırasıyla).
        /// </summary>
        [HttpGet("{id}/members")]
        public async Task<IActionResult> GetMembers(int id)
        {
            if (CurrentUserId == null) return Unauthorized();
            if (await _roomAuth.GetRoleAsync(id, CurrentUserId) == null) return Forbid();

            var members = await _db.RoomMembers
                .Where(m => m.RoomId == id)
                .Join(_db.Users, m => m.UserId, u => u.Id, (m, u) => new
                {
                    userId = u.Id,
                    username = u.Username,
                    avatarId = u.AvatarId,
                    role = m.Role,
                    joinedAt = m.JoinedAt
                })
                .ToListAsync();

            // owner(0) → moderator(1) → member(2), sonra isim
            var ordered = members
                .OrderBy(m => m.role == RoomRoles.Owner ? 0 : m.role == RoomRoles.Moderator ? 1 : 2)
                .ThenBy(m => m.username)
                .ToList();

            return Ok(ordered);
        }

        public class SetRoleDto { public string Role { get; set; } = "member"; }

        /// <summary>
        /// Rol ata/al (sadece kurucu). 'moderator' veya 'member'.
        /// </summary>
        [HttpPut("{id}/members/{userId}/role")]
        public async Task<IActionResult> SetRole(int id, string userId, [FromBody] SetRoleDto dto)
        {
            if (CurrentUserId == null) return Unauthorized();
            if (!await _roomAuth.IsOwnerAsync(id, CurrentUserId)) return Forbid();

            var role = dto.Role?.ToLower();
            if (role != RoomRoles.Moderator && role != RoomRoles.Member)
                return BadRequest("Rol 'moderator' veya 'member' olmalı.");
            if (userId == CurrentUserId)
                return BadRequest("Kendi rolünü değiştiremezsin.");

            var member = await _db.RoomMembers.FirstOrDefaultAsync(m => m.RoomId == id && m.UserId == userId);
            if (member == null) return NotFound("Kullanıcı bu odanın üyesi değil.");
            if (member.Role == RoomRoles.Owner) return BadRequest("Kurucunun rolü değiştirilemez.");

            member.Role = role!;
            await _db.SaveChangesAsync();

            var room = await _db.Rooms.FindAsync(id);
            if (room != null)
            {
                ChatAndSignalingHub.UpdateUserRoleInMemory(room.Name, userId, role!);
                await _hubContext.Clients.Group(room.Name).SendAsync("MemberRoleChanged", userId, role);
            }

            return Ok(new { userId, role });
        }

        /// <summary>
        /// Kullanıcıyı odadan at (kick). Hiyerarşiye tabi.
        /// </summary>
        [HttpDelete("{id}/members/{userId}")]
        public async Task<IActionResult> KickMember(int id, string userId)
        {
            if (CurrentUserId == null) return Unauthorized();
            if (!await _roomAuth.CanModerateAsync(id, CurrentUserId, userId))
                return Forbid();

            var member = await _db.RoomMembers.FirstOrDefaultAsync(m => m.RoomId == id && m.UserId == userId);
            if (member != null)
            {
                _db.RoomMembers.Remove(member);
                await _db.SaveChangesAsync();
            }

            var room = await _db.Rooms.FindAsync(id);
            if (room != null)
                await _hubContext.Clients.Group(room.Name).SendAsync("MemberKicked", id, userId);

            return NoContent();
        }

        public class BanDto { public string? Reason { get; set; } }

        /// <summary>
        /// Kullanıcıyı yasakla (ban) — üyelikten çıkar + tekrar giremez. Hiyerarşiye tabi.
        /// </summary>
        [HttpPost("{id}/bans/{userId}")]
        public async Task<IActionResult> BanMember(int id, string userId, [FromBody] BanDto? dto)
        {
            if (CurrentUserId == null) return Unauthorized();
            if (!await _roomAuth.CanModerateAsync(id, CurrentUserId, userId))
                return Forbid();

            var existing = await _db.RoomBans.FirstOrDefaultAsync(b => b.RoomId == id && b.UserId == userId);
            if (existing == null)
            {
                _db.RoomBans.Add(new RoomBan
                {
                    RoomId = id,
                    UserId = userId,
                    BannedBy = CurrentUserId,
                    Reason = dto?.Reason
                });
            }

            var member = await _db.RoomMembers.FirstOrDefaultAsync(m => m.RoomId == id && m.UserId == userId);
            if (member != null) _db.RoomMembers.Remove(member);

            await _db.SaveChangesAsync();

            var room = await _db.Rooms.FindAsync(id);
            if (room != null)
            {
                await _hubContext.Clients.Group(room.Name).SendAsync("MemberBanned", id, userId);
                await _hubContext.Clients.Group(room.Name).SendAsync("MemberKicked", id, userId);
            }

            return NoContent();
        }

        /// <summary>
        /// Oda yasak listesi (owner/moderator).
        /// </summary>
        [HttpGet("{id}/bans")]
        public async Task<IActionResult> GetBans(int id)
        {
            if (CurrentUserId == null) return Unauthorized();
            if (!await _roomAuth.CanManageAsync(id, CurrentUserId)) return Forbid();

            var bans = await _db.RoomBans
                .Where(b => b.RoomId == id)
                .Join(_db.Users, b => b.UserId, u => u.Id, (b, u) => new
                {
                    userId = u.Id,
                    username = u.Username,
                    avatarId = u.AvatarId,
                    reason = b.Reason,
                    bannedAt = b.BannedAt
                })
                .ToListAsync();

            return Ok(bans);
        }

        /// <summary>
        /// Yasağı kaldır (owner/moderator).
        /// </summary>
        [HttpDelete("{id}/bans/{userId}")]
        public async Task<IActionResult> UnbanMember(int id, string userId)
        {
            if (CurrentUserId == null) return Unauthorized();
            if (!await _roomAuth.CanManageAsync(id, CurrentUserId)) return Forbid();

            var ban = await _db.RoomBans.FirstOrDefaultAsync(b => b.RoomId == id && b.UserId == userId);
            if (ban != null)
            {
                _db.RoomBans.Remove(ban);
                await _db.SaveChangesAsync();
            }

            return NoContent();
        }
    }
}
