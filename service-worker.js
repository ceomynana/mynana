// ══════════════════════════════════════════════════════
//  My Nana — Service Worker v1.0
//  Maneja: Push notifications · Offline básico
// ══════════════════════════════════════════════════════

const CACHE_NAME = 'mynana-v1';
const OFFLINE_URL = '/app.html';

// Assets a cachear para uso offline básico
const PRECACHE = [
  '/app.html',
  '/manifest.json',
  '/mynana-icon-casa-512.png',
];

// ── INSTALL ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

// ── ACTIVATE ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ── FETCH — Network first, cache fallback ──
self.addEventListener('fetch', event => {
  // Solo manejar GET, ignorar Firebase/Cloudinary/CDN
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (!url.origin.includes('mynana.app') && !url.origin.includes('localhost')) return;

  event.respondWith(
    fetch(event.request)
      .then(res => {
        // Solo cachear respuestas HTML propias
        if (res.ok && event.request.destination === 'document') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(event.request).then(r => r || caches.match(OFFLINE_URL)))
  );
});

// ── PUSH — Recibir notificación del servidor ──
self.addEventListener('push', event => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'My Nana', body: event.data.text() };
  }

  const {
    title = 'My Nana',
    body = '',
    icon = '/mynana-icon-casa-512.png',
    badge = '/mynana-icon-casa-512.png',
    url = '/app.html',
    tag = 'mynana-general',
    tipo = 'general',
  } = payload;

  // Iconos y colores por tipo
  const tipoConfig = {
    'nueva-tarea':       { icon: '/mynana-icon-casa-512.png', badge: '/mynana-icon-casa-512.png' },
    'mensaje':           { icon: '/mynana-icon-casa-512.png', badge: '/mynana-icon-casa-512.png' },
    'tarea-completada':  { icon: '/mynana-icon-casa-512.png', badge: '/mynana-icon-casa-512.png' },
    'recordatorio':      { icon: '/mynana-icon-casa-512.png', badge: '/mynana-icon-casa-512.png' },
    'alerta-hogar':      { icon: '/mynana-icon-casa-512.png', badge: '/mynana-icon-casa-512.png' },
  };
  const cfg = tipoConfig[tipo] || tipoConfig['general'] || {};

  const options = {
    body,
    icon: cfg.icon || icon,
    badge: cfg.badge || badge,
    tag,
    renotify: true,
    requireInteraction: tipo === 'alerta-hogar',
    vibrate: [100, 50, 100],
    data: { url, tipo },
    actions: tipo === 'nueva-tarea' ? [
      { action: 'ver', title: 'Ver tareas' },
      { action: 'cerrar', title: 'Cerrar' },
    ] : [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── NOTIFICATION CLICK ──
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'cerrar') return;

  const url = event.notification.data?.url || '/app.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Si ya hay una ventana abierta, enfocarla
      for (const client of windowClients) {
        if (client.url.includes('mynana.app') && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      // Si no hay ventana abierta, abrir una nueva
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ── MESSAGE — Comunicación desde la app ──
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
