// netlify/functions/create-payment.js
export async function handler(event) {
  // CORS preflight
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
    const {
      amount,
      description,
      payer_email,
      loanId,
      installment,
      success_url,
      failure_url
    } = JSON.parse(event.body || '{}');

    if (!amount || isNaN(Number(amount))) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'amount inválido' }),
      };
    }

    const ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
    if (!ACCESS_TOKEN) {
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Falta MP_ACCESS_TOKEN en Netlify' }),
      };
    }

    const siteUrl = process.env.URL || `https://${event.headers.host}`;
    const webhookSecret = process.env.MP_WEBHOOK_SECRET || '';

    const preference = {
      items: [
        {
          title: description || 'Pago EstimaPres',
          quantity: 1,
          currency_id: 'ARS',
          unit_price: Number(amount),
        },
      ],
      payer: payer_email ? { email: payer_email } : undefined,
      metadata: { loanId: loanId || null, installment: installment || null },
      back_urls: {
        success: success_url || siteUrl,
        failure: failure_url || siteUrl,
        pending: success_url || siteUrl,
      },
      auto_return: 'approved',
      notification_url: `${siteUrl}/.netlify/functions/webhook-mp${webhookSecret ? `?secret=${encodeURIComponent(webhookSecret)}` : ''}`,
      statement_descriptor: 'ESTIMAPRES',
    };

    const resp = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      body: JSON.stringify(preference),
    });

    const data = await resp.json();
    if (!resp.ok) {
      return {
        statusCode: resp.status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Mercado Pago error', detail: data }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        preference_id: data.id,
        init_point: data.init_point,
        sandbox_init_point: data.sandbox_init_point,
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server error', detail: String(e) }),
    };
  }
}

