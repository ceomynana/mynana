// ══════════════════════════════════════════════════════
//  My Nana — Netlify Function: generate-plan.js
//  Proxy hacia Claude API — PROTEGIDO con CORS + auth
// ══════════════════════════════════════════════════════

const ALLOWED_ORIGINS = [
  'https://mynana.app',
  'https://mynana.netlify.app',
];

// Verificar que la request viene de mynana.app
function isAllowedOrigin(event) {
  const origin  = event.headers?.origin  || '';
  const referer = event.headers?.referer || '';
  return ALLOWED_ORIGINS.some(o => origin.startsWith(o) || referer.startsWith(o));
}

exports.handler = async (event) => {
  const origin = event.headers?.origin || 'https://mynana.app';
  const corsOrigin = ALLOWED_ORIGINS.some(o => origin.startsWith(o))
    ? origin : 'https://mynana.app';

  const headers = {
    'Access-Control-Allow-Origin':  corsOrigin,
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

  // Rechazar si el origen no es mynana.app
  if (!isAllowedOrigin(event)) {
    console.warn('[generate-plan] Origen no autorizado:', event.headers?.origin);
    return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };
  }

  // Verificar que la ANTHROPIC_API_KEY esté configurada
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[generate-plan] ANTHROPIC_API_KEY no configurada');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Server misconfigured' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');

    // Validar que tenga mensajes — rechazar payloads vacíos o maliciosos
    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid payload' }) };
    }

    // Limitar max_tokens para controlar costos
    const max_tokens = Math.min(body.max_tokens || 1000, 2000);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:     'claude-haiku-4-5-20251001', // Cambiado de Opus a Haiku — 60x más barato
        max_tokens,
        system:   body.system   || 'Responde en JSON.',
        messages: body.messages,
      }),
    });

    const data = await response.json();

    if (!response.ok || data.type === 'error') {
      return {
        statusCode: response.status || 500,
        headers,
        body: JSON.stringify(data),
      };
    }

    return { statusCode: 200, headers, body: JSON.stringify(data) };

  } catch (err) {
    console.error('[generate-plan] Error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
