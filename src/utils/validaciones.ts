import { JornadaAsignada, Turno } from '../types'
import { minutosDesdeMedianoche, formatoHoraDesdeMinutos } from './timeUtils'

export function validarDistribucionFull(jornadas: JornadaAsignada[], tipo?: string): string[] {
  const errores: string[] = []
  if (tipo === 'AUX' || tipo === 'EVENTUAL') return []
  const diasActivos = jornadas.filter(j => !j.esFranco)

  // Contar jornadas por duración
  const conteo = diasActivos.reduce(
    (acc, j) => {
      if (j.horas === 9) acc.jornadas9++
      else if (j.horas === 8) acc.jornadas8++
      else if (j.horas === 5) acc.jornadas5++
      else acc.otras++
      return acc
    },
    { jornadas9: 0, jornadas8: 0, jornadas5: 0, otras: 0 }
  )

  if (conteo.jornadas9 !== 3) {
    errores.push(`FULL requiere 3 jornadas de 9h (tiene ${conteo.jornadas9})`)
  }
  if (conteo.jornadas8 !== 2) {
    errores.push(`FULL requiere 2 jornadas de 8h (tiene ${conteo.jornadas8})`)
  }
  if (conteo.jornadas5 !== 1) {
    errores.push(`FULL requiere 1 jornada de 5h (tiene ${conteo.jornadas5})`)
  }
  if (conteo.otras > 0) {
    errores.push(`FULL tiene ${conteo.otras} jornadas con duración no permitida`)
  }

  // Validar exactamente 1 franco
  const francos = jornadas.filter(j => j.esFranco).length
  if (francos !== 1) {
    errores.push(`Debe tener exactamente 1 franco (tiene ${francos})`)
  }

  return errores
}

export function validarJornadaCorridaPart(jornadas: JornadaAsignada[]): string[] {
  const errores: string[] = []
  const diasActivos = jornadas.filter(j => !j.esFranco)

  for (const jornada of diasActivos) {
    if (jornada.turnos.length === 0) {
      // Día activo sin turno asignado
      errores.push(`PART no tiene turno asignado (día ${jornada.dia})`)
    } else if (jornada.turnos.length > 1) {
      // Turno cortado: múltiples bloques en un mismo día
      errores.push(`PART no puede tener turno cortado (día ${jornada.dia})`)
    }
    // Si turnos.length === 1, es válido (turno corrido)
  }

  return errores
}

export function validarDescanso12h(jornadas: JornadaAsignada[]): string[] {
  const errores: string[] = []
  const diasActivos = jornadas.filter(j => !j.esFranco).sort((a, b) => a.dia - b.dia)

  for (let i = 0; i < diasActivos.length - 1; i++) {
    const hoy = diasActivos[i]
    const manana = diasActivos[i + 1]

    // Si los días no son consecutivos, no aplica descanso 12h
    if (manana.dia !== hoy.dia + 1) continue

    const finHoy = Math.max(...hoy.turnos.map(t => minutosDesdeMedianoche(t.fin)))
    const inicioManana = Math.min(...manana.turnos.map(t => minutosDesdeMedianoche(t.inicio)))

    // Ajustar si el inicio del día siguiente es antes del fin del día anterior (cruce de medianoche)
    let inicioMananaAjustado = inicioManana
    if (inicioMananaAjustado < finHoy) {
      inicioMananaAjustado += 1440 // sumar 24 horas en minutos
    }

    const descansoMinutos = inicioMananaAjustado - finHoy
    if (descansoMinutos < 720) { // 12 horas * 60 = 720 minutos
      const descansoHoras = descansoMinutos / 60
      // Obtener las horas de fin e inicio usadas en el cálculo
      const finHoyFormato = formatoHoraDesdeMinutos(finHoy)
      const inicioMananaFormato = formatoHoraDesdeMinutos(inicioManana)
      errores.push(
        `Descanso insuficiente entre día ${hoy.dia} (fin: ${finHoyFormato}) y día ${manana.dia} (inicio: ${inicioMananaFormato}): ${descansoHoras.toFixed(1)}h (< 12h)`
      )
    }
  }

  return errores
}

export function validarDescanso3hBloques(turnos: Turno[]): string[] {
  const errores: string[] = []
  if (turnos.length !== 2) return errores

  const finPrimero = minutosDesdeMedianoche(turnos[0].fin)
  const inicioSegundo = minutosDesdeMedianoche(turnos[1].inicio)

  const descansoHoras = (inicioSegundo - finPrimero) / 60
  if (descansoHoras < 3) {
    errores.push(
      `Descanso insuficiente entre bloques: ${turnos[0].fin} a ${turnos[1].inicio} (${descansoHoras}h < 3h)`
    )
  }

  return errores
}

export function validarFranco(jornadas: JornadaAsignada[], tipo?: string): string[] {
  const errores: string[] = []
  // AUX y EVENTUAL no tienen distribución fija de francos
  if (tipo === 'AUX' || tipo === 'EVENTUAL') {
    return []
  }
  const francos = jornadas.filter(j => j.esFranco).length
  if (francos !== 1) {
    errores.push(`Debe tener exactamente 1 franco (tiene ${francos})`)
  }
  return errores
}

export function validarHorasSemanales(
  jornadas: JornadaAsignada[],
  maxHoras: number,
  tipo: 'FULL' | 'PART' | 'AUX' | 'EVENTUAL'
): string[] {
  const errores: string[] = []
  // AUX y EVENTUAL no tienen distribución fija de horas
  if (tipo === 'AUX' || tipo === 'EVENTUAL') {
    return []
  }
  const totalHoras = jornadas
    .filter(j => !j.esFranco)
    .reduce((sum, j) => sum + j.horas, 0)

  if (tipo === 'PART' && totalHoras > 32) {
    errores.push(`PART supera 32h semanales (${totalHoras}h)`)
  }

  if (totalHoras > maxHoras) {
    errores.push(`Supera horas contractuales (${totalHoras}h > ${maxHoras}h)`)
  }

  return errores
}