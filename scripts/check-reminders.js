/**
 * My Nana — check-reminders.js
 * Script ejecutado por GitHub Actions cada hora.
 *
 * Verifica y envía:
 *  1. Recordatorio 24h antes de evento
 *  2. Recordatorio 1h antes de evento
 *  3. Recordatorio día de compra
 *
 * Requiere env vars:
 *  FIREBASE_SERVICE_ACCOUNT  — JSON del service account de Firebase
 *  VAPID_PUBLIC_KEY
 *  VAPID_PRIVATE_KEY
 *  VAPID_EMAIL
 */

'use strict';

const admin  = require('firebase-admin');
const webpush = require('web-push');

// ── Inicializar Firebase Admin ──────────────────────────────────────────────
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// ── Inicializar web-push ────────────────────────────────────────────────────
webpush.setVapidDetails(
  process.env.VAPID_EMAIL || 'mailto:ceo@mynanaapp.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// ── Helpers de fecha ────────────────────────────────────────────────────────
function getFechaStr(date) {
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
}

function getHoraStr(date) {
  return date.toTimeString().slice(0, 5); // HH:MM
}

function formatHora(horaStr) {
  if (!horaStr) return '';
  const [h, m] = horaStr.split(':').map(Number);
  const ampm = h >= 12 ? 'pm' : 'am';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function calcularProximaCompra(frecuencia, diaCompra) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const diaHoy = hoy.getDay() === 0 ? 6 : hoy.getDay() - 1; // 0=lunes
  let diasHasta = (diaCompra - diaHoy + 7) % 7;
  if (diasHasta === 0) diasHasta = 7;
  if (frecuencia === 'quincenal') diasHasta += 7;
  if (frecuencia === 'mensual')   diasHasta += 21;
  const proxima = new Date(hoy);
  proxima.setDate(hoy.getDate() + diasHasta);
  return getFechaStr(proxima);
}

// ── Enviar push a todos los participantes de un hogar (excepto excludeUid) ──
async function enviarPushAHogar(hogarId, excludeUid, { titulo, cuerpo, url, tipo }) {
  try {
    const hogarSnap = await db.doc(`hogares/${hogarId}`).get();
    if (!hogarSnap.exists) return;
    const participantes = hogarSnap.data().participantes || [];

    for (const uid of participantes) {
      if (uid === excludeUid) continue;

      const subsSnap = await db
        .collection(`usuarios/${uid}/pushSubscriptions`)
        .where('active', '==', true)
        .limit(1) // solo una suscripción — evita multiplicar
        .get();

      if (subsSnap.empty) continue;
      const sub = subsSnap.docs[0].data();
      if (!sub.endpoint || !sub.keys) continue;

      const payload = JSON.stringify({
        title: titulo,
        body:  cuerpo,
        icon:  '/mynana-icon-casa-v2.png',
        url:   url || '/app.html',
        tipo:  tipo || 'general',
        tag:   tipo || 'mynana-reminder',
      });

      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload
        );
        console.log(`  📱 Push enviado a uid=${uid.slice(0, 8)}...`);
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          // Suscripción expirada — marcar inactiva
          await subsSnap.docs[0].ref.update({ active: false });
          console.log(`  ⚠️  Sub expirada para uid=${uid.slice(0, 8)}... → marcada inactiva`);
        } else {
          console.warn(`  ❌ Error push uid=${uid.slice(0, 8)}: ${err.message}`);
        }
      }
    }
  } catch (e) {
    console.warn(`enviarPushAHogar error hogar=${hogarId}: ${e.message}`);
  }
}

// ── 1. Recordatorios 24h antes de evento ───────────────────────────────────
async function check24hReminders(hogarId, prefs) {
  if (!(prefs.notifRecordatorio24h ?? true)) return;

  const manana = new Date();
  manana.setDate(manana.getDate() + 1);
  const mananaStr = getFechaStr(manana);

  const snap = await db
    .collection(`hogares/${hogarId}/eventos`)
    .where('fecha', '==', mananaStr)
    .where('estado', '==', 'pendiente')
    .where('recordatorio24hEnviado', '==', false)
    .get();

  if (snap.empty) return;
  console.log(`  📅 ${snap.docs.length} evento(s) mañana → recordatorio 24h`);

  for (const eventoDoc of snap.docs) {
    const e = eventoDoc.data();
    await enviarPushAHogar(hogarId, null, {
      titulo: `📅 Mañana: ${e.titulo}`,
      cuerpo: `${formatHora(e.hora)}${e.proveedor ? ' · ' + e.proveedor : ''}`,
      url:  '/tareas.html',
      tipo: 'evento-recordatorio-24h',
    });
    await eventoDoc.ref.update({ recordatorio24hEnviado: true });
    console.log(`    ✅ 24h marcado: "${e.titulo}"`);
  }
}

// ── 2. Recordatorios 1h antes de evento ────────────────────────────────────
async function check1hReminders(hogarId, prefs) {
  if (!(prefs.notifRecordatorio1h ?? false)) return;

  const ahora     = new Date();
  const en1h      = new Date(ahora.getTime() + 60 * 60 * 1000);
  const hoyStr    = getFechaStr(ahora);
  const ahoraHora = getHoraStr(ahora);
  const en1hHora  = getHoraStr(en1h);

  const snap = await db
    .collection(`hogares/${hogarId}/eventos`)
    .where('fecha', '==', hoyStr)
    .where('estado', '==', 'pendiente')
    .where('recordatorioEnviado', '==', false)
    .get();

  if (snap.empty) return;

  for (const eventoDoc of snap.docs) {
    const e = eventoDoc.data();
    if (!e.hora) continue;
    // ¿La hora del evento cae en la próxima hora?
    if (e.hora >= ahoraHora && e.hora <= en1hHora) {
      await enviarPushAHogar(hogarId, null, {
        titulo: `⏰ En 1 hora: ${e.titulo}`,
        cuerpo: `Hoy a las ${formatHora(e.hora)}`,
        url:  '/tareas.html',
        tipo: 'evento-recordatorio-24h', // reutiliza tipo existente
      });
      await eventoDoc.ref.update({ recordatorioEnviado: true });
      console.log(`    ✅ 1h marcado: "${e.titulo}" a las ${e.hora}`);
    }
  }
}

// ── 3. Recordatorio día de compra ───────────────────────────────────────────
async function checkCompraReminder(hogarId, prefs) {
  if (!(prefs.notifRecordatorioCompra ?? true)) return;

  const hoyStr = getFechaStr(new Date());

  // proximaCompra == hoy Y no enviamos ya este recordatorio hoy
  const proximaCompra = prefs.proximaCompra;
  if (!proximaCompra || proximaCompra !== hoyStr) return;
  if (prefs.recordatorioCompraEnviado === hoyStr) return; // ya enviado hoy

  const frecLabel = {
    semanal:   'semanal',
    quincenal: 'quincenal',
    mensual:   'mensual',
  }[prefs.frecuenciaCompra] || '';

  await enviarPushAHogar(hogarId, null, {
    titulo: `🛒 Hoy es día de mercado`,
    cuerpo: `Compra ${frecLabel} programada para hoy`,
    url:  '/menu.html',
    tipo: 'general',
  });

  // Marcar enviado y calcular próxima fecha
  const nuevaProxima = calcularProximaCompra(
    prefs.frecuenciaCompra || 'semanal',
    prefs.diaCompra ?? 1
  );

  await db
    .doc(`hogares/${hogarId}/configuracion/alimentaria`)
    .update({
      recordatorioCompraEnviado: hoyStr,
      proximaCompra: nuevaProxima,
    });

  console.log(`    ✅ Recordatorio compra enviado. Próxima: ${nuevaProxima}`);
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const ahora = new Date();
  console.log(`\n🏠 My Nana — check-reminders`);
  console.log(`⏰ ${ahora.toLocaleString('es-PA', { timeZone: 'America/Panama' })} (Panamá)`);
  console.log('─'.repeat(50));

  const hogaresSnap = await db.collection('hogares').get();
  if (hogaresSnap.empty) {
    console.log('Sin hogares. Nada que hacer.');
    return;
  }

  console.log(`📦 ${hogaresSnap.docs.length} hogar(es) encontrado(s)\n`);

  for (const hogarDoc of hogaresSnap.docs) {
    const hogarId = hogarDoc.id;
    console.log(`Hogar: ${hogarId.slice(0, 12)}...`);

    // Cargar preferencias (configuracion/alimentaria)
    const confSnap = await db
      .doc(`hogares/${hogarId}/configuracion/alimentaria`)
      .get();
    const prefs = confSnap.exists ? confSnap.data() : {};

    await check24hReminders(hogarId, prefs);
    await check1hReminders(hogarId, prefs);
    await checkCompraReminder(hogarId, prefs);
  }

  console.log('\n✅ Revisión completada');
}

main().catch(err => {
  console.error('❌ Error fatal:', err);
  process.exit(1);
});
