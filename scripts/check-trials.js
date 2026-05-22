// scripts/check-trials.js
// Se ejecuta todos los dias via GitHub Actions
// Revisa usuarios en dia 13 y envia correo de aviso de cobro

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Inicializar Firebase Admin con credenciales de entorno
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const RESEND_API_KEY = process.env.RESEND_API_KEY;

async function enviarCorreoAviso(nombre, email, fechaCobro) {
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#F9F5F0;font-family:Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9F5F0;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
          <tr>
            <td style="background:#0F4A38;border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
              <h1 style="color:#ffffff;font-size:28px;margin:0;font-weight:600;">My Nana Panama</h1>
              <p style="color:rgba(255,255,255,0.6);font-size:14px;margin:8px 0 0;">mynana.app</p>
            </td>
          </tr>
          <tr>
            <td style="background:#ffffff;padding:36px 40px;">
              <h2 style="color:#1A2E25;font-size:20px;margin:0 0 12px;">Hola, ${nombre.split(' ')[0]}</h2>
              <p style="color:#4A6358;font-size:15px;line-height:1.6;margin:0 0 20px;">
                Tu periodo de prueba gratuita de <strong>15 dias</strong> esta por terminar.
              </p>
              <div style="background:#FAEEDA;border-radius:12px;padding:16px 20px;margin-bottom:20px;">
                <p style="color:#633806;font-size:14px;margin:0;line-height:1.6;">
                  El <strong>${fechaCobro}</strong> comenzara automaticamente el cobro de tu plan mensual a traves de PagueloFacil.
                </p>
              </div>
              <p style="color:#4A6358;font-size:14px;line-height:1.6;margin:0 0 20px;">
                Si deseas cancelar antes de ese dia, escríbenos y lo hacemos sin problema.
              </p>
              <div style="text-align:center;margin-bottom:24px;">
                <a href="https://mynana.app/app.html" style="display:inline-block;background:#0F4A38;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:99px;font-size:15px;font-weight:600;">
                  Ir a mi plataforma
                </a>
              </div>
              <p style="color:#4A6358;font-size:13px;line-height:1.6;margin:0;">
                Preguntas o cancelaciones: escríbenos por
                <a href="https://wa.me/50760243324" style="color:#1A6B52;font-weight:500;">WhatsApp</a> o a
                <a href="mailto:ceo@mynanaapp.com" style="color:#1A6B52;font-weight:500;">ceo@mynanaapp.com</a>.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#0F4A38;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;">
              <p style="color:rgba(255,255,255,0.5);font-size:12px;margin:0;">
                2025 My Nana Panama - <a href="https://mynana.app" style="color:rgba(255,255,255,0.5);">mynana.app</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'My Nana Panama <hola@mynana.app>',
      to: [email],
      subject: `${nombre.split(' ')[0]}, tu prueba gratis termina en 3 dias`,
      html,
    }),
  });

  const data = await response.json();
  if (response.ok) {
    console.log(`Correo enviado a ${email} - ID: ${data.id}`);
  } else {
    console.error(`Error enviando a ${email}:`, data.message);
  }
}

async function main() {
  console.log('Revisando usuarios en dia 13...');

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  const snap = await db.collection('usuarios').get();
  let enviados = 0;

  for (const doc of snap.docs) {
    const data = doc.data();

    // Solo familias con email y fecha
    if (data.tipo !== 'familia' || !data.email || !data.fecha) continue;

    const fechaRegistro = new Date(data.fecha);
    fechaRegistro.setHours(0, 0, 0, 0);

    // Calcular dias desde registro
    const diasDesdeRegistro = Math.floor((hoy - fechaRegistro) / (1000 * 60 * 60 * 24));

    if (diasDesdeRegistro === 13) {
      // Calcular fecha de cobro (dia 16)
      const fechaCobro = new Date(fechaRegistro);
      fechaCobro.setDate(fechaCobro.getDate() + 15);
      const fechaCobroStr = fechaCobro.toLocaleDateString('es-PA', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });

      console.log(`Usuario en dia 13: ${data.nombre} (${data.email})`);
      await enviarCorreoAviso(data.nombre, data.email, fechaCobroStr);
      enviados++;
    }
  }

  console.log(`Proceso completado. Correos enviados: ${enviados}`);
}

main().catch(console.error);
