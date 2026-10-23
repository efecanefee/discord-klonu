import { useCallback, useEffect, useRef, useState } from 'react';
import { getAllLastRead, LAST_READ_EVENT } from '../utils/lastRead';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5098';

export interface UnreadCounts {
  byKey: Record<string, number>;   // kanal messageKey / oda adı → sayı
  byRoom: Record<number, number>;  // oda id → tüm metin kanallarının toplamı
}

const EMPTY: UnreadCounts = { byKey: {}, byRoom: {} };

// Oda ve kanal okunmamış sayıları. Yalnızca daha önce açılmış (son okuma
// zamanı bilinen) oda/kanallar sayılır; açılıştan, sekmeye dönünce ve
// belirli aralıklarla tazelenir. Okunan anahtar anında sıfırlanır.
export function useUnreadCounts(enabled = true, intervalMs = 45_000): UnreadCounts {
  const [counts, setCounts] = useState<UnreadCounts>(EMPTY);
  const keyRoomRef = useRef<Record<string, number>>({});

  const refresh = useCallback(async () => {
    const lastRead = getAllLastRead();
    if (Object.keys(lastRead).length === 0) { setCounts(EMPTY); return; }
    try {
      const res = await fetch(`${API_BASE_URL}/api/rooms/unread`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ lastRead }),
      });
      if (!res.ok) return;
      const rows: { key: string; roomId: number; count: number }[] = await res.json();
      const byKey: Record<string, number> = {};
      const byRoom: Record<number, number> = {};
      for (const r of rows) {
        byKey[r.key] = r.count;
        keyRoomRef.current[r.key] = r.roomId;
        byRoom[r.roomId] = (byRoom[r.roomId] ?? 0) + r.count;
      }
      setCounts({ byKey, byRoom });
    } catch { /* ağ hatası — bir sonraki turda */ }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const first = window.setTimeout(refresh, 0);
    const id = window.setInterval(() => { if (!document.hidden) refresh(); }, intervalMs);
    const onVisible = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [enabled, intervalMs, refresh]);

  // Okundu işaretlenen anahtarı sunucuyu beklemeden sıfırla
  useEffect(() => {
    const onRead = (e: Event) => {
      const k = (e as CustomEvent<string>).detail;
      setCounts(prev => {
        const c = prev.byKey[k];
        if (!c) return prev;
        const byKey = { ...prev.byKey };
        delete byKey[k];
        const byRoom = { ...prev.byRoom };
        const rid = keyRoomRef.current[k];
        if (rid != null) {
          byRoom[rid] = Math.max(0, (byRoom[rid] ?? 0) - c);
          if (!byRoom[rid]) delete byRoom[rid];
        }
        return { byKey, byRoom };
      });
    };
    window.addEventListener(LAST_READ_EVENT, onRead);
    return () => window.removeEventListener(LAST_READ_EVENT, onRead);
  }, []);

  return counts;
}

export const formatUnread = (n: number) => (n > 99 ? '99+' : String(n));
