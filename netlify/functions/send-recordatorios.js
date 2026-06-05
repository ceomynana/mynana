/**
 * send-recordatorios.js
 * Netlify Scheduled Function — corre diariamente a las 7am Panamá (12:00 UTC)
 *
 * Envía push notifications para:
 *  1. Eventos de mantenimiento del hogar con fecha = mañana (recordatorioEnviado = false)
 *  2. Visitas de nana eventual con fecha = mañana (recordatorio24hEnviado = false)
 *
 * Variables de entorno requeridas en Netlify:
 *   VAPID_PUBLIC_KEY   — clave pública VAPID
 *   VAPID_PRIVATE_KEY  — clave privada VAPID
 *   FIREBASE_API_KEY   — API key de Firebase (solo lectura vía REST)
 *   VAPID_SUBJECT      — mailto:ceo@mynanaapp.com
 */

const { schedule } = require('@netlify/functions');
const webpush = require('web-push');

// ── Constantes ───────────────────────────────────────────────────────────────
const PROJECT_ID  = 'mynanapapp';
const FS_BASE     = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const API_KEY     = process.env.FIREBASE_API_KEY;
const VAPID_PUB   = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIV  = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUB   = process.env.VAPID_SUBJECT || 'mailto:ceo@mynanaapp.com';

// ── Helpers de fecha ─────────────────────────────────────────────────────────
function getFechaStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function manana() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return getFechaStr(d);
}

// ── Firestore REST helpers ───────────────────────────────────────────────────
async function firestoreGet(path) {
  const res = await fetch(`${FS_BASE}/${path}?key=${API_KEY}`);
  if (!res.ok) return null;
  return res.json();
}

/** Convierte un valor Firestore REST → JS */
function fsVal(v) {
  if (!v) return null;
  if (v.stringValue  !== undefined) return v.stringValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.integerValue !== undefined) return parseInt(v.integerValue);
  if (v.timestampValue !== undefined) return v.timestampValue;
  if (v.arrayValue) return (v.arrayValue.values || []).map(fsVal);
  if (v.mapValue)   return fsFields(v.mapValue.fields || {});
  return null;
}
function fsFields(fields) {
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = fsVal(v);
  return out;
}

/** runQuery via Firestore REST */
async function firestoreQuery(collectionPath, structuredQuery) {
  const res = await fetch(`${FS_BASE}/${collectionPath}:runQuery?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
  });
  if (!res.ok) return [];
  const rows = await res.json();
  return rows
    .filter(r => r.document)
    .map(r => ({
      id: r.document.name.split('/').pop(),
      path: r.document.name,
      ...fsFields(r.document.fields || {}),
    }));
}

/** PATCH un campo en Firestore REST */
async function firestorePatch(docPath, fields) {
  const fieldPaths = Object.keys(fields).join(',');
  const body = { fields: {} };
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'boolean') body.fields[k] = { booleanValue: v };
    else if (typeof v === 'string') body.fields[k] = { stringValue: v };
    else if (typeof v === 'number') body.fields[k] = { integerValue: String(v) };
  }
  await fetch(
    `${FS_BASE}/${docPath}?updateMask.fieldPaths=${fieldPaths}&key=${API_KEY}`,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
  );
}

// ── Obtener suscripciones push de un hogar ───────────────────────────────────
async function getPushSubsDeHogar(hogarId) {
  // Leer participantes del hogar
  const hogarDoc = await firestoreGet(`hogares/${hogarId}`);
  if (!hogarDoc?.fields) return [];
  const participantes = fsVal(hogarDoc.fields.participantes) || [];

  const subs = [];
  for (const uid of participantes) {
    const snapSubs = await firestoreQuery(`usuarios/${uid}/pushSubscriptions`, {
      from: [{ collectionId: 'pushSubscriptions' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'active' },
          op: 'EQUAL',
          value: { booleanValue: true },
        },
      },
      limit: 3,
    });
    for (const s of snapSubs) {
      if (s.endpoint && s.keys) subs.push({ uid, endpoint: s.endpoint, keys: s.keys });
    }
  }
  return subs;
}

// ── Enviar push a una suscripción ────────────────────────────────────────────
async function enviarPush(sub, notification) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify({
        title: notification.title,
        body:  notification.body,
        icon:  '/icon-192.png',
        badge: '/badge-72.png',
        url:   notification.url || '/app.html',
        tag:   notification.tag || 'mynana-recordatorio',
        data:  { url: notification.url || '/app.html' },
      })
    );
    return true;
  } catch(e) {
    // 410 = subscription expirada
    if (e.statusCode === 410) console.log(`[PUSH] Suscripción expirada: ${sub.endpoint.slice(-20)}`);
    else console.warn(`[PUSH] Error: ${e.message}`);
    return false;
  }
}

// ── Procesador principal ─────────────────────────────────────────────────────
async function procesarRecordatorios() {
  if (!VAPID_PUB || !VAPID_PRIV || !API_KEY) {
    console.error('[Recordatorios] Variables de entorno faltantes');
    return { enviados: 0, errores: ['Variables de entorno no configuradas'] };
  }

  webpush.setVapidDetails(VAPID_SUB, VAPID_PUB, VAPID_PRIV);

  const fechaManana = manana();
  console.log(`[Recordatorios] Procesando para mañana: ${fechaManana}`);

  let enviados = 0;
  const errores = [];

  // ── 1. Eventos de MANTENIMIENTO ─────────────────────────────────────────
  try {
    // Obtener todos los hogares con eventos pendientes para mañana
    // (Firestore REST no soporta collectionGroup queries, iteramos por hogar)
    // Approach: query colección raíz hogares y luego subcolecc eventos
    const hogaresSnap = await firestoreQuery('', {
      from: [{ collectionId: 'hogares', allDescendants: false }],
      select: { fields: [{ fieldPath: '__name__' }, { fieldPath: 'participantes' }] },
      limit: 500,
    });

    for (const hogar of hogaresSnap) {
      const hogarId = hogar.id;

      const eventos = await firestoreQuery(`hogares/${hogarId}/eventos`, {
        from: [{ collectionId: 'eventos' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: 'fecha' },
                  op: 'EQUAL',
                  value: { stringValue: fechaManana },
                },
              },
              {
                fieldFilter: {
                  field: { fieldPath: 'estado' },
                  op: 'EQUAL',
                  value: { stringValue: 'pendiente' },
                },
              },
            ],
          },
        },
        limit: 20,
      });

      // Filtrar los que NO han recibido recordatorio aún
      const pendientes = eventos.filter(e => !e.recordatorioEnviado);
      if (!pendientes.length) continue;

      const subs = await getPushSubsDeHogar(hogarId);
      if (!subs.length) continue;

      for (const evento of pendientes) {
        const hora = evento.hora || '';
        const notif = {
          title: `🔧 Mañana: ${evento.titulo}`,
          body:  hora ? `Programado para las ${hora}${evento.proveedor ? ' · ' + evento.proveedor : ''}` : 'Revisa el calendario de mantenimiento',
          url:   '/mantenimiento.html',
          tag:   `mant-${evento.id}`,
        };

        for (const sub of subs) {
          const ok = await enviarPush(sub, notif);
          if (ok) enviados++;
        }

        // Marcar como enviado
        await firestorePatch(`hogares/${hogarId}/eventos/${evento.id}`, {
          recordatorioEnviado: true,
        });
        console.log(`[Mant] ✅ Recordatorio enviado: ${evento.titulo} (${hogarId})`);
      }
    }
  } catch(e) {
    console.error('[Mant] Error:', e.message);
    errores.push(`mantenimiento: ${e.message}`);
  }

  // ── 2. VISITAS de nana eventual (recordatorio 24h antes) ─────────────────
  try {
    const hogaresSnap2 = await firestoreQuery('', {
      from: [{ collectionId: 'hogares', allDescendants: false }],
      select: { fields: [{ fieldPath: '__name__' }, { fieldPath: 'participantes' }] },
      limit: 500,
    });

    for (const hogar of hogaresSnap2) {
      const hogarId = hogar.id;

      const visitas = await firestoreQuery(`hogares/${hogarId}/visitas`, {
        from: [{ collectionId: 'visitas' }],
        where: {
          compositeFilter: {
            op: 'AND',
            filters: [
              {
                fieldFilter: {
                  field: { fieldPath: 'fecha' },
                  op: 'EQUAL',
                  value: { stringValue: fechaManana },
                },
              },
              {
                fieldFilter: {
                  field: { fieldPath: 'tipo' },
                  op: 'EQUAL',
                  value: { stringValue: 'eventual' },
                },
              },
            ],
          },
        },
        limit: 10,
      });

      const pendientes = visitas.filter(v => !v.recordatorio24hEnviado);
      if (!pendientes.length) continue;

      const subs = await getPushSubsDeHogar(hogarId);
      if (!subs.length) continue;

      for (const visita of pendientes) {
        const hora = visita.hora || '';
        const notif = {
          title: '👩 Mañana viene tu ayuda',
          body:  hora
            ? `Visita programada a las ${hora}. Revisa tareas pendientes.`
            : 'Tienes una visita de ayuda programada para mañana.',
          url:   '/nomina.html',
          tag:   `visita-${visita.id}`,
        };

        for (const sub of subs) {
          const ok = await enviarPush(sub, notif);
          if (ok) enviados++;
        }

        await firestorePatch(`hogares/${hogarId}/visitas/${visita.id}`, {
          recordatorio24hEnviado: true,
        });
        console.log(`[Visita] ✅ Recordatorio enviado: ${visita.fecha} (${hogarId})`);
      }
    }
  } catch(e) {
    console.error('[Visita] Error:', e.message);
    errores.push(`visitas: ${e.message}`);
  }

  return { enviados, errores, fecha: fechaManana };
}

// ── Handler scheduled ────────────────────────────────────────────────────────
// Corre todos los días a las 12:00 UTC = 7:00am Panamá (UTC-5)
exports.handler = schedule('0 12 * * *', async (event) => {
  console.log('[Recordatorios] Iniciando...');
  const result = await procesarRecordatorios();
  console.log(`[Recordatorios] Completado: ${result.enviados} enviados, ${result.errores.length} errores`);
  return { statusCode: 200 };
});
