/* Web Push: vite-plugin-pwa'nın ürettiği service worker bunu importScripts ile yükler.
   Sunucu bildirimi { title, body, tag, url, icon } JSON'u olarak gönderir. */

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }

  event.waitUntil((async () => {
    // Uygulama zaten önde ve açıksa mesajı orada görüyor: ikinci kez bildirme
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows.some((c) => c.visibilityState === 'visible' && c.focused)) return;

    await self.registration.showNotification(data.title || 'Yeni bildirim', {
      body: data.body || '',
      icon: data.icon || '/logo.png',
      badge: '/logo.png',
      tag: data.tag || undefined,
      renotify: !!data.tag,
      data: { url: data.url || '/' },
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((c) => c.url.startsWith(self.location.origin));
    if (existing) {
      await existing.focus();
      return;
    }
    await self.clients.openWindow(url);
  })());
});
