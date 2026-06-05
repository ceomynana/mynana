exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  try {
    const { tipo, nombre, email, plan } = JSON.parse(event.body);
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: 'API key no configurada' }) };
    }

    const esFamilia = tipo === 'familia';
    const nombreCorto = (nombre || '').split(' ')[0];
    const asunto = `¡Bienvenido/a a My Nana, ${nombreCorto}! 🏠`;

    const planHTML = plan
      ? `<p style="color:#4A6358;font-size:14px;line-height:1.6;margin:0 0 20px;background:#EAF5EE;border-radius:10px;padding:14px 18px;">
           📋 <strong>Plan seleccionado:</strong> ${plan}<br>
           ⏳ Tu período de prueba de <strong>15 días</strong> comienza hoy.<br>
           💡 El cobro inicia automáticamente el día 16.
         </p>`
      : '';

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bienvenida a My Nana</title>
</head>
<body style="margin:0;padding:0;background:#F9F5F0;font-family:Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9F5F0;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- Header -->
          <tr>
            <td style="background:#0F4A38;border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
              <h1 style="color:#ffffff;font-size:28px;margin:0;font-weight:600;letter-spacing:-0.5px;">My Nana Panama</h1>
              <p style="color:rgba(255,255,255,0.6);font-size:14px;margin:8px 0 0;">mynana.app</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:36px 40px;">
              <h2 style="color:#1A2E25;font-size:22px;margin:0 0 12px;">
                ¡Bienvenido/a, ${nombreCorto}! 🎉
              </h2>
              <p style="color:#4A6358;font-size:15px;line-height:1.6;margin:0 0 20px;">
                Tu cuenta en My Nana está lista.
                ${esFamilia
                  ? 'Ahora puedes organizar tu hogar, gestionar a tu nana y tener todo bajo control desde un solo lugar.'
                  : 'Ahora puedes ver tus tareas, el menú del día y construir tu reputación profesional.'}
              </p>

              ${planHTML}

              <div style="text-align:center;margin-bottom:28px;">
                <a href="https://mynana.app/app.html"
                   style="display:inline-block;background:#0F4A38;color:#ffffff;text-decoration:none;
                          padding:14px 40px;border-radius:99px;font-size:15px;font-weight:600;">
                  → Ir a mi plataforma
                </a>
              </div>

              <p style="color:#4A6358;font-size:13px;line-height:1.6;margin:0 0 6px;">
                ¿Tienes dudas? Escríbenos:
              </p>
              <p style="font-size:13px;margin:0;">
                💬 <a href="https://wa.me/50760243324" style="color:#1A6B52;font-weight:600;">WhatsApp +507 6024-3324</a><br>
                ✉️ <a href="mailto:ceo@mynanaapp.com" style="color:#1A6B52;font-weight:600;">ceo@mynanaapp.com</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0F4A38;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;">
              <p style="color:rgba(255,255,255,0.5);font-size:12px;margin:0;">
                © 2025 My Nana Panama ·
                <a href="https://mynana.app" style="color:rgba(255,255,255,0.5);text-decoration:none;">mynana.app</a>
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
        subject: asunto,
        html,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return { statusCode: 500, body: JSON.stringify({ error: data.message }) };
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, id: data.id }),
    };
  } catch(e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
