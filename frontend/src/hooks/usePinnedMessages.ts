import { useCallback, useEffect, useState } from 'react';
import signalrService, { type PinnedMessage } from '../services/signalrService';

// Bir odanın (ya da kanalın) sabitlenmiş mesajları. Liste, odaya giriş
// tamamlanınca (RoomHistory) ve her sabitleme değişiminde sunucudan yeniden
// okunur; sunucu yalnızca o odaya katılmış bağlantıya liste döndürür.
export function usePinnedMessages(roomKey: string) {
    const [pins, setPins] = useState<PinnedMessage[]>([]);

    const refresh = useCallback(async () => {
        try {
            setPins(await signalrService.getPinnedMessages(roomKey));
        } catch {
            // Bağlantı yoksa sessizce geç; yeniden girişte RoomHistory tekrar tetikler
        }
    }, [roomKey]);

    useEffect(() => {
        let alive = true;
        const reload = () => { if (alive) refresh(); };
        const onDeleted = (messageId: number) => {
            if (alive) setPins(prev => prev.filter(p => p.id !== messageId));
        };

        setPins([]);
        reload();
        signalrService.onRoomHistory(reload);
        signalrService.onMessagePinChanged(reload);
        signalrService.onMessageDeleted(onDeleted);
        return () => {
            alive = false;
            signalrService.offRoomHistory(reload);
            signalrService.offMessagePinChanged(reload);
            signalrService.offMessageDeleted(onDeleted);
        };
    }, [refresh]);

    const togglePin = useCallback(async (messageId: number) => {
        try {
            return await signalrService.togglePin(messageId);
        } catch {
            return false;
        }
    }, []);

    return { pins, pinnedIds: new Set(pins.map(p => p.id)), togglePin };
}
