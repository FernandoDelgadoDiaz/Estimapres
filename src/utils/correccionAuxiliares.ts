import { HorarioColaborador, Turno } from '../types'
import { minutosDesdeMedianoche } from './timeUtils'

// ==================== FUNCIONES AUXILIARES ====================

function esAuxiliar(rolGeneral: string): boolean {
  return rolGeneral === 'aux_supervisor' || rolGeneral === 'aux_eventual'
}

/**
 * Obtiene los auxiliares disponibles para un día específico (no franco).
 * Filtra por rolGeneral que empiece con 'aux' y que no tengan franco ese día.
 */
export function obtenerAuxiliaresDisponibles(
  horarios: HorarioColaborador[],
  dia: number
): HorarioColaborador[] {
  return horarios.filter(horario => {
    // Es auxiliar si rolGeneral es aux_supervisor o aux_eventual
    if (!esAuxiliar(horario.rolGeneral)) return false
    const jornada = horario.jornadas.find(j => j.dia === dia)
    if (!jornada) return false
    // Disponible si no es franco
    return !jornada.esFranco
  })
}

/**
 * Calcula las horas trabajadas por un auxiliar en un día específico.
 */
export function horasDia(horario: HorarioColaborador, dia: number): number {
  const jornada = horario.jornadas.find(j => j.dia === dia)
  if (!jornada || jornada.esFranco) return 0
  return jornada.horas
}

// ==================== FUNCIONES DE CORRECCIÓN ====================

/**
 * Elimina turnos inválidos para auxiliares (fin = '21:30', '22:00', '22:30').
 * Solo afecta a auxiliares (rolGeneral comienza con 'aux').
 */
export function limpiarTurnosInvalidos(horarios: HorarioColaborador[]): void {
  const turnosInvalidos = ['21:30', '22:00', '22:30']
  horarios.forEach(horario => {
    if (!esAuxiliar(horario.rolGeneral)) return
    horario.jornadas.forEach(jornada => {
      if (jornada.esFranco) return
      // Filtrar turnos cuyo fin sea inválido
      jornada.turnos = jornada.turnos.filter(turno => !turnosInvalidos.includes(turno.fin))
      // Recalcular horas después de filtrar
      if (jornada.turnos.length === 0) {
        // Si no quedan turnos, marcar como franco? No, puede que tenga otros turnos ya removidos.
        // Mejor dejar jornada vacía pero no franco (horas 0)
        jornada.horas = 0
      } else {
        const minutosTotales = jornada.turnos.reduce((sum, turno) => {
          return sum + (minutosDesdeMedianoche(turno.fin) - minutosDesdeMedianoche(turno.inicio))
        }, 0)
        jornada.horas = minutosTotales / 60
      }
    })
  })
}

/**
 * Fuerza cierre: asigna EXACTAMENTE 2 auxiliares de 21:00 a 23:00 con rol 'aux_cierre'.
 * Proceso por día:
 * 1. Obtener auxiliares disponibles (no franco).
 * 2. Eliminar cualquier turno que termine después de 21:00 (para auxiliares que no sean cierre).
 * 3. Resetear rol 'aux_cierre' a 'aux_supervisor' (para recalcular).
 * 4. Ordenar auxiliares por menor horas trabajadas ese día.
 * 5. Asignar a exactamente 2 auxiliares un turno { inicio: '21:00', fin: '23:00' }, rol 'aux_cierre', horas += 2.
 */
export function forzarCierre(horarios: HorarioColaborador[]): void {
  for (let dia = 0; dia < 7; dia++) {
    const disponibles = obtenerAuxiliaresDisponibles(horarios, dia)
    if (disponibles.length === 0) continue

    // 1. Eliminar turnos > 21:00 para todos los auxiliares disponibles
    disponibles.forEach(horario => {
      const jornada = horario.jornadas.find(j => j.dia === dia)!
      if (jornada.esFranco) return
      jornada.turnos = jornada.turnos.filter(turno => {
        const finMin = minutosDesdeMedianoche(turno.fin)
        const limiteMin = minutosDesdeMedianoche('21:00')
        return finMin <= limiteMin
      })
      // Recalcular horas
      if (jornada.turnos.length === 0) {
        jornada.horas = 0
      } else {
        const minutosTotales = jornada.turnos.reduce((sum, turno) => {
          return sum + (minutosDesdeMedianoche(turno.fin) - minutosDesdeMedianoche(turno.inicio))
        }, 0)
        jornada.horas = minutosTotales / 60
      }
    })

    // 2. Resetear rol 'aux_cierre' a 'aux_supervisor' para este día
    disponibles.forEach(horario => {
      const jornada = horario.jornadas.find(j => j.dia === dia)!
      if (jornada.rol === 'aux_cierre') {
        jornada.rol = 'aux_supervisor'
      }
    })

    // 3. Ordenar auxiliares por horas trabajadas ese día (menor a mayor)
    const ordenados = [...disponibles].sort((a, b) => horasDia(a, dia) - horasDia(b, dia))

    // 4. Asignar cierre a exactamente 2 auxiliares (o menos si no hay suficientes)
    const asignados = ordenados.slice(0, Math.min(2, ordenados.length))
    asignados.forEach(horario => {
      const jornada = horario.jornadas.find(j => j.dia === dia)!
      // Agregar turno de cierre
      const turnoCierre: Turno = { inicio: '21:00', fin: '23:00' }
      jornada.turnos.push(turnoCierre)
      // Asegurar que no haya duplicados (por si acaso)
      // Recalcular horas sumando 2 horas del turno de cierre
      const minutosTotales = jornada.turnos.reduce((sum, turno) => {
        return sum + (minutosDesdeMedianoche(turno.fin) - minutosDesdeMedianoche(turno.inicio))
      }, 0)
      jornada.horas = minutosTotales / 60
      jornada.rol = 'aux_cierre'
    })
  }
}

/**
 * Recorta turnos posteriores a las 21:00 para auxiliares que NO sean 'aux_cierre'.
 * Si un turno termina después de las 21:00, se ajusta su fin a las 21:00.
 */
export function recortarTurnosPost21(horarios: HorarioColaborador[]): void {
  const limiteMin = minutosDesdeMedianoche('21:00')
  horarios.forEach(horario => {
    if (!esAuxiliar(horario.rolGeneral)) return
    horario.jornadas.forEach(jornada => {
      if (jornada.esFranco || jornada.rol === 'aux_cierre') return
      jornada.turnos.forEach(turno => {
        const finMin = minutosDesdeMedianoche(turno.fin)
        if (finMin > limiteMin) {
          turno.fin = '21:00'
        }
      })
      // Recalcular horas después del recorte
      if (jornada.turnos.length > 0) {
        const minutosTotales = jornada.turnos.reduce((sum, turno) => {
          return sum + (minutosDesdeMedianoche(turno.fin) - minutosDesdeMedianoche(turno.inicio))
        }, 0)
        jornada.horas = minutosTotales / 60
      }
    })
  })
}

/**
 * Valida reglas globales para auxiliares y devuelve errores.
 * Por ahora, devuelve un array vacío (placeholder).
 */
export function validarReglasAuxiliaresGlobal(_horarios: HorarioColaborador[]): string[] {
  // TODO: implementar validaciones específicas
  return []
}

// ==================== FUNCIÓN PRINCIPAL ====================

/**
 * Corrección global de auxiliares.
 * 1. Clona el input.
 * 2. Aplica correcciones en orden: limpiarTurnosInvalidos, forzarCierre, recortarTurnosPost21.
 * 3. Valida reglas.
 * 4. Retorna horarios corregidos y errores.
 */
export function corregirAuxiliaresGlobal(horarios: HorarioColaborador[]): {
  horarios: HorarioColaborador[]
  errores: string[]
} {
  // 1. Clonar profundo
  const horariosClonados = structuredClone(horarios)

  // 2. Aplicar correcciones en orden
  limpiarTurnosInvalidos(horariosClonados)
  forzarCierre(horariosClonados)
  recortarTurnosPost21(horariosClonados)

  // 3. Validar
  const errores = validarReglasAuxiliaresGlobal(horariosClonados)

  return {
    horarios: horariosClonados,
    errores
  }
}