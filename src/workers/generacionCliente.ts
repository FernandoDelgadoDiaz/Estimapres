import type { ResultadoAsignacion } from '../types'
import type { RespuestaGeneracion, SolicitudGeneracion } from './generacion.worker'

let siguienteId = 0

/** Devuelve null si el Worker no está disponible antes de enviar el cálculo. */
export function ejecutarEnWorker(entrada: SolicitudGeneracion['entrada'], signal?: AbortSignal): Promise<ResultadoAsignacion | null> {
  if (signal?.aborted) return Promise.reject(new DOMException('Generación cancelada', 'AbortError'))
  if (typeof Worker === 'undefined') return Promise.resolve(null)

  let worker: Worker
  try {
    worker = new Worker(new URL('./generacion.worker.ts', import.meta.url), { type: 'module' })
  } catch {
    return Promise.resolve(null)
  }
  const solicitud: SolicitudGeneracion = { id: ++siguienteId, entrada }

  return new Promise((resolve, reject) => {
    let iniciado = false
    let cerrado = false
    const cerrar = () => {
      cerrado = true
      signal?.removeEventListener('abort', cancelar)
      worker.onmessage = worker.onerror = worker.onmessageerror = null
      worker.terminate()
    }
    const cancelar = () => {
      cerrar()
      reject(new DOMException('Generación cancelada', 'AbortError'))
    }
    const fallar = () => {
      if (cerrado) return
      cerrar()
      reject(new Error('No se pudo generar el horario. Volvé a intentarlo.'))
    }

    worker.onerror = event => {
      event.preventDefault()
      if (cerrado) return
      if (iniciado) {
        fallar()
      } else {
        cerrar()
        resolve(null)
      }
    }
    worker.onmessageerror = fallar
    worker.onmessage = ({ data }: MessageEvent<RespuestaGeneracion>) => {
      if (cerrado) return
      if (data.tipo === 'listo') {
        if (iniciado) return
        try {
          worker.postMessage(solicitud)
          iniciado = true
        } catch {
          fallar()
        }
        return
      }
      if (!iniciado || data.id !== solicitud.id) return
      if (data.tipo === 'resultado') {
        cerrar()
        resolve(data.resultado)
      } else {
        fallar()
      }
    }
    signal?.addEventListener('abort', cancelar, { once: true })
  })
}
