// src/utils/sucursal.ts
// Sucursal activa del supervisor. Un mismo usuario puede manejar varias
// sucursales: los datos (semanas, reglas, correcciones, aprendizajes y el
// roster local) se separan por sucursal_id. Cambiar de sucursal recarga la
// app para que todas las capas relean con el nuevo contexto.

export const SUCURSAL_POR_DEFECTO = '091'
const CLAVE_SUCURSAL = 'aliada_sucursal_actual'

export function getSucursalActual(): string {
  try {
    return localStorage.getItem(CLAVE_SUCURSAL)?.trim() || SUCURSAL_POR_DEFECTO
  } catch {
    return SUCURSAL_POR_DEFECTO
  }
}

export function setSucursalActual(sucursal: string): void {
  try {
    localStorage.setItem(CLAVE_SUCURSAL, sucursal.trim() || SUCURSAL_POR_DEFECTO)
  } catch {
    // sin localStorage (tests/SSR): no-op
  }
}

export function esSucursalPorDefecto(): boolean {
  return getSucursalActual() === SUCURSAL_POR_DEFECTO
}

/**
 * Clave de localStorage con namespace por sucursal. La sucursal por defecto
 * conserva las claves históricas (los datos existentes siguen visibles);
 * las demás usan sufijo "::<sucursal>" para no pisarse entre sí.
 */
export function claveConSucursal(base: string): string {
  const s = getSucursalActual()
  return s === SUCURSAL_POR_DEFECTO ? base : `${base}::${s}`
}
