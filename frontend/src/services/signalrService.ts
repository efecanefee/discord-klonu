import * as signalR from '@microsoft/signalr';

export interface VoiceUser {
    connectionId: string;
    username: string;
    avatarId: string;
    userId: string;
}

class SignalRService {
    private connection: signalR.HubConnection;
    private connectionPromise: Promise<void> | null = null;
    private backendUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:5098'}/hub/chat`;

    constructor() {
        this.connection = new signalR.HubConnectionBuilder()
            .withUrl(this.backendUrl, {
                accessTokenFactory: () => localStorage.getItem('token') || '',
            })
            .withAutomaticReconnect()
            .configureLogging(signalR.LogLevel.Warning)
            .build();
    }

    public get connectionId(): string | null {
        return this.connection.connectionId;
    }

    public async startConnection(roomId?: string, username?: string): Promise<void> {
        if (this.connection.state === signalR.HubConnectionState.Disconnected) {
            console.log(`🔌 SignalR bağlantısı deneniyor... Hedef: ${this.backendUrl}`);
            this.connectionPromise = this.connection.start().then(() => {
                console.log('✅ SignalR Bağlantısı BAŞARILI!');
            }).catch(err => {
                console.error('❌ SignalR Bağlantı Hatası! Lütfen Backend portunun doğru olduğundan (5098) ve CORS ayarlarından emin olun. Hata: ', err);
                this.connectionPromise = null;
                throw err;
            });
        }

        if (this.connectionPromise) {
            try {
                await this.connectionPromise;
            } catch {
                return; // Error already logged.
            }
        }

        // Her zaman JoinRoom çağır — bağlantı zaten Connected olsa bile
        if (roomId && username && this.connection.state === signalR.HubConnectionState.Connected) {
            try {
                await this.connection.invoke('JoinRoom', roomId, username);
                console.log(`✅ Odaya katıldı: ${roomId} (${username})`);
            } catch (err) {
                console.error('Odaya katılma hatası:', err);
            }
        }
    }

    /** Odadan ayrıl — SignalR bağlantısını kapatmadan sadece LeaveRoom çağırır */
    public async leaveRoom(roomId: string, username: string): Promise<void> {
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            try {
                await this.connection.invoke('LeaveRoom', roomId, username);
                console.log(`👋 Odadan ayrıldı: ${roomId}`);
            } catch (e) {
                console.error('LeaveRoom hatası:', e);
            }
        }
    }

    // ON Listeners
    public onRoomUsers(callback: (usersDict: Record<string, { username: string; avatarId: string; userId?: string }>) => void) {
        this.connection.on('RoomUsers', callback);
    }
    public onActiveUserCountUpdated(callback: (count: number) => void) {
        this.connection.on('ActiveUserCountUpdated', callback);
    }
    public onUserJoined(callback: (username: string, connectionId: string) => void) {
        this.connection?.on('UserJoined', callback);
    }
    public onUserLeft(callback: (username: string, connectionId: string) => void) {
        this.connection?.on('UserLeft', callback);
    }
    public onReceiveMessage(callback: (username: string, avatarId: string, message: string, serverId: number, timestamp: number, replyToId?: number) => void) {
        this.connection?.on('ReceiveMessage', callback);
    }
    public onReceiveSignal(callback: (senderConnectionId: string, signalData: string) => void) {
        this.connection?.on('ReceiveSignal', callback);
    }

    // OFF Listeners (To prevent multiple event fire bugs in React StrictMode/re-renders)
    public offRoomUsers(callback: (usersDict: Record<string, { username: string; avatarId: string; userId?: string }>) => void) {
        this.connection.off('RoomUsers', callback);
    }
    public offActiveUserCountUpdated(callback: (count: number) => void) {
        this.connection.off('ActiveUserCountUpdated', callback);
    }
    public offUserJoined(callback: (username: string, connectionId: string) => void) {
        this.connection?.off('UserJoined', callback);
    }
    public offUserLeft(callback: (username: string, connectionId: string) => void) {
        this.connection?.off('UserLeft', callback);
    }
    public offReceiveMessage(callback: (username: string, avatarId: string, message: string, serverId: number, timestamp: number) => void) {
        this.connection?.off('ReceiveMessage', callback);
    }
    public offReceiveSignal(callback: (senderConnectionId: string, signalData: string) => void) {
        this.connection?.off('ReceiveSignal', callback);
    }

    // Geçmiş mesajlar
    public onRoomHistory(callback: (history: { id: number; username: string; avatarId: string; text: string; timestamp: number; isEdited?: boolean; fileUrl?: string; fileName?: string }[]) => void) {
        this.connection?.on('RoomHistory', callback);
    }
    public offRoomHistory(callback: (history: { id: number; username: string; avatarId: string; text: string; timestamp: number; isEdited?: boolean; fileUrl?: string; fileName?: string }[]) => void) {
        this.connection?.off('RoomHistory', callback);
    }

    // Mesaj silindi
    public onMessageDeleted(callback: (messageId: number) => void) {
        this.connection?.on('MessageDeleted', callback);
    }
    public offMessageDeleted(callback: (messageId: number) => void) {
        this.connection?.off('MessageDeleted', callback);
    }

    // Gerçek DB ID ataması (broadcast-first yaklaşımı için)
    public onMessageIdAssigned(callback: (timestamp: number, serverId: number) => void) {
        this.connection?.on('MessageIdAssigned', callback);
    }
    public offMessageIdAssigned(callback: (timestamp: number, serverId: number) => void) {
        this.connection?.off('MessageIdAssigned', callback);
    }

    // Mesaj düzenleme
    public onMessageEdited(callback: (messageId: number, newText: string) => void) {
        this.connection?.on('MessageEdited', callback);
    }
    public offMessageEdited(callback: (messageId: number, newText: string) => void) {
        this.connection?.off('MessageEdited', callback);
    }

    // Dosya mesajı
    public onReceiveFileMessage(callback: (username: string, fileUrl: string, fileName: string, serverId: number, timestamp: number) => void) {
        this.connection?.on('ReceiveFileMessage', callback);
    }
    public offReceiveFileMessage(callback: (username: string, fileUrl: string, fileName: string, serverId: number, timestamp: number) => void) {
        this.connection?.off('ReceiveFileMessage', callback);
    }

    // Mute durumu değişikliği
    public onUserMuteChanged(callback: (username: string, connectionId: string, isMuted: boolean) => void) {
        this.connection?.on('UserMuteChanged', callback);
    }
    public offUserMuteChanged(callback: (username: string, connectionId: string, isMuted: boolean) => void) {
        this.connection?.off('UserMuteChanged', callback);
    }

    // Odadaki mute durumları (ilk bağlandığında)
    public onRoomMuteStates(callback: (muteStates: Record<string, boolean>) => void) {
        this.connection?.on('RoomMuteStates', callback);
    }
    public offRoomMuteStates(callback: (muteStates: Record<string, boolean>) => void) {
        this.connection?.off('RoomMuteStates', callback);
    }

    // Çift Giriş - Force Disconnect
    public onForceDisconnect(callback: (message: string) => void) {
        this.connection?.on('ForceDisconnect', callback);
    }
    public offForceDisconnect(callback: (message: string) => void) {
        this.connection?.off('ForceDisconnect', callback);
    }

    // Yeni oda oluşturuldu
    public onRoomCreated(callback: (room: { id: number; name: string; type: string; description?: string; createdBy: string; createdAt: string; isPrivate?: boolean; roomCode?: string }) => void) {
        this.connection?.on('RoomCreated', callback);
    }
    public offRoomCreated(callback: (room: { id: number; name: string; type: string; description?: string; createdBy: string; createdAt: string; isPrivate?: boolean; roomCode?: string }) => void) {
        this.connection?.off('RoomCreated', callback);
    }

    // Oda silindi
    public onRoomDeleted(callback: (roomId: number) => void) {
        this.connection?.on('RoomDeleted', callback);
    }
    public offRoomDeleted(callback: (roomId: number) => void) {
        this.connection?.off('RoomDeleted', callback);
    }

    // Yeni kanal oluşturuldu
    public onChannelCreated(callback: (roomId: number, channel: { id: number; name: string; type: string; position: number; messageKey: string }) => void) {
        this.connection?.on('ChannelCreated', callback);
    }
    public offChannelCreated(callback: (roomId: number, channel: { id: number; name: string; type: string; position: number; messageKey: string }) => void) {
        this.connection?.off('ChannelCreated', callback);
    }

    // Kanal silindi
    public onChannelDeleted(callback: (roomId: number, channelId: number) => void) {
        this.connection?.on('ChannelDeleted', callback);
    }
    public offChannelDeleted(callback: (roomId: number, channelId: number) => void) {
        this.connection?.off('ChannelDeleted', callback);
    }

    // ===== Ses kanalı presence =====
    public onVoiceParticipants(cb: (voiceKey: string, users: VoiceUser[]) => void) { this.connection?.on('VoiceParticipants', cb); }
    public offVoiceParticipants(cb: (voiceKey: string, users: VoiceUser[]) => void) { this.connection?.off('VoiceParticipants', cb); }
    public onVoiceUserJoined(cb: (voiceKey: string, user: VoiceUser) => void) { this.connection?.on('VoiceUserJoined', cb); }
    public offVoiceUserJoined(cb: (voiceKey: string, user: VoiceUser) => void) { this.connection?.off('VoiceUserJoined', cb); }
    public onVoiceUserLeft(cb: (voiceKey: string, connectionId: string) => void) { this.connection?.on('VoiceUserLeft', cb); }
    public offVoiceUserLeft(cb: (voiceKey: string, connectionId: string) => void) { this.connection?.off('VoiceUserLeft', cb); }

    // Oda güncellendi (açıklama)
    public onRoomUpdated(callback: (data: { id: number; description?: string }) => void) {
        this.connection?.on('RoomUpdated', callback);
    }
    public offRoomUpdated(callback: (data: { id: number; description?: string }) => void) {
        this.connection?.off('RoomUpdated', callback);
    }

    // ==========================================
    // ROL SİSTEMİ (Özellik 6)
    // ==========================================
    // Kullanıcı odadan atıldı (kick veya ban sonrası düşürme)
    public onMemberKicked(callback: (roomId: number, userId: string) => void) {
        this.connection?.on('MemberKicked', callback);
    }
    public offMemberKicked(callback: (roomId: number, userId: string) => void) {
        this.connection?.off('MemberKicked', callback);
    }
    // Kullanıcı yasaklandı
    public onMemberBanned(callback: (roomId: number, userId: string) => void) {
        this.connection?.on('MemberBanned', callback);
    }
    public offMemberBanned(callback: (roomId: number, userId: string) => void) {
        this.connection?.off('MemberBanned', callback);
    }
    // Kullanıcının rolü değişti
    public onMemberRoleChanged(callback: (userId: string, role: string) => void) {
        this.connection?.on('MemberRoleChanged', callback);
    }
    public offMemberRoleChanged(callback: (userId: string, role: string) => void) {
        this.connection?.off('MemberRoleChanged', callback);
    }
    // Odaya giriş reddedildi (ör. yasaklı)
    public onJoinRejected(callback: (reason: string) => void) {
        this.connection?.on('JoinRejected', callback);
    }
    public offJoinRejected(callback: (reason: string) => void) {
        this.connection?.off('JoinRejected', callback);
    }

    // ==========================================
    // ÖZEL MESAJLAR (DIRECT MESSAGES) - FAZ 1
    // ==========================================
    
    // Kullanıcı durum değişimi (Online, Offline)
    public onUserStatusChanged(callback: (data: { userId: string, status: string, message?: string, lastSeen?: string }) => void) {
        this.connection?.on('UserStatusChanged', callback);
    }
    public offUserStatusChanged(callback: (data: { userId: string, status: string, message?: string, lastSeen?: string }) => void) {
        this.connection?.off('UserStatusChanged', callback);
    }

    // Yeni özel mesaj geldi
    public onReceiveDirectMessage(callback: (dm: any) => void) {
        this.connection?.on('ReceiveDirectMessage', callback);
    }
    public offReceiveDirectMessage(callback: (dm: any) => void) {
        this.connection?.off('ReceiveDirectMessage', callback);
    }

    // DM Gönderme
    public async sendDirectMessage(receiverId: string, content: string, replyToId?: number) {
        if (!this.connection) return;
        try {
            await this.connection.invoke("SendDirectMessage", receiverId, content, replyToId || null);
        } catch (err) {
            console.error("Send DM Error:", err);
        }
    }

    public async sendDirectFileMessage(receiverId: string, fileUrl: string, fileName: string) {
        if (!this.connection) return;
        try {
            await this.connection.invoke("SendDirectFileMessage", receiverId, fileUrl, fileName);
        } catch (err) {
            console.error("Send DM File Error:", err);
        }
    }

    public async editDirectMessage(messageId: number, newContent: string) {
        if (!this.connection) return;
        try {
            await this.connection.invoke("EditDirectMessage", messageId, newContent);
        } catch (err) {
            console.error("Edit DM Error:", err);
        }
    }

    public async deleteDirectMessage(messageId: number) {
        if (!this.connection) return;
        try {
            await this.connection.invoke("DeleteDirectMessage", messageId);
        } catch (err) {
            console.error("Delete DM Error:", err);
        }
    }

    // Yazıyor... Bildirimi
    public onUserTyping(callback: (userId: string) => void) {
        this.connection?.on('UserTyping', callback);
    }
    public offUserTyping(callback: (userId: string) => void) {
        this.connection?.off('UserTyping', callback);
    }
    public async sendUserTyping(receiverId: string) {
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            await this.connection.invoke('SendUserTyping', receiverId);
        }
    }

    // Oda içi yazıyor... bildirimi
    public onRoomUserTyping(callback: (username: string) => void) {
        this.connection?.on('RoomUserTyping', callback);
    }
    public offRoomUserTyping(callback: (username: string) => void) {
        this.connection?.off('RoomUserTyping', callback);
    }
    public async sendRoomTyping(roomId: string) {
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            await this.connection.invoke('SendRoomTyping', roomId);
        }
    }

    // Okundu Bilgisi
    public onMessagesRead(callback: (userId: string) => void) {
        this.connection?.on('MessagesRead', callback);
    }
    public offMessagesRead(callback: (userId: string) => void) {
        this.connection?.off('MessagesRead', callback);
    }
    public onDirectMessageEdited(callback: (messageId: number, newContent: string) => void) {
        this.connection?.on('DirectMessageEdited', callback);
    }
    public onDirectMessageDeleted(callback: (messageId: number) => void) {
        this.connection?.on('DirectMessageDeleted', callback);
    }
    public offDirectMessageEdited(callback: (messageId: number, newContent: string) => void) {
        this.connection?.off('DirectMessageEdited', callback);
    }
    public offDirectMessageDeleted(callback: (messageId: number) => void) {
        this.connection?.off('DirectMessageDeleted', callback);
    }
    public async sendMarkAsRead(senderId: string) {
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            await this.connection.invoke('MarkMessagesAsRead', senderId);
        }
    }

    // Senders
    public async sendMessage(roomId: string, username: string, message: string, replyToId?: number): Promise<void> {
        if (!this.connection) return;
        try {
            await this.connection.invoke("SendMessage", roomId, username, message, replyToId || null);
        } catch (err) {
            console.error("Error sending message: ", err);
        }
    }
    public async sendFileMessage(roomId: string, username: string, fileUrl: string, fileName: string) {
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            await this.connection.invoke('SendFileMessage', roomId, username, fileUrl, fileName);
        }
    }
    public async editMessage(messageId: number, newText: string) {
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            await this.connection.invoke('EditMessage', messageId, newText);
        }
    }
    public async deleteMessage(messageId: number) {
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            await this.connection.invoke('DeleteMessage', messageId);
        }
    }
    public async notifyMuteStatus(roomId: string, isMuted: boolean) {
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            await this.connection.invoke('NotifyMuteStatus', roomId, isMuted);
        }
    }
    public async sendSignalToUser(signalData: string, targetConnectionId: string) {
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            await this.connection.invoke('SendSignalToUser', signalData, targetConnectionId);
        }
    }

    // ===== Soundboard =====
    public async playSound(roomId: string, soundUrl: string, soundName: string) {
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            try { await this.connection.invoke('PlaySound', roomId, soundUrl, soundName); }
            catch (err) { console.error('PlaySound hatası (backend güncel mi?):', err); }
        }
    }
    public onSoundPlayed(callback: (username: string, soundUrl: string, soundName: string) => void) {
        this.connection?.on('SoundPlayed', callback);
    }
    public offSoundPlayed(callback: (username: string, soundUrl: string, soundName: string) => void) {
        this.connection?.off('SoundPlayed', callback);
    }

    // ===== YouTube senkron oynatma =====
    public async startYoutube(roomId: string, videoId: string, mode: 'audio' | 'video' = 'audio') {
        if (this.connection.state !== signalR.HubConnectionState.Connected) {
            console.warn('StartYoutube: SignalR bağlantısı yok (state=', this.connection.state, ')');
            throw new Error('SignalR bağlantısı yok.');
        }
        try {
            await this.connection.invoke('StartYoutube', roomId, videoId, mode);
        } catch (err) {
            console.error('StartYoutube hatası (backend güncel mi?):', err);
            throw err;
        }
    }
    public async syncYoutube(roomId: string, action: 'play' | 'pause' | 'seek', position: number) {
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            try { await this.connection.invoke('SyncYoutube', roomId, action, position); }
            catch (err) { console.error('SyncYoutube hatası:', err); }
        }
    }
    public async stopYoutube(roomId: string) {
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            try { await this.connection.invoke('StopYoutube', roomId); }
            catch (err) { console.error('StopYoutube hatası:', err); }
        }
    }
    public onYoutubeStarted(callback: (videoId: string, username: string, mode: string) => void) {
        this.connection?.on('YoutubeStarted', callback);
    }
    public offYoutubeStarted(callback: (videoId: string, username: string, mode: string) => void) {
        this.connection?.off('YoutubeStarted', callback);
    }
    public onYoutubeSync(callback: (action: string, position: number) => void) {
        this.connection?.on('YoutubeSync', callback);
    }
    public offYoutubeSync(callback: (action: string, position: number) => void) {
        this.connection?.off('YoutubeSync', callback);
    }
    public onYoutubeStopped(callback: () => void) {
        this.connection?.on('YoutubeStopped', callback);
    }
    public offYoutubeStopped(callback: () => void) {
        this.connection?.off('YoutubeStopped', callback);
    }
    public onYoutubeState(callback: (videoId: string, isPlaying: boolean, position: number, startedBy: string, mode: string) => void) {
        this.connection?.on('YoutubeState', callback);
    }
    public offYoutubeState(callback: (videoId: string, isPlaying: boolean, position: number, startedBy: string, mode: string) => void) {
        this.connection?.off('YoutubeState', callback);
    }

    // ===== Ses kanalları =====
    public async joinVoice(voiceKey: string) {
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            await this.connection.invoke('JoinVoice', voiceKey);
        }
    }
    public async leaveVoice(voiceKey: string) {
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            try { await this.connection.invoke('LeaveVoice', voiceKey); } catch { /* bağlantı kapanıyor olabilir */ }
        }
    }

    public async stopConnection(roomId: string, username: string) {
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            try {
                await this.connection.invoke('LeaveRoom', roomId, username);
                await this.connection.stop();
                console.log('SignalR Disconnected.');
            } catch (e) {
                console.error('Disconnect error:', e);
            }
        }
    }
}

const signalrService = new SignalRService();
export default signalrService;
