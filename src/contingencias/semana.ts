/**
 * AH2-057 · Datos de una semana guardada para buscar cobertura, y la nueva versión que se guarda al aprobar.
 * Sirve para cualquier sucursal: semanas del motor híbrido (snapshot) y semanas del motor A (datos guardados).
 */
import type { AusenciaCargada, Eventual, SemanaHistorial } from '../types'
import { FIN_CAJEROS_POR_DEFECTO, topesCajaPorPersona } from '../algoritmo/adapter'
import { compilarCondiciones } from '../algoritmo/condicionesSupervisor'
import { compilarDisponibilidadCaja } from '../algoritmo/disponibilidadCajaEventual'
import type { Propuesta } from './reparar'

const DIAS = 7, SLOTS = 30
const aMin = (h: string) => { const [a, b] = h.split(':').map(Number); return a * 60 + (b || 0) }

export function matrizDeHorario(hs: string[] | undefined): boolean[][] {
  return Array.from({ length: DIAS }, (_, d) => Array.from({ length: SLOTS }, (_, s) => {
    const t = 8 * 60 + s * 30
    return (hs?.[d] ?? '').split('|').map(x => x.trim()).filter(Boolean).some(r => { const [a, b] = r.split('-'); return aMin(a) <= t && t < aMin(b) })
  }))
}

export interface ApoyoSemana {
  disponibilidadEventual: Record<string, boolean[][]>
  topesEventualSlots?: Record<string, number>
  reservasEventual?: Record<string, boolean[][]>
  finCajeros: string
  /** Lo que falta para poder buscar cobertura automática (semanas viejas). */
  faltan: string[]
}

export function apoyoDeSemana(semana: SemanaHistorial, eventuales: Eventual[]): ApoyoSemana {
  const faltan = [
    !semana.necesidadFranjas && 'la necesidad de cajas del POM',
    !semana.disponibilidadSemana && 'la disponibilidad de supervisores y eventuales',
    !semana.configOperativa && 'la configuración con la que se generó',
  ].filter((x): x is string => !!x)
  const idsEv = [...new Set([...semana.horarios.filter(h => h.rolGeneral === 'eventual_sector').map(h => h.colaboradorId), ...(semana.cajaEventual ?? []).map(e => e.colaboradorId)])]
  if (semana.hibrido) {
    try {
      const { input } = compilarDisponibilidadCaja(compilarCondiciones(semana.hibrido.entrada).input)
      const ui = semana.hibrido.uiPorMotor
      const disponibilidadEventual: Record<string, boolean[][]> = {}
      const topes: Record<string, number> = {}
      const reservas: Record<string, boolean[][]> = {}
      for (const [m, matriz] of Object.entries(input.disponibilidad_eventual)) {
        const id = ui[m] ?? m
        disponibilidadEventual[id] = matriz.map(f => f.map(v => v !== 'NO_DISPONIBLE'))
        const tope = input.max_caja_eventual_slots?.[m]
        if (tope !== undefined) topes[id] = tope
        const r = input.reservas_sector_eventual?.[m]
        if (r) reservas[id] = r
      }
      return { disponibilidadEventual, topesEventualSlots: topes, reservasEventual: Object.keys(reservas).length ? reservas : undefined,
        finCajeros: semana.hibrido.entrada.cajeros_fin_hora_limite ?? FIN_CAJEROS_POR_DEFECTO, faltan }
    } catch {
      faltan.push('la configuración del motor guardada con la semana')
    }
  }
  return {
    disponibilidadEventual: Object.fromEntries(idsEv.map(id => [id, matrizDeHorario(semana.disponibilidadSemana?.[id])])),
    topesEventualSlots: topesCajaPorPersona(eventuales.filter(e => idsEv.includes(e.id)), undefined, id => id),
    finCajeros: FIN_CAJEROS_POR_DEFECTO,
    faltan,
  }
}

const sumarDias = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

/** Ingreso del lunes siguiente por cajero (última versión de esa semana, si existe). Protege el descanso de 12 h. */
export function inicioLunesSiguiente(historial: SemanaHistorial[], semana: SemanaHistorial): Record<string, string | null> | undefined {
  const siguiente = historial.filter(s => s.fechaLunes === sumarDias(semana.fechaLunes, 7)).sort((a, b) => b.version - a.version)[0]
  if (!siguiente) return undefined
  return Object.fromEntries(siguiente.horarios.filter(h => h.rolGeneral === 'cajero').map(h => {
    const j = h.jornadas.find(x => x.dia === 0)
    return [h.colaboradorId, !j || j.esFranco || !j.turnos.length ? null : j.turnos[0].inicio]
  }))
}

/** Datos de la nueva versión aprobada (la guarda `agregarSemana`, que asigna id, versión y fecha). */
export function versionPorContingencia(
  semana: SemanaHistorial, propuesta: Propuesta, ausencia: AusenciaCargada, diasAusente: number[], aprobadoPor: string,
  resumir: (h: SemanaHistorial['horarios']) => SemanaHistorial['resumenPorColaborador'], ahora = new Date(),
): Omit<SemanaHistorial, 'id' | 'version' | 'generadoEl' | 'editadoManualmente' | 'modificadoEl'> {
  const { id: _id, version, generadoEl: _g, editadoManualmente: _e, modificadoEl: _m, ...resto } = semana
  void _id; void _g; void _e; void _m
  const p = propuesta.plan
  // La persona ausente deja de estar disponible esos días (si después se edita la semana, no se la vuelve a usar).
  const disponibilidadSemana = semana.disponibilidadSemana?.[ausencia.colaboradorId]
    ? { ...semana.disponibilidadSemana, [ausencia.colaboradorId]: semana.disponibilidadSemana[ausencia.colaboradorId].map((x, d) => diasAusente.includes(d) ? '' : x) }
    : semana.disponibilidadSemana
  return {
    ...resto,
    horarios: p.horarios,
    cajaAux: p.cajaAux,
    cajaEventual: p.cajaEventual,
    eventualesFijos: p.eventualesFijos,
    coberturaFranjas: p.coberturaFranjas,
    faltantesFranjas: p.faltantesFranjas,
    porcentajeCobertura: p.porcentajeCobertura,
    resumenPorColaborador: resumir(p.horarios),
    disponibilidadSemana,
    ausencias: [...(semana.ausencias ?? []), ausencia],
    contingencia: {
      ausencia, opcion: propuesta.opcion, aprobadoPor, aprobadoEl: ahora.toISOString(), basadaEnVersion: version,
      desde: propuesta.cambios.length ? sumarDias(semana.fechaLunes, Math.min(...propuesta.cambios.map(c => c.dia))) : null,
      cambios: propuesta.cambios.length,
    },
  }
}

const fechaAR = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/')

/** Texto para el PDF y la pantalla. */
export function notaContingencia(s: Pick<SemanaHistorial, 'contingencia' | 'version'>): string | undefined {
  const c = s.contingencia
  if (!c) return undefined
  const cuando = new Date(c.aprobadoEl).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'America/Argentina/Buenos_Aires' })
  const rango = c.ausencia.desde === c.ausencia.hasta ? fechaAR(c.ausencia.desde) : `${fechaAR(c.ausencia.desde)} al ${fechaAR(c.ausencia.hasta)}`
  return `Versión ${s.version}: cobertura por ausencia de ${c.ausencia.nombre} (${c.ausencia.motivo}, ${rango}). ` +
    `${c.opcion === 'menor_impacto' ? 'Menor impacto' : 'Mejor cobertura'}, aprobada por ${c.aprobadoPor} el ${cuando}. Reemplaza a la versión ${c.basadaEnVersion}.`
}
