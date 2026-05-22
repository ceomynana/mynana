// netlify/functions/send-email.js
// FunciÃ³n serverless para enviar correos con Resend
// Coloca este archivo en: netlify/functions/send-email.js

exports.handler = async (event) => {
  // Solo POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { tipo, nombre, email } = JSON.parse(event.body);
    const RESEND_API_KEY = process.env.RESEND_API_KEY;

    if (!RESEND_API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: 'API key no configurada' }) };
    }

    // Contenido del correo segÃºn tipo
    const esFamilia = tipo === 'familia';
    const asunto = esFamilia
      ? `Â¡Bienvenida a My Nana, ${nombre.split(' ')[0]}! ðŸ `
      : `Â¡Bienvenida a My Nana, ${nombre.split(' ')[0]}! ðŸ‘©`;

    const html = `
<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Bienvenida a My Nana</title>
</head>
<body style="margin:0;padding:0;background:#F9F5F0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F9F5F0;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">

          <!-- HEADER -->
          <tr>
            <td style="background:#0F4A38;border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
              <div style="font-size:36px;margin-bottom:8px;">${esFamilia ? 'ðŸ ' : 'ðŸ‘©'}</div>
              <h1 style="color:#ffffff;font-size:28px;margin:0;font-weight:600;">My Nana Panama</h1>
              <p style="color:rgba(255,255,255,0.6);font-size:14px;margin:8px 0 0;">mynana.app</p>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background:#ffffff;padding:36px 40px;">
              <h2 style="color:#1A2E25;font-size:22px;margin:0 0 12px;">Â¡Bienvenido/a, ${nombre.split(' ')[0]}! ðŸŽ‰</h2>
              <p style="color:#4A6358;font-size:15px;line-height:1.6;margin:0 0 24px;">
                Tu cuenta en My Nana estÃ¡ lista. ${esFamilia
                  ? 'Ahora puedes organizar tu hogar y gestionar a tu nana de forma simple y profesional.'
                  : 'Ahora puedes ver tus tareas, el menÃº del dÃ­a y construir tu reputaciÃ³n profesional.'}
              </p>

              <!-- PASOS -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                ${esFamilia ? `
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #E1F0EB;">
                    <span style="display:inline-block;width:28px;height:28px;background:#0F4A38;color:white;border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:700;margin-right:12px;">1</span>
                    <span style="color:#1A2E25;font-size:14px;font-weight:500;">Genera tu cÃ³digo Ãºnico y compÃ¡rtelo con tu nana</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #E1F0EB;">
                    <span style="display:inline-block;width:28px;height:28px;background:#0F4A38;color:white;border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:700;margin-right:12px;">2</span>
                    <span style="color:#1A2E25;font-size:14px;font-weight:500;">Crea las tareas del dÃ­a con hora y descripciÃ³n</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;">
                    <span style="display:inline-block;width:28px;height:28px;background:#0F4A38;color:white;border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:700;margin-right:12px;">3</span>
                    <span style="color:#1A2E25;font-size:14px;font-weight:500;">Planifica el menÃº semanal â€” la lista del mercado se genera sola</span>
                  </td>
                </tr>` : `
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #F7EFEF;">
                    <span style="display:inline-block;width:28px;height:28px;background:#BF9090;color:white;border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:700;margin-right:12px;">1</span>
                    <span style="color:#1A2E25;font-size:14px;font-weight:500;">Ve tus tareas del dÃ­a organizadas por hora</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;border-bottom:1px solid #F7EFEF;">
                    <span style="display:inline-block;width:28px;height:28px;background:#BF9090;color:white;border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:700;margin-right:12px;">2</span>
                    <span style="color:#1A2E25;font-size:14px;font-weight:500;">Al terminar una tarea toca el botÃ³n verde y sube una foto</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:10px 0;">
                    <span style="display:inline-block;width:28px;height:28px;background:#BF9090;color:white;border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:700;margin-right:12px;">3</span>
                    <span style="color:#1A2E25;font-size:14px;font-weight:500;">Activa tu perfil en el buscador para que te encuentren</span>
                  </td>
                </tr>`}
              </table>

              <!-- CTA -->
              <div style="text-align:center;margin-bottom:24px;">
                <a href="https://mynana.app/app.html" style="display:inline-block;background:#0F4A38;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:99px;font-size:15px;font-weight:600;">
                  ${esFamilia ? 'Ir a mi dashboard â†’' : 'Ver mis tareas â†’'}
                </a>
              </div>

              <p style="color:#4A6358;font-size:13px;line-height:1.6;margin:0;">
                Tienes <strong>15 dÃ­as gratis</strong> para explorar todo. Si tienes alguna pregunta escrÃ­benos por
                <a href="https://wa.me/50760243324" style="color:#1A6B52;font-weight:500;">WhatsApp</a> o a
                <a href="mailto:ceo@mynanaapp.com" style="color:#1A6B52;font-weight:500;">ceo@mynanaapp.com</a>.
              </p>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#0F4A38;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;">
              <p style="color:rgba(255,255,255,0.5);font-size:12px;margin:0;">
                Â© 2025 My Nana Panama Â· <a href="https://mynana.app" style="color:rgba(255,255,255,0.5);">mynana.app</a>
                Â· <a href="https://mynana.app/privacidad.html" style="color:rgba(255,255,255,0.5);">Privacidad</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    // Enviar con Resend
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
      console.error('Resend error:', data);
      return { statusCode: 500, body: JSON.stringify({ error: data.message }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, id: data.id }),
    };

  } catch(e) {
    console.error('Error:', e);
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
