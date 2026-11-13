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
const EXTREMO = '(\\d{1,2})(?:[:.](\\d{2}))?\\s*(?:horas?|hrs?\\.?|hs?\\.?)?'
const INTERVALO = new RegExp(`^${EXTREMO}\\s*(?:[-–—]|a)\\s*${EXTREMO}$`, 'i')

export function interpretarHorario(valor: string, opciones: {
  mediasHoras?: boolean
  permiteMedianoche?: boolean
  maxBloques?: number
} = {}): { ok: true; turnos: { inicio: string; fin: string }[]; normalizado: string } | { ok: false; error: string } {
  const turnos: { inicio: string; fin: string }[] = []
  let finAnterior = 0
  const bloques = valor.trim() ? valor.trim().split(/\s*(?:\||;|\n|\s+y\s+)\s*/i) : []
  if (bloques.length > (opciones.maxBloques ?? Infinity)) {
    return { ok: false, error: `Se admiten hasta ${opciones.maxBloques} bloques.` }
  }
  for (const bloque of bloques) {
    const m = INTERVALO.exec(bloque)
    if (!m) return { ok: false, error: 'Ingresá inicio y fin, por ejemplo 12 a 22. Separá los bloques con «y».' }
    const [, hi, mi = '00', hf, mf = '00'] = m
    if (+hi > 23 || +hf > 23 || +mi > 59 || +mf > 59) {
      return { ok: false, error: 'Las horas van de 00 a 23 y los minutos de 00 a 59.' }
    }
    if (opciones.mediasHoras && (+mi % 30 || +mf % 30)) {
      return { ok: false, error: 'Ingresá bloques en medias horas (:00 o :30).' }
    }
    const inicio = +hi * 60 + +mi
    const fin = +hf * 60 + +mf
    if (inicio === fin) return { ok: false, error: 'El inicio y el fin no pueden coincidir.' }
    if (fin < inicio && !opciones.permiteMedianoche) {
      return { ok: false, error: 'El fin debe ser posterior al inicio. Este horario no cruza medianoche.' }
    }
    if (inicio < finAnterior) return { ok: false, error: 'Ordená los bloques y evitá superposiciones.' }
    finAnterior = fin < inicio ? fin + 1440 : fin
    turnos.push({ inicio: formatoHoraDesdeMinutos(inicio), fin: formatoHoraDesdeMinutos(fin) })
  }
  return { ok: true, turnos, normalizado: turnos.map(t => `${t.inicio}-${t.fin}`).join('|') }
}

export const opcionesHorarioMotor = { mediasHoras: true }
export const mostrarHorario = (horario: string) => horario.split('|').map(b => b.replace(/\s*[-–—]\s*/g, ' - ')).join('\n')
