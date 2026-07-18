// src/utils/efectividad.ts
// Métricas de efectividad del sistema: ¿el motor aprende?
// La métrica reina es la cantidad de correcciones manuales por semana (debe
// bajar con el tiempo) junto con la cobertura que propone el motor sin
// intervención (debe subir). Todo se deriva de datos ya persistidos en
// Supabase (semanas_historial + correcciones_manuales): el aprendizaje es
// acumulativo y sobrevive a cambios de dispositivo o limpieza del navegador.

import type {
  SemanaHistorial,
  CorreccionManual,
  HorarioColaborador,
  AsignacionCajaColaborador,
} from '../types'
import { HORAS_FRANJAS } from '../types'
import {
  BANDAS_HORARIAS,
  type BandaHoraria,
  deltaPorBanda,
  derivarCriteriosCobertura,
  horaASlotUI,
  ultimasVersiones,
} from './preferencias'

const MS_POR_SEMANA = 7 * 24 * 60 * 60 * 1000

// ==================== COBERTURA DE UN SET DE HORARIOS ====================

function horaAMin(hora: string): number {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + (m || 0)
}

export interface CoberturaCalculada {
  /** [franja HORAS_FRANJAS][dia] cajas cubiertas */
  cobertura: number[][]
  /** % de cumplimiento: Σ min(X,Y) / Σ Y sobre celdas con necesidad */
  pct: number
}

/**
 * Cobertura real de un set de horarios contra la necesidad del PDF.
 * Cuentan como caja abierta los cajeros FULL/PART y los bloques de
 * eventuales (filas de horarios); los AUX aportan sus bloques en CAJA.
 * Misma lógica que el panel en vivo del editor (que la reutiliza).
 */
export function calcularCoberturaHorarios(
  horarios: HorarioColaborador[],
  necesidadFranjas: number[][],
  cajaAux: AsignacionCajaColaborador[] = []
): CoberturaCalculada {
  const numFranjas = HORAS_FRANJAS.length
  const cobertura: number[][] = Array.from({ length: numFranjas }, () => Array(7).fill(0))

  const filasQueCubren = horarios.filter(
    h => h.rolGeneral === 'cajero' || h.rolGeneral === 'eventual_sector'
  )
  for (let fi = 0; fi < numFranjas; fi++) {
    const t = horaAMin(HORAS_FRANJAS[fi])
    for (const h of filasQueCubren) {
      for (const j of h.jornadas) {
        if (j.esFranco) continue
        if (j.turnos.some(tu => horaAMin(tu.inicio) <= t && t < horaAMin(tu.fin))) {
          cobertura[fi][j.dia]++
        }
      }
    }
  }

  for (let fi = 0; fi < numFranjas; fi++) {
    const slot = horaASlotUI(HORAS_FRANJAS[fi])
    if (slot < 0 || slot >= 30) continue
    for (const a of cajaAux) {
      for (let dia = 0; dia < 7; dia++) {
        if (a.slotsCajaPorDia[dia]?.[slot]) cobertura[fi][dia]++
      }
    }
  }

  let cubierto = 0
  let necesario = 0
  for (let fi = 0; fi < numFranjas; fi++) {
    for (let dia = 0; dia < 7; dia++) {
      const y = necesidadFranjas[fi]?.[dia] ?? 0
      if (y <= 0) continue
      necesario += y
      cubierto += Math.min(cobertura[fi][dia], y)
    }
  }
  return { cobertura, pct: necesario > 0 ? (cubierto / necesario) * 100 : 100 }
}

// ==================== MÉTRICAS POR SEMANA ====================

export interface MetricaSemana {
  semanaId: string
  descripcion: string
  fechaLunes: string
  version: number
  /** Correcciones manuales que necesitó esa semana */
  correcciones: number
  /** % cobertura de lo que propuso el motor (snapshot al generar) */
  pctMotor: number | null
  /** % cobertura tras las ediciones del supervisor (estado actual guardado) */
  pctFinal: number | null
  /** Criterios que ya estaban ACTIVOS cuando se generó esa semana */
  criteriosActivosAlGenerar: BandaHoraria[]
  /** Bandas con señal nueva detectada EN esa semana (no activas antes) */
  criteriosNuevos: BandaHoraria[]
}

/**
 * Serie histórica de efectividad, semana a semana (última versión de cada
 * lunes, ordenada ascendente). Los criterios "activos al generar" se
 * reconstruyen retrospectivamente: solo con las correcciones ANTERIORES a la
 * generación de cada semana, evaluadas a esa fecha.
 */
export function calcularMetricasSemanales(
  semanas: SemanaHistorial[],
  correcciones: CorreccionManual[]
): MetricaSemana[] {
  const serie = ultimasVersiones(semanas).sort((a, b) => a.fechaLunes.localeCompare(b.fechaLunes))

  return serie.map(s => {
    const correccionesSemana = correcciones.filter(c => c.semanaId === s.id)

    // Criterios activos al momento de generar (solo correcciones previas)
    const previas = correcciones.filter(c => c.fecha < s.generadoEl && c.semanaId !== s.id)
    const criteriosPrevios = derivarCriteriosCobertura(previas, {
      semanas,
      ahora: new Date(s.generadoEl),
    })
    const activasAntes = criteriosPrevios.filter(c => c.estado === 'activo').map(c => c.banda)

    // Señales nuevas de esta semana: bandas con delta neto positivo acá que
    // no estaban activas antes
    const deltaSemana: Record<BandaHoraria, number> = { apertura: 0, mediodia: 0, tarde: 0, cierre: 0 }
    for (const c of correccionesSemana) {
      const d = deltaPorBanda(c)
      for (const banda of Object.keys(d) as BandaHoraria[]) deltaSemana[banda] += d[banda]
    }
    const nuevas = (Object.keys(deltaSemana) as BandaHoraria[])
      .filter(b => deltaSemana[b] > 0 && !activasAntes.includes(b))

    // Cobertura final: recalculada sobre los horarios guardados (que ya
    // incluyen todas las ediciones) contra la necesidad del PDF
    let pctFinal: number | null = null
    if (s.necesidadFranjas) {
      pctFinal = calcularCoberturaHorarios(s.horarios, s.necesidadFranjas, s.cajaAux).pct
    } else if (correccionesSemana.length === 0) {
      pctFinal = s.porcentajeCobertura ?? null // sin ediciones, final = motor
    }

    return {
      semanaId: s.id,
      descripcion: s.descripcion,
      fechaLunes: s.fechaLunes,
      version: s.version,
      correcciones: correccionesSemana.length,
      pctMotor: s.porcentajeCobertura ?? null,
      pctFinal,
      criteriosActivosAlGenerar: activasAntes,
      criteriosNuevos: nuevas,
    }
  })
}

// ==================== INDICADORES ====================

export interface IndicadoresEfectividad {
  semanasConDatos: number
  correccionesUltimaSemana: number | null
  promedioCorrecciones: number | null
  pctMotorUltimaSemana: number | null
  promedioPctMotor: number | null
  /** ¿Las correcciones vienen bajando? (comparación mitades de la serie) */
  tendenciaCorrecciones: 'mejorando' | 'estable' | 'empeorando' | null
}

export function calcularIndicadores(metricas: MetricaSemana[]): IndicadoresEfectividad {
  if (metricas.length === 0) {
    return {
      semanasConDatos: 0,
      correccionesUltimaSemana: null,
      promedioCorrecciones: null,
      pctMotorUltimaSemana: null,
      promedioPctMotor: null,
      tendenciaCorrecciones: null,
    }
  }
  const ultima = metricas[metricas.length - 1]
  const conMotor = metricas.filter(m => m.pctMotor !== null)
  const promedio = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

  let tendencia: IndicadoresEfectividad['tendenciaCorrecciones'] = null
  if (metricas.length >= 4) {
    const mitad = Math.floor(metricas.length / 2)
    const antes = promedio(metricas.slice(0, mitad).map(m => m.correcciones))
    const despues = promedio(metricas.slice(mitad).map(m => m.correcciones))
    tendencia = despues < antes - 0.5 ? 'mejorando' : despues > antes + 0.5 ? 'empeorando' : 'estable'
  }

  return {
    semanasConDatos: metricas.length,
    correccionesUltimaSemana: ultima.correcciones,
    promedioCorrecciones: promedio(metricas.map(m => m.correcciones)),
    pctMotorUltimaSemana: ultima.pctMotor,
    promedioPctMotor: conMotor.length > 0 ? promedio(conMotor.map(m => m.pctMotor as number)) : null,
    tendenciaCorrecciones: tendencia,
  }
}

// ==================== PREDICCIÓN DE MADUREZ ====================

export interface PrediccionCorrecciones {
  /** Correcciones/semana proyectadas dentro de 4 semanas (≥ 0) */
  en4Semanas: number
  /** Pendiente de la regresión (correcciones por semana adicional) */
  pendiente: number
}

/**
 * Regresión lineal simple sobre las últimas semanas (hasta 8) para proyectar
 * cuántas correcciones/semana necesitará el sistema en 4 semanas. null con
 * menos de 3 puntos (no hay tendencia confiable).
 */
export function predecirCorrecciones(metricas: MetricaSemana[]): PrediccionCorrecciones | null {
  const puntos = metricas.slice(-8).map((m, i) => ({ x: i, y: m.correcciones }))
  if (puntos.length < 3) return null
  const n = puntos.length
  const sumX = puntos.reduce((a, p) => a + p.x, 0)
  const sumY = puntos.reduce((a, p) => a + p.y, 0)
  const sumXY = puntos.reduce((a, p) => a + p.x * p.y, 0)
  const sumX2 = puntos.reduce((a, p) => a + p.x * p.x, 0)
  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return null
  const pendiente = (n * sumXY - sumX * sumY) / denom
  const intercepto = (sumY - pendiente * sumX) / n
  const en4 = Math.max(0, intercepto + pendiente * (n - 1 + 4))
  return { en4Semanas: en4, pendiente }
}

export interface MadurezBanda {
  banda: BandaHoraria
  etiqueta: string
  estado: 'madura' | 'en_ajuste' | 'sin_datos'
  /** Semanas desde la última corrección que tocó esta franja */
  semanasSinCorreccion: number | null
}

/**
 * Madurez por franja horaria: una banda está "madura" si recibió correcciones
 * alguna vez pero hace 3+ semanas que no recibe ninguna (el motor ya la
 * resuelve solo); "en ajuste" si tuvo correcciones recientes; "sin datos" si
 * nunca fue corregida.
 */
export function madurezPorBanda(
  correcciones: CorreccionManual[],
  ahora: Date = new Date()
): MadurezBanda[] {
  const ultimaPorBanda = new Map<BandaHoraria, string>()
  for (const c of correcciones) {
    const d = deltaPorBanda(c)
    const fecha = c.fecha.slice(0, 10)
    for (const banda of Object.keys(d) as BandaHoraria[]) {
      if (d[banda] === 0) continue
      const prev = ultimaPorBanda.get(banda)
      if (!prev || fecha > prev) ultimaPorBanda.set(banda, fecha)
    }
  }

  return (Object.keys(BANDAS_HORARIAS) as BandaHoraria[]).map(banda => {
    const ultima = ultimaPorBanda.get(banda)
    if (!ultima) {
      return { banda, etiqueta: BANDAS_HORARIAS[banda].etiqueta, estado: 'sin_datos' as const, semanasSinCorreccion: null }
    }
    const semanas = (ahora.getTime() - new Date(`${ultima}T00:00:00`).getTime()) / MS_POR_SEMANA
    return {
      banda,
      etiqueta: BANDAS_HORARIAS[banda].etiqueta,
      estado: semanas >= 3 ? ('madura' as const) : ('en_ajuste' as const),
      semanasSinCorreccion: Math.floor(semanas),
    }
  })
}
