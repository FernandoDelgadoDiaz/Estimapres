/**
 * AH2-063 · Rotación mensual de turnos y reparto parejo de domingos (decisión del propietario, 23/11/2026).
 *
 *  - Mes de una semana (lunes a domingo): el mes que tiene 4 o más de sus 7 días, o sea el mes de su JUEVES.
 *  - Dentro del mismo mes: continuidad. Cada persona tiende a repetir, día por día, el tipo de turno (mañana,
 *    tarde, cierre) y los francos de la semana anterior. Los cambios de necesidad se absorben con cambios suaves.
 *  - Al empezar un mes nuevo: rotación. Se evita el tipo de turno que predominó el mes anterior y los francos de
 *    sábado repetidos. Quien tiene un «Turno (pedido)» vigente no rota de turno.
 *  - Domingos (se pagan doble): se reparten parejo. Quien trabajó más domingos que el promedio (este mes y el
 *    anterior) tiende a franco el domingo; quien trabajó menos, a trabajarlo. «Prefiere trabajar los domingos»
 *    (regla por persona) es una preferencia fuerte y queda fuera del reparto. El sábado es un día normal.
 *
 * Todo se expresa como preferencias de turno (mañana/tarde/cierre/franco, generales o por día) que ya entienden los
 * dos motores. Son SIEMPRE blandas: la cobertura va primero (en B son la última prioridad; en A el orquestador solo
 * las acepta si no aumentan el faltante).
 */
import type { SemanaHistorial } from '../types'
import { horariosAcreditados } from '../contingencias/ausencias'
import { clasificarJornadaUI, ultimasVersiones, type SesgosPorNombre } from './preferencias'

type Clase = 'manana' | 'tarde' | 'cierre' | 'franco'

export const CONTINUIDAD = 5      // por día: repetir lo de la semana anterior dentro del mes
export const ROTACION = 6         // global: evitar el turno que predominó el mes anterior
export const FRANCO_SABADO = 4    // evitar repetir franco de sábado al cambiar de mes
export const DOMINGO_PASO = 3     // por cada domingo de diferencia con el promedio
export const DOMINGO_MAX = 8
export const PREFIERE_DOMINGO = 10

const sumar = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
/** Mes («YYYY-MM») al que pertenece la semana que empieza el lunes `lunes`: el de su jueves. */
export const mesDeSemana = (lunes: string) => sumar(lunes, 3).slice(0, 7)
const mesAnterior = (mes: string) => { const [a, m] = mes.split('-').map(Number); return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, '0')}` }
const clamp = (v: number, max: number) => Math.max(-max, Math.min(max, v))

export interface OpcionesRotacion {
  /** Cajeros (FULL/PART) de la sucursal: id → nombre (las preferencias van por nombre). */
  cajeros: Array<{ id: string; nombre: string }>
  /** Nombres con «Turno (pedido)» vigente: no rotan de turno al cambiar de mes. */
  conTurnoPedido?: Set<string>
  /** Nombres con «Prefiere trabajar los domingos» vigente. */
  prefierenDomingo?: Set<string>
}

export interface ExplicacionRotacion { mes: string; modo: 'continuidad' | 'cambio_de_mes' | 'sin_historia'; frases: string[] }

/** Clases por día (0..6) de cada cajero en una semana guardada; los días ausentes cuentan con la jornada comunicada. */
function clasesDeSemana(s: SemanaHistorial): Map<string, Clase[]> {
  const out = new Map<string, Clase[]>()
  for (const h of horariosAcreditados(s.horarios)) {
    if (h.rolGeneral !== 'cajero') continue
    out.set(h.colaboradorId, Array.from({ length: 7 }, (_, d) => {
      const j = h.jornadas.find(x => x.dia === d)
      return j ? clasificarJornadaUI(j) : 'franco'
    }))
  }
  return out
}

export function rotacionMensual(historial: SemanaHistorial[], lunes: string, op: OpcionesRotacion): { sesgos: SesgosPorNombre; explicacion: ExplicacionRotacion } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(lunes) || Number.isNaN(Date.parse(`${lunes}T12:00:00Z`))) {
    return { sesgos: {}, explicacion: { mes: '', modo: 'sin_historia', frases: [] } }
  }
  const mes = mesDeSemana(lunes)
  const previas = ultimasVersiones(historial.filter(s => s.fechaLunes < lunes)).sort((a, b) => b.fechaLunes.localeCompare(a.fechaLunes))
  const sesgos: SesgosPorNombre = {}
  const frases: string[] = []
  const de = (nombre: string) => (sesgos[nombre] ??= {})
  const dia = (nombre: string, d: number) => ((de(nombre).porDia ??= {})[d] ??= {})
  const anterior = previas.find(s => s.fechaLunes === sumar(lunes, -7))
  const nombrePorId = new Map(op.cajeros.map(c => [c.id, c.nombre]))
  if (!previas.length) return { sesgos, explicacion: { mes, modo: 'sin_historia', frases } }

  let modo: ExplicacionRotacion['modo'] = 'sin_historia'
  if (anterior && mesDeSemana(anterior.fechaLunes) === mes) {
    // 1. Mismo mes: continuidad día por día (el domingo lo decide el reparto parejo).
    modo = 'continuidad'
    for (const [id, clases] of clasesDeSemana(anterior)) {
      const nombre = nombrePorId.get(id)
      if (!nombre) continue
      clases.forEach((c, d) => { if (d !== 6) { const x = dia(nombre, d); x[c] = (x[c] ?? 0) + CONTINUIDAD } })
    }
    frases.push('Mismo mes que la semana anterior: cada cajero tiende a mantener sus turnos y francos (los cambios siguen a la necesidad de cajas).')
  } else {
    // 2. Mes nuevo: se evita el turno que predominó el mes anterior y repetir franco de sábado.
    const delMesAnterior = previas.filter(s => mesDeSemana(s.fechaLunes) === mesAnterior(mes))
    if (delMesAnterior.length) {
      modo = 'cambio_de_mes'
      const cuenta = new Map<string, Record<Clase | 'sabadoFranco', number>>()
      for (const s of delMesAnterior) for (const [id, clases] of clasesDeSemana(s)) {
        const c = cuenta.get(id) ?? { manana: 0, tarde: 0, cierre: 0, franco: 0, sabadoFranco: 0 }
        clases.forEach((k, d) => { if (d !== 6) c[k]++ })
        if (clases[5] === 'franco') c.sabadoFranco++
        cuenta.set(id, c)
      }
      for (const [id, c] of cuenta) {
        const nombre = nombrePorId.get(id)
        if (!nombre) continue
        const tipos = (['manana', 'tarde', 'cierre'] as const)
        const max = Math.max(...tipos.map(t => c[t]))
        const predominantes = tipos.filter(t => c[t] === max && max > 0)
        if (predominantes.length === 1 && !op.conTurnoPedido?.has(nombre)) {
          const t = predominantes[0]
          de(nombre)[t] = (de(nombre)[t] ?? 0) - ROTACION
          frases.push(`${nombre}: el mes pasado hizo sobre todo ${t === 'manana' ? 'mañana' : t}; este mes rota.`)
        }
        if (c.sabadoFranco >= 2) { const x = dia(nombre, 5); x.franco = (x.franco ?? 0) - FRANCO_SABADO }
      }
    }
  }

  // 3. Domingos: reparto parejo entre los que no lo piden, contando este mes y el anterior.
  const ventana = previas.filter(s => [mes, mesAnterior(mes)].includes(mesDeSemana(s.fechaLunes)))
  const domingos = new Map<string, number>()
  for (const s of ventana) for (const [id, clases] of clasesDeSemana(s)) if (nombrePorId.has(id)) domingos.set(id, (domingos.get(id) ?? 0) + (clases[6] !== 'franco' ? 1 : 0))
  const enReparto = op.cajeros.filter(c => !op.prefierenDomingo?.has(c.nombre) && domingos.has(c.id))
  if (ventana.length && enReparto.length) {
    const promedio = enReparto.reduce((n, c) => n + domingos.get(c.id)!, 0) / enReparto.length
    for (const c of enReparto) {
      const diferencia = domingos.get(c.id)! - promedio
      if (Math.abs(diferencia) < 0.5) continue
      const x = dia(c.nombre, 6)
      x.franco = clamp((x.franco ?? 0) + diferencia * DOMINGO_PASO, DOMINGO_MAX)
    }
    frases.push('Domingos: se reparten parejo; tiene prioridad para trabajarlos quien trabajó menos domingos.')
  }
  for (const nombre of op.prefierenDomingo ?? []) {
    if (!op.cajeros.some(c => c.nombre === nombre)) continue
    dia(nombre, 6).franco = -PREFIERE_DOMINGO
    frases.push(`${nombre}: prefiere trabajar los domingos.`)
  }
  // Se limpian los ceros para no ensuciar la entrada de los motores.
  for (const [n, s] of Object.entries(sesgos)) {
    for (const [d, x] of Object.entries(s.porDia ?? {})) {
      for (const k of Object.keys(x) as (keyof typeof x)[]) if (!x[k]) delete x[k]
      if (!Object.keys(x).length) delete s.porDia![Number(d)]
    }
    if (s.porDia && !Object.keys(s.porDia).length) delete s.porDia
    if (!Object.keys(s).length) delete sesgos[n]
  }
  return { sesgos, explicacion: { mes, modo, frases } }
}
