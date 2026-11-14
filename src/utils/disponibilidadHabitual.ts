// src/utils/disponibilidadHabitual.ts
// AUX-01 — Disponibilidad habitual + excepciones por fecha para AUX y eventuales,
// y diagnóstico de supervisión ANTES de generar.
//
// Objetivo (AH2-008): que el supervisor no tenga que reescribir cada semana los
// horarios de AUX y la disponibilidad de eventuales. El `horarioSemanal` que ya
// existe en Colaboradores pasa a ser el PATRÓN HABITUAL; las diferencias de una
// semana concreta se cargan como EXCEPCIONES POR FECHA, con motivo y autor.
//
// Fuera de alcance (decisiones pendientes, ver Issue AUX-01): planificación
// automática de la presencia de AUX (contrato, francos, cortes, cantidad mínima
// de supervisores por franja). Este módulo no decide ningún valor laboral.

import type { Auxiliar, Eventual } from '../types'
import { fechasDeSemana } from './pomContrato'
import { construirMatrizAux } from '../algoritmo/adapter'
import { validarCobertura0922, validarPresenciaAux0809 } from '../algoritmo/reglas'

export interface ExcepcionDisponibilidad {
  colaboradorId: string
  /** yyyy-MM-dd */
  fecha: string
  /** Mismo formato que horarioSemanal: "08:00-16:00", "08:00-13:00|19:00-22:30" o "" (no disponible / franco). */
  horario: string
  motivo: string
  autor: string
  creadaEn: string
}

export type OrigenDia = 'habitual' | 'excepcion'

export interface ResolucionDisponibilidad<T> {
  personas: T[]
  /** id → origen de cada día (lunes..domingo). */
  origen: Record<string, OrigenDia[]>
  /** Excepciones descartadas o datos inválidos (no se aplican en silencio). */
  errores: string[]
}

const RANGO = /^(\d{1,2}):([03]0)-(\d{1,2}):([03]0)$/
const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

/** Valida bloques representables en medias horas, ordenados y sin superposición. */
export function horarioValido(h: string): boolean {
  if (h.trim() === '') return true
  let finAnterior = 0
  return h.split('|').every(rango => {
    const partes = RANGO.exec(rango.trim())
    if (!partes) return false
    const [, hi, mi, hf, mf] = partes.map(Number)
    const inicio = hi * 60 + mi
    const fin = hf * 60 + mf
    if (hi > 23 || hf > 23 || inicio >= fin || inicio < finAnterior) return false
    finAnterior = fin
    return true
  })
}

/**
 * Aplica las excepciones por fecha de la semana sobre el patrón habitual
 * (`horarioSemanal`) de cada persona. Devuelve copias; no modifica la entrada.
 * Excepciones duplicadas para la misma persona y fecha → se informa y no se aplica ninguna.
 */
export function resolverDisponibilidadSemana<T extends { id: string; nombre: string; horarioSemanal: string[] }>(
  personas: T[], excepciones: ExcepcionDisponibilidad[], lunes: string,
): ResolucionDisponibilidad<T> {
  const fechas = fechasDeSemana(lunes)
  const errores: string[] = []
  const origen: Record<string, OrigenDia[]> = {}
  const ids = new Set(personas.map(p => p.id))

  const porClave = new Map<string, ExcepcionDisponibilidad[]>()
  for (const x of excepciones) {
    if (!fechas.includes(x.fecha)) continue
    if (!ids.has(x.colaboradorId)) { errores.push(`Excepción del ${x.fecha} para una persona que no está en la lista.`); continue }
    if (!horarioValido(x.horario)) { errores.push(`Excepción del ${x.fecha}: horario «${x.horario}» inválido.`); continue }
    if (!x.motivo.trim() || !x.autor.trim()) { errores.push(`Excepción del ${x.fecha}: falta motivo o autor.`); continue }
    const k = `${x.colaboradorId}|${x.fecha}`
    porClave.set(k, [...(porClave.get(k) ?? []), x])
  }

  const resueltas = personas.map(p => {
    const dias = [...p.horarioSemanal]
    origen[p.id] = Array(7).fill('habitual')
    fechas.forEach((f, d) => {
      const xs = porClave.get(`${p.id}|${f}`)
      if (!xs) return
      if (xs.length > 1 && new Set(xs.map(x => x.horario)).size > 1) {
        errores.push(`${p.nombre}: ${xs.length} excepciones distintas para el ${f}; no se aplica ninguna hasta resolverlo.`)
        return
      }
      dias[d] = xs[0].horario
      origen[p.id][d] = 'excepcion'
    })
    dias.forEach((h, d) => {
      if (!horarioValido(h ?? '')) errores.push(`${p.nombre}: horario habitual del ${DIAS[d]} «${h}» inválido.`)
    })
    return { ...p, horarioSemanal: dias }
  })
  return { personas: resueltas, origen, errores }
}

export interface HuecoSupervision {
  dia: number
  tipo: 'APERTURA' | 'SUPERVISION'
  desde: string
  hasta: string
  detalle: string
}

const slotAHora = (s: number) => `${String(8 + Math.floor(s / 2)).padStart(2, '0')}:${s % 2 ? '30' : '00'}`

/**
 * Diagnóstico ANTES de generar, con la misma semántica que el motor (H-A1: con «apertura
 * solo AUX» activa, al menos un AUX presente 08:00–09:00; H-A2: al menos un AUX presente
 * cada media hora 09:00–22:00). Los huecos se informan y dejan la semana en BORRADOR; el
 * motor asigna igual el resto de la semana (#38).
 */
export function diagnosticarSupervision(auxiliares: Auxiliar[], opciones: { aperturaSoloAux?: boolean } = {}): HuecoSupervision[] {
  const presencia = Object.fromEntries(auxiliares.filter(a => a.activo).map(a => [a.id, construirMatrizAux(a.horarioSemanal.map(h => horarioValido(h ?? '') ? h : ''))]))
  const huecos: HuecoSupervision[] = []
  // #38: H-A1 (AUX en la apertura) solo existe con «apertura solo AUX» activa.
  // Desactivada, la apertura la abre un FULL/PART y no se exige AUX 08:00–09:00.
  const aperturaSoloAux = opciones.aperturaSoloAux ?? true
  for (const v of aperturaSoloAux ? validarPresenciaAux0809(presencia) : []) {
    const d = v.dia ?? 0
    huecos.push({ dia: d, tipo: 'APERTURA', desde: '08:00', hasta: '09:00', detalle: `${DIAS[d]}: ningún supervisor (AUX) presente en la apertura 08:00–09:00.` })
  }
  // Agrupar los slots sin supervisor en rangos contiguos por día
  const sinAux = new Map<number, number[]>()
  for (const v of validarCobertura0922(presencia)) {
    const slot = Number(/slot (\d+)/.exec(v.detalle)?.[1])
    sinAux.set(v.dia ?? 0, [...(sinAux.get(v.dia ?? 0) ?? []), slot])
  }
  for (const [d, slots] of [...sinAux].sort((a, b) => a[0] - b[0])) {
    slots.sort((a, b) => a - b)
    let ini = slots[0], prev = slots[0]
    const cerrar = (fin: number) => huecos.push({
      dia: d, tipo: 'SUPERVISION', desde: slotAHora(ini), hasta: slotAHora(fin + 1),
      detalle: `${DIAS[d]}: ningún supervisor (AUX) presente de ${slotAHora(ini)} a ${slotAHora(fin + 1)}.`,
    })
    for (const s of slots.slice(1)) {
      if (s !== prev + 1) { cerrar(prev); ini = s }
      prev = s
    }
    cerrar(prev)
  }
  return huecos
}

/** Conveniencia: resuelve AUX y eventuales de la semana y diagnostica la supervisión. */
export function prepararDisponibilidadSemana(
  auxiliares: Auxiliar[], eventuales: Eventual[], excepciones: ExcepcionDisponibilidad[], lunes: string,
  opciones: { aperturaSoloAux?: boolean } = {},
) {
  const auxIds = new Set(auxiliares.map(a => a.id))
  const evIds = new Set(eventuales.map(e => e.id))
  // El resolver informa ids desconocidos. Procesarlos una sola vez, con AUX.
  const aux = resolverDisponibilidadSemana(auxiliares, excepciones.filter(x => !evIds.has(x.colaboradorId)), lunes)
  const ev = resolverDisponibilidadSemana(eventuales, excepciones.filter(x => !auxIds.has(x.colaboradorId) && evIds.has(x.colaboradorId)), lunes)
  return {
    auxiliares: aux.personas, eventuales: ev.personas,
    origen: { ...aux.origen, ...ev.origen },
    errores: [...aux.errores, ...ev.errores],
    huecosSupervision: diagnosticarSupervision(aux.personas, opciones),
  }
}
