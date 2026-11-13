// src/reglas/reglasV2.ts
// RULES-01 (#11) — Reglas configurables v2 (AH2-010, PROPUESTO).
//
// Módulo puro (sin base de datos, sin UI):
//   1. Modelo tipado: ámbito (empresa / sucursal / grupo / persona), vigencia
//      (semana / mes / rango / permanente), nivel, prioridad explícita y auditoría.
//   2. resolverSemana(): qué reglas aplican a cada persona y día, con precedencia
//      y DETECCIÓN DE CONFLICTOS (nunca se resuelven en silencio).
//   3. compilarParaMotor(): traduce lo resuelto al formato que ya consume el motor
//      actual (ExcepcionSemanal, tope de francos, mínimos, toggles operativos).
//   4. desdeReglaLegacy(): compatibilidad con ReglaConfigurable (modelo actual).
//
// Fuera de alcance (decisiones pendientes): valores normativos/contractuales
// (#7, D1–D3) — este módulo NO contiene horas máximas, francos ni descansos;
// persistencia (migración no autorizada) — ver docs/proposals/RULES01_reglas_v2.sql.

import type { ExcepcionSemanal, ReglaConfigurable } from '../types'
import { DEFAULTS_OPERATIVOS, horaASlotUI, type ConfigOperativa, type MinimoFranja, type TipoReglaOperativa } from '../utils/preferencias'

// ======================= MODELO =======================

/**
 * NORMATIVA: obligación legal/convencional (valores en el perfil normativo, #7). Nunca se desactiva.
 * OPERATIVA: obligatoria para la sucursal. Solo una EXCEPCIÓN AUTORIZADA puede reemplazarla.
 * PREFERENCIA: blanda; se ordena por prioridad y cede ante cualquier obligatoria.
 */
export type Nivel = 'NORMATIVA' | 'OPERATIVA' | 'PREFERENCIA'
export type TipoAmbito = 'EMPRESA' | 'SUCURSAL' | 'GRUPO' | 'PERSONA'
export type Turno = 'manana' | 'tarde' | 'noche'

export type Vigencia =
  | { tipo: 'SEMANA'; lunes: string }                 // yyyy-MM-dd (lunes)
  | { tipo: 'MES'; anio: number; mes: number }        // mes 1..12
  | { tipo: 'RANGO'; desde: string; hasta: string }   // inclusivo
  | { tipo: 'PERMANENTE'; desde?: string }            // opcionalmente desde una fecha

export type Parametros =
  | { tipo: 'solo_turno'; turno: Turno }
  | { tipo: 'siempre_cierre' }
  | { tipo: 'franco_fijo'; dia: number }              // 0=Lun..6=Dom
  | { tipo: 'no_disponible' }                         // no trabaja en los días vigentes
  | { tipo: 'ventana_horaria'; entradaDesde?: string; salidaHasta?: string } // HH:MM
  | { tipo: 'min_cajeros_franja'; dia: number; desde: string; hasta: string; cantidad: number } // dia -1 = todos
  | { tipo: 'max_francos_dia'; cantidad: number }
  | { tipo: 'toggle_operativo'; clave: TipoReglaOperativa; valor: boolean }

export type TipoRegla = Parametros['tipo']

export interface Auditoria {
  creadaPor: string
  creadaEn: string   // ISO
  motivo: string
  version: number
}

/**
 * Excepción autorizada: una regla OPERATIVA que reemplaza, mientras dure su vigencia,
 * a reglas OPERATIVAS nombradas explícitamente. Requiere autor, fecha y motivo, y una
 * vigencia acotada (SEMANA, MES o RANGO). Nunca puede reemplazar una regla NORMATIVA.
 */
export interface ExcepcionAutorizada {
  reemplaza: string[]
  autorizadaPor: string
  autorizadaEn: string // ISO
  motivo: string
}

export interface ReglaV2 {
  id: string
  nivel: Nivel
  /** Presente solo si la regla es una excepción autorizada. */
  excepcion?: ExcepcionAutorizada
  ambito: { tipo: TipoAmbito; id: string }
  parametros: Parametros
  vigencia: Vigencia
  /** Mayor número = mayor prioridad. Por defecto 0. */
  prioridad: number
  activa: boolean
  descripcion: string
  auditoria: Auditoria
}

export interface Grupo {
  id: string
  sucursalId: string
  nombre: string
  miembros: Array<{ colaboradorId: string; desde?: string; hasta?: string }>
}

export interface PersonaRoster {
  id: string
  nombre: string
  sucursalId: string
  contrato: 'FULL' | 'PART' | 'AUX' | 'EVENTUAL'
}

export interface ContextoSemana {
  lunes: string
  empresaId?: string
  sucursalId: string
  roster: PersonaRoster[]
  grupos?: Grupo[]
}

/** Tipos que aplican a una persona (el resto son generales de la sucursal). */
const PERSONALES: ReadonlySet<TipoRegla> = new Set(['solo_turno', 'siempre_cierre', 'franco_fijo', 'no_disponible', 'ventana_horaria'])

// ======================= FECHAS / VIGENCIA =======================

const MS_DIA = 86_400_000
const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
const ts = (f: string) => Date.parse(f + 'T00:00:00Z')
export const fechasSemana = (lunes: string) => Array.from({ length: 7 }, (_, i) => iso(ts(lunes) + i * MS_DIA))

function cubreFecha(v: Vigencia, f: string): boolean {
  switch (v.tipo) {
    case 'SEMANA': return f >= v.lunes && f <= iso(ts(v.lunes) + 6 * MS_DIA)
    case 'MES': return f.slice(0, 7) === `${v.anio}-${String(v.mes).padStart(2, '0')}`
    case 'RANGO': return f >= v.desde && f <= v.hasta
    case 'PERMANENTE': return !v.desde || f >= v.desde
  }
}

/** Índices de día (0..6) de la semana en los que la regla está vigente. */
export function diasVigentes(r: ReglaV2, lunes: string): number[] {
  if (!r.activa) return []
  return fechasSemana(lunes).flatMap((f, i) => (cubreFecha(r.vigencia, f) ? [i] : []))
}

// ======================= ÁMBITO =======================

const ESPECIFICIDAD: Record<TipoAmbito, number> = { EMPRESA: 0, SUCURSAL: 1, GRUPO: 2, PERSONA: 3 }

function enGrupo(g: Grupo | undefined, colaboradorId: string, fecha: string): boolean {
  return !!g?.miembros.some(m => m.colaboradorId === colaboradorId && (!m.desde || fecha >= m.desde) && (!m.hasta || fecha <= m.hasta))
}

function aplicaA(r: ReglaV2, p: PersonaRoster, fecha: string, ctx: ContextoSemana): boolean {
  switch (r.ambito.tipo) {
    case 'EMPRESA': return !ctx.empresaId || r.ambito.id === ctx.empresaId
    case 'SUCURSAL': return r.ambito.id === p.sucursalId
    case 'GRUPO': return enGrupo(ctx.grupos?.find(g => g.id === r.ambito.id), p.id, fecha)
    case 'PERSONA': return r.ambito.id === p.id
  }
}

function aplicaASucursal(r: ReglaV2, ctx: ContextoSemana): boolean {
  if (r.ambito.tipo === 'EMPRESA') return !ctx.empresaId || r.ambito.id === ctx.empresaId
  return r.ambito.tipo === 'SUCURSAL' && r.ambito.id === ctx.sucursalId
}

// ======================= PRECEDENCIA =======================

const RANGO_NIVEL: Record<Nivel, number> = { NORMATIVA: 2, OPERATIVA: 1, PREFERENCIA: 0 }
const obligatoria = (r: ReglaV2) => r.nivel !== 'PREFERENCIA'

/**
 * Orden de evaluación: nivel → prioridad → especificidad → más reciente (< 0 si `a` va antes).
 * El orden SOLO decide entre preferencias, o entre una preferencia y una obligatoria
 * (gana la obligatoria). Dos obligatorias incompatibles son siempre CONFLICTO.
 */
export function compararPrecedencia(a: ReglaV2, b: ReglaV2): number {
  return (RANGO_NIVEL[b.nivel] - RANGO_NIVEL[a.nivel])
    || (b.prioridad - a.prioridad)
    || (ESPECIFICIDAD[b.ambito.tipo] - ESPECIFICIDAD[a.ambito.tipo])
    || b.auditoria.creadaEn.localeCompare(a.auditoria.creadaEn)
}

/**
 * Dos reglas incompatibles se resuelven automáticamente SOLO si alguna es PREFERENCIA.
 * Las obligatorias (NORMATIVA/OPERATIVA) vigentes deben cumplirse simultáneamente: si
 * chocan, es un CONFLICTO bloqueante cualquiera sea su prioridad. La única forma de
 * apartar una OPERATIVA es una excepción autorizada que la nombre (ver validarExcepcion).
 */
function resolubles(a: ReglaV2, b: ReglaV2): boolean {
  return !obligatoria(a) || !obligatoria(b)
}

/** Motivos por los que una excepción no es válida (vacío = válida). */
export function validarExcepcion(r: ReglaV2, todas: ReglaV2[]): string[] {
  const x = r.excepcion
  if (!x) return []
  const err: string[] = []
  if (r.nivel !== 'OPERATIVA') err.push('una excepción debe ser de nivel OPERATIVA')
  if (r.vigencia.tipo === 'PERMANENTE') err.push('una excepción necesita vigencia acotada (semana, mes o rango)')
  if (!x.autorizadaPor.trim()) err.push('falta quién la autorizó')
  if (!x.autorizadaEn.trim()) err.push('falta la fecha de autorización')
  if (!x.motivo.trim()) err.push('falta el motivo')
  if (!r.auditoria.creadaPor.trim() || !r.auditoria.creadaEn.trim()) err.push('falta la auditoría de creación')
  if (!x.reemplaza.length) err.push('no indica qué reglas reemplaza')
  for (const id of x.reemplaza) {
    const t = todas.find(q => q.id === id)
    if (!t) err.push(`la regla ${id} que dice reemplazar no existe`)
    else if (t.nivel === 'NORMATIVA') err.push(`no puede reemplazar la regla normativa «${t.descripcion}»`)
    else if (t.nivel !== 'OPERATIVA') err.push(`solo reemplaza reglas OPERATIVAS («${t.descripcion}» es ${t.nivel})`)
  }
  return err
}

// ======================= RESOLUCIÓN =======================

export interface Conflicto {
  codigo: 'FRANCO_FIJO' | 'TURNO' | 'VENTANA_VACIA' | 'FRANCOS_FIJOS_SOBRE_TOPE' | 'DOTACION_INSUFICIENTE' | 'PERSONA_INEXISTENTE' | 'EXCEPCION_INVALIDA' | 'TOGGLE'
  dia?: number
  colaboradorId?: string
  reglas: string[]
  detalle: string
}

export interface Sobrescrita { regla: string; por: string; dia: number; colaboradorId: string; motivo: string }

/** Regla OPERATIVA apartada por una excepción autorizada (queda en la auditoría de la semana). */
export interface Reemplazada { regla: string; excepcion: string; dias: number[]; autorizadaPor: string; motivo: string }

export interface ResolucionSemana {
  lunes: string
  /** colaboradorId → día → reglas personales efectivas (ya sin las sobrescritas). */
  porPersona: Record<string, ReglaV2[][]>
  /** Reglas generales de la sucursal vigentes en la semana, con sus días. */
  generales: Array<{ regla: ReglaV2; dias: number[] }>
  conflictos: Conflicto[]
  sobrescritas: Sobrescrita[]
  reemplazadas: Reemplazada[]
  /** true si no hay conflictos: se puede generar. */
  ok: boolean
}

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const min = (h: string) => { const [hh, mm] = h.split(':').map(Number); return hh * 60 + (mm || 0) }

function incompatiblesTurno(a: Parametros, b: Parametros): boolean {
  const t = (p: Parametros) => (p.tipo === 'solo_turno' ? p.turno : p.tipo === 'siempre_cierre' ? 'cierre' : null)
  const x = t(a), y = t(b)
  if (!x || !y || x === y) return false
  const par = new Set([x, y])
  // cierre es compatible con tarde y noche (termina tarde); mañana es incompatible con todo lo demás
  return par.has('manana') || (par.has('tarde') && par.has('noche'))
}

export function resolverSemana(reglas: ReglaV2[], ctx: ContextoSemana): ResolucionSemana {
  const conflictos: Conflicto[] = []
  const sobrescritas: Sobrescrita[] = []
  const porPersona: Record<string, ReglaV2[][]> = {}
  const fechas = fechasSemana(ctx.lunes)
  const ids = new Set(ctx.roster.map(p => p.id))

  // Excepciones: las inválidas no se aplican y bloquean; las válidas apartan, en sus días
  // vigentes, a las reglas OPERATIVAS que nombran.
  const reemplazadas: Reemplazada[] = []
  const apartadasPorDia = Array.from({ length: 7 }, () => new Set<string>())
  const invalidas = new Set<string>()
  for (const r of reglas) {
    if (!r.excepcion) continue
    const dias = diasVigentes(r, ctx.lunes)
    if (!dias.length) continue
    const err = validarExcepcion(r, reglas)
    if (err.length) {
      invalidas.add(r.id)
      conflictos.push({ codigo: 'EXCEPCION_INVALIDA', reglas: [r.id], detalle: `Excepción «${r.descripcion}» no aplicada: ${err.join('; ')}.` })
      continue
    }
    for (const id of r.excepcion.reemplaza) {
      for (const d of dias) apartadasPorDia[d].add(id)
      reemplazadas.push({ regla: id, excepcion: r.id, dias, autorizadaPor: r.excepcion.autorizadaPor, motivo: r.excepcion.motivo })
    }
  }
  const usable = (r: ReglaV2, d: number) => !invalidas.has(r.id) && !apartadasPorDia[d].has(r.id)

  for (const r of reglas) {
    if (r.ambito.tipo === 'PERSONA' && !ids.has(r.ambito.id) && diasVigentes(r, ctx.lunes).length) {
      conflictos.push({ codigo: 'PERSONA_INEXISTENTE', reglas: [r.id], detalle: `«${r.descripcion}» refiere a una persona que no está en el roster de la sucursal.` })
    }
  }

  for (const p of ctx.roster) {
    porPersona[p.id] = Array.from({ length: 7 }, () => [])
    for (let d = 0; d < 7; d++) {
      const candidatas = reglas
        .filter(r => PERSONALES.has(r.parametros.tipo) && usable(r, d) && diasVigentes(r, ctx.lunes).includes(d) && aplicaA(r, p, fechas[d], ctx))
        .sort(compararPrecedencia)
      const efectivas: ReglaV2[] = []
      for (const r of candidatas) {
        const choques = efectivas.filter(e => chocan(e, r))
        if (!choques.length) { efectivas.push(r); continue }
        for (const choque of choques) {
          if (resolubles(choque, r)) {
            // `choque` va antes en el orden: si una es preferencia, gana la otra o la de mayor prioridad
            sobrescritas.push({ regla: r.id, por: choque.id, dia: d, colaboradorId: p.id, motivo: `prevalece «${choque.descripcion}» (${choque.nivel}, prioridad ${choque.prioridad})` })
          } else {
            conflictos.push({
              codigo: choque.parametros.tipo === 'franco_fijo' ? 'FRANCO_FIJO' : 'TURNO', dia: d, colaboradorId: p.id, reglas: [choque.id, r.id],
              detalle: `${p.nombre}, ${DIAS[d]}: «${choque.descripcion}» (${choque.nivel}) y «${r.descripcion}» (${r.nivel}) son obligatorias e incompatibles. La prioridad no decide entre obligatorias: corregir una o cargar una excepción autorizada.`,
            })
          }
        }
      }
      // Ventana horaria: todas obligatorias → intersección; vacía = conflicto
      const vent = efectivas.filter(e => e.parametros.tipo === 'ventana_horaria')
      const desde = Math.max(...vent.map(e => (e.parametros as { entradaDesde?: string }).entradaDesde).filter(Boolean).map(h => min(h!)), -Infinity)
      const hasta = Math.min(...vent.map(e => (e.parametros as { salidaHasta?: string }).salidaHasta).filter(Boolean).map(h => min(h!)), Infinity)
      if (vent.length && desde >= hasta) {
        conflictos.push({ codigo: 'VENTANA_VACIA', dia: d, colaboradorId: p.id, reglas: vent.map(v => v.id), detalle: `${p.nombre}, ${DIAS[d]}: las ventanas de entrada/salida no dejan horario posible.` })
      }
      porPersona[p.id][d] = efectivas
    }
  }

  const generales = reglas
    .filter(r => !PERSONALES.has(r.parametros.tipo) && aplicaASucursal(r, ctx))
    .map(regla => ({ regla, dias: diasVigentes(regla, ctx.lunes).filter(d => usable(regla, d)) }))
    .filter(g => g.dias.length > 0)

  // Toggles operativos: dos obligatorias con valores distintos el mismo día = conflicto
  const toggles = generales.filter(g => g.regla.parametros.tipo === 'toggle_operativo' && obligatoria(g.regla))
  for (let i = 0; i < toggles.length; i++) for (let j = i + 1; j < toggles.length; j++) {
    const a = toggles[i], b = toggles[j]
    const pa = a.regla.parametros as Extract<Parametros, { tipo: 'toggle_operativo' }>
    const pb = b.regla.parametros as Extract<Parametros, { tipo: 'toggle_operativo' }>
    const dias = a.dias.filter(d => b.dias.includes(d))
    if (pa.clave === pb.clave && pa.valor !== pb.valor && dias.length) {
      conflictos.push({ codigo: 'TOGGLE', dia: dias[0], reglas: [a.regla.id, b.regla.id], detalle: `«${a.regla.descripcion}» y «${b.regla.descripcion}» fijan «${pa.clave}» en valores opuestos.` })
    }
  }

  // Conflictos entre personas y reglas generales (condiciones necesarias, sin horas)
  const tope = topeFrancos(generales)
  const cajeros = ctx.roster.filter(p => p.contrato === 'FULL' || p.contrato === 'PART')
  for (let d = 0; d < 7; d++) {
    const conFrancoFijo = cajeros.filter(p => esFrancoFijoEn(porPersona[p.id], d))
    if (tope !== undefined && conFrancoFijo.length > tope) {
      conflictos.push({
        codigo: 'FRANCOS_FIJOS_SOBRE_TOPE', dia: d, reglas: conFrancoFijo.map(p => fuenteFrancoFijo(porPersona[p.id])!).filter(Boolean),
        detalle: `${conFrancoFijo.length} personas con franco fijo el ${DIAS[d]} y el tope es ${tope}.`,
      })
    }
    const ausentes = new Set([
      ...conFrancoFijo.map(p => p.id),
      ...cajeros.filter(p => porPersona[p.id][d].some(r => r.parametros.tipo === 'no_disponible')).map(p => p.id),
    ])
    const disponibles = cajeros.length - ausentes.size
    for (const g of generales) {
      const pr = g.regla.parametros
      if (pr.tipo !== 'min_cajeros_franja' || !g.dias.includes(d) || (pr.dia !== -1 && pr.dia !== d)) continue
      if (pr.cantidad > disponibles) {
        conflictos.push({
          codigo: 'DOTACION_INSUFICIENTE', dia: d, reglas: [g.regla.id],
          detalle: `${DIAS[d]}: «${g.regla.descripcion}» pide ${pr.cantidad} cajeros y solo ${disponibles} FULL/PART están disponibles (francos fijos / no disponibles).`,
        })
      }
    }
  }

  return { lunes: ctx.lunes, porPersona, generales, conflictos, sobrescritas, reemplazadas, ok: conflictos.length === 0 }
}

function chocan(a: ReglaV2, b: ReglaV2): boolean {
  const pa = a.parametros, pb = b.parametros
  if (pa.tipo === 'franco_fijo' && pb.tipo === 'franco_fijo') return pa.dia !== pb.dia
  return incompatiblesTurno(pa, pb)
}

/** Franco fijo efectivo en el día d: alguna regla franco_fijo vigente ese día con dia === d. */
function esFrancoFijoEn(dias: ReglaV2[][], d: number): boolean {
  return dias[d].some(r => r.parametros.tipo === 'franco_fijo' && r.parametros.dia === d)
}
function fuenteFrancoFijo(dias: ReglaV2[][]): string | undefined {
  return dias.flat().find(r => r.parametros.tipo === 'franco_fijo')?.id
}

/** Varias reglas de tope son todas obligatorias: rige la más restrictiva. */
function topeFrancos(generales: ResolucionSemana['generales']): number | undefined {
  const v = generales.flatMap(g => (g.regla.parametros.tipo === 'max_francos_dia' && obligatoria(g.regla) ? [Math.max(1, g.regla.parametros.cantidad)] : []))
  return v.length ? Math.min(...v) : undefined
}

// ======================= COMPILACIÓN AL MOTOR ACTUAL =======================

export interface CompiladoMotor {
  excepciones: ExcepcionSemanal[]
  maxFrancosDia?: number
  demandaMinima: MinimoFranja[]
  operativa: ConfigOperativa
  /** Limitaciones de representación del motor actual (no bloquean). */
  avisos: string[]
}


/**
 * Traduce la resolución al formato del motor actual. El motor aplica excepciones
 * por semana completa; una regla vigente solo algunos días se aplica a la semana
 * (mismo criterio que el modelo actual) y se avisa. Las PREFERENCIAS no se aplican
 * como restricciones duras.
 */
export function compilarParaMotor(res: ResolucionSemana, ctx: ContextoSemana): CompiladoMotor {
  const avisos: string[] = []
  const excepciones: ExcepcionSemanal[] = []
  const nombre = new Map(ctx.roster.map(p => [p.id, p.nombre]))
  for (const [id, dias] of Object.entries(res.porPersona)) {
    const unicas = new Map<string, { r: ReglaV2; dias: number[] }>()
    dias.forEach((rs, d) => rs.forEach(r => {
      const u = unicas.get(r.id) ?? { r, dias: [] }
      u.dias.push(d); unicas.set(r.id, u)
    }))
    for (const { r, dias: ds } of unicas.values()) {
      if (r.nivel === 'PREFERENCIA') { avisos.push(`«${r.descripcion}» es una preferencia: el motor actual no la aplica como restricción.`); continue }
      if (ds.length < 7) avisos.push(`«${r.descripcion}» rige solo ${ds.map(d => DIAS[d]).join(', ')}; el motor actual la aplica a toda la semana.`)
      const base = { id: `regla_${r.id}`, colaboradorNombre: nombre.get(id)!, descripcion: r.descripcion }
      const p = r.parametros
      switch (p.tipo) {
        case 'franco_fijo': excepciones.push({ ...base, tipo: 'franco_dia', valor: String(p.dia) }); break
        case 'siempre_cierre': excepciones.push({ ...base, tipo: 'siempre_cierre' }); break
        case 'solo_turno':
          if (p.turno === 'manana') excepciones.push({ ...base, tipo: 'solo_matutino' })
          else if (p.turno === 'noche') excepciones.push({ ...base, tipo: 'solo_nocturno' })
          else avisos.push(`«${r.descripcion}»: «solo tarde» no tiene representación en el motor actual.`)
          break
        case 'ventana_horaria':
          if (p.entradaDesde) excepciones.push({ ...base, tipo: 'no_antes_de', valor: p.entradaDesde })
          if (p.salidaHasta) excepciones.push({ ...base, tipo: 'no_despues_de', valor: p.salidaHasta })
          break
        case 'no_disponible':
          avisos.push(`«${r.descripcion}»: «no disponible» no tiene representación en el motor actual; quitá a la persona del roster esa semana o usá franco fijo.`)
          break
      }
    }
  }

  const demandaMinima: MinimoFranja[] = []
  const operativa: ConfigOperativa = {
    aperturaSoloAux: DEFAULTS_OPERATIVOS.apertura_solo_aux,
    sinAuxCierre: DEFAULTS_OPERATIVOS.sin_aux_cierre,
    supervisorJornadaCompleta: DEFAULTS_OPERATIVOS.supervisor_jornada_completa,
    francoMedioCorridos: DEFAULTS_OPERATIVOS.franco_medio_corridos,
  }
  const campo: Record<TipoReglaOperativa, keyof ConfigOperativa> = {
    apertura_solo_aux: 'aperturaSoloAux', sin_aux_cierre: 'sinAuxCierre',
    supervisor_jornada_completa: 'supervisorJornadaCompleta', franco_medio_corridos: 'francoMedioCorridos',
  }
  const toggles = res.generales.filter(g => g.regla.parametros.tipo === 'toggle_operativo' && obligatoria(g.regla)).sort((a, b) => compararPrecedencia(a.regla, b.regla))
  const vistos = new Set<string>()
  for (const g of toggles) {
    const p = g.regla.parametros as Extract<Parametros, { tipo: 'toggle_operativo' }>
    if (vistos.has(p.clave)) continue
    vistos.add(p.clave)
    operativa[campo[p.clave]] = p.valor
  }
  for (const g of res.generales) {
    const p = g.regla.parametros
    if (g.regla.nivel === 'PREFERENCIA') continue
    if (p.tipo === 'min_cajeros_franja') {
      const slotDesde = Math.max(0, horaASlotUI(p.desde)), slotHasta = Math.min(30, horaASlotUI(p.hasta))
      if (slotHasta > slotDesde) demandaMinima.push({ dia: p.dia, slotDesde, slotHasta, cantidad: p.cantidad })
    }
  }
  return { excepciones, maxFrancosDia: topeFrancos(res.generales), demandaMinima, operativa, avisos }
}

// ======================= COMPATIBILIDAD CON EL MODELO ACTUAL =======================

export interface ResultadoMigracion {
  reglas: ReglaV2[]
  /** Reglas legacy que no pudieron migrarse automáticamente (p. ej. nombre ambiguo). */
  pendientes: Array<{ id: string; motivo: string }>
}

/**
 * Convierte ReglaConfigurable (modelo actual) a ReglaV2 sin cambiar su efecto:
 *  - ámbito «local» → SUCURSAL (las reglas actuales ya se guardan por sucursal);
 *  - ámbito «colaborador» → PERSONA, resolviendo el nombre contra el roster
 *    (homónimos o inexistentes quedan pendientes: no se adivina, ver ID-01 #9);
 *  - vigenciaDesde/Hasta → RANGO / PERMANENTE; prioridad 0; nivel OPERATIVA.
 */
export function desdeReglasLegacy(legacy: ReglaConfigurable[], roster: PersonaRoster[], sucursalId: string): ResultadoMigracion {
  const reglas: ReglaV2[] = []
  const pendientes: ResultadoMigracion['pendientes'] = []
  for (const r of legacy) {
    let ambito: ReglaV2['ambito']
    if (r.ambito === 'local') ambito = { tipo: 'SUCURSAL', id: sucursalId }
    else {
      const m = roster.filter(p => p.nombre === r.colaboradorNombre)
      if (m.length !== 1) { pendientes.push({ id: r.id, motivo: m.length ? `nombre «${r.colaboradorNombre}» ambiguo` : `«${r.colaboradorNombre}» no está en el roster` }); continue }
      ambito = { tipo: 'PERSONA', id: m[0].id }
    }
    const parametros = parametrosLegacy(r)
    if (!parametros) { pendientes.push({ id: r.id, motivo: `regla «${r.tipo}» incompleta` }); continue }
    const vigencia: Vigencia = r.vigenciaHasta
      ? { tipo: 'RANGO', desde: r.vigenciaDesde ?? '0000-01-01', hasta: r.vigenciaHasta }
      : { tipo: 'PERMANENTE', desde: r.vigenciaDesde }
    reglas.push({
      id: r.id, nivel: 'OPERATIVA', ambito, parametros, vigencia, prioridad: 0,
      // Los toggles «inactivos» siguen siendo reglas: su valor es false.
      activa: parametros.tipo === 'toggle_operativo' ? true : r.activa,
      descripcion: r.descripcion,
      auditoria: { creadaPor: 'legacy', creadaEn: r.creadaEl, motivo: 'migración desde reglas_configurables', version: 1 },
    })
  }
  return { reglas, pendientes }
}

function parametrosLegacy(r: ReglaConfigurable): Parametros | null {
  switch (r.tipo) {
    case 'franco_fijo': return r.dia !== undefined && r.dia >= 0 ? { tipo: 'franco_fijo', dia: r.dia } : null
    case 'no_antes_de': return r.hora ? { tipo: 'ventana_horaria', entradaDesde: r.hora } : null
    case 'no_despues_de': return r.hora ? { tipo: 'ventana_horaria', salidaHasta: r.hora } : null
    case 'siempre_cierre': return { tipo: 'siempre_cierre' }
    case 'siempre_manana': return { tipo: 'solo_turno', turno: 'manana' }
    case 'min_cajeros_franja':
      return r.horaDesde && r.horaHasta && r.cantidad ? { tipo: 'min_cajeros_franja', dia: r.dia ?? -1, desde: r.horaDesde, hasta: r.horaHasta, cantidad: r.cantidad } : null
    case 'max_francos_dia': return r.cantidad !== undefined ? { tipo: 'max_francos_dia', cantidad: r.cantidad } : null
    case 'apertura_solo_aux': case 'sin_aux_cierre': case 'supervisor_jornada_completa': case 'franco_medio_corridos':
      return { tipo: 'toggle_operativo', clave: r.tipo, valor: r.activa }
  }
  return null
}
