/// <reference lib="webworker" />
import { generarConCiclo, type ContextoCiclos } from '../utils/optimizacionCiclos'
import type { EntradaMultiArranque } from '../utils/generacionMultiArranque'

export interface SolicitudCicloOffline {
  entrada: Omit<EntradaMultiArranque, 'reloj'>
  ciclo: Omit<ContextoCiclos, 'historial'> & { historial: Omit<ContextoCiclos['historial'], 'ausente'> }
}

const scope = self as unknown as DedicatedWorkerGlobalScope
scope.onmessage = ({ data }: MessageEvent<SolicitudCicloOffline>) => {
  try {
    const inicio = performance.now()
    const resultado = generarConCiclo(data.entrada, data.ciclo)
    scope.postMessage({ resultado, calculoMs: performance.now() - inicio })
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : 'Error de generación offline' })
  }
}
