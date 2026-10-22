import { useCallback, useEffect, useState } from 'react';
import signalrService, { type PinnedMessage } from '../services/signalrService';

// Bir odanın (ya da kanalın) sabitlenmiş mesajları. Liste, odaya giriş
// tamamlanınca (RoomHistory) ve her sabitleme değişiminde sunucudan yeniden
// okunur; sunucu yalnızca o odaya katılmış bağlantıya liste döndürür.
const NO_PINS: PinnedMessage[] = [];

export function usePinnedMessages(roomKey: string) {
    // Liste hangi odaya ait olduğuyla birlikte tutulur: kanal değişince eskisi görünmez
    const [loaded, setLoaded] = useState<{ key: string; pins: PinnedMessage[] }>({ key: roomKey, pins: [] });
    const pins = loaded.key === roomKey ? loaded.pins : NO_PINS;

    const refresh = useCallback(async () => {
        try {
            const list = await signalrService.getPinnedMessages(roomKey);
            setLoaded({ key: roomKey, pins: list });
        } catch {
            // Bağlantı yoksa sessizce geç; yeniden girişte RoomHistory tekrar tetikler
        }
    }, [roomKey]);

    useEffect(() => {
        let alive = true;
        const reload = () => { if (alive) refresh(); };
        const onDeleted = (messageId: number) => {
            if (alive) setLoaded(prev => ({ ...prev, pins: prev.pins.filter(p => p.id !== messageId) }));
        };

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
