using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;
using DiscordClone.Api.Data;
using DiscordClone.Api.Models;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace DiscordClone.Api.Hubs
{
    [Authorize] // Sadece JWT'si geçerli olanlar bağlanabilir
    public class ChatAndSignalingHub : Hub
    {
        private static int _activeUserCount = 0;
        private static readonly ConcurrentDictionary<string, string> _userConnections = new();
        private static readonly ConcurrentDictionary<string, ConcurrentDictionary<string, string>> _roomUsers = new();

        private readonly AppDbContext _db;

        public ChatAndSignalingHub(AppDbContext db)
        {
            _db = db;
        }

        public override async Task OnConnectedAsync()
        {
            var count = Interlocked.Increment(ref _activeUserCount);
            await Clients.All.SendAsync("ActiveUserCountUpdated", count);
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            var count = Interlocked.Decrement(ref _activeUserCount);
            await Clients.All.SendAsync("ActiveUserCountUpdated", count);

            if (_userConnections.TryRemove(Context.ConnectionId, out var roomId))
            {
                if (_roomUsers.TryGetValue(roomId, out var usersInRoom))
                {
                    if (usersInRoom.TryRemove(Context.ConnectionId, out var username))
                    {
                        await Clients.Group(roomId).SendAsync("UserLeft", username, Context.ConnectionId);
                    }
                }
            }

            await base.OnDisconnectedAsync(exception);
        }

        public static int GetActiveUserCount() => _activeUserCount;

        public async Task JoinRoom(string roomId, string requestedUsername)
        {
            // Kullanıcı adını JWT token'ından al
            var username = Context.User?.Identity?.Name ?? requestedUsername;

            await Groups.AddToGroupAsync(Context.ConnectionId, roomId);
            _userConnections[Context.ConnectionId] = roomId;

            var usersInRoom = _roomUsers.GetOrAdd(roomId, _ => new ConcurrentDictionary<string, string>());
            usersInRoom[Context.ConnectionId] = username;

            var dictionary = usersInRoom.ToDictionary(k => k.Key, v => v.Value);
            await Clients.OthersInGroup(roomId).SendAsync("UserJoined", username, Context.ConnectionId);
            await Clients.Caller.SendAsync("roomusers", dictionary);

            // Son 100 mesajı gönder
            var oneWeekAgo = DateTimeOffset.UtcNow.AddDays(-7).ToUnixTimeMilliseconds();
            var history = await _db.Messages
                .Where(m => m.RoomId == roomId && m.Timestamp >= oneWeekAgo && !m.IsDeleted)
                .OrderBy(m => m.Timestamp)
                .Take(100)
                .Select(m => new { m.Id, m.Username, m.Text, m.Timestamp })
                .ToListAsync();

            await Clients.Caller.SendAsync("RoomHistory", history);
        }

        public async Task LeaveRoom(string roomId, string requestedUsername)
        {
            var username = Context.User?.Identity?.Name ?? requestedUsername;
            
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, roomId);

            if (_userConnections.TryRemove(Context.ConnectionId, out _))
            {
                if (_roomUsers.TryGetValue(roomId, out var usersInRoom))
                    usersInRoom.TryRemove(Context.ConnectionId, out _);
            }

            await Clients.Group(roomId).SendAsync("UserLeft", username, Context.ConnectionId);
        }

        public async Task SendMessage(string roomId, string requestedUsername, string message)
        {
            var userId = Context.UserIdentifier; // JWT Token'dan (NameIdentifier)
            var username = Context.User?.Identity?.Name ?? requestedUsername;
            
            var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

            // Önce yayınla
            await Clients.Group(roomId).SendAsync("ReceiveMessage", username, message, 0L, timestamp);

            // DB'ye kaydet
            var msg = new ChatMessage
            {
                RoomId = roomId,
                UserId = userId,
                Username = username,
                Text = message,
                Timestamp = timestamp
            };
            _db.Messages.Add(msg);
            await _db.SaveChangesAsync();

            // Gerçek DB ID'sini bildir
            if (msg.Id > 0)
                await Clients.Group(roomId).SendAsync("MessageIdAssigned", timestamp, msg.Id);
        }

        public async Task DeleteMessage(long messageId)
        {
            var msg = await _db.Messages.FindAsync(messageId);
            if (msg == null) return;

            var userId = Context.UserIdentifier;
            
            // Sadece mesajı yazan silebilir
            if (msg.UserId != userId && msg.Username != Context.User?.Identity?.Name) 
                return;

            msg.IsDeleted = true;
            await _db.SaveChangesAsync();

            if (_userConnections.TryGetValue(Context.ConnectionId, out var roomId))
            {
                await Clients.Group(roomId).SendAsync("MessageDeleted", messageId);
            }
        }

        public async Task SendSignal(string signalData, string roomId)
        {
            await Clients.GroupExcept(roomId, Context.ConnectionId)
                .SendAsync("ReceiveSignal", Context.ConnectionId, signalData);
        }

        public async Task SendSignalToUser(string signalData, string targetConnectionId)
        {
            await Clients.Client(targetConnectionId)
                .SendAsync("ReceiveSignal", Context.ConnectionId, signalData);
        }
    }
}

