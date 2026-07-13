// src/utils/almacen.ts
// Helpers tipados de localStorage para las capacidades configurables.
// Claves centralizadas para evitar colisiones y facilitar migración a backend.

export const CLAVES_ALMACEN = {
  reglas: 'aliada_reglas_configurables',
  historial: 'aliada_historial_semanas',
  correcciones: 'aliada_correcciones_manuales',
} as const

export const LIMITE_HISTORIAL_SEMANAS = 26 // ~6 meses
export const LIMITE_CORRECCIONES = 300

export function leerAlmacen<T>(clave: string, porDefecto: T): T {
  try {
    const crudo = localStorage.getItem(clave)
    if (!crudo) return porDefecto
    return JSON.parse(crudo) as T
  } catch (error) {
    console.error(`Error leyendo ${clave} de localStorage:`, error)
    return porDefecto
  }
}

export function guardarAlmacen<T>(clave: string, valor: T): void {
  try {
    localStorage.setItem(clave, JSON.stringify(valor))
  } catch (error) {
    console.error(`Error guardando ${clave} en localStorage:`, error)
  }
}
