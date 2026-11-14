import { Franja, Colaborador, ResultadoAsignacion, ExcepcionSemanal, Auxiliar, Eventual } from '../types'
import { convertirInputAV2, type OpcionesGeneracion } from '../algoritmo/adapter'
import { normalizarExcepciones } from './preferencias'
import { generarConMultiArranque } from './generacionMultiArranque'
import { operativaEfectiva, type ContextoValidacionSemana } from './validacionSemana'

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
  opciones?: OpcionesGeneracion,
  /** Contexto de validación de la semana (el mismo que usa la pantalla). Sin él, se arma desde la entrada. */
  contextoValidacion?: ContextoValidacionSemana
): Promise<ResultadoAsignacion> {
  // 1. Ejecutar algoritmo v2 (excepciones normalizadas: día textual → índice)
  const inputV2 = convertirInputAV2(
    necesidad, cajeros, auxiliares, eventuales,
    normalizarExcepciones(excepciones), opciones
  )
  // #7 · AH2-020 (B conjunta): multi-arranque con el motor actual como respaldo; solo se
  // elige un candidato validado que no reduzca horas de nadie y mejore la cobertura.
  const contexto: ContextoValidacionSemana = contextoValidacion ?? {
    necesidad, excepciones,
    maxFrancosDia: opciones?.maxFrancosDia,
    minimosCajeros: opciones?.demandaMinima,
    operativa: operativaEfectiva(opciones),
  }
  const { resultado } = generarConMultiArranque({ input: inputV2, cajeros, auxiliares, eventuales, contexto })

  // SEC-01: sin llamadas de red a modelos externos en esta fase.

  // 2. Retornar resultado
  return resultado
}

// ==================== FUNCIONES AUXILIARES EXISTENTES ====================






// ==================== PARSEO Y MAPEO FINAL ====================

