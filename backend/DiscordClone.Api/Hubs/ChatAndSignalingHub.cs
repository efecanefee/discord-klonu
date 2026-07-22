using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Collections.Concurrent;
using DiscordClone.Api.Data;
using DiscordClone.Api.Models;
using DiscordClone.Api.Services;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace DiscordClone.Api.Hubs
{
    [Authorize] // Sadece JWT'si geçerli olanlar bağlanabilir
    public class ChatAndSignalingHub : Hub
    {
        private static readonly ConcurrentDictionary<string, int> _userConnectionCounts = new();
        private static readonly ConcurrentDictionary<string, string> _userConnections = new();
        private static readonly ConcurrentDictionary<string, ConcurrentDictionary<string, RoomUserDto>> _roomUsers = new();
        // Mute durumu: connectionId -> isMuted
        private static readonly ConcurrentDictionary<string, bool> _muteStatus = new();
        // Ses kanalları: voiceKey -> (connectionId -> VoiceUserDto). Metin kanalı presence'ından bağımsız.
        private static readonly ConcurrentDictionary<string, ConcurrentDictionary<string, VoiceUserDto>> _voiceUsers = new();
        // Soundboard spam koruması: connectionId -> son ses basma zamanı
        private static readonly ConcurrentDictionary<string, DateTime> _lastSoundAt = new();
        // Oda başına aktif YouTube oynatma durumu (geç katılanlar için)
        private static readonly ConcurrentDictionary<string, YoutubeRoomState> _youtubeStates = new();

        public class YoutubeRoomState
        {
            public string VideoId { get; set; } = string.Empty;
            public bool IsPlaying { get; set; }
            public double PositionSeconds { get; set; }
            public long UpdatedAtUnixMs { get; set; }
            public string StartedBy { get; set; } = string.Empty;
            // "audio": herkes otomatik dinler; "video": watch party — davet gider,
            // kabul eden birlikte izler.
            public string Mode { get; set; } = "audio";
        }

        private readonly AppDbContext _db;
        private readonly IRoomAuthorizationService _roomAuth;

        public ChatAndSignalingHub(AppDbContext db, IRoomAuthorizationService roomAuth)
        {
            _db = db;
            _roomAuth = roomAuth;
        }

        public override async Task OnConnectedAsync()
        {
            var uid = Context.UserIdentifier ?? Context.ConnectionId;
            _userConnectionCounts.AddOrUpdate(uid, 1, (_, count) => count + 1);
            await Clients.All.SendAsync("ActiveUserCountUpdated", _userConnectionCounts.Count);
            
            var userId = Context.UserIdentifier;
            if (!string.IsNullOrEmpty(userId))
            {
                var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
                if (user != null)
                {
                    // Görünmez moddaysa online'a çevirme
                    if (user.CustomStatus == "offline") 
                    {
                        user.CustomStatus = "online";
                    }
                    user.LastSeen = DateTime.UtcNow;
                    await _db.SaveChangesAsync();
                    
                    // Herkese bu kullanıcının durumunu bildir (Görünmezse offline olarak bildir)
                    var broadcastStatus = user.CustomStatus == "invisible" ? "offline" : user.CustomStatus;
                    await Clients.All.SendAsync("UserStatusChanged", new
                    {
                        userId = user.Id,
                        status = broadcastStatus,
                        message = user.CustomStatusMessage,
                        lastSeen = user.ShowLastSeen ? user.LastSeen : (DateTime?)null
                    });
                }
            }
            
            await base.OnConnectedAsync();
        }

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            var uid = Context.UserIdentifier ?? Context.ConnectionId;
            if (_userConnectionCounts.TryGetValue(uid, out var currentCount))
            {
                if (currentCount <= 1)
                    _userConnectionCounts.TryRemove(uid, out _);
                else
                    _userConnectionCounts[uid] = currentCount - 1;
            }
            await Clients.All.SendAsync("ActiveUserCountUpdated", _userConnectionCounts.Count);

            var userId = Context.UserIdentifier;
            if (!string.IsNullOrEmpty(userId))
            {
                var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId);
                if (user != null)
                {
                    // Sadece kullanıcı görünmez modda değilse DB'yi offline olarak güncelle
                    // (Görünmez modun kalıcı olması için)
                    if (user.CustomStatus != "invisible")
                    {
                        user.CustomStatus = "offline";
                    }
                    user.LastSeen = DateTime.UtcNow;
                    await _db.SaveChangesAsync();
                    
                    await Clients.All.SendAsync("UserStatusChanged", new
                    {
                        userId = user.Id,
                        status = "offline",
                        message = user.CustomStatusMessage,
                        lastSeen = user.ShowLastSeen ? user.LastSeen : (DateTime?)null
                    });
                }
            }

            _muteStatus.TryRemove(Context.ConnectionId, out _);
            _lastSoundAt.TryRemove(Context.ConnectionId, out _);

            if (_userConnections.TryRemove(Context.ConnectionId, out var roomId))
            {
                if (_roomUsers.TryGetValue(roomId, out var usersInRoom))
                {
                    if (usersInRoom.TryRemove(Context.ConnectionId, out var userDto))
                    {
                        await Clients.Group(roomId).SendAsync("UserLeft", userDto.Username, Context.ConnectionId);
                    }
                    // Oda boşaldıysa YouTube oturumunu da temizle
                    if (usersInRoom.IsEmpty)
                        _youtubeStates.TryRemove(roomId, out _);
                }
            }

            // Bağlantı koptuğunda bulunduğu tüm ses kanallarından çıkar
            foreach (var kv in _voiceUsers)
            {
                if (kv.Value.TryRemove(Context.ConnectionId, out _))
                {
                    await Clients.Group(kv.Key).SendAsync("VoiceUserLeft", kv.Key, Context.ConnectionId);
                }
            }

            await base.OnDisconnectedAsync(exception);
        }

        public static int GetActiveUserCount() => _userConnectionCounts.Count;

        // Rol değişince bellekteki RoomUserDto'yu güncelle (yeni katılımlarda eski rol yayınlanmasın).
        public static void UpdateUserRoleInMemory(string roomName, string userId, string role)
        {
            if (_roomUsers.TryGetValue(roomName, out var users))
            {
                foreach (var kv in users)
                    if (kv.Value.UserId == userId) kv.Value.Role = role;
            }
        }

        public static object GetUsersInRoom(string roomId)
        {
            if (_roomUsers.TryGetValue(roomId, out var usersInRoom))
            {
                return usersInRoom.Values.DistinctBy(u => u.Username).Select(u => new { username = u.Username, avatarId = u.AvatarId }).ToList();
            }
            return new List<object>();
        }

        public class RoomUserDto
        {
            public string Username { get; set; } = string.Empty;
            public string AvatarId { get; set; } = "default";
            public string UserId { get; set; } = string.Empty;
            public string Role { get; set; } = string.Empty; // "owner" | "moderator" | "member" | "" (sistem odası)
        }

        public async Task JoinRoom(string roomId, string requestedUsername)
        {
            // Kullanıcı adını JWT token'ından al
            var username = Context.User?.Identity?.Name ?? requestedUsername;
            var avatarId = Context.User?.FindFirst("AvatarId")?.Value ?? "default";
            var userId = Context.UserIdentifier ?? string.Empty;

            // Kalıcı (topluluk) oda ise: ban kontrolü + üyelik + rol
            // Sistem odaları (Ana Salon, Müzik Odası → created_by='system') rol sistemi dışında.
            string role = string.Empty;
            var room = await _db.Rooms.FirstOrDefaultAsync(r => r.Name == roomId);
            var isSystemRoom = room == null || room.CreatedBy == "system";
            if (room != null && !isSystemRoom && !string.IsNullOrEmpty(userId))
            {
                var banned = await _db.RoomBans.AnyAsync(b => b.RoomId == room.Id && b.UserId == userId);
                if (banned)
                {
                    await Clients.Caller.SendAsync("JoinRejected", "banned");
                    return;
                }

                var member = await _db.RoomMembers.FirstOrDefaultAsync(m => m.RoomId == room.Id && m.UserId == userId);
                if (member == null)
                {
                    member = new RoomMember { RoomId = room.Id, UserId = userId, Role = RoomRoles.Member };
                    _db.RoomMembers.Add(member);
                    await _db.SaveChangesAsync();
                }
                role = member.Role;
            }

            var usersInRoom = _roomUsers.GetOrAdd(roomId, _ => new ConcurrentDictionary<string, RoomUserDto>());

            // Çift giriş engelleme: Aynı username zaten odadaysa eski bağlantıyı düşür
            var existingConnection = usersInRoom.FirstOrDefault(x => x.Value.Username == username).Key;
            if (existingConnection != null && existingConnection != Context.ConnectionId)
            {
                await Clients.Client(existingConnection).SendAsync("ForceDisconnect", "Hesabınıza başka bir cihaz veya sekmeden giriş yapıldı.");
                await Groups.RemoveFromGroupAsync(existingConnection, roomId);
                usersInRoom.TryRemove(existingConnection, out _);
                _userConnections.TryRemove(existingConnection, out _);
            }

            await Groups.AddToGroupAsync(Context.ConnectionId, roomId);
            _userConnections[Context.ConnectionId] = roomId;

            usersInRoom[Context.ConnectionId] = new RoomUserDto { Username = username, AvatarId = avatarId, UserId = userId, Role = role };

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

            // Son 50 mesajı gönder (en yeni 50)
            var oneWeekAgo = DateTimeOffset.UtcNow.AddDays(-7).ToUnixTimeMilliseconds();
            var history = await _db.Messages
                .Where(m => m.RoomId == roomId && m.Timestamp >= oneWeekAgo && !m.IsDeleted)
                .OrderByDescending(m => m.Timestamp)
                .Take(50)
                .Select(m => new { m.Id, m.Username, m.AvatarId, m.Text, m.Timestamp, m.IsEdited, m.FileUrl, m.FileName, m.ReplyToId })
                .ToListAsync();

            history.Reverse(); // In memory reverse to chronological order

            // Mesajların tepkileri — tek sorgu (N+1 yok), mesaj başına gruplanmış set
            var historyIds = history.Select(h => h.Id).ToList();
            var reactionRows = await _db.MessageReactions
                .Where(r => historyIds.Contains(r.MessageId))
                .ToListAsync();
            var reactionsByMessage = reactionRows
                .GroupBy(r => r.MessageId)
                .ToDictionary(
                    g => g.Key,
                    g => g.GroupBy(r => r.Emoji)
                          .Select(e => new { emoji = e.Key, count = e.Count(), usernames = e.Select(x => x.Username).ToList() })
                          .ToList());

            var historyWithReactions = history.Select(m => new
            {
                m.Id, m.Username, m.AvatarId, m.Text, m.Timestamp, m.IsEdited, m.FileUrl, m.FileName, m.ReplyToId,
                Reactions = reactionsByMessage.TryGetValue(m.Id, out var rx) ? (object)rx : null
            }).ToList();

            await Clients.Caller.SendAsync("RoomHistory", historyWithReactions);

            // Odada süren YouTube oynatması varsa geç katılana güncel durumu gönder
            if (_youtubeStates.TryGetValue(roomId, out var yt))
            {
                var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                var effectivePos = yt.PositionSeconds + (yt.IsPlaying ? (now - yt.UpdatedAtUnixMs) / 1000.0 : 0);
                await Clients.Caller.SendAsync("YoutubeState", yt.VideoId, yt.IsPlaying, effectivePos, yt.StartedBy, yt.Mode);
            }
        }

        public async Task LeaveRoom(string roomId, string requestedUsername)
        {
            var username = Context.User?.Identity?.Name ?? requestedUsername;
            
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, roomId);

            if (_userConnections.TryRemove(Context.ConnectionId, out _))
            {
                if (_roomUsers.TryGetValue(roomId, out var usersInRoom))
                {
                    usersInRoom.TryRemove(Context.ConnectionId, out _);
                    // Oda boşaldıysa YouTube oturumunu da temizle
                    if (usersInRoom.IsEmpty)
                        _youtubeStates.TryRemove(roomId, out _);
                }
            }

            _muteStatus.TryRemove(Context.ConnectionId, out _);

            await Clients.Group(roomId).SendAsync("UserLeft", username, Context.ConnectionId);
        }

        public async Task SendMessage(string roomId, string requestedUsername, string message, long? replyToId = null)
        {
            var userId = Context.UserIdentifier; // JWT Token'dan (NameIdentifier)
            var username = Context.User?.Identity?.Name ?? requestedUsername;
            var avatarId = Context.User?.FindFirst("AvatarId")?.Value ?? "default";
            
            var timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

            // Önce yayınla
            await Clients.Group(roomId).SendAsync("ReceiveMessage", username, avatarId, message, 0L, timestamp, replyToId);

            // DB'ye kaydet
            var msg = new ChatMessage
            {
                RoomId = roomId,
                UserId = userId,
                Username = username,
                AvatarId = avatarId,
                Text = message,
                Timestamp = timestamp,
                ReplyToId = replyToId
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

        // ============ SOUNDBOARD ============
        // Odadaki herkese bir ses efekti çaldırır (her istemci URL'i lokal oynatır).
        public async Task PlaySound(string roomId, string soundUrl, string soundName)
        {
            // Sadece gerçekten odada olan bağlantılar ses basabilir
            if (!_userConnections.TryGetValue(Context.ConnectionId, out var currentRoom) || currentRoom != roomId)
                return;

            // Spam koruması: bağlantı başına 2 saniye
            if (_lastSoundAt.TryGetValue(Context.ConnectionId, out var last)
                && (DateTime.UtcNow - last).TotalSeconds < 2)
                return;
            _lastSoundAt[Context.ConnectionId] = DateTime.UtcNow;

            var username = Context.User?.Identity?.Name ?? "";
            await Clients.Group(roomId).SendAsync("SoundPlayed", username, soundUrl, soundName);
        }

        // ============ YOUTUBE SENKRON OYNATMA ============
        public async Task StartYoutube(string roomId, string videoId, string mode = "audio")
        {
            if (!_userConnections.TryGetValue(Context.ConnectionId, out var currentRoom) || currentRoom != roomId)
                return;
            if (string.IsNullOrWhiteSpace(videoId) || videoId.Length > 20) return;
            if (mode != "audio" && mode != "video") mode = "audio";

            var username = Context.User?.Identity?.Name ?? "";
            _youtubeStates[roomId] = new YoutubeRoomState
            {
                VideoId = videoId,
                IsPlaying = true,
                PositionSeconds = 0,
                UpdatedAtUnixMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                StartedBy = username,
                Mode = mode
            };
            await Clients.Group(roomId).SendAsync("YoutubeStarted", videoId, username, mode);
        }

        public async Task SyncYoutube(string roomId, string action, double position)
        {
            if (!_userConnections.TryGetValue(Context.ConnectionId, out var currentRoom) || currentRoom != roomId)
                return;
            if (!_youtubeStates.TryGetValue(roomId, out var yt)) return;
            if (action != "play" && action != "pause" && action != "seek") return;

            yt.IsPlaying = action != "pause";
            yt.PositionSeconds = position;
            yt.UpdatedAtUnixMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

            await Clients.OthersInGroup(roomId).SendAsync("YoutubeSync", action, position);
        }

        public async Task StopYoutube(string roomId)
        {
            if (!_userConnections.TryGetValue(Context.ConnectionId, out var currentRoom) || currentRoom != roomId)
                return;
            _youtubeStates.TryRemove(roomId, out _);
            await Clients.Group(roomId).SendAsync("YoutubeStopped");
        }

        // Mesaj düzenleme
        public async Task EditMessage(long messageId, string newText)
        {
            var username = Context.User?.Identity?.Name;
            if (username == null) return;

            var msg = await _db.Messages.FirstOrDefaultAsync(m => m.Id == messageId && m.Username == username);
            if (msg == null) return;

            msg.Text = newText;
            msg.IsEdited = true;
            await _db.SaveChangesAsync();

            await Clients.Group(msg.RoomId).SendAsync("MessageEdited", messageId, newText);
        }

        public async Task DeleteMessage(long messageId)
        {
            var msg = await _db.Messages.FindAsync(messageId);
            if (msg == null) return;

            var userId = Context.UserIdentifier;

            // Kendi mesajı → serbest. Değilse: odada owner/moderator ise silebilir.
            var isOwnMessage = msg.UserId == userId || msg.Username == Context.User?.Identity?.Name;
            if (!isOwnMessage)
            {
                var room = await _db.Rooms.FirstOrDefaultAsync(r => r.Name == msg.RoomId);
                if (room == null || string.IsNullOrEmpty(userId) || !await _roomAuth.CanManageAsync(room.Id, userId))
                    return;
            }

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

        // ==========================================
        // SES KANALLARI (Özellik 8 — Faz 2b/voice)
        // Metin presence'ından bağımsız; sinyalleşme SendSignalToUser/ReceiveSignal ile.
        // ==========================================
        public class VoiceUserDto
        {
            public string ConnectionId { get; set; } = string.Empty;
            public string Username { get; set; } = string.Empty;
            public string AvatarId { get; set; } = "default";
            public string UserId { get; set; } = string.Empty;
        }

        public async Task JoinVoice(string voiceKey)
        {
            var username = Context.User?.Identity?.Name ?? "";
            var avatarId = Context.User?.FindFirst("AvatarId")?.Value ?? "default";
            var userId = Context.UserIdentifier ?? string.Empty;

            var users = _voiceUsers.GetOrAdd(voiceKey, _ => new ConcurrentDictionary<string, VoiceUserDto>());

            // Aynı kullanıcının eski bağlantısını bu ses kanalından düşür
            foreach (var kvp in users.Where(x => x.Value.UserId == userId && x.Key != Context.ConnectionId).ToList())
            {
                if (users.TryRemove(kvp.Key, out _))
                    await Clients.Group(voiceKey).SendAsync("VoiceUserLeft", voiceKey, kvp.Key);
            }

            await Groups.AddToGroupAsync(Context.ConnectionId, voiceKey);
            var me = new VoiceUserDto { ConnectionId = Context.ConnectionId, Username = username, AvatarId = avatarId, UserId = userId };
            users[Context.ConnectionId] = me;

            // Caller'a mevcut katılımcı listesini gönder (kendisi hariç) → onlara offer açar
            var others = users.Values.Where(u => u.ConnectionId != Context.ConnectionId).ToList();
            await Clients.Caller.SendAsync("VoiceParticipants", voiceKey, others);

            // Diğerlerine yeni katılımcıyı bildir
            await Clients.OthersInGroup(voiceKey).SendAsync("VoiceUserJoined", voiceKey, me);
        }

        public async Task LeaveVoice(string voiceKey)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, voiceKey);
            if (_voiceUsers.TryGetValue(voiceKey, out var users))
                users.TryRemove(Context.ConnectionId, out _);
            await Clients.Group(voiceKey).SendAsync("VoiceUserLeft", voiceKey, Context.ConnectionId);
        }

        // ==========================================
        // ÖZEL MESAJLAR (DIRECT MESSAGES) - FAZ 1
        // ==========================================
        public async Task SendDirectMessage(string receiverId, string content, long? replyToId = null)
        {
            var senderId = Context.UserIdentifier;
            if (string.IsNullOrEmpty(senderId) || string.IsNullOrWhiteSpace(content)) return;

            var sender = await _db.Users.FindAsync(senderId);

            var directMessage = new DirectMessage
            {
                SenderId = senderId,
                ReceiverId = receiverId,
                Content = content,
                CreatedAt = DateTime.UtcNow,
                IsRead = false,
                ReplyToId = replyToId
            };

            _db.DirectMessages.Add(directMessage);
            await _db.SaveChangesAsync();

            var dmData = new {
                id = directMessage.Id,
                senderId = senderId,
                receiverId = receiverId,
                content = content,
                createdAt = directMessage.CreatedAt,
                isRead = directMessage.IsRead,
                isEdited = directMessage.IsEdited,
                replyToId = directMessage.ReplyToId,
                senderUsername = sender?.Username,
                senderAvatarId = sender?.AvatarId,
                senderCustomStatus = sender?.CustomStatus
            };

        // Alıcıya ve gönderene mesajı gönder (Eğer online iseler)
            await Clients.Users(new[] { senderId, receiverId }).SendAsync("ReceiveDirectMessage", dmData);
        }

        // Özel mesajda dosya/görsel gönder
        public async Task SendDirectFileMessage(string receiverId, string fileUrl, string fileName)
        {
            var senderId = Context.UserIdentifier;
            if (string.IsNullOrEmpty(senderId) || string.IsNullOrWhiteSpace(fileUrl)) return;

            var sender = await _db.Users.FindAsync(senderId);

            var directMessage = new DirectMessage
            {
                SenderId = senderId,
                ReceiverId = receiverId,
                Content = $"[Dosya: {fileName}]",
                CreatedAt = DateTime.UtcNow,
                IsRead = false,
                FileUrl = fileUrl,
                FileName = fileName
            };

            _db.DirectMessages.Add(directMessage);
            await _db.SaveChangesAsync();

            var dmData = new {
                id = directMessage.Id,
                senderId,
                receiverId,
                content = directMessage.Content,
                createdAt = directMessage.CreatedAt,
                isRead = directMessage.IsRead,
                isEdited = directMessage.IsEdited,
                replyToId = directMessage.ReplyToId,
                fileUrl = directMessage.FileUrl,
                fileName = directMessage.FileName,
                senderUsername = sender?.Username,
                senderAvatarId = sender?.AvatarId,
                senderCustomStatus = sender?.CustomStatus
            };

            await Clients.Users(new[] { senderId, receiverId }).SendAsync("ReceiveDirectMessage", dmData);
        }

        public async Task EditDirectMessage(long messageId, string newContent)
        {
            var userId = Context.UserIdentifier;
            if (string.IsNullOrEmpty(userId)) return;

            var msg = await _db.DirectMessages.FindAsync(messageId);
            if (msg == null || msg.SenderId != userId || msg.IsDeleted) return;

            msg.Content = newContent;
            msg.IsEdited = true;
            await _db.SaveChangesAsync();

            await Clients.Users(new[] { msg.SenderId, msg.ReceiverId }).SendAsync("DirectMessageEdited", messageId, newContent);
        }

        public async Task DeleteDirectMessage(long messageId)
        {
            var userId = Context.UserIdentifier;
            if (string.IsNullOrEmpty(userId)) return;

            var msg = await _db.DirectMessages.FindAsync(messageId);
            if (msg == null || msg.SenderId != userId || msg.IsDeleted) return;

            msg.IsDeleted = true;
            await _db.SaveChangesAsync();

            await Clients.Users(new[] { msg.SenderId, msg.ReceiverId }).SendAsync("DirectMessageDeleted", messageId);
        }

        public async Task SendUserTyping(string receiverId)
        {
            var senderId = Context.UserIdentifier;
            if (string.IsNullOrEmpty(senderId)) return;

            // Alıcıya "senderId yazıyor..." sinyali gönder
            await Clients.User(receiverId).SendAsync("UserTyping", senderId);
        }

        // Mesaja emoji tepkisi ekle/kaldır (toggle) — gruba mesajın güncel tam seti yayınlanır
        public async Task ToggleReaction(string roomId, long messageId, string emoji)
        {
            var userId = Context.UserIdentifier;
            var username = Context.User?.Identity?.Name;
            if (string.IsNullOrEmpty(userId) || string.IsNullOrEmpty(username)) return;
            if (string.IsNullOrWhiteSpace(emoji) || emoji.Length > 16) return;

            var existing = await _db.MessageReactions
                .FirstOrDefaultAsync(r => r.MessageId == messageId && r.UserId == userId && r.Emoji == emoji);
            if (existing != null)
            {
                _db.MessageReactions.Remove(existing);
                await _db.SaveChangesAsync();
            }
            else
            {
                _db.MessageReactions.Add(new MessageReaction
                {
                    MessageId = messageId,
                    UserId = userId,
                    Username = username,
                    Emoji = emoji
                });
                // Unique index yarışında (çift tık) sessizce yut — set zaten doğru
                try { await _db.SaveChangesAsync(); } catch (DbUpdateException) { }
            }

            // Mesajın güncel tam reaction seti (idempotent — client state basit kalır)
            var rows = await _db.MessageReactions
                .Where(r => r.MessageId == messageId)
                .ToListAsync();
            var set = rows
                .GroupBy(r => r.Emoji)
                .Select(g => new { emoji = g.Key, count = g.Count(), usernames = g.Select(x => x.Username).ToList() })
                .ToList();

            await Clients.Group(roomId).SendAsync("ReactionUpdated", messageId, set);
        }

        // Oda içi "yazıyor..." — gruptaki diğerlerine kullanıcı adıyla yayınlanır
        public async Task SendRoomTyping(string roomId)
        {
            var username = Context.User?.Identity?.Name;
            if (string.IsNullOrEmpty(username)) return;

            await Clients.OthersInGroup(roomId).SendAsync("RoomUserTyping", username);
        }

        public async Task MarkMessagesAsRead(string senderId)
        {
            var currentUserId = Context.UserIdentifier;
            if (string.IsNullOrEmpty(currentUserId)) return;

            var unreadMessages = await _db.DirectMessages
                .Where(m => m.SenderId == senderId && m.ReceiverId == currentUserId && !m.IsRead)
                .ToListAsync();

            if (unreadMessages.Any())
            {
                foreach (var msg in unreadMessages)
                {
                    msg.IsRead = true;
                }
                await _db.SaveChangesAsync();

                // Gönderene "mesajların okundu" bilgisini ilet
                await Clients.User(senderId).SendAsync("MessagesRead", currentUserId);
            }
        }
    }
}


