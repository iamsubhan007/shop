/* Service worker for the staff portal (registered with scope /admin/ by the "phone alerts" button).
   It only does one thing: show a notification when the server pushes a new-order alert, and open the right page
   when it is tapped. It does no caching, so it can never serve stale pages. */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(
    self.registration.showNotification(data.title || 'New order', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: data.tag || 'new-order', // one notification per order; a repeat replaces it
      renotify: true, // ...but still buzz again
      requireInteraction: true, // stay on screen (desktop) until someone taps it
      vibrate: [300, 150, 300, 150, 300],
      data: { url: data.url || '/admin' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    // Only ever open pages of this site, whatever the payload says.
    let target = new URL('/admin', self.location.origin);
    try {
      const u = new URL((event.notification.data && event.notification.data.url) || '/admin', self.location.origin);
      if (u.origin === self.location.origin && u.pathname.indexOf('/admin') === 0) target = u;
    } catch (e) { /* keep default */ }
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of open) {
      if (new URL(c.url).pathname.indexOf('/admin') === 0 && 'focus' in c) {
        await c.focus();
        if ('navigate' in c) { try { await c.navigate(target.href); } catch (e) { /* ignore */ } }
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target.href);
  })());
});
