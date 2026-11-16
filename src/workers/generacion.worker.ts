/// <reference lib="webworker" />
import type { ResultadoAsignacion } from '../types'
import { generarConMultiArranque, type EntradaMultiArranque } from '../utils/generacionMultiArranque'

export interface SolicitudGeneracion {
  id: number
  entrada: Omit<EntradaMultiArranque, 'reloj' | 'estrategias' | 'presupuestoMs'>
}

export type RespuestaGeneracion =
  | { tipo: 'listo' }
  | { tipo: 'resultado'; id: number; resultado: ResultadoAsignacion }
  | { tipo: 'error'; id: number }

const worker = self as unknown as DedicatedWorkerGlobalScope

worker.onmessage = ({ data }: MessageEvent<SolicitudGeneracion>) => {
  const { id, entrada } = data
  try {
    const { resultado } = generarConMultiArranque(entrada)
    worker.postMessage({ tipo: 'resultado', id, resultado } satisfies RespuestaGeneracion)
  } catch {
    worker.postMessage({ tipo: 'error', id } satisfies RespuestaGeneracion)
  }
}
worker.postMessage({ tipo: 'listo' } satisfies RespuestaGeneracion)
