import type { JornadaResumida } from '../types'
import { interpretarHorario } from './timeUtils'

export function minutosHorario(horario: string): number {
  const entrada = interpretarHorario(horario)
  return entrada.ok ? minutosAsignados([{ esFranco: false, turnos: entrada.turnos }]) : 0
}

export function minutosAsignados(jornadas: JornadaResumida[]): number {
  return jornadas.reduce((total, dia) => {
    if (dia.esFranco) return total
    const bloques = dia.turnos.map(t => [minutos(t.inicio), minutos(t.fin)])
      .filter(([inicio, fin]) => Number.isFinite(inicio) && fin > inicio)
      .sort(([a], [b]) => a - b)
    let hasta = 0
    for (const [inicio, fin] of bloques) {
      total += Math.max(0, fin - Math.max(hasta, inicio))
      hasta = Math.max(fin, hasta)
    }
    return total
  }, 0)
}

function minutos(hora: string) {
  const [h, m] = hora.split(':').map(Number)
  return h * 60 + m
}

export function resumenHoras(asignados: number, tipo: string, objetivo?: number) {
  const limite = typeof objetivo === 'number' && Number.isFinite(objetivo) && objetivo > 0 ? objetivo : undefined
  const diferencia = limite === undefined ? undefined : asignados - Math.round(limite * 60)
  const exceso = diferencia !== undefined && diferencia > 0
  const preventivo = tipo === 'EVENTUAL' && asignados > 48 * 60
  return { asignados, limite, diferencia, exceso, preventivo }
}

export function horasLegibles(min: number): string {
  const h = Math.floor(Math.abs(min) / 60)
  const m = Math.abs(min) % 60
  return m ? `${h} h ${m} min` : `${h} h`
}
