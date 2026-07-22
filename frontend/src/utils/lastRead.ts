// Cihaz-bazlı "son okunan" zaman damgaları (unix ms) — okunmamış mesaj
// ayracı için. Anahtar: oda adı / kanal messageKey / dm:{userId}.

const key = (messageKey: string) => `lastRead:${messageKey}`;

export function getLastRead(messageKey: string): number {
  const raw = localStorage.getItem(key(messageKey));
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

export function setLastRead(messageKey: string, ts: number = Date.now()): void {
  try {
    localStorage.setItem(key(messageKey), String(ts));
  } catch { /* depolama dolu/kapalı — ayraç bir sonraki oturumda yanlış olabilir, kritik değil */ }
}
