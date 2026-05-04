using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;
using DiscordClone.Api.Data;
using DiscordClone.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace DiscordClone.Api.Hubs
{
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

        public async Task JoinRoom(string roomId, string username)
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, roomId);
            _userConnections[Context.ConnectionId] = roomId;

            var usersInRoom = _roomUsers.GetOrAdd(roomId, _ => new ConcurrentDictionary<string, string>());
            usersInRoom[Context.ConnectionId] = username;

            var dictionary = usersInRoom.ToDictionary(k => k.Key, v => v.Value);
            await Clients.OthersInGroup(roomId).SendAsync("UserJoined", username, Context.ConnectionId);
            await Clients.Caller.SendAsync("roomusers", dictionary);

            // Son 100 mesajı gönder (1 haftadan yeni, silinmemiş)
            var oneWeekAgo = DateTimeOffset.UtcNow.AddDays(-7).ToUnixTimeMilliseconds();
            var history = await _db.Messages
                .Where(m => m.RoomId == roomId && m.Timestamp >= oneWeekAgo && !m.IsDeleted)
                .OrderBy(m => m.Timestamp)
                .Take(100)
                .Select(m => new { m.Id, m.Username, m.Text, m.Timestamp })
                .ToListAsync();

            await Clients.Caller.SendAsync("RoomHistory", history);
        }

        public async Task LeaveRoom(string roomId, string username)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, roomId);

            if (_userConnections.TryRemove(Context.ConnectionId, out _))
            {
                if (_roomUsers.TryGetValue(roomId, out var usersInRoom))
                    usersInRoom.TryRemove(Context.ConnectionId, out _);
            }

            await Clients.Group(roomId).SendAsync("UserLeft", username, Context.ConnectionId);
        }

        public async Task SendMessage(string roomId, string username, string message)
        {
            var msg = new ChatMessage
            {
                RoomId = roomId,
                Username = username,
                Text = message,
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            };
            _db.Messages.Add(msg);
            await _db.SaveChangesAsync();

            await Clients.Group(roomId).SendAsync("ReceiveMessage", username, message, msg.Id, msg.Timestamp);
        }

        public async Task DeleteMessage(long messageId)
        {
            var msg = await _db.Messages.FindAsync(messageId);
            if (msg == null) return;

            var connectionUsername = GetUsernameByConnectionId(Context.ConnectionId);
            if (msg.Username != connectionUsername) return;

            msg.IsDeleted = true;
            await _db.SaveChangesAsync();

            if (_userConnections.TryGetValue(Context.ConnectionId, out var roomId))
            {
                await Clients.Group(roomId).SendAsync("MessageDeleted", messageId);
            }
        }

        private string? GetUsernameByConnectionId(string connectionId)
        {
            foreach (var room in _roomUsers.Values)
            {
                if (room.TryGetValue(connectionId, out var username))
                    return username;
            }
            return null;
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
