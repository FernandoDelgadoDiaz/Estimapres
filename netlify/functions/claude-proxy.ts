/**
 * SEC-01 / AH2 — Cierre temporal de la integración opcional con Claude.
 *
 * La versión anterior era un relé HTTP público que reenviaba cuerpos de
 * terceros a Anthropic con la clave del servidor. Hasta que exista una
 * integración autenticada, con cuota, validación y auditoría, este endpoint
 * debe fallar de forma explícita y no ejecutar ninguna solicitud externa.
 *
 * NO activar ni extender esta función sin una nueva Issue, revisión de
 * seguridad y autorización del propietario. El motor de horarios es
 * determinístico y funciona sin Claude.
 */
type NetlifyEvent = { httpMethod?: string }

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

export async function handler(event: NetlifyEvent) {
  // No habilitar CORS para orígenes externos. El cliente ya no llama aquí.
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        Allow: 'POST, OPTIONS',
        'Cache-Control': 'no-store',
      },
      body: '',
    }
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: RESPONSE_HEADERS,
      body: JSON.stringify({ error: 'Method not allowed' }),
    }
  }

  return {
    statusCode: 503,
    headers: RESPONSE_HEADERS,
    body: JSON.stringify({
      error: 'AI suggestions are temporarily disabled',
      code: 'AI_SUGGESTIONS_DISABLED',
    }),
  }
}
