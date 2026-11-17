/** Límite exclusivo en la grilla POM, con slot 0 a las 08:00. */
export function slotLimiteCajaEventual(hora?: string): number | undefined {
  if (!hora || !/^(?:0[89]|1[0-9]|2[0-2]):(?:00|30)$/.test(hora)) return undefined
  const [horas, minutos] = hora.split(':').map(Number)
  return (horas - 8) * 2 + minutos / 30
}

export function esMaxBloquesCajaEventual(valor?: number): valor is number {
  return typeof valor === 'number' && Number.isInteger(valor) && valor >= 1 && valor <= 15
}
