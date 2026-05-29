// ══════════════════════════════════════════════════════
//  My Nana — Netlify Function: send-push.js
//  Envía push notifications usando VAPID + web-push
//
//  Variables de entorno en Netlify (NO en código):
//    VAPID_PUBLIC_KEY
//    VAPID_PRIVATE_KEY
//    VAPID_EMAIL
// ══════════════════════════════════════════════════════

const webpush = require('web-push');

// Dominios permitidos — rechazar requests de otros orígenes
const ALLOWED_ORIGINS = [
  'https://mynana.app',
  'https://mynana.netlify.app',
];

exports.handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.referer || '';
  const isAllowed = ALLOWED_ORIGINS.some(o => origin.startsWith(o));

  const headers = {
    'Access-Control-Allow-Origin': isAllowed ? origin : 'https://mynana.app',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Solo POST permitido
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Rechazar si origen no es mynana.app
  if (!isAllowed) {
    console.warn('[send-push] Origen no permitido:', origin);
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  // Verificar variables de entorno
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.error('[send-push] VAPID keys no configuradas en Netlify env vars');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  try {
    const { subscription, notification } = JSON.parse(event.body || '{}');

    if (!subscription?.endpoint || !subscription?.keys?.auth || !subscription?.keys?.p256dh) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid subscription' }) };
    }

    if (!notification?.title) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing notification title' }) };
    }

    webpush.setVapidDetails(
      process.env.VAPID_EMAIL || 'mailto:ceo@mynanaapp.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const payload = JSON.stringify({
      title: notification.title,
      body:  notification.body  || '',
      icon:  '/mynana-icon-casa-v2.png',
      url:   notification.url   || '/app.html',
      tipo:  notification.tipo  || 'general',
      tag:   notification.tag   || 'mynana',
    });

    await webpush.sendNotification(subscription, payload);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };

  } catch (err) {
    console.error('[send-push] Error:', err.statusCode, err.message);
    if (err.statusCode === 410 || err.statusCode === 404) {
      return { statusCode: 410, headers, body: JSON.stringify({ error: 'Subscription expired', expired: true }) };
    }
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
