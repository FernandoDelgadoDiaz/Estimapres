/**
 * AH2-062 · Por qué no se puede generar el horario, en palabras del supervisor.
 *
 * 1. `diagnosticoPrevio`: antes de llamar a los motores revisa los cambios de la semana (y las reglas por persona)
 *    que hacen imposible cualquier horario. Así el supervisor sabe en el momento qué corregir, sin esperar.
 * 2. `explicarSinPropuesta`: si los motores igual no encuentran un horario válido, traduce sus motivos (con nombres,
 *    sin códigos) y agrega qué hacer.
 */
import type { Colaborador, ExcepcionSemanal } from '../types'
import { normalizarExcepciones } from './preferencias'

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const aMin = (h?: string) => { if (!h) return NaN; const [a, b] = h.split(':').map(Number); return a * 60 + (b || 0) }
const lista = (xs: string[]) => xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`

export interface OpcionesDiagnostico { maxFrancosDia?: number; maxFrancosPorDia?: number[]; /** AH2-066: supervisores de franco por día (ya descontados del máximo). */ supervisoresDeFranco?: number[] }

/** Motivos que hacen imposible generar. Vacío si no se detecta ninguno. */
export function diagnosticoPrevio(cajeros: Colaborador[], excepciones: ExcepcionSemanal[], op: OpcionesDiagnostico = {}): string[] {
  const motivos: string[] = []
  // Los francos cargados en pantalla vienen como 'Lun'..'Dom'; las reglas, como '0'..'6'.
  excepciones = normalizarExcepciones(excepciones)
  const activos = cajeros.filter(c => c.activo !== false && (c.tipo === 'FULL' || c.tipo === 'PART'))
  const de = (c: Colaborador) => excepciones.filter(e => e.colaboradorId ? e.colaboradorId === c.id : e.colaboradorNombre === c.nombre)

  // Francos fijos: uno por persona y semana; no más del máximo por día.
  const francosPorDia: string[][] = DIAS.map(() => [])
  for (const c of activos) {
    const dias = [...new Set(de(c).filter(e => e.tipo === 'franco_dia').flatMap(e => e.dias?.length ? e.dias : [Number(e.valor)]).filter(d => d >= 0 && d < 7))].sort()
    if (dias.length > 1) motivos.push(`${c.nombre} tiene franco cargado ${dias.length} días (${lista(dias.map(d => DIAS[d]))}), pero cada cajero tiene un solo franco por semana. Dejale uno solo.`)
    for (const d of dias) francosPorDia[d].push(c.nombre)
  }
  francosPorDia.forEach((nombres, d) => {
    const max = op.maxFrancosPorDia?.[d] ?? op.maxFrancosDia
    if (max !== undefined && nombres.length > max) {
      const aux = op.supervisoresDeFranco?.[d] ?? 0
      const tope = aux ? `el máximo es ${max + aux} personas por día y ese día ya ${aux === 1 ? 'está de franco un supervisor' : `están de franco ${aux} supervisores`}` : `el máximo es ${max} por día`
      motivos.push(`El ${DIAS[d]} tienen franco ${nombres.length} cajeros (${lista(nombres)}) y ${tope}. Quitá ${nombres.length - max === 1 ? 'un franco' : `${nombres.length - max} francos`} de ese día o cambiá el máximo en Configuración → Francos.`)
    }
  })
  // Todos los cajeros de franco el mismo día no se puede ni sin máximo.
  francosPorDia.forEach((nombres, d) => {
    if (activos.length > 0 && nombres.length >= activos.length && (op.maxFrancosPorDia?.[d] ?? op.maxFrancosDia) === undefined) {
      motivos.push(`El ${DIAS[d]} tienen franco todos los cajeros: no queda nadie para atender las cajas.`)
    }
  })

  // Horarios que se contradicen para una misma persona.
  for (const c of activos) {
    const ex = de(c)
    const noAntes = Math.max(...ex.filter(e => e.tipo === 'no_antes_de').map(e => aMin(e.valor)), -Infinity)
    const noDespues = Math.min(...ex.filter(e => e.tipo === 'no_despues_de').map(e => aMin(e.valor)), Infinity)
    const iniHasta = Math.min(...ex.filter(e => e.tipo === 'inicio_no_despues_de').map(e => aMin(e.valor)), Infinity)
    const hh = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    if (Number.isFinite(noAntes) && Number.isFinite(noDespues) && noDespues - noAntes < 4 * 60) {
      motivos.push(`${c.nombre} no puede entrar antes de las ${hh(noAntes)} ni salir después de las ${hh(noDespues)}: no entra ninguna jornada en ese horario. Revisá sus cambios o sus reglas por persona.`)
    }
    if (Number.isFinite(noAntes) && Number.isFinite(iniHasta) && iniHasta < noAntes) {
      motivos.push(`${c.nombre} tiene que entrar antes de las ${hh(iniHasta)} pero no puede entrar antes de las ${hh(noAntes)}. Revisá sus cambios o sus reglas por persona.`)
    }
  }
  return [...new Set(motivos)]
}

/** Motivos del motor (sin códigos, con nombres) para el caso en que no hay ninguna propuesta válida. */
export function explicarSinPropuesta(conflictos: Array<{ origen?: string; codigo: string; detalle?: string }>, nombrePorId: Record<string, string>): string {
  const ids = Object.keys(nombrePorId).sort((a, b) => b.length - a.length)
  const conNombres = (t: string) => ids.reduce((s, id) => s.split(id).join(nombrePorId[id]), t)
  const legibles = [...new Set(conflictos
    .filter(c => c.detalle && c.origen !== 'TRANSPORTE' && !/^\s*[{[]/.test(c.detalle))
    .map(c => conNombres(c.detalle!).trim()))]
    .slice(0, 5)
  const base = 'No se pudo armar un horario que cumpla todas las reglas con los cambios de esta semana. No se relajó ninguna regla.'
  const que = 'Revisá los cambios de esta semana (francos y horarios) y las reglas por persona en Configuración, y volvé a generar.'
  return legibles.length ? `${base}\nLo que no se pudo cumplir:\n${legibles.map(l => `• ${l}`).join('\n')}\n${que}` : `${base}\n${que}`
}
