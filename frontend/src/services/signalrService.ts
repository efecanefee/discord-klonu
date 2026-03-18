import * as signalR from '@microsoft/signalr';

class SignalRService {
    private connection: signalR.HubConnection;
    private connectionPromise: Promise<void> | null = null;
    private backendUrl = 'http://localhost:5098/hub/chat';

    constructor() {
        this.connection = new signalR.HubConnectionBuilder()
            .withUrl(this.backendUrl)
            .withAutomaticReconnect()
            .configureLogging(signalR.LogLevel.Information)
            .build();
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
            } catch (err) {
                return; // Error already logged.
            }
        }

        if (roomId && username && this.connection.state === signalR.HubConnectionState.Connected) {
            try {
                await this.connection.invoke('JoinRoom', roomId, username);
            } catch (err) {
                console.error('Odaya katılma hatası:', err);
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
    public onReceiveMessage(callback: (username: string, message: string) => void) {
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
    public offReceiveMessage(callback: (username: string, message: string) => void) {
        this.connection?.off('ReceiveMessage', callback);
    }
    public offReceiveSignal(callback: (senderConnectionId: string, signalData: string) => void) {
        this.connection?.off('ReceiveSignal', callback);
    }

    // Senders
    public async sendMessage(roomId: string, username: string, message: string) {
        if (this.connection.state === signalR.HubConnectionState.Connected) {
            await this.connection.invoke('SendMessage', roomId, username, message);
        } else {
            console.warn("Mesaj gönderilemedi, bağlantı koptu.");
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
