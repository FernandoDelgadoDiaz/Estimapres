import { Franja, Colaborador, ResultadoAsignacion, ExcepcionSemanal, Auxiliar, Eventual } from '../types'
import { convertirInputAV2, type OpcionesGeneracion } from '../algoritmo/adapter'
import { normalizarExcepciones } from './preferencias'
import { generarConMultiArranque } from './generacionMultiArranque'
import { ejecutarEnWorker } from '../workers/generacionCliente'
import { operativaEfectiva, type ContextoValidacionSemana } from './validacionSemana'

// SEC-01: las sugerencias con IA están deshabilitadas hasta disponer de
// autenticación, validación y cuotas en un servidor seguro. La asignación
// continúa siendo determinística y nunca necesita una clave en el navegador.

// ==================== LLAMADA 1 - CAJEROS ====================


// ==================== CÁLCULO DE COBERTURA DE CAJEROS ====================


// ==================== LLAMADA 2 - AUXILIARES Y EVENTUALES ====================


// ==================== FUNCIÓN PRINCIPAL ====================

/** Espera a que el navegador pinte un cuadro (no-op fuera del navegador). */
function cederUnCuadro(): Promise<void> {
  if (typeof requestAnimationFrame !== 'function') return Promise.resolve()
  return new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)))
}

export async function asignarHorariosConIA(
  necesidad: Franja[],
  cajeros: Colaborador[],
  auxiliares: Auxiliar[],
  eventuales: Eventual[],
  _fechas: string[],
  excepciones: ExcepcionSemanal[] = [],
  opciones?: OpcionesGeneracion,
  /** Contexto de validación de la semana (el mismo que usa la pantalla). Sin él, se arma desde la entrada. */
  contextoValidacion?: ContextoValidacionSemana,
  ejecucion?: { signal: AbortSignal; avisarModoCompatible: () => void },
): Promise<ResultadoAsignacion> {
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
  const entrada = { input: inputV2, cajeros, auxiliares, eventuales, contexto }
  const resultado = await ejecutarEnWorker(entrada, ejecucion?.signal)
  if (resultado) return resultado

  // Navegadores sin soporte o sin acceso al script del Worker.
  ejecucion?.avisarModoCompatible()
  await cederUnCuadro()
  if (ejecucion?.signal.aborted) throw new DOMException('Generación cancelada', 'AbortError')
  return generarConMultiArranque(entrada).resultado
}

// ==================== FUNCIONES AUXILIARES EXISTENTES ====================






// ==================== PARSEO Y MAPEO FINAL ====================

