using Microsoft.AspNetCore.SignalR;
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace DiscordClone.Api.Hubs
{
    public class ChatAndSignalingHub : Hub
    {
        private static int _activeUserCount = 0;
        private static readonly ConcurrentDictionary<string, string> _userConnections = new(); // ConnectionId -> RoomId
        private static readonly ConcurrentDictionary<string, ConcurrentDictionary<string, string>> _roomUsers = new(); // RoomId -> (ConnectionId -> Username)

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
        }

        public async Task LeaveRoom(string roomId, string username)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, roomId);

            if (_userConnections.TryRemove(Context.ConnectionId, out _))
            {
                if (_roomUsers.TryGetValue(roomId, out var usersInRoom))
                {
                    usersInRoom.TryRemove(Context.ConnectionId, out _);
                }
            }

            await Clients.Group(roomId).SendAsync("UserLeft", username, Context.ConnectionId);
        }

        public async Task SendMessage(string roomId, string username, string message)
        {
            await Clients.Group(roomId).SendAsync("ReceiveMessage", username, message);
        }

        public async Task SendSignal(string signalData, string roomId)
        {
            // Group broadcast for generic signals if needed
            await Clients.GroupExcept(roomId, Context.ConnectionId).SendAsync("ReceiveSignal", Context.ConnectionId, signalData);
        }

        public async Task SendSignalToUser(string signalData, string targetConnectionId)
        {
            // Direct P2P signaling routing
            await Clients.Client(targetConnectionId).SendAsync("ReceiveSignal", Context.ConnectionId, signalData);
        }
    }
}
