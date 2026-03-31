import { HorarioColaborador, JornadaAsignada } from '../types'
import { minutosDesdeMedianoche, formatoHoraDesdeMinutos } from './timeUtils'

const MIN_START = '09:00'
const MAX_END = '22:00'
const MIN_START_MIN = minutosDesdeMedianoche(MIN_START)
const MAX_END_MIN = minutosDesdeMedianoche(MAX_END)

/**
 * Recorta una jornada para que cumpla con los límites horarios (09:00-22:00).
 * Retorna la jornada recortada y la diferencia de horas (nueva - original).
 * Asume que la jornada tiene un solo turno.
 */
function recortarJornada(jornada: JornadaAsignada): { jornada: JornadaAsignada, deltaHoras: number } {
  if (jornada.esFranco || jornada.turnos.length === 0) {
    return { jornada, deltaHoras: 0 }
  }
  const turno = jornada.turnos[0]
  const inicioMin = minutosDesdeMedianoche(turno.inicio)
  const finMin = minutosDesdeMedianoche(turno.fin)

  let nuevoInicioMin = inicioMin
  let nuevoFinMin = finMin

  // Aplicar límites
  if (nuevoInicioMin < MIN_START_MIN) {
    nuevoInicioMin = MIN_START_MIN
  }
  if (nuevoFinMin > MAX_END_MIN) {
    nuevoFinMin = MAX_END_MIN
  }

  // Asegurar que el turno tenga duración positiva
  if (nuevoFinMin <= nuevoInicioMin) {
    // Si se solapan, crear un turno mínimo de 4 horas dentro de los límites
    nuevoInicioMin = MIN_START_MIN
    nuevoFinMin = MIN_START_MIN + 4 * 60
    if (nuevoFinMin > MAX_END_MIN) {
      nuevoFinMin = MAX_END_MIN
      nuevoInicioMin = nuevoFinMin - 4 * 60
      if (nuevoInicioMin < MIN_START_MIN) {
        nuevoInicioMin = MIN_START_MIN
        nuevoFinMin = MIN_START_MIN + 4 * 60
      }
    }
  }

  const horasOriginales = jornada.horas
  const nuevasHoras = (nuevoFinMin - nuevoInicioMin) / 60
  const deltaHoras = nuevasHoras - horasOriginales

  const jornadaRecortada: JornadaAsignada = {
    ...jornada,
    turnos: [{ inicio: formatoHoraDesdeMinutos(nuevoInicioMin), fin: formatoHoraDesdeMinutos(nuevoFinMin) }],
    horas: nuevasHoras
  }

  return { jornada: jornadaRecortada, deltaHoras }
}

/**
 * Ajusta horarios de trabajadores PART TIME para asegurar exactamente 32 horas semanales
 * y cumplir con las reglas de turnos corridos.
 */
export function ajustarPartTime(horarios: HorarioColaborador[]): HorarioColaborador[] {
  return horarios.map(horario => {
    // Solo aplicamos ajuste a cajeros PART (identificados por rolGeneral 'cajero' y con jornadas de 4-6h)
    const esPart = horario.jornadas.some(j =>
      !j.esFranco && j.rol === 'cajero' && j.horas >= 4 && j.horas <= 6
    )
    const esFull = horario.jornadas.some(j => j.rol === 'franco_medio')
    if (!esPart || esFull) return horario

    // Calcular horas actuales (solo días activos, no franco)
    const horasActuales = horario.jornadas.reduce(
      (sum, j) => sum + (j.esFranco ? 0 : j.horas),
      0
    )
    const diferencia = 32 - horasActuales
    if (Math.abs(diferencia) < 0.1) return horario

    // Obtener jornadas activas (no franco, rol cajero) que podemos ajustar
    const jornadasActivas = horario.jornadas.filter(
      j => !j.esFranco && j.rol === 'cajero'
    )
    if (jornadasActivas.length === 0) return horario

    // Crear copia modificable de las jornadas
    const jornadasModificadas = [...horario.jornadas]

    // 1. Recortar jornadas que exceden los límites horarios (09:00-22:00)
    let _deltaTotalRecorte = 0 // solo para debugging
    for (let i = 0; i < jornadasModificadas.length; i++) {
      const { jornada: recortada, deltaHoras } = recortarJornada(jornadasModificadas[i])
      jornadasModificadas[i] = recortada
      _deltaTotalRecorte += deltaHoras
    }

    // 2. Normalizar jornadas que quedaron con horas <4 o >6 después del recorte
    // (las horas >6 ya fueron recortadas, pero por si acaso)
    for (let i = 0; i < jornadasModificadas.length; i++) {
      const jornada = jornadasModificadas[i]
      if (jornada.esFranco || jornada.turnos.length === 0) continue

      const inicioMin = minutosDesdeMedianoche(jornada.turnos[0].inicio)
      const horasActuales = jornada.horas
      let nuevasHoras = horasActuales

      if (horasActuales < 4) {
        // Intentar extender hasta 4h sin pasar de MAX_END
        const maxHoras = (MAX_END_MIN - inicioMin) / 60
        nuevasHoras = Math.min(4, maxHoras)
        if (nuevasHoras < 4) {
          console.warn(`Jornada día ${jornada.dia} no puede alcanzar 4h (máximo ${maxHoras.toFixed(1)}h)`)
        }
        // Si no se puede alcanzar 4h, quedará con menos (situación excepcional)
      } else if (horasActuales > 6) {
        console.warn(`Jornada día ${jornada.dia} tiene ${horasActuales}h (>6), recortando a 6h`)
        nuevasHoras = 6
      }

      if (nuevasHoras !== horasActuales) {
        const finMin = inicioMin + nuevasHoras * 60
        const finHora = formatoHoraDesdeMinutos(finMin)
        jornadasModificadas[i] = {
          ...jornada,
          turnos: [{ inicio: jornada.turnos[0].inicio, fin: finHora }],
          horas: nuevasHoras
        }
      }
    }

    // Calcular horas después de normalización
    const horasDespuesNormalizacion = jornadasModificadas.reduce(
      (sum, j) => sum + (j.esFranco ? 0 : j.horas),
      0
    )
    let diferenciaRestante = 32 - horasDespuesNormalizacion

    // Función para ajustar una jornada específica
    const ajustarJornada = (jornada: JornadaAsignada, delta: number): boolean => {
      const nuevasHoras = jornada.horas + delta
      if (nuevasHoras < 4 || nuevasHoras > 6) return false
      if (jornada.turnos.length === 0) return false

      const inicioMin = minutosDesdeMedianoche(jornada.turnos[0].inicio)
      // Validar límites de inicio
      if (inicioMin < MIN_START_MIN) {
        // El inicio ya debería haber sido recortado, pero por si acaso
        return false
      }

      const finMin = inicioMin + nuevasHoras * 60
      // Validar límite de fin
      if (finMin > MAX_END_MIN) {
        // No se puede extender más allá de 22:00
        return false
      }

      const finHora = formatoHoraDesdeMinutos(finMin)

      // Actualizar la jornada en el array (identificada por día)
      const index = jornadasModificadas.findIndex(j => j.dia === jornada.dia)
      if (index === -1) return false

      jornadasModificadas[index] = {
        ...jornada,
        turnos: [{ inicio: jornada.turnos[0].inicio, fin: finHora }],
        horas: nuevasHoras
      }
      return true
    }

    // Ajustar iterativamente en pasos de 0.5h hasta alcanzar 32h
    while (Math.abs(diferenciaRestante) >= 0.1) {
      // Obtener jornadas activas actualizadas (no franco, rol cajero)
      const jornadasAjustables = jornadasModificadas.filter(
        j => !j.esFranco && j.rol === 'cajero'
      )
      if (jornadasAjustables.length === 0) break

      // Para agregar horas: empezar por las jornadas más cortas (más capacidad para crecer)
      // Para quitar horas: empezar por las jornadas más largas (más capacidad para reducir)
      jornadasAjustables.sort((a, b) =>
        diferenciaRestante > 0 ? a.horas - b.horas : b.horas - a.horas
      )

      let ajusteRealizado = false

      for (const jornada of jornadasAjustables) {
        if (Math.abs(diferenciaRestante) < 0.1) break

        const delta = diferenciaRestante > 0 ? 0.5 : -0.5
        if (ajustarJornada(jornada, delta)) {
          diferenciaRestante -= delta
          ajusteRealizado = true
        }
      }

      // Si no se pudo realizar ningún ajuste, salir para evitar bucle infinito
      if (!ajusteRealizado) break
    }

    // Validación final: asegurar que ningún turno excede los límites horarios
    for (const jornada of jornadasModificadas) {
      if (jornada.esFranco || jornada.turnos.length === 0) continue
      const inicioMin = minutosDesdeMedianoche(jornada.turnos[0].inicio)
      const finMin = minutosDesdeMedianoche(jornada.turnos[0].fin)
      if (inicioMin < MIN_START_MIN || finMin > MAX_END_MIN) {
        console.warn(`Jornada día ${jornada.dia} excede límites: ${jornada.turnos[0].inicio}-${jornada.turnos[0].fin}`)
      }
      if (jornada.horas < 4 || jornada.horas > 6) {
        console.warn(`Jornada día ${jornada.dia} tiene ${jornada.horas}h (fuera de 4-6h)`)
      }
    }

    // Calcular total final
    const totalHorasFinal = jornadasModificadas.reduce(
      (sum, j) => sum + (j.esFranco ? 0 : j.horas),
      0
    )

    return {
      ...horario,
      jornadas: jornadasModificadas,
      totalHoras: totalHorasFinal
    }
  })
}

/**
 * Corrige descansos insuficientes entre turnos consecutivos (mínimo 12 horas).
 */
export function corregirDescansos(horarios: HorarioColaborador[]): HorarioColaborador[] {
  return horarios.map(horario => {
    const jornadasOrdenadas = [...horario.jornadas].sort((a, b) => a.dia - b.dia)
    const jornadasCorregidas = [...horario.jornadas]

    for (let i = 0; i < jornadasOrdenadas.length - 1; i++) {
      const hoy = jornadasOrdenadas[i]
      const manana = jornadasOrdenadas[i + 1]

      // Solo aplicar si días son consecutivos y ambos son días activos
      if (manana.dia !== hoy.dia + 1) continue
      if (hoy.esFranco || manana.esFranco) continue
      if (hoy.turnos.length === 0 || manana.turnos.length === 0) continue

      const finHoy = Math.max(...hoy.turnos.map(t => minutosDesdeMedianoche(t.fin)))
      const inicioManana = Math.min(...manana.turnos.map(t => minutosDesdeMedianoche(t.inicio)))

      // Ajustar si cruce de medianoche
      let inicioMananaAjustado = inicioManana
      if (inicioMananaAjustado < finHoy) {
        inicioMananaAjustado += 1440
      }

      const descansoMinutos = inicioMananaAjustado - finHoy
      if (descansoMinutos >= 720) continue // 12 horas ok

      // Necesitamos retrasar el inicio del día siguiente
      const minutosFaltantes = 720 - descansoMinutos
      const nuevoInicioManana = inicioManana + minutosFaltantes

      // Ajustar turnos del día siguiente manteniendo duraciones
      let indiceManana = -1
      for (let idx = 0; idx < jornadasCorregidas.length; idx++) {
        if (jornadasCorregidas[idx].dia === manana.dia) {
          indiceManana = idx
          break
        }
      }
      if (indiceManana === -1) continue

      const turnosOriginales = jornadasCorregidas[indiceManana].turnos
      const desplazamiento = nuevoInicioManana - inicioManana

      const turnosAjustados = turnosOriginales.map(turno => ({
        inicio: formatoHoraDesdeMinutos(minutosDesdeMedianoche(turno.inicio) + desplazamiento),
        fin: formatoHoraDesdeMinutos(minutosDesdeMedianoche(turno.fin) + desplazamiento)
      }))

      // Actualizar jornada
      jornadasCorregidas[indiceManana] = {
        ...jornadasCorregidas[indiceManana],
        turnos: turnosAjustados
      }
    }

    return {
      ...horario,
      jornadas: jornadasCorregidas
    }
  })
}

/**
 * Aplica todas las correcciones post-procesamiento a los horarios generados.
 */
export function postProcesar(horarios: HorarioColaborador[]): HorarioColaborador[] {
  let resultado = [...horarios]

  // Aplicar ajustes de PART TIME
  resultado = ajustarPartTime(resultado)

  // Corregir descansos insuficientes
  resultado = corregirDescansos(resultado)

  return resultado
}