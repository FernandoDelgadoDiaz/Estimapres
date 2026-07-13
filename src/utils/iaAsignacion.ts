import Anthropic from '@anthropic-ai/sdk'
import { Franja, Colaborador, ResultadoAsignacion, ExcepcionSemanal, Auxiliar, Eventual } from '../types'
import { convertirInputAV2, convertirOutputDeV2, type OpcionesGeneracion } from '../algoritmo/adapter'
import { ejecutarAlgoritmo } from '../algoritmo/orquestador'
import { normalizarExcepciones } from './preferencias'

// API key configuration
const DEV_API_KEY = import.meta.env.VITE_CLAUDE_API_KEY || import.meta.env.VITE_ANTHROPIC_API_KEY;
const isProduction = import.meta.env.PROD;

// Create client only for development (browser)
const client = !isProduction && DEV_API_KEY
  ? new Anthropic({
      apiKey: DEV_API_KEY,
      dangerouslyAllowBrowser: true
    })
  : null;

async function callClaudeAPI(prompt: string) {
  if (!isProduction && client) {
    // Use Anthropic SDK directly in development
    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }]
    });
    return response.content[0].type === 'text' ? response.content[0].text : '';
  } else {
    // In production, call Netlify function proxy
    try {
      const response = await fetch('/.netlify/functions/claude-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-opus-4-5',
          max_tokens: 300,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      if (!response.ok) {
        throw new Error(`Proxy error: ${response.status}`);
      }
      const data = await response.json();
      return data.content?.[0]?.text || '';
    } catch (error) {
      console.debug('Claude proxy call failed', error);
      throw error;
    }
  }
}

// ==================== LLAMADA 1 - CAJEROS ====================


// ==================== CÁLCULO DE COBERTURA DE CAJEROS ====================


// ==================== LLAMADA 2 - AUXILIARES Y EVENTUALES ====================


// ==================== FUNCIÓN PRINCIPAL ====================

export async function asignarHorariosConIA(
  necesidad: Franja[],
  cajeros: Colaborador[],
  auxiliares: Auxiliar[],
  eventuales: Eventual[],
  _fechas: string[],
  excepciones: ExcepcionSemanal[] = [],
  opciones?: OpcionesGeneracion
): Promise<ResultadoAsignacion> {
  // 1. Ejecutar algoritmo v2 (excepciones normalizadas: día textual → índice)
  const inputV2 = convertirInputAV2(
    necesidad, cajeros, auxiliares, eventuales,
    normalizarExcepciones(excepciones), opciones
  )
  const resultadoV2 = ejecutarAlgoritmo(inputV2)
  const resultado = convertirOutputDeV2(resultadoV2, cajeros, auxiliares, eventuales)

  // 2. Opcionalmente pedir sugerencias a Claude (via proxy en producción)
  try {
    const prompt = `Revisá este horario semanal y listá máximo 3 sugerencias de mejora opcionales. Respondé en español, máximo 3 líneas.
Horario: ${JSON.stringify(resultado.horarios.map(h => ({
      id: h.colaboradorId,
      horas: h.totalHoras,
      jornadas: h.jornadas.filter(j => !j.esFranco)
        .map(j => ({ dia: j.dia, horas: j.horas, rol: j.rol }))
    })))}`

    const texto = await callClaudeAPI(prompt);

    if (texto.trim()) {
      resultado.alertas.push(`💡 ${texto.trim()}`)
    }
  } catch (error) {
    // Ignorar error, continuar sin sugerencias
    console.debug('Claude no pudo dar sugerencias (opcional)', error)
  }

  // 3. Retornar resultado
  return resultado
}

// ==================== FUNCIONES AUXILIARES EXISTENTES ====================






// ==================== PARSEO Y MAPEO FINAL ====================

