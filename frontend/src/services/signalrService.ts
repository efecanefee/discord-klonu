import * as signalR from '@microsoft/signalr';

class SignalRService {
    private connection: signalR.HubConnection;
    private connectionPromise: Promise<void> | null = null;
    private backendUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:5098'}/hub/chat`;

    constructor() {
        this.connection = new signalR.HubConnectionBuilder()
            .withUrl(this.backendUrl, {
                // WebSocket'e zorla — negotiate roundtrip'ini atla (~100ms kazanç)
                skipNegotiation: true,
                transport: signalR.HttpTransportType.WebSockets,
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
    public onRoomUsers(callback: (usersDict: Record<string, string>) => void) {
        this.connection.on('roomusers', callback);
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
    public onReceiveMessage(callback: (username: string, message: string, serverId: number, timestamp: number) => void) {
        this.connection?.on('ReceiveMessage', callback);
    }
    public onReceiveSignal(callback: (senderConnectionId: string, signalData: string) => void) {
        this.connection?.on('ReceiveSignal', callback);
    }

    // OFF Listeners (To prevent multiple event fire bugs in React StrictMode/re-renders)
    public offRoomUsers(callback: (usersDict: Record<string, string>) => void) {
        this.connection.off('roomusers', callback);
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
    public offReceiveMessage(callback: (username: string, message: string, serverId: number, timestamp: number) => void) {
        this.connection?.off('ReceiveMessage', callback);
    }
    public offReceiveSignal(callback: (senderConnectionId: string, signalData: string) => void) {
        this.connection?.off('ReceiveSignal', callback);
    }

    // Geçmiş mesajlar
    public onRoomHistory(callback: (history: { id: number; username: string; text: string; timestamp: number }[]) => void) {
        this.connection?.on('RoomHistory', callback);
    }
    public offRoomHistory(callback: (history: { id: number; username: string; text: string; timestamp: number }[]) => void) {
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

    // Senders
    public async sendMessage(roomId: string, username: string, message: string) {
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            await this.connection.invoke('SendMessage', roomId, username, message);
        } else {
            console.warn("Mesaj gönderilemedi, bağlantı koptu.");
        }
    }
    public async deleteMessage(messageId: number) {
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            await this.connection.invoke('DeleteMessage', messageId);
        }
    }
    public async sendSignalToUser(signalData: string, targetConnectionId: string) {
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            await this.connection.invoke('SendSignalToUser', signalData, targetConnectionId);
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
