// Service worker güncelleme köprüsü — main.tsx'teki registerSW ile App
// arasında durum taşır. "Hazır olunca yenile" akışı:
//   - Güncelleme hazır + kullanıcı güvenli yerdeyse (oda/DM/ses yokken) otomatik uygula.
//   - Odadaysa küçük bir "Yeni sürüm hazır" bildirimi göster, tıklayınca uygula.

let applyFn: (() => void) | null = null;
let ready = false;
const listeners = new Set<() => void>();

// main.tsx çağırır: güncelleme indirildi, uygulama fonksiyonunu kaydet
export function setUpdateReady(apply: () => void): void {
  applyFn = apply;
  ready = true;
  listeners.forEach(l => l());
}

// App abone olur; zaten hazırsa anında tetiklenir
export function onUpdateReady(listener: () => void): () => void {
  listeners.add(listener);
  if (ready) listener();
  return () => { listeners.delete(listener); };
}

// Yeni SW'yi etkinleştirir — sayfa controllerchange ile yenilenir
export function applyUpdate(): void {
  applyFn?.();
}
