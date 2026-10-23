import * as signalR from '@microsoft/signalr';
import type { FeedPostDto, FeedReactionGroup, FeedVotes } from './feedApi';

// Hub baglanti durumu — UI'daki "baglanti koptu" uyarisi bunu dinler.
export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

// Yeniden baglanma araliklari (ms). Son deger sonsuza kadar tekrarlanir:
// varsayilan politika 4 denemeden (~42 sn) sonra pes ediyordu ve kullanici
// odada gorunmeye devam ederken baglanti kalici olarak kapali kaliyordu.
const RECONNECT_DELAYS = [0, 1000, 2000, 5000];

export interface VoiceUser {
    connectionId: string;
    username: string;
    avatarId: string;
    userId: string;
}

export interface PinnedMessage {
    id: number;
    username: string;
    avatarId: string;
    text: string;
    timestamp: number;
    fileUrl?: string | null;
    fileName?: string | null;
    pinnedBy?: string | null;
    pinnedAt?: number | null;
}

class SignalRService {
    private connection: signalR.HubConnection;
    private connectionPromise: Promise<void> | null = null;
    private backendUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:5098'}/hub/chat`;
    // Yeniden baglaninca otomatik geri girilecek oda ve ses kanali. Sunucu kopan
    // baglantiyi odadan ve ses kanalindan cikarir; yeni baglantinin yeni bir
    // connectionId'si olur, yani tekrar JoinRoom/JoinVoice cagrilmazsa kullanici
    // odada gorunur ama kimseyi duymaz ve kimse onu duymaz.
    private currentRoom: { roomId: string; username: string } | null = null;
    private currentVoiceKey: string | null = null;
    private status: ConnectionStatus = 'disconnected';
    private statusListeners = new Set<(status: ConnectionStatus) => void>();
    // Yeniden baglanma tamamlaninca, odaya geri girmeden HEMEN ONCE cagrilir.
    // WebRTC hook'lari eski peer baglantilarini burada kapatir; ardindan gelen
    // UserJoined/VoiceUserJoined ile karsi taraf yeni baglantiya offer acar.
    private reconnectedListeners = new Set<(newConnectionId: string) => void>();
    private restartTimer: ReturnType<typeof setTimeout> | null = null;
    private intentionalStop = false;

    constructor() {
        this.connection = new signalR.HubConnectionBuilder()
            .withUrl(this.backendUrl, {
                accessTokenFactory: () => localStorage.getItem('token') || '',
            })
            .withAutomaticReconnect({
                nextRetryDelayInMilliseconds: ctx =>
                    RECONNECT_DELAYS[Math.min(ctx.previousRetryCount, RECONNECT_DELAYS.length - 1)],
            })
            .configureLogging(signalR.LogLevel.Warning)
            .build();

        // Arka plandaki sekmede tarayici zamanlayicilari yavaslatir (Chrome'da
        // dakikada bire kadar). Varsayilan 30 sn'lik zaman asimi bu yuzden oyun
        // oynarken baglantiyi dusuruyordu; sunucudaki ClientTimeoutInterval ile esit.
        this.connection.serverTimeoutInMilliseconds = 120_000;
        this.connection.keepAliveIntervalInMilliseconds = 15_000;

        this.connection.onreconnecting(err => {
            console.warn('[SignalR] Baglanti koptu, yeniden baglaniliyor...', err);
            this.setStatus('reconnecting');
        });
        this.connection.onreconnected(newId => {
            console.log('[SignalR] Yeniden baglandi:', newId);
            this.handleReconnected(newId ?? this.connection.connectionId ?? '');
        });
        this.connection.onclose(err => {
            this.setStatus('disconnected');
            if (this.intentionalStop) return;
            console.warn('[SignalR] Baglanti kapandi, tekrar denenecek.', err);
            this.scheduleRestart();
        });

        // Ag geri gelince beklemeden dene
        window.addEventListener('online', () => {
            if (this.connection.state === signalR.HubConnectionState.Disconnected && !this.intentionalStop) {
                this.scheduleRestart(0);
            }
        });
    }

    public get connectionId(): string | null {
        return this.connection.connectionId;
    }

    public get connectionStatus(): ConnectionStatus {
        return this.status;
    }

    /** Kullanici bir odada ya da ses kanalinda mi (kopma uyarisi sesi icin) */
    public get isInCall(): boolean {
        return this.currentRoom !== null || this.currentVoiceKey !== null;
    }

    public onConnectionStatus(cb: (status: ConnectionStatus) => void) { this.statusListeners.add(cb); }
    public offConnectionStatus(cb: (status: ConnectionStatus) => void) { this.statusListeners.delete(cb); }
    public onReconnected(cb: (newConnectionId: string) => void) { this.reconnectedListeners.add(cb); }
    public offReconnected(cb: (newConnectionId: string) => void) { this.reconnectedListeners.delete(cb); }

    private setStatus(next: ConnectionStatus) {
        if (this.status === next) return;
        this.status = next;
        this.statusListeners.forEach(cb => { try { cb(next); } catch (e) { console.error(e); } });
    }

    private async handleReconnected(newId: string) {
        this.reconnectedListeners.forEach(cb => { try { cb(newId); } catch (e) { console.error(e); } });
        const room = this.currentRoom;
        if (room) {
            try { await this.connection.invoke('JoinRoom', room.roomId, room.username); }
            catch (e) { console.error('[SignalR] Odaya geri girilemedi:', e); }
        }
        const voiceKey = this.currentVoiceKey;
        if (voiceKey) {
            try { await this.connection.invoke('JoinVoice', voiceKey); }
            catch (e) { console.error('[SignalR] Ses kanalina geri girilemedi:', e); }
        }
        this.setStatus('connected');
    }

    // Otomatik yeniden baglanma da basarisiz olursa (or. backend yeniden
    // baslarken) baglantiyi sifirdan kurmayi denemeye devam et.
    private scheduleRestart(delay = 5000) {
        if (this.restartTimer) return;
        this.restartTimer = setTimeout(async () => {
            this.restartTimer = null;
            if (this.connection.state !== signalR.HubConnectionState.Disconnected || this.intentionalStop) return;
            this.setStatus('reconnecting');
            try {
                await this.connection.start();
                await this.handleReconnected(this.connection.connectionId ?? '');
            } catch {
                this.setStatus('disconnected');
                this.scheduleRestart();
            }
        }, delay);
    }

    public async startConnection(roomId?: string, username?: string): Promise<void> {
        this.intentionalStop = false;
        if (roomId && username) this.currentRoom = { roomId, username };
        if (this.connection.state === signalR.HubConnectionState.Disconnected) {
            console.log(`🔌 SignalR bağlantısı deneniyor... Hedef: ${this.backendUrl}`);
            this.connectionPromise = this.connection.start().then(() => {
                console.log('✅ SignalR Bağlantısı BAŞARILI!');
                this.setStatus('connected');
            }).catch(err => {
                console.error('❌ SignalR Bağlantı Hatası! Lütfen Backend portunun doğru olduğundan (5098) ve CORS ayarlarından emin olun. Hata: ', err);
                this.connectionPromise = null;
                this.setStatus('disconnected');
                // Ilk baglanti da basarisiz olabilir (backend uyaniyor) — denemeye devam
                this.scheduleRestart();
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
        if (this.currentRoom?.roomId === roomId) this.currentRoom = null;
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

    // Sağırlaştırma durumu değişikliği
    public onUserDeafenChanged(callback: (username: string, connectionId: string, isDeafened: boolean) => void) {
        this.connection?.on('UserDeafenChanged', callback);
    }
    public offUserDeafenChanged(callback: (username: string, connectionId: string, isDeafened: boolean) => void) {
        this.connection?.off('UserDeafenChanged', callback);
    }

    // Odadaki sağırlaştırma durumları (ilk bağlandığında)
    public onRoomDeafenStates(callback: (deafenStates: Record<string, boolean>) => void) {
        this.connection?.on('RoomDeafenStates', callback);
    }
    public offRoomDeafenStates(callback: (deafenStates: Record<string, boolean>) => void) {
        this.connection?.off('RoomDeafenStates', callback);
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

    // Ana ekran not akışı — gönderi/oy/tepki değişiklikleri herkese yayınlanır
    public onFeedPostCreated(callback: (post: FeedPostDto) => void) {
        this.connection?.on('FeedPostCreated', callback);
    }
    public offFeedPostCreated(callback: (post: FeedPostDto) => void) {
        this.connection?.off('FeedPostCreated', callback);
    }
    public onFeedPostDeleted(callback: (postId: number) => void) {
        this.connection?.on('FeedPostDeleted', callback);
    }
    public offFeedPostDeleted(callback: (postId: number) => void) {
        this.connection?.off('FeedPostDeleted', callback);
    }
    public onFeedVotesUpdated(callback: (postId: number, votes: FeedVotes) => void) {
        this.connection?.on('FeedVotesUpdated', callback);
    }
    public offFeedVotesUpdated(callback: (postId: number, votes: FeedVotes) => void) {
        this.connection?.off('FeedVotesUpdated', callback);
    }
    public onFeedReactionUpdated(callback: (postId: number, reactions: FeedReactionGroup[]) => void) {
        this.connection?.on('FeedReactionUpdated', callback);
    }
    public offFeedReactionUpdated(callback: (postId: number, reactions: FeedReactionGroup[]) => void) {
        this.connection?.off('FeedReactionUpdated', callback);
    }

    // Mesaj tepkileri (emoji reaction)
    public onReactionUpdated(callback: (messageId: number, reactions: { emoji: string; count: number; usernames: string[] }[]) => void) {
        this.connection?.on('ReactionUpdated', callback);
    }
    public offReactionUpdated(callback: (messageId: number, reactions: { emoji: string; count: number; usernames: string[] }[]) => void) {
        this.connection?.off('ReactionUpdated', callback);
    }
    public async toggleReaction(roomId: string, messageId: number, emoji: string) {
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            await this.connection.invoke('ToggleReaction', roomId, messageId, emoji);
        }
    }

    // Sunucuya gidiş-dönüş süresi (ms); bağlı değilse null
    public async measureLatency(): Promise<number | null> {
        if (this.connection.state !== signalR.HubConnectionState.Connected) return null;
        const start = performance.now();
        try {
            await this.connection.invoke('Ping');
            return Math.round(performance.now() - start);
        } catch {
            return null;
        }
    }

    // Mesaj sabitleme
    public onMessagePinChanged(callback: (messageId: number, isPinned: boolean, pinnedBy: string | null) => void) {
        this.connection?.on('MessagePinChanged', callback);
    }
    public offMessagePinChanged(callback: (messageId: number, isPinned: boolean, pinnedBy: string | null) => void) {
        this.connection?.off('MessagePinChanged', callback);
    }
    public async togglePin(messageId: number): Promise<boolean> {
        if (this.connection.state !== signalR.HubConnectionState.Connected) return false;
        return this.connection.invoke<boolean>('TogglePin', messageId);
    }
    public async getPinnedMessages(roomId: string): Promise<PinnedMessage[]> {
        if (this.connection.state !== signalR.HubConnectionState.Connected) return [];
        return this.connection.invoke<PinnedMessage[]>('GetPinnedMessages', roomId);
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
    public async notifyDeafenStatus(roomId: string, isDeafened: boolean) {
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            try { await this.connection.invoke('NotifyDeafenStatus', roomId, isDeafened); }
            catch (err) { console.error('NotifyDeafenStatus hatası (backend güncel mi?):', err); }
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

    // ===== YouTube kuyruğu =====
    public async enqueueYoutube(roomId: string, videoId: string) {
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            await this.connection.invoke('EnqueueYoutube', roomId, videoId);
        }
    }
    public async skipYoutube(roomId: string) {
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            try { await this.connection.invoke('SkipYoutube', roomId); }
            catch (err) { console.error('SkipYoutube hatası:', err); }
        }
    }
    public async nextYoutube(roomId: string, endedVideoId: string) {
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            try { await this.connection.invoke('NextYoutube', roomId, endedVideoId); }
            catch (err) { console.error('NextYoutube hatası:', err); }
        }
    }
    public async removeFromYoutubeQueue(roomId: string, index: number) {
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            try { await this.connection.invoke('RemoveFromYoutubeQueue', roomId, index); }
            catch (err) { console.error('RemoveFromYoutubeQueue hatası:', err); }
        }
    }
    public onYoutubeQueueUpdated(callback: (queue: { videoId: string; addedBy: string }[]) => void) {
        this.connection?.on('YoutubeQueueUpdated', callback);
    }
    public offYoutubeQueueUpdated(callback: (queue: { videoId: string; addedBy: string }[]) => void) {
        this.connection?.off('YoutubeQueueUpdated', callback);
    }

    // ===== Ses kanalları =====
    public async joinVoice(voiceKey: string) {
        this.currentVoiceKey = voiceKey;
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            await this.connection.invoke('JoinVoice', voiceKey);
        }
    }
    public async leaveVoice(voiceKey: string) {
        if (this.currentVoiceKey === voiceKey) this.currentVoiceKey = null;
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            try { await this.connection.invoke('LeaveVoice', voiceKey); } catch { /* bağlantı kapanıyor olabilir */ }
        }
    }

    public async stopConnection(roomId: string, username: string) {
        this.intentionalStop = true;
        this.currentRoom = null;
        this.currentVoiceKey = null;
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
