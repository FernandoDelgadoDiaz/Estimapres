// src/utils/preferencias.ts
// Motor de dominio (funciones puras) para las tres capacidades configurables:
//   1. Reglas configurables → excepciones del algoritmo + demanda mínima + cap de francos
//   2. Rotación → sesgo blando por turno a partir del historial de semanas
//   3. Aprendizaje → sesgo blando derivado de las correcciones manuales
// Los sesgos son SIEMPRE blandos: el algoritmo los suma como puntos de utilidad
// pequeños que ceden ante la demanda real del PDF y las reglas duras.

import type {
  ReglaConfigurable,
  SemanaHistorial,
  CorreccionManual,
  AprendizajeDerivado,
  DireccionAprendizaje,
  ExcepcionSemanal,
  HorarioColaborador,
  JornadaResumida,
  ResumenTurnos,
  Colaborador,
  Turno,
} from '../types'
import { DIAS_SEMANA } from '../types'

// Sesgo por turno, keyed por NOMBRE de colaborador (la UI trabaja con nombres;
// el adapter los normaliza a ids del algoritmo v2).
export type SesgosPorNombre = Record<string, { manana?: number; tarde?: number; cierre?: number }>

export interface MinimoFranja {
  dia: number // -1 = todos los días
  slotDesde: number
  slotHasta: number // exclusivo
  cantidad: number
}

// ==================== HELPERS DE HORA/TURNO (formato UI) ====================

function horaAMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function horaASlotUI(hora: string): number {
  const [h, m] = hora.split(':').map(Number)
  return (h - 8) * 2 + ((m || 0) >= 30 ? 1 : 0)
}

export type TurnoClasificado = 'manana' | 'tarde' | 'cierre' | 'franco'

// Misma semántica que el algoritmo v2 (sesgoDeJornada):
// cierre = termina 22:00+; mañana = corrida que entra 09:00-11:00; tarde = resto.
export function clasificarJornadaUI(j: JornadaResumida): TurnoClasificado {
  if (j.esFranco || j.turnos.length === 0) return 'franco'
  const fin = horaAMinutos(j.turnos[j.turnos.length - 1].fin)
  if (fin >= 22 * 60) return 'cierre'
  const inicio = horaAMinutos(j.turnos[0].inicio)
  if (j.turnos.length === 1 && inicio >= 9 * 60 && inicio <= 11 * 60) return 'manana'
  return 'tarde'
}

// ==================== CAPACIDAD 2: ROTACIÓN ====================

export function resumirTurnos(
  horarios: HorarioColaborador[],
  nombrePorId: Record<string, string>
): Record<string, ResumenTurnos> {
  const resumen: Record<string, ResumenTurnos> = {}
  for (const h of horarios) {
    const nombre = nombrePorId[h.colaboradorId]
    if (!nombre) continue
    const r: ResumenTurnos = { mananas: 0, tardes: 0, cierres: 0, francos: 0 }
    for (const j of h.jornadas) {
      const t = clasificarJornadaUI({ esFranco: j.esFranco, turnos: j.turnos })
      if (t === 'franco') r.francos++
      else if (t === 'manana') r.mananas++
      else if (t === 'cierre') r.cierres++
      else r.tardes++
    }
    resumen[nombre] = r
  }
  return resumen
}

const SEMANAS_ROTACION = 3   // cuántas semanas recientes pesan en la rotación
const UMBRAL_ROTACION = 2    // desbalance mínimo (cierres vs mañanas) para actuar
const SESGO_ROTACION_MAX = 6

/**
 * Si un colaborador acumuló más cierres que mañanas en las últimas semanas,
 * se lo empuja suavemente hacia la mañana (y viceversa). Bidireccional.
 */
export function calcularSesgoRotacion(historial: SemanaHistorial[]): SesgosPorNombre {
  const recientes = [...historial]
    .sort((a, b) => b.fechaLunes.localeCompare(a.fechaLunes))
    .slice(0, SEMANAS_ROTACION)

  const acumulado: Record<string, { mananas: number; cierres: number }> = {}
  for (const semana of recientes) {
    for (const [nombre, r] of Object.entries(semana.resumenPorColaborador)) {
      const acc = (acumulado[nombre] ??= { mananas: 0, cierres: 0 })
      acc.mananas += r.mananas
      acc.cierres += r.cierres
    }
  }

  const sesgos: SesgosPorNombre = {}
  for (const [nombre, acc] of Object.entries(acumulado)) {
    const desbalance = acc.cierres - acc.mananas
    if (Math.abs(desbalance) < UMBRAL_ROTACION) continue
    const fuerza = Math.max(-SESGO_ROTACION_MAX, Math.min(SESGO_ROTACION_MAX, desbalance * 1.5))
    // muchos cierres → fuerza > 0 → preferir mañana y evitar cierre
    sesgos[nombre] = { manana: fuerza, cierre: -fuerza }
  }
  return sesgos
}

// ==================== CAPACIDAD 3: APRENDIZAJE DE CORRECCIONES ====================

function direccionDeCorreccion(c: CorreccionManual): DireccionAprendizaje | null {
  const antes = clasificarJornadaUI(c.antes)
  const despues = clasificarJornadaUI(c.despues)
  if (antes === 'franco' || despues === 'franco' || antes === despues) return null
  if (despues === 'manana') return 'prefiere_manana'
  if (despues === 'cierre') return 'prefiere_cierre'
  if (antes === 'cierre') return 'evita_cierre'
  return 'prefiere_tarde'
}

const DESCRIPCION_DIRECCION: Record<DireccionAprendizaje, string> = {
  prefiere_manana: 'prefiere turnos de mañana',
  prefiere_tarde: 'prefiere turnos de tarde',
  prefiere_cierre: 'prefiere turnos de cierre',
  evita_cierre: 'evita turnos de cierre',
}

const EVIDENCIAS_MINIMAS = 2 // una corrección aislada no es un patrón

export function derivarAprendizajes(correcciones: CorreccionManual[]): AprendizajeDerivado[] {
  const grupos = new Map<string, { nombre: string; direccion: DireccionAprendizaje; ids: string[] }>()
  for (const c of correcciones) {
    const dir = direccionDeCorreccion(c)
    if (!dir) continue
    const clave = `${c.colaboradorNombre}::${dir}`
    const grupo = grupos.get(clave) ?? { nombre: c.colaboradorNombre, direccion: dir, ids: [] }
    grupo.ids.push(c.id)
    grupos.set(clave, grupo)
  }

  const aprendizajes: AprendizajeDerivado[] = []
  for (const g of grupos.values()) {
    if (g.ids.length < EVIDENCIAS_MINIMAS) continue
    aprendizajes.push({
      colaboradorNombre: g.nombre,
      direccion: g.direccion,
      evidencias: g.ids.length,
      correccionIds: g.ids,
      descripcion: `${g.nombre} ${DESCRIPCION_DIRECCION[g.direccion]} (${g.ids.length} correcciones)`,
    })
  }
  return aprendizajes.sort((a, b) => b.evidencias - a.evidencias)
}

export function calcularSesgoAprendizaje(aprendizajes: AprendizajeDerivado[]): SesgosPorNombre {
  const sesgos: SesgosPorNombre = {}
  for (const a of aprendizajes) {
    const fuerza = Math.min(a.evidencias, 4) * 2.5 // 5..10
    const s = (sesgos[a.colaboradorNombre] ??= {})
    switch (a.direccion) {
      case 'prefiere_manana':
        s.manana = (s.manana ?? 0) + fuerza
        s.cierre = (s.cierre ?? 0) - fuerza / 2
        break
      case 'prefiere_cierre':
        s.cierre = (s.cierre ?? 0) + fuerza
        s.manana = (s.manana ?? 0) - fuerza / 2
        break
      case 'evita_cierre':
        s.cierre = (s.cierre ?? 0) - fuerza
        break
      case 'prefiere_tarde':
        s.tarde = (s.tarde ?? 0) + fuerza
        break
    }
  }
  return sesgos
}

export function combinarSesgos(...fuentes: SesgosPorNombre[]): SesgosPorNombre {
  const total: SesgosPorNombre = {}
  for (const fuente of fuentes) {
    for (const [nombre, s] of Object.entries(fuente)) {
      const acc = (total[nombre] ??= {})
      if (s.manana) acc.manana = (acc.manana ?? 0) + s.manana
      if (s.tarde) acc.tarde = (acc.tarde ?? 0) + s.tarde
      if (s.cierre) acc.cierre = (acc.cierre ?? 0) + s.cierre
    }
  }
  return total
}

/** Explicaciones legibles para mostrar al supervisor antes de generar. */
export function explicarSesgos(sesgos: SesgosPorNombre): string[] {
  const frases: string[] = []
  for (const [nombre, s] of Object.entries(sesgos)) {
    const partes: string[] = []
    if ((s.manana ?? 0) >= 3) partes.push('se preferirá mañana')
    if ((s.manana ?? 0) <= -3) partes.push('se evitará mañana')
    if ((s.cierre ?? 0) >= 3) partes.push('se preferirá cierre')
    if ((s.cierre ?? 0) <= -3) partes.push('se evitará cierre')
    if ((s.tarde ?? 0) >= 3) partes.push('se preferirá tarde')
    if (partes.length > 0) frases.push(`${nombre}: ${partes.join(', ')}`)
  }
  return frases
}

// ==================== CAPACIDAD 1: REGLAS CONFIGURABLES ====================

export function reglaVigenteEnSemana(regla: ReglaConfigurable, fechaLunes: string): boolean {
  if (!regla.activa) return false
  if (!regla.vigenciaDesde && !regla.vigenciaHasta) return true
  const lunes = fechaLunes
  const domingo = sumarDias(fechaLunes, 6)
  if (regla.vigenciaDesde && regla.vigenciaDesde > domingo) return false
  if (regla.vigenciaHasta && regla.vigenciaHasta < lunes) return false
  return true
}

function sumarDias(fechaISO: string, dias: number): string {
  const f = new Date(`${fechaISO}T00:00:00`)
  f.setDate(f.getDate() + dias)
  return f.toISOString().split('T')[0]
}

/** Traduce las reglas por colaborador vigentes al formato ExcepcionSemanal del algoritmo. */
export function reglasAExcepciones(
  reglas: ReglaConfigurable[],
  fechaLunes: string
): ExcepcionSemanal[] {
  const excepciones: ExcepcionSemanal[] = []
  for (const r of reglas) {
    if (r.ambito !== 'colaborador' || !r.colaboradorNombre) continue
    if (!reglaVigenteEnSemana(r, fechaLunes)) continue
    const base = { id: `regla_${r.id}`, colaboradorNombre: r.colaboradorNombre, descripcion: r.descripcion }
    switch (r.tipo) {
      case 'franco_fijo':
        if (r.dia !== undefined && r.dia >= 0) {
          excepciones.push({ ...base, tipo: 'franco_dia', valor: String(r.dia) })
        }
        break
      case 'no_antes_de':
        if (r.hora) excepciones.push({ ...base, tipo: 'no_antes_de', valor: r.hora })
        break
      case 'no_despues_de':
        if (r.hora) excepciones.push({ ...base, tipo: 'no_despues_de', valor: r.hora })
        break
      case 'siempre_cierre':
        excepciones.push({ ...base, tipo: 'siempre_cierre' })
        break
      case 'siempre_manana':
        excepciones.push({ ...base, tipo: 'solo_matutino' })
        break
    }
  }
  return excepciones
}

/**
 * Las excepciones creadas desde la UI usan el día como texto ('Lun'..'Dom'),
 * pero el algoritmo espera el índice numérico como string ('0'..'6').
 */
export function normalizarExcepciones(excepciones: ExcepcionSemanal[]): ExcepcionSemanal[] {
  return excepciones.map(e => {
    if (e.tipo !== 'franco_dia' || !e.valor || /^\d+$/.test(e.valor)) return e
    const idx = DIAS_SEMANA.indexOf(e.valor as (typeof DIAS_SEMANA)[number])
    return idx >= 0 ? { ...e, valor: String(idx) } : e
  })
}

/** Mínimos de cajeros por franja, en slots del algoritmo v2. */
export function demandaMinimaDeReglas(
  reglas: ReglaConfigurable[],
  fechaLunes: string
): MinimoFranja[] {
  const minimos: MinimoFranja[] = []
  for (const r of reglas) {
    if (r.tipo !== 'min_cajeros_franja' || !reglaVigenteEnSemana(r, fechaLunes)) continue
    if (!r.horaDesde || !r.horaHasta || !r.cantidad) continue
    const slotDesde = Math.max(0, horaASlotUI(r.horaDesde))
    const slotHasta = Math.min(30, horaASlotUI(r.horaHasta))
    if (slotHasta <= slotDesde) continue
    minimos.push({ dia: r.dia ?? -1, slotDesde, slotHasta, cantidad: r.cantidad })
  }
  return minimos
}

/** Tope de francos por día según reglas del local. Nunca supera 2 (H-FR1 dura). */
export function capFrancosDeReglas(
  reglas: ReglaConfigurable[],
  fechaLunes: string
): number | undefined {
  let cap: number | undefined
  for (const r of reglas) {
    if (r.tipo !== 'max_francos_dia' || !reglaVigenteEnSemana(r, fechaLunes)) continue
    if (r.cantidad === undefined) continue
    const valor = Math.min(2, Math.max(1, r.cantidad))
    cap = cap === undefined ? valor : Math.min(cap, valor)
  }
  return cap
}

/**
 * Detecta conflictos entre reglas configurables y las reglas laborales duras.
 * El sistema informa pero nunca permite violar las duras: cuando hay conflicto,
 * la regla se aplica recortada (o se ignora) y acá se explica por qué.
 */
export function validarConflictosReglas(
  reglas: ReglaConfigurable[],
  colaboradores: Colaborador[]
): string[] {
  const avisos: string[] = []
  const activas = reglas.filter(r => r.activa)
  const cajeros = colaboradores.filter(c => c.activo && (c.tipo === 'FULL' || c.tipo === 'PART'))
  const tipoDe = (nombre?: string) => colaboradores.find(c => c.nombre === nombre)?.tipo

  for (const r of activas) {
    if (r.tipo === 'max_francos_dia' && r.cantidad !== undefined) {
      if (r.cantidad > 2) {
        avisos.push(
          `"${r.descripcion}": la regla laboral dura permite máximo 2 francos por día. Se aplicará 2.`
        )
      }
      const cap = Math.min(2, Math.max(1, r.cantidad))
      if (cap * 7 < cajeros.length) {
        avisos.push(
          `"${r.descripcion}": con ${cajeros.length} cajeros que necesitan franco semanal, un tope de ${cap} por día no alcanza (máximo ${cap * 7} francos/semana). Algunos quedarán sin asignar.`
        )
      }
    }
    if (r.tipo === 'no_antes_de' && r.hora && r.hora >= '10:00' && tipoDe(r.colaboradorNombre) === 'FULL') {
      avisos.push(
        `"${r.descripcion}": los FULL necesitan jornadas cortadas que cubren la apertura (entrada hasta 09:30). Con esta regla ${r.colaboradorNombre} quedará sin horario asignable.`
      )
    }
    if (r.tipo === 'min_cajeros_franja' && r.cantidad !== undefined && r.cantidad > cajeros.length) {
      avisos.push(
        `"${r.descripcion}": pide ${r.cantidad} cajeros pero solo hay ${cajeros.length} FULL/PART activos. Se cubrirá lo posible con auxiliares y eventuales.`
      )
    }
  }

  // siempre_manana + siempre_cierre sobre la misma persona son incompatibles
  const porColaborador = new Map<string, Set<string>>()
  for (const r of activas) {
    if (r.ambito !== 'colaborador' || !r.colaboradorNombre) continue
    const set = porColaborador.get(r.colaboradorNombre) ?? new Set()
    set.add(r.tipo)
    porColaborador.set(r.colaboradorNombre, set)
  }
  for (const [nombre, tipos] of porColaborador) {
    if (tipos.has('siempre_manana') && tipos.has('siempre_cierre')) {
      avisos.push(
        `${nombre} tiene "siempre mañana" y "siempre cierre" a la vez: son incompatibles y quedará sin horario asignable. Desactivá una de las dos.`
      )
    }
  }

  // franco_fijo: más colaboradores con franco fijo el mismo día que el tope permitido
  const francosFijosPorDia = new Map<number, string[]>()
  for (const r of activas) {
    if (r.tipo === 'franco_fijo' && r.dia !== undefined && r.dia >= 0 && r.colaboradorNombre) {
      const lista = francosFijosPorDia.get(r.dia) ?? []
      lista.push(r.colaboradorNombre)
      francosFijosPorDia.set(r.dia, lista)
    }
  }
  for (const [dia, nombres] of francosFijosPorDia) {
    if (nombres.length > 2) {
      avisos.push(
        `Hay ${nombres.length} colaboradores con franco fijo el ${DIAS_SEMANA[dia]} (${nombres.join(', ')}), pero la regla dura permite máximo 2 francos por día.`
      )
    }
  }

  return avisos
}

// ==================== CONSTRUCCIÓN DE TURNOS (edición manual) ====================

export function turnosDesdeHoras(inicio: string, fin: string): Turno[] {
  return [{ inicio, fin }]
}
