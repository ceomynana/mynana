// ══════════════════════════════════════════════════════
//  My Nana — Service Worker v2.0
//  iOS-compatible push notifications
// ══════════════════════════════════════════════════════

const CACHE_NAME = 'mynana-v2';
const OFFLINE_URL = '/app.html';
const PRECACHE = ['/app.html', '/manifest.json'];

// ── INSTALL ──
self.addEventListener('install', event => {
  console.log('[SW] Installing v2...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .then(() => {
        console.log('[SW] Installed. Calling skipWaiting.');
        return self.skipWaiting();
      })
  );
});

// ── ACTIVATE ──
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      ))
      .then(() => {
        console.log('[SW] Activated. Claiming clients.');
        return self.clients.claim();
      })
  );
});

// ── FETCH — Network first, cache fallback ──
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Solo manejar recursos propios
  if (!url.hostname.includes('mynana.app') && !url.hostname.includes('localhost')) return;

  event.respondWith(
    fetch(event.request)
      .then(res => {
        if (res.ok && event.request.destination === 'document') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request).then(r => r || caches.match(OFFLINE_URL)))
  );
});

// ── PUSH ──
// IMPORTANTE: Para iOS, las opciones de notificación deben ser MUY simples.
// NO usar: actions, vibrate, renotify, requireInteraction, badge (en iOS no funciona)
self.addEventListener('push', event => {
  console.log('[SW] Push recibido');

  if (!event.data) {
    console.warn('[SW] Push sin datos');
    return;
  }

  let payload;
  try {
    payload = event.data.json();
    console.log('[SW] Payload:', JSON.stringify(payload));
  } catch(e) {
    payload = { title: 'My Nana', body: event.data.text() };
    console.log('[SW] Payload (text):', payload.body);
  }

  const title = payload.title || 'My Nana';
  const body  = payload.body  || '';
  const icon  = '/mynana-icon-casa-512.png';
  const tag   = payload.tag   || 'mynana';
  const url   = payload.url   || '/app.html';

  // Opciones mínimas compatibles con iOS
  // NO incluir: actions, vibrate, renotify, requireInteraction, badge
  const options = {
    body,
    icon,
    tag,
    data: { url },
  };

  console.log('[SW] Mostrando notificación:', title, body);

  event.waitUntil(
    self.registration.showNotification(title, options)
      .then(() => console.log('[SW] Notificación mostrada correctamente'))
      .catch(err => console.error('[SW] Error mostrando notificación:', err))
  );
});

// ── NOTIFICATION CLICK ──
self.addEventListener('notificationclick', event => {
  console.log('[SW] Notificación tocada');
  event.notification.close();

  const url = event.notification.data?.url || '/app.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        for (const client of windowClients) {
          if ('focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(url);
      })
  );
});

// ── MESSAGE ──
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') {
    console.log('[SW] skipWaiting por mensaje');
    self.skipWaiting();
  }
  if (event.data?.type === 'PING') {
    event.source?.postMessage({ type: 'PONG', version: CACHE_NAME });
  }
});
