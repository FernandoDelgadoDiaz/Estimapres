// Utilidades para trabajar con horas en formato HH:MM

export function minutosDesdeMedianoche(hora: string): number {
  const [horas, minutos] = hora.split(':').map(Number)
  return horas * 60 + minutos
}

export function formatoHoraDesdeMinutos(minutos: number): string {
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

export function diferenciaHoras(inicio: string, fin: string): number {
  const inicioMin = minutosDesdeMedianoche(inicio)
  const finMin = minutosDesdeMedianoche(fin)
  return (finMin - inicioMin) / 60
}

export function sumarMinutos(hora: string, minutos: number): string {
  const totalMin = minutosDesdeMedianoche(hora) + minutos
  return formatoHoraDesdeMinutos(totalMin)
}

export function esHoraValida(hora: string): boolean {
  return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(hora)
}

export function generarFranjasHorarias(): string[] {
  const franjas: string[] = []
  for (let h = 7; h <= 22; h++) {
    for (let m = 0; m < 60; m += 30) {
      franjas.push(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`)
    }
  }
  return franjas
}

export function formatoTurno(turnos: { inicio: string; fin: string }[]): string {
  if (turnos.length === 0) return 'FRANCO'
  if (turnos.length === 1) {
    return `${turnos[0].inicio}-${turnos[0].fin}`
  }
  return turnos.map(t => `${t.inicio}-${t.fin}`).join(' | ')
}