import { useEffect, useState } from 'react';
import signalrService from '../services/signalrService';

const POLL_MS = 4000;

// Kişi başı WebRTC gidiş-dönüş süresi (ms). Seçili ICE aday çiftinin
// currentRoundTripTime değerinden okunur; ses doğrudan kişiler arasında
// aktığı için asıl hissedilen gecikme budur.
export function usePeerPings(getPeers: () => Map<string, RTCPeerConnection>, enabled: boolean) {
    const [pings, setPings] = useState<Map<string, number>>(new Map());

    useEffect(() => {
        if (!enabled) { setPings(new Map()); return; }
        let alive = true;

        const poll = async () => {
            const next = new Map<string, number>();
            await Promise.all([...getPeers().entries()].map(async ([connId, pc]) => {
                if (pc.connectionState !== 'connected') return;
                try {
                    const stats = await pc.getStats();
                    stats.forEach(report => {
                        if (report.type === 'candidate-pair' && report.state === 'succeeded'
                            && (report.nominated || report.selected) && typeof report.currentRoundTripTime === 'number') {
                            next.set(connId, Math.round(report.currentRoundTripTime * 1000));
                        }
                    });
                } catch { /* kapanmakta olan bağlantı */ }
            }));
            if (alive) setPings(next);
        };

        poll();
        const id = setInterval(poll, POLL_MS);
        return () => { alive = false; clearInterval(id); };
    }, [getPeers, enabled]);

    return pings;
}

// Sunucuya (SignalR hub) gidiş-dönüş süresi; odada tek başınayken de bir değer gösterir.
export function useServerPing(enabled: boolean) {
    const [ping, setPing] = useState<number | null>(null);

    useEffect(() => {
        if (!enabled) { setPing(null); return; }
        let alive = true;
        const poll = async () => {
            const ms = await signalrService.measureLatency();
            if (alive) setPing(ms);
        };
        poll();
        const id = setInterval(poll, POLL_MS);
        return () => { alive = false; clearInterval(id); };
    }, [enabled]);

    return ping;
}

// Discord'daki gibi: yeşil < 100 ms, sarı < 250 ms, üstü kırmızı
export function pingQuality(ms: number | null | undefined): 'good' | 'ok' | 'bad' | 'unknown' {
    if (ms == null) return 'unknown';
    if (ms < 100) return 'good';
    if (ms < 250) return 'ok';
    return 'bad';
}
