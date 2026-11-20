import { Franja, Colaborador, ResultadoAsignacion, ExcepcionSemanal, Auxiliar, Eventual } from '../types'
import { convertirInputAV2, asignarIdentidadesV2, type OpcionesGeneracion } from '../algoritmo/adapter'
import { entradaMinimaLunesSlots } from './antecedenteDomingo'
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

export function prepararEntradaAsignacion(
  necesidad: Franja[], cajeros: Colaborador[], auxiliares: Auxiliar[], eventuales: Eventual[],
  excepciones: ExcepcionSemanal[] = [], opciones?: OpcionesGeneracion,
  contextoValidacion?: ContextoValidacionSemana,
) {
  const inputV2 = convertirInputAV2(
    necesidad, cajeros, auxiliares, eventuales,
    normalizarExcepciones(excepciones), opciones
  )
  // Si el supervisor aportó el domingo confirmado, la pasada FULL/PART
  // impide directamente entradas del lunes que violen las 12 horas.
  // Los IDs del motor no son necesariamente iguales a los de la UI.
  const fines = contextoValidacion?.finDomingoAnteriorPorId
  if (fines) {
    const personas = [
      ...cajeros.filter(c => c.tipo === 'FULL' || c.tipo === 'PART'),
      ...auxiliares.filter(a => a.activo),
      ...eventuales.filter(e => e.activo),
    ]
    const ids = asignarIdentidadesV2(personas).v2PorUi
    inputV2.inicio_minimo_lunes_por_colaborador = Object.fromEntries(
      cajeros.filter(c => c.tipo === 'FULL' || c.tipo === 'PART').map(c => {
        const id = ids.get(c.id)
        if (!id || !Object.prototype.hasOwnProperty.call(fines, c.id)) {
          throw new Error(`Falta el domingo confirmado para ${c.nombre}.`)
        }
        return [id, entradaMinimaLunesSlots(fines[c.id])]
      })
    )
  }
  const contexto: ContextoValidacionSemana = contextoValidacion ?? {
    necesidad, excepciones,
    maxFrancosDia: opciones?.maxFrancosDia,
    minimosCajeros: opciones?.demandaMinima,
    operativa: operativaEfectiva(opciones),
  }
  return { input: inputV2, cajeros, auxiliares, eventuales, contexto }
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
  const entrada = prepararEntradaAsignacion(necesidad, cajeros, auxiliares, eventuales, excepciones, opciones, contextoValidacion)
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

