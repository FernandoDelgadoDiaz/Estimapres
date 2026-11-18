import { esFechaValida, esLunes, sumarDias } from '../planificacion/fechas'

export type Bloques = [number, number][]
type Rol = 'FULL' | 'PART' | 'AUX' | 'EVENTUAL'
export const tiposAusencia = ['licencia', 'indisponibilidad', 'otra'] as const
export interface Ausencia {
  id: string
  persona: string
  tipo: typeof tiposAusencia[number]
  desde: string
  hasta: string
  estado: 'confirmada' | 'anulada'
}
export interface Jornada { colab_id: string; dia: number; bloques: { slot_inicio: number; slot_fin: number }[] }
export interface PlanReparacion {
  jornadas: Record<string, Jornada[]>
  AUX: Record<string, number[][]>
  EVENTUAL: Record<string, number[][]>
}
export interface EntradaContingencia {
  semana: string
  demanda: number[][]
  colaboradores: { id: string; nombre: string; rol: Rol }[]
  presencia_aux: Record<string, string[][]>
  disponibilidad_eventual: Record<string, string[][]>
  fin_domingo_anterior?: Record<string, number>
  excepciones?: { tipo: string; valor?: string; colaboradorNombre: string }[]
  apertura_solo_aux?: boolean
  sin_aux_cierre?: boolean
  supervisor_jornada_completa?: boolean
  max_caja_eventual_slots?: Record<string, number>
  max_bloques_caja_eventual_dia?: number
  eventuales_caja_hora_limite?: string
  eventuales?: boolean
}
export interface SolicitudContingencia {
  snapshot: { profile: { branch_id: string; version: number }; input: EntradaContingencia; baseline: PlanReparacion }
  aviso: string
  zona: string
  ausencias: Ausencia[]
  aperturaSiguiente?: Record<string, number | null>
}
export const dias = 7
export const slots = 30
export const indices = (n: number) => Array.from({ length: n }, (_, i) => i)
export const bloques = (j: Jornada): Bloques => j.bloques.map(b => [b.slot_inicio, b.slot_fin])
export const franjas = (b: Bloques) => b.flatMap(([a, z]) => indices(z - a).map(s => a + s))
export const cantidadBloques = (row: number[]) => row.filter(s => !row.includes(s-1)).length
export const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
export const comoSlot = (h: string) => { const [hh, mm] = h.split(':').map(Number); return (hh - 8) * 2 + mm / 30 }
export const manana = (b: Bloques) => b.length === 1 && b[0][0] <= 6

export function fechaLocal(aviso: string, zona: string) {
  if (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(aviso) || !esFechaValida(aviso.slice(0,10))) throw Error('El aviso necesita fecha, hora y zona')
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' })
  const partes = Object.fromEntries(fmt.formatToParts(new Date(aviso)).map(p => [p.type, p.value]))
  return `${partes.year}-${partes.month}-${partes.day}`
}

export function preparar(s: SolicitudContingencia) {
  const p = s.snapshot.input
  if (!s.snapshot.profile.branch_id.startsWith('lab-') || !esLunes(p.semana)) throw Error('Solo semanas de laboratorio')
  const hoy = fechaLocal(s.aviso, s.zona)
  const fechas = indices(dias).map(d => sumarDias(p.semana, d))
  const ids = new Set(p.colaboradores.map(c => c.id))
  if (s.ausencias.some(a => !ids.has(a.persona) || !tiposAusencia.includes(a.tipo) ||
    !['confirmada','anulada'].includes(a.estado) || !esFechaValida(a.desde) || !esFechaValida(a.hasta) || a.desde > a.hasta)
    || new Set(s.ausencias.map(a => a.id)).size !== s.ausencias.length) throw Error('Ausencia inválida')
  const ausente = (id: string, d: number) => fechas[d] >= hoy && s.ausencias.some(a =>
    a.estado === 'confirmada' && a.persona === id && a.desde <= fechas[d] && fechas[d] <= a.hasta)
  const modificable = fechas.map((f,d) => f > hoy && p.colaboradores.some(c => ausente(c.id,d)))
  return { p, hoy, fechas, ausente, modificable, base: s.snapshot.baseline }
}

export function cobertura(plan: PlanReparacion, c: ReturnType<typeof preparar>) {
  return indices(dias).map(d => {
    const grid = indices(slots).map(() => 0)
    for (const [id, week] of Object.entries(plan.jornadas)) {
      if (!c.ausente(id,d)) for (const s of franjas(bloques(week[d]))) grid[s]++
    }
    for (const tabla of [plan.AUX,plan.EVENTUAL]) for (const [id, week] of Object.entries(tabla)) {
      if (!c.ausente(id,d)) for (const s of week[d]) grid[s]++
    }
    return grid
  })
}

export function medir(plan: PlanReparacion, c: ReturnType<typeof preparar>) {
  const grid = cobertura(plan,c)
  const faltantes = grid.map((fila,d) => fila.map((n,s) => Math.max(0,c.p.demanda[d][s]-n)))
  const porDia = faltantes.map(fila => fila.reduce((a,b) => a+b,0))
  const afectados = new Set<string>()
  let jornadas = 0, mediasHoras = 0
  for (const d of indices(dias).filter(d => c.modificable[d])) {
    for (const persona of c.p.colaboradores) {
      if (c.ausente(persona.id,d)) continue
      const obtener = (p: PlanReparacion) => persona.rol === 'AUX' || persona.rol === 'EVENTUAL'
        ? p[persona.rol][persona.id][d] : franjas(bloques(p.jornadas[persona.id][d]))
      const a = obtener(c.base), b = obtener(plan)
      if (igual(a,b)) continue
      afectados.add(persona.id)
      jornadas++
      mediasHoras += a.filter(s => !b.includes(s)).length + b.filter(s => !a.includes(s)).length
    }
  }
  const sobrantes = grid.reduce((n,fila,d) => n + (c.modificable[d] ? fila.reduce((t,v,s) =>
    t+Math.max(0,v-c.p.demanda[d][s]),0) : 0),0)
  return {
    grid, faltantes, porDia, personas: [...afectados].sort(), jornadas, mediasHoras, sobrantes,
    deficit: porDia.reduce((n,d,i) => n+(c.modificable[i] ? d : 0),0),
    delDiaAviso: porDia[c.fechas.indexOf(c.hoy)] ?? 0,
  }
}

export function puntaje(m: ReturnType<typeof medir>) {
  return [m.deficit,m.personas.length,m.jornadas,m.mediasHoras,m.sobrantes]
}
export function mejora(a: number[], b: number[]) {
  const i = a.findIndex((n,k) => n !== b[k])
  return i !== -1 && a[i] < b[i]
}

export function opcionesApoyo(c: ReturnType<typeof preparar>, d: number) {
  const { p, ausente } = c
  const aux = Object.keys(p.presencia_aux).sort()
  const ev = Object.keys(p.disponibilidad_eventual).sort()
  const pres = indices(slots).map(s => aux.filter(i => !ausente(i,d) && p.presencia_aux[i][d][s] !== 'NO_PRESENTE'))
  const supervisor = p.supervisor_jornada_completa && pres.some(r => r.length >= 2)
    ? [...aux].sort((a,b) => pres.filter(r => r.includes(b)).length - pres.filter(r => r.includes(a)).length || a.localeCompare(b))[0]
    : undefined
  const apertura = pres[0].filter(i => pres[1].includes(i))
  const candidatos = apertura.length > 1 ? apertura.filter(i => i !== supervisor) : apertura
  const corte = p.eventuales_caja_hora_limite ? comoSlot(p.eventuales_caja_hora_limite) : slots
  return {
    supervision: pres.slice(2,28).every(r => r.length > 0),
    franjas: pres.map((r,s) => {
      if (s < 2) return { aux: p.apertura_solo_aux !== false ? candidatos : [], ev: [], cap: p.apertura_solo_aux !== false ? 1 : 0 }
      const habil = s <= (p.sin_aux_cierre === false ? 28 : 27)
      return { aux: habil ? r.filter(i => i !== supervisor) : [], cap: habil ? Math.max(0,r.length-1) : 0,
        ev: s < corte && p.eventuales !== false ? ev.filter(i => !ausente(i,d) && p.disponibilidad_eventual[i][d][s] !== 'NO_DISPONIBLE') : [] }
    }),
  }
}
