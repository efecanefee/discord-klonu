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
        // Mute durumu: connectionId -> isMuted
        private static readonly ConcurrentDictionary<string, bool> _muteStatus = new();

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

            _muteStatus.TryRemove(Context.ConnectionId, out _);

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

        public static object GetUsersInRoom(string roomId)
        {
            if (_roomUsers.TryGetValue(roomId, out var usersInRoom))
            {
                return usersInRoom.Values.Distinct().Select(u => new { username = u }).ToList();
            }
            return new List<object>();
        }

        public async Task JoinRoom(string roomId, string requestedUsername)
        {
            // Kullanıcı adını JWT token'ından al
            var username = Context.User?.Identity?.Name ?? requestedUsername;

            var usersInRoom = _roomUsers.GetOrAdd(roomId, _ => new ConcurrentDictionary<string, string>());

            // Çift giriş engelleme: Aynı username zaten odadaysa eski bağlantıyı düşür
            var existingConnection = usersInRoom.FirstOrDefault(x => x.Value == username).Key;
            if (existingConnection != null && existingConnection != Context.ConnectionId)
            {
                await Clients.Client(existingConnection).SendAsync("ForceDisconnect", "Hesabınıza başka bir cihaz veya sekmeden giriş yapıldı.");
                await Groups.RemoveFromGroupAsync(existingConnection, roomId);
                usersInRoom.TryRemove(existingConnection, out _);
                _userConnections.TryRemove(existingConnection, out _);
            }

            await Groups.AddToGroupAsync(Context.ConnectionId, roomId);
            _userConnections[Context.ConnectionId] = roomId;

            usersInRoom[Context.ConnectionId] = username;

            var dictionary = usersInRoom.ToDictionary(k => k.Key, v => v.Value);

            // Mute durumlarını da gönder
            var muteStates = usersInRoom.Keys.ToDictionary(
                connId => connId,
                connId => _muteStatus.TryGetValue(connId, out var m) && m
            );

            // Odadaki herkese güncel kullanıcı listesini gönder
            await Clients.Group(roomId).SendAsync("RoomUsers", dictionary);
            
            await Clients.OthersInGroup(roomId).SendAsync("UserJoined", username, Context.ConnectionId);
            await Clients.Caller.SendAsync("RoomUsers", dictionary);

            // Mute durumlarını caller'a gönder
            await Clients.Caller.SendAsync("RoomMuteStates", muteStates);

            // Son 100 mesajı gönder
            var oneWeekAgo = DateTimeOffset.UtcNow.AddDays(-7).ToUnixTimeMilliseconds();
            var history = await _db.Messages
                .Where(m => m.RoomId == roomId && m.Timestamp >= oneWeekAgo && !m.IsDeleted)
                .OrderBy(m => m.Timestamp)
                .Take(100)
                .Select(m => new { m.Id, m.Username, m.Text, m.Timestamp, m.IsEdited, m.FileUrl, m.FileName })
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

            _muteStatus.TryRemove(Context.ConnectionId, out _);

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

        // Dosya/resim mesajı gönder
        public async Task SendFileMessage(string roomId, string requestedUsername, string fileUrl, string fileName)
        {
            var userId = Context.UserIdentifier;
            var username = Context.User?.Identity?.Name ?? requestedUsername;
            var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

            // Önce yayınla
            await Clients.Group(roomId).SendAsync("ReceiveFileMessage", username, fileUrl, fileName, 0L, timestamp);

            // DB'ye kaydet
            var msg = new ChatMessage
            {
                RoomId = roomId,
                UserId = userId,
                Username = username,
                Text = $"[Dosya: {fileName}]",
                FileUrl = fileUrl,
                FileName = fileName,
                Timestamp = timestamp
            };
            _db.Messages.Add(msg);
            await _db.SaveChangesAsync();

            if (msg.Id > 0)
                await Clients.Group(roomId).SendAsync("MessageIdAssigned", timestamp, msg.Id);
        }

        // Mesaj düzenleme
        public async Task EditMessage(long messageId, string newText)
        {
            var msg = await _db.Messages.FindAsync(messageId);
            if (msg == null) return;

            var userId = Context.UserIdentifier;
            
            // Sadece mesajı yazan düzenleyebilir
            if (msg.UserId != userId && msg.Username != Context.User?.Identity?.Name) 
                return;

            msg.Text = newText;
            msg.IsEdited = true;
            await _db.SaveChangesAsync();

            if (_userConnections.TryGetValue(Context.ConnectionId, out var roomId))
            {
                await Clients.Group(roomId).SendAsync("MessageEdited", messageId, newText);
            }
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

        // Mute durumu bildir
        public async Task NotifyMuteStatus(string roomId, bool isMuted)
        {
            var username = Context.User?.Identity?.Name ?? "";
            _muteStatus[Context.ConnectionId] = isMuted;

            await Clients.Group(roomId).SendAsync("UserMuteChanged", username, Context.ConnectionId, isMuted);
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


