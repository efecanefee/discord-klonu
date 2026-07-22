// Tarayıcı bildirimleri (sayfa açıkken çalışan Notification API — Web Push değil).
// Sekme görünürken bildirim gösterilmez; tıklanınca pencereye odaklanılır.

export function notificationsSupported(): boolean {
  return 'Notification' in window;
}

export function notificationPermission(): NotificationPermission {
  return notificationsSupported() ? Notification.permission : 'denied';
}

// Kullanıcı jesti içinde çağrılmalı (ör. ayarlardaki toggle)
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied';
  return Notification.requestPermission();
}

interface NotifyOptions {
  tag?: string;         // aynı tag'li bildirimler birbirini günceller (spam önler)
  force?: boolean;      // true: sekme görünür olsa da göster (varsayılan: gösterme)
}

export function notify(title: string, body: string, opts: NotifyOptions = {}): void {
  if (!notificationsSupported()) return;
  if (Notification.permission !== 'granted') return;
  if (!opts.force && document.visibilityState === 'visible') return;

  try {
    const n = new Notification(title, {
      body: body.length > 80 ? body.slice(0, 80) + '...' : body,
      icon: '/logo.png',
      tag: opts.tag ?? 'sandalyecimetin',
      silent: false,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch { /* bazı platformlarda sayfa bağlamında Notification constructor yok */ }
}
