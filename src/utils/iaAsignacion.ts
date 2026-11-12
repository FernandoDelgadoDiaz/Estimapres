import { Franja, Colaborador, ResultadoAsignacion, ExcepcionSemanal, Auxiliar, Eventual } from '../types'
import { convertirInputAV2, convertirOutputDeV2, type OpcionesGeneracion } from '../algoritmo/adapter'
import { ejecutarAlgoritmo } from '../algoritmo/orquestador'
import { normalizarExcepciones } from './preferencias'

// SEC-01: las sugerencias con IA están deshabilitadas hasta disponer de
// autenticación, validación y cuotas en un servidor seguro. La asignación
// continúa siendo determinística y nunca necesita una clave en el navegador.

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

  // SEC-01: sin llamadas de red a modelos externos en esta fase.

  // 2. Retornar resultado
  return resultado
}

// ==================== FUNCIONES AUXILIARES EXISTENTES ====================






// ==================== PARSEO Y MAPEO FINAL ====================

