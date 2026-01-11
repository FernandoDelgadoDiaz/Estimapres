// netlify/functions/webhook-mp.js
// Recibe notificaciones de Mercado Pago y confirma el pago consultando la API.
// Valida un "secret" por query string para evitar llamados externos.

export async function handler(event) {
  // Preflight CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
    const SECRET = process.env.MP_WEBHOOK_SECRET || '';

    // Chequeo de "secret" simple por querystring
    const got = event.queryStringParameters?.secret || '';
    if (SECRET && got !== SECRET) {
      return { statusCode: 401, body: 'unauthorized' };
    }
    if (!ACCESS_TOKEN) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Falta MP_ACCESS_TOKEN en Netlify' }),
      };
    }

    // MP puede enviar distintos formatos; cubrimos los más comunes
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }
    const type =
      body.type || body.action || body.topic || ''; // p.ej. "payment", "payment.created"
    const paymentId =
      body.data?.id || body['data.id'] || body.resource?.id || null;

    // Si no es sobre "payment" o no trae id, OK igual (evitamos reintentos)
    if (!String(type).includes('payment') || !paymentId) {
      return { statusCode: 200, body: 'ok' };
    }

    // Confirmo contra la API de MP (fuente de verdad)
    const resp = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );
    const payment = await resp.json();

    // Log útil en Netlify (Deploy logs → Function logs)
    console.log('MP payment', {
      id: payment.id,
      status: payment.status,           // approved / pending / rejected
      status_detail: payment.status_detail,
      metadata: payment.metadata,       // { loanId, installment }
      transaction_amount: payment.transaction_amount,
    });

    // En este paso SOLO confirmamos recepción. (Luego, si querés,
    // podemos actualizar Firestore desde el front cuando vuelvas del pago
    // o con credenciales de servicio en otra función).
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true }),
    };
  } catch (e) {
    console.error(e);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error', detail: String(e) }),
    };
  }
}

