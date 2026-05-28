// ══════════════════════════════════════════════════════
//  My Nana — Netlify Function: send-push.js
//  Envía push notifications usando VAPID + web-push
//
//  Variables de entorno requeridas en Netlify:
//    VAPID_PUBLIC_KEY   = BFAdLN5LcWCs0mR_KDyJthqJb9cdDpBEu9rUIY8dUgudF5wyahX4_TOKkbEPnmWssc7jgBQzs7Hwx1bUIZxnIFM
//    VAPID_PRIVATE_KEY  = uObQyyJYIpXuTzonpL7r5Nq7oUuaxFnaxciBtYcufEk
//    VAPID_EMAIL        = mailto:ceo@mynanaapp.com
// ══════════════════════════════════════════════════════

const webpush = require('web-push');

exports.handler = async (event) => {
  // CORS
  const headers = {
    'Access-Control-Allow-Origin': 'https://mynana.app',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { subscription, notification } = JSON.parse(event.body || '{}');

    if (!subscription || !notification) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing subscription or notification' }) };
    }

    // Validar estructura de subscription
    if (!subscription.endpoint || !subscription.keys?.auth || !subscription.keys?.p256dh) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid subscription format' }) };
    }

    webpush.setVapidDetails(
      process.env.VAPID_EMAIL || 'mailto:ceo@mynanaapp.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const payload = JSON.stringify({
      title: notification.title || 'My Nana',
      body: notification.body || '',
      icon: '/mynana-icon-casa-512.png',
      badge: '/mynana-icon-casa-512.png',
      url: notification.url || '/app.html',
      tag: notification.tag || 'mynana-general',
      tipo: notification.tipo || 'general',
    });

    await webpush.sendNotification(subscription, payload);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true }),
    };

  } catch (err) {
    console.error('send-push error:', err);

    // Si la suscripción expiró (410 Gone), devolver ese código para que el cliente la elimine
    if (err.statusCode === 410 || err.statusCode === 404) {
      return {
        statusCode: 410,
        headers,
        body: JSON.stringify({ error: 'Subscription expired', expired: true }),
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
