using DiscordClone.Api.Data;
using DiscordClone.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace DiscordClone.Api.Services
{
    public interface IRoomAuthorizationService
    {
        // Kullanıcının odadaki rolü; üye değilse null.
        Task<string?> GetRoleAsync(int roomId, string userId);
        Task<bool> IsOwnerAsync(int roomId, string userId);
        // actor, target üzerinde moderasyon (kick/ban) yapabilir mi? Hiyerarşi kuralına tabi.
        Task<bool> CanModerateAsync(int roomId, string actorId, string targetId);
        // actor odayı yönetebilir mi (mesaj silme, oda düzenleme) — owner veya moderator.
        Task<bool> CanManageAsync(int roomId, string userId);
    }

    public class RoomAuthorizationService : IRoomAuthorizationService
    {
        private readonly AppDbContext _db;

        public RoomAuthorizationService(AppDbContext db)
        {
            _db = db;
        }

        // Rol sıralaması: owner(2) > moderator(1) > member(0). Üye değilse -1.
        private static int Rank(string? role) => role switch
        {
            RoomRoles.Owner => 2,
            RoomRoles.Moderator => 1,
            RoomRoles.Member => 0,
            _ => -1
        };

        public async Task<string?> GetRoleAsync(int roomId, string userId)
        {
            if (string.IsNullOrEmpty(userId)) return null;
            var member = await _db.RoomMembers
                .AsNoTracking()
                .FirstOrDefaultAsync(m => m.RoomId == roomId && m.UserId == userId);
            return member?.Role;
        }

        public async Task<bool> IsOwnerAsync(int roomId, string userId)
            => await GetRoleAsync(roomId, userId) == RoomRoles.Owner;

        public async Task<bool> CanManageAsync(int roomId, string userId)
        {
            var role = await GetRoleAsync(roomId, userId);
            return role == RoomRoles.Owner || role == RoomRoles.Moderator;
        }

        public async Task<bool> CanModerateAsync(int roomId, string actorId, string targetId)
        {
            if (string.IsNullOrEmpty(actorId) || string.IsNullOrEmpty(targetId)) return false;
            if (actorId == targetId) return false; // kendine işlem yapamaz

            var actorRank = Rank(await GetRoleAsync(roomId, actorId));
            var targetRank = Rank(await GetRoleAsync(roomId, targetId));

            // actor en az moderatör olmalı ve hedeften kesin üstün olmalı.
            // (moderatör başka bir moderatörü/kurucuyu; kurucu başka bir kurucuyu yönetemez)
            if (actorRank < 1) return false;
            return actorRank > targetRank;
        }
    }
}
