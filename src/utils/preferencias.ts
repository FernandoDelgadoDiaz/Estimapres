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
// `porDia` es el aprendizaje/rotación fino: sesgos que sólo aplican a un día
// concreto de la semana (0=Lun..6=Dom). `franco` empuja hacia franco ese día.
export interface SesgoColaborador {
  manana?: number
  tarde?: number
  cierre?: number
  porDia?: Record<number, { manana?: number; tarde?: number; cierre?: number; franco?: number }>
}
export type SesgosPorNombre = Record<string, SesgoColaborador>

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
    const r: ResumenTurnos = { mananas: 0, tardes: 0, cierres: 0, francos: 0, francosDias: [], findeTrabajado: false }
    let trabajoSab = false
    let trabajoDom = false
    for (const j of h.jornadas) {
      const t = clasificarJornadaUI({ esFranco: j.esFranco, turnos: j.turnos })
      if (t === 'franco') { r.francos++; r.francosDias!.push(j.dia) }
      else if (t === 'manana') r.mananas++
      else if (t === 'cierre') r.cierres++
      else r.tardes++
      if (t !== 'franco' && j.dia === 5) trabajoSab = true
      if (t !== 'franco' && j.dia === 6) trabajoDom = true
    }
    r.findeTrabajado = trabajoSab && trabajoDom
    resumen[nombre] = r
  }
  return resumen
}

const SEMANAS_ROTACION = 3   // cuántas semanas recientes pesan en la rotación
const UMBRAL_ROTACION = 2    // desbalance mínimo (cierres vs mañanas) para actuar
const SESGO_ROTACION_MAX = 6
const UMBRAL_FINDE = 2       // fines de semana seguidos trabajados antes de empujar franco

/**
 * Rotación completa a partir del historial reciente:
 *  - Balance cierre ↔ mañana: quien acumuló muchos cierres se empuja a la mañana.
 *  - Fines de semana: quien trabajó los últimos findes seguidos recibe un empuje
 *    suave a franco de fin de semana (día 5/6) vía preferencia de esos días.
 *  - Preferencia por día concreto: se propaga a `porDia` para que la generación
 *    ubique francos/turnos rotando también días específicos, no solo el genérico.
 * Sólo usa la ÚLTIMA versión de cada lunes (versionado) para no contar doble.
 */
export function calcularSesgoRotacion(historial: SemanaHistorial[]): SesgosPorNombre {
  const recientes = ultimasVersiones(historial)
    .sort((a, b) => b.fechaLunes.localeCompare(a.fechaLunes))
    .slice(0, SEMANAS_ROTACION)

  const acumulado: Record<string, { mananas: number; cierres: number; findes: number }> = {}
  for (const semana of recientes) {
    for (const [nombre, r] of Object.entries(semana.resumenPorColaborador)) {
      const acc = (acumulado[nombre] ??= { mananas: 0, cierres: 0, findes: 0 })
      acc.mananas += r.mananas
      acc.cierres += r.cierres
      if (r.findeTrabajado) acc.findes++
    }
  }

  const sesgos: SesgosPorNombre = {}
  for (const [nombre, acc] of Object.entries(acumulado)) {
    const s: SesgosPorNombre[string] = {}
    const desbalance = acc.cierres - acc.mananas
    if (Math.abs(desbalance) >= UMBRAL_ROTACION) {
      const fuerza = Math.max(-SESGO_ROTACION_MAX, Math.min(SESGO_ROTACION_MAX, desbalance * 1.5))
      s.manana = fuerza      // muchos cierres → preferir mañana
      s.cierre = -fuerza     //                → evitar cierre
    }
    if (acc.findes >= UMBRAL_FINDE) {
      // trabajó varios findes seguidos → preferir franco fin de semana
      s.porDia = { 5: { franco: 4 }, 6: { franco: 4 } }
    }
    if (Object.keys(s).length > 0) sesgos[nombre] = s
  }
  return sesgos
}

/** Conserva sólo la versión más alta de cada (lunes) — clave del versionado. */
export function ultimasVersiones(historial: SemanaHistorial[]): SemanaHistorial[] {
  const porLunes = new Map<string, SemanaHistorial>()
  for (const s of historial) {
    const prev = porLunes.get(s.fechaLunes)
    if (!prev || s.version > prev.version) porLunes.set(s.fechaLunes, s)
  }
  return [...porLunes.values()]
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
  hora_preferida: 'entra a una hora preferida',
}

const EVIDENCIAS_MINIMAS = 2 // una corrección aislada no es un patrón
const EVIDENCIAS_MINIMAS_FINO = 2 // patrón por día concreto

/**
 * Deriva aprendizajes en dos granularidades:
 *  - GLOBAL: el colaborador prefiere/evita un tipo de turno en general.
 *  - FINO por día: el mismo patrón repetido en un día concreto de la semana
 *    (ej. "los sábados prefiere mañana") → aprendizaje con `dia`.
 *  - HORA preferida: si mueve repetidamente su entrada a la misma hora, se
 *    registra esa hora como preferida (`hora_preferida`).
 */
export function derivarAprendizajes(correcciones: CorreccionManual[]): AprendizajeDerivado[] {
  const globales = new Map<string, { nombre: string; direccion: DireccionAprendizaje; ids: string[] }>()
  const porDia = new Map<string, { nombre: string; direccion: DireccionAprendizaje; dia: number; ids: string[] }>()
  const horas = new Map<string, { nombre: string; dia: number; hora: string; ids: string[] }>()

  for (const c of correcciones) {
    const dir = direccionDeCorreccion(c)
    if (dir) {
      const cg = `${c.colaboradorNombre}::${dir}`
      const g = globales.get(cg) ?? { nombre: c.colaboradorNombre, direccion: dir, ids: [] }
      g.ids.push(c.id)
      globales.set(cg, g)

      const cd = `${c.colaboradorNombre}::${dir}::${c.dia}`
      const d = porDia.get(cd) ?? { nombre: c.colaboradorNombre, direccion: dir, dia: c.dia, ids: [] }
      d.ids.push(c.id)
      porDia.set(cd, d)
    }
    // Hora preferida: entrada del turno corregido (si no es franco)
    if (!c.despues.esFranco && c.despues.turnos.length > 0) {
      const hora = c.despues.turnos[0].inicio
      const ch = `${c.colaboradorNombre}::${c.dia}::${hora}`
      const h = horas.get(ch) ?? { nombre: c.colaboradorNombre, dia: c.dia, hora, ids: [] }
      h.ids.push(c.id)
      horas.set(ch, h)
    }
  }

  const aprendizajes: AprendizajeDerivado[] = []

  for (const g of globales.values()) {
    if (g.ids.length < EVIDENCIAS_MINIMAS) continue
    aprendizajes.push({
      colaboradorNombre: g.nombre,
      direccion: g.direccion,
      evidencias: g.ids.length,
      correccionIds: g.ids,
      descripcion: `${g.nombre} ${DESCRIPCION_DIRECCION[g.direccion]} (${g.ids.length} correcciones)`,
    })
  }

  for (const d of porDia.values()) {
    if (d.ids.length < EVIDENCIAS_MINIMAS_FINO) continue
    aprendizajes.push({
      colaboradorNombre: d.nombre,
      direccion: d.direccion,
      dia: d.dia,
      evidencias: d.ids.length,
      correccionIds: d.ids,
      descripcion: `${d.nombre}, los ${DIAS_SEMANA[d.dia]}, ${DESCRIPCION_DIRECCION[d.direccion]} (${d.ids.length} correcciones)`,
    })
  }

  for (const h of horas.values()) {
    if (h.ids.length < EVIDENCIAS_MINIMAS_FINO) continue
    aprendizajes.push({
      colaboradorNombre: h.nombre,
      direccion: 'hora_preferida',
      dia: h.dia,
      valor: h.hora,
      evidencias: h.ids.length,
      correccionIds: h.ids,
      descripcion: `${h.nombre}, los ${DIAS_SEMANA[h.dia]}, prefiere entrar ${h.hora} (${h.ids.length} correcciones)`,
    })
  }

  return aprendizajes.sort((a, b) => b.evidencias - a.evidencias)
}

export function calcularSesgoAprendizaje(aprendizajes: AprendizajeDerivado[]): SesgosPorNombre {
  const sesgos: SesgosPorNombre = {}
  for (const a of aprendizajes) {
    const fuerza = Math.min(a.evidencias, 4) * 2.5 // 5..10
    const s = (sesgos[a.colaboradorNombre] ??= {})

    if (a.dia !== undefined) {
      // Aprendizaje fino: aplica sólo a ese día de la semana
      s.porDia ??= {}
      const d = (s.porDia[a.dia] ??= {})
      aplicarDireccion(d, a.direccion, fuerza)
    } else {
      aplicarDireccion(s, a.direccion, fuerza)
    }
  }
  return sesgos
}

function aplicarDireccion(
  destino: { manana?: number; tarde?: number; cierre?: number },
  direccion: DireccionAprendizaje,
  fuerza: number
): void {
  switch (direccion) {
    case 'prefiere_manana':
      destino.manana = (destino.manana ?? 0) + fuerza
      destino.cierre = (destino.cierre ?? 0) - fuerza / 2
      break
    case 'prefiere_cierre':
      destino.cierre = (destino.cierre ?? 0) + fuerza
      destino.manana = (destino.manana ?? 0) - fuerza / 2
      break
    case 'evita_cierre':
      destino.cierre = (destino.cierre ?? 0) - fuerza
      break
    case 'prefiere_tarde':
      destino.tarde = (destino.tarde ?? 0) + fuerza
      break
    case 'hora_preferida':
      // La hora preferida es una señal suave hacia la mañana si es temprana;
      // el sesgo por turno la aproxima sin forzar el slot exacto.
      break
  }
}

export function combinarSesgos(...fuentes: SesgosPorNombre[]): SesgosPorNombre {
  const total: SesgosPorNombre = {}
  for (const fuente of fuentes) {
    for (const [nombre, s] of Object.entries(fuente)) {
      const acc = (total[nombre] ??= {})
      if (s.manana) acc.manana = (acc.manana ?? 0) + s.manana
      if (s.tarde) acc.tarde = (acc.tarde ?? 0) + s.tarde
      if (s.cierre) acc.cierre = (acc.cierre ?? 0) + s.cierre
      if (s.porDia) {
        acc.porDia ??= {}
        for (const [diaStr, sd] of Object.entries(s.porDia)) {
          const dia = Number(diaStr)
          const accd = (acc.porDia[dia] ??= {})
          if (sd.manana) accd.manana = (accd.manana ?? 0) + sd.manana
          if (sd.tarde) accd.tarde = (accd.tarde ?? 0) + sd.tarde
          if (sd.cierre) accd.cierre = (accd.cierre ?? 0) + sd.cierre
          if (sd.franco) accd.franco = (accd.franco ?? 0) + sd.franco
        }
      }
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
    for (const [diaStr, sd] of Object.entries(s.porDia ?? {})) {
      const dia = DIAS_SEMANA[Number(diaStr)]
      if ((sd.franco ?? 0) >= 3) partes.push(`franco tendencia ${dia}`)
      if ((sd.manana ?? 0) >= 3) partes.push(`mañana los ${dia}`)
      if ((sd.cierre ?? 0) >= 3) partes.push(`cierre los ${dia}`)
      if ((sd.tarde ?? 0) >= 3) partes.push(`tarde los ${dia}`)
    }
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

// ==================== VALIDACIÓN DE EDICIONES MANUALES (reglas duras) ====================

export type Severidad = 'error' | 'aviso'
export interface AvisoValidacion {
  severidad: Severidad
  mensaje: string
}

function horasDeJornadaUI(j: JornadaResumida): number {
  if (j.esFranco) return 0
  return j.turnos.reduce((sum, t) => sum + (horaAMinutos(t.fin) - horaAMinutos(t.inicio)) / 60, 0)
}

/**
 * Valida en tiempo real una edición manual del horario contra las reglas
 * laborales duras. NO bloquea (el supervisor manda), pero informa qué reglas
 * duras rompería el cambio para que decida con contexto.
 *
 * @param jornadaEditada  la jornada nueva que el supervisor está por guardar
 * @param jornadasSemana  las 7 jornadas actuales del colaborador (para totales y descansos)
 * @param dia             día editado (0..6)
 * @param tipo            'FULL' | 'PART' — define límites de horas
 */
export function validarEdicionManual(
  jornadaEditada: JornadaResumida,
  jornadasSemana: JornadaResumida[],
  dia: number,
  tipo: 'FULL' | 'PART' | string
): AvisoValidacion[] {
  const avisos: AvisoValidacion[] = []

  // Simular la semana con la jornada editada aplicada
  const semana = jornadasSemana.map((j, i) => (i === dia ? jornadaEditada : j))

  // --- Franja de operación 08:00–22:30 ---
  if (!jornadaEditada.esFranco) {
    for (const t of jornadaEditada.turnos) {
      if (horaAMinutos(t.inicio) < 8 * 60 || horaAMinutos(t.fin) > 22.5 * 60) {
        avisos.push({ severidad: 'error', mensaje: `El turno ${t.inicio}-${t.fin} se sale del horario de operación (08:00–22:30).` })
      }
      if (horaAMinutos(t.fin) <= horaAMinutos(t.inicio)) {
        avisos.push({ severidad: 'error', mensaje: `El turno ${t.inicio}-${t.fin} termina antes de empezar.` })
      }
    }
    // Cortado: descanso mínimo 4h entre bloques (H-F7)
    if (jornadaEditada.turnos.length === 2) {
      const gap = horaAMinutos(jornadaEditada.turnos[1].inicio) - horaAMinutos(jornadaEditada.turnos[0].fin)
      if (gap < 4 * 60) {
        avisos.push({ severidad: 'error', mensaje: `Jornada cortada: el descanso entre bloques es de ${(gap / 60).toFixed(1)}h, mínimo 4h (H-F7).` })
      }
    }
    if (jornadaEditada.turnos.length > 2) {
      avisos.push({ severidad: 'error', mensaje: 'Una jornada no puede tener más de 2 bloques (corrida o cortada).' })
    }
  }

  // --- Descanso 12h entre este día y los adyacentes (H-D1) ---
  const chequeoDescanso = (previa: JornadaResumida | undefined, siguiente: JornadaResumida | undefined) => {
    if (!previa || previa.esFranco || jornadaEditada.esFranco) return
    if (siguiente) return
    const finPrev = horaAMinutos(previa.turnos[previa.turnos.length - 1].fin)
    const inicioHoy = horaAMinutos(jornadaEditada.turnos[0].inicio)
    // descanso = resto del día previo + noche (hasta 08:00) + inicio de hoy
    const descanso = (24 * 60 - finPrev) + inicioHoy
    if (descanso < 12 * 60) {
      avisos.push({ severidad: 'error', mensaje: `Descanso menor a 12h respecto al día anterior (${(descanso / 60).toFixed(1)}h, H-D1).` })
    }
  }
  chequeoDescanso(semana[dia - 1], undefined)
  // día siguiente
  if (!jornadaEditada.esFranco && dia < 6 && semana[dia + 1] && !semana[dia + 1].esFranco) {
    const finHoy = horaAMinutos(jornadaEditada.turnos[jornadaEditada.turnos.length - 1].fin)
    const inicioSig = horaAMinutos(semana[dia + 1].turnos[0].inicio)
    const descanso = (24 * 60 - finHoy) + inicioSig
    if (descanso < 12 * 60) {
      avisos.push({ severidad: 'error', mensaje: `Descanso menor a 12h respecto al día siguiente (${(descanso / 60).toFixed(1)}h, H-D1).` })
    }
  }

  // --- Totales de horas semanales ---
  const totalHoras = semana.reduce((sum, j) => sum + horasDeJornadaUI(j), 0)
  const francos = semana.filter(j => j.esFranco).length
  if (tipo === 'FULL') {
    if (Math.abs(totalHoras - 48) > 0.01) {
      avisos.push({ severidad: 'aviso', mensaje: `Total FULL = ${totalHoras.toFixed(1)}h; la regla dura pide exactamente 48h (H-F1).` })
    }
    if (francos !== 1) {
      avisos.push({ severidad: 'aviso', mensaje: `FULL debe tener exactamente 1 franco; ahora tiene ${francos} (H-F3).` })
    }
  } else if (tipo === 'PART') {
    if (totalHoras > 31.01) {
      avisos.push({ severidad: 'aviso', mensaje: `Total PART = ${totalHoras.toFixed(1)}h; el máximo es 31h (H-P1).` })
    }
    if (!jornadaEditada.esFranco && horasDeJornadaUI(jornadaEditada) > 6.01) {
      avisos.push({ severidad: 'error', mensaje: `Jornada PART de ${horasDeJornadaUI(jornadaEditada).toFixed(1)}h; el máximo por jornada es 6h (H-P5).` })
    }
    if (jornadaEditada.turnos.length === 2) {
      avisos.push({ severidad: 'error', mensaje: 'Los PART no pueden tener jornadas cortadas (H-P4).' })
    }
  }

  return avisos
}
