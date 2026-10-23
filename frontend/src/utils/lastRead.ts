// Cihaz-bazlı "son okunan" zaman damgaları (unix ms) — okunmamış mesaj
// ayracı için. Anahtar: oda adı / kanal messageKey / dm:{userId}.

const key = (messageKey: string) => `lastRead:${messageKey}`;

// setLastRead sonrası yayınlanır — rozetler o anahtarı hemen sıfırlar
export const LAST_READ_EVENT = 'lastread-changed';

export function getLastRead(messageKey: string): number {
  const raw = localStorage.getItem(key(messageKey));
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function setLastRead(messageKey: string, ts: number = Date.now()): void {
  try {
    localStorage.setItem(key(messageKey), String(ts));
    window.dispatchEvent(new CustomEvent(LAST_READ_EVENT, { detail: messageKey }));
  } catch { /* depolama dolu/kapalı — ayraç bir sonraki oturumda yanlış olabilir, kritik değil */ }
}

// Oda/kanal anahtarlarının tamamı (DM'ler hariç) — okunmamış rozetleri için sunucuya gider
export function getAllLastRead(): Record<string, number> {
  const out: Record<string, number> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('lastRead:') || k.startsWith('lastRead:dm:')) continue;
      const n = Number(localStorage.getItem(k));
      if (Number.isFinite(n)) out[k.slice('lastRead:'.length)] = n;
    }
  } catch { /* depolama kapalı */ }
  return out;
}
