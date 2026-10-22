// Web Push: uygulama kapalıyken de DM ve @bahsetme bildirimi. Abonelik tarayıcıda
// (service worker) tutulur, sunucuya kullanıcıyla eşleştirilerek kaydedilir.

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5098';
const ENABLED_KEY = 'webPushEnabled';

export type PushState = 'unsupported' | 'server-disabled' | 'denied' | 'off' | 'on';

export function webPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

function authHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` };
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function getPublicKey(): Promise<string | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/push/public-key`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.enabled && data.publicKey ? data.publicKey : null;
  } catch {
    return null;
  }
}

async function saveSubscription(sub: PushSubscription): Promise<boolean> {
  const json = sub.toJSON();
  const res = await fetch(`${API_BASE_URL}/api/push/subscribe`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ endpoint: json.endpoint, keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth } }),
  });
  return res.ok;
}

export async function getPushState(): Promise<PushState> {
  if (!webPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (!(await getPublicKey())) return 'server-disabled';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && localStorage.getItem(ENABLED_KEY) === '1' ? 'on' : 'off';
}

// İzin ister, aboneliği açar ve sunucuya kaydeder. Sonuç durumunu döndürür.
export async function enableWebPush(): Promise<PushState> {
  if (!webPushSupported()) return 'unsupported';
  const publicKey = await getPublicKey();
  if (!publicKey) return 'server-disabled';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';

  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });
  }
  if (!(await saveSubscription(sub))) return 'off';
  localStorage.setItem(ENABLED_KEY, '1');
  return 'on';
}

export async function disableWebPush(): Promise<void> {
  localStorage.removeItem(ENABLED_KEY);
  if (!webPushSupported()) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  try {
    await fetch(`${API_BASE_URL}/api/push/unsubscribe`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
  } catch { /* çevrimdışı: tarayıcı aboneliği yine de kapanır */ }
  await sub.unsubscribe().catch(() => { });
}

// Girişte çağrılır: açık abonelik varsa bu kullanıcıya bağlı olduğundan emin ol
// (tarayıcı aboneliği yenilemiş ya da başka hesapla girilmiş olabilir).
export async function resyncWebPush(): Promise<void> {
  if (!webPushSupported() || localStorage.getItem(ENABLED_KEY) !== '1') return;
  if (Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await saveSubscription(sub);
    else await enableWebPush();
  } catch { /* sessiz: bir sonraki girişte tekrar denenir */ }
}
