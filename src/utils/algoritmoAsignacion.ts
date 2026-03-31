import { Franja, Colaborador, ExcepcionSemanal, JornadaAsignada, Turno, HorarioColaborador, Auxiliar, Eventual, ResultadoAsignacion } from '../types'

// ========================================
// FUNCIONES AUXILIARES
// ========================================

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`
}

function parsearHorarioDia(horario: string):
  { turnos: Turno[], horas: number, esFranco: boolean } {
  if (!horario || !horario.trim()) {
    return { turnos: [], horas: 0, esFranco: true }
  }
  const bloques = horario.split('|').map(b => b.trim()).filter(Boolean)
  const turnos: Turno[] = []
  let horas = 0
  for (const bloque of bloques) {
    const partes = bloque.split('-').map(s => s.trim())
    if (partes.length < 2) continue
    const inicio = partes[0].includes(':') ? partes[0] :
      `${partes[0].padStart(2,'0')}:00`
    const fin = partes[1].includes(':') ? partes[1] :
      `${partes[1].padStart(2,'0')}:00`
    turnos.push({ inicio, fin })
    horas += (timeToMinutes(fin) - timeToMinutes(inicio)) / 60
  }
  turnos.sort((a,b) => timeToMinutes(a.inicio) - timeToMinutes(b.inicio))
  return { turnos, horas, esFranco: false }
}

function calcularNecesidadDia(
  necesidad: Franja[],
  dia: number,
  franjaInicio?: string,
  franjaFin?: string
): number {
  return necesidad.reduce((sum, f) => {
    if (franjaInicio && timeToMinutes(f.hora) < timeToMinutes(franjaInicio))
      return sum
    if (franjaFin && timeToMinutes(f.hora) >= timeToMinutes(franjaFin))
      return sum
    return sum + (f.necesidad[dia] || 0)
  }, 0)
}

function franjaEnTurno(franja: string, turnos: Turno[]): boolean {
  const franjaMin = timeToMinutes(franja)
  return turnos.some(t =>
    franjaMin >= timeToMinutes(t.inicio) &&
    franjaMin < timeToMinutes(t.fin)
  )
}

function calcularCobertura(
  horarios: HorarioColaborador[],
  necesidad: Franja[]
): number[][] {
  const cob = necesidad.map(() => Array(7).fill(0))
  for (const h of horarios) {
    for (const j of h.jornadas) {
      if (j.esFranco || !j.turnos.length) continue
      for (let fi = 0; fi < necesidad.length; fi++) {
        if (franjaEnTurno(necesidad[fi].hora, j.turnos)) {
          cob[fi][j.dia]++
        }
      }
    }
  }
  return cob
}

function necesidadEnFranja(necesidad: Franja[], dia: number, franja: string): number {
  const franjaObj = necesidad.find(f => f.hora === franja)
  return franjaObj ? franjaObj.necesidad[dia] || 0 : 0
}

function obtenerExcepcion(
  excepciones: ExcepcionSemanal[],
  colaboradorNombre: string,
  tipo: ExcepcionSemanal['tipo']
): ExcepcionSemanal | undefined {
  return excepciones.find(e =>
    e.colaboradorNombre === colaboradorNombre && e.tipo === tipo
  )
}

function aplicarExcepcionesHorario(
  inicioMin: number,
  finMin: number,
  exNoAntes?: ExcepcionSemanal,
  exNoDespues?: ExcepcionSemanal,
  exSiempreCierre?: ExcepcionSemanal,
  exSoloMatutino?: ExcepcionSemanal,
  exSoloNocturno?: ExcepcionSemanal
): { inicioMinAjustado: number; finMinAjustado: number; errores: string[] } {
  let inicioMinAjustado = inicioMin
  let finMinAjustado = finMin
  const errores: string[] = []
  const DURACION_MINIMA = 60 // 1 hora

  // 1. siempre_cierre – forzar fin a 22:30 (prioridad máxima)
  if (exSiempreCierre) {
    const cierre = timeToMinutes('22:30')
    inicioMinAjustado = cierre - (finMinAjustado - inicioMinAjustado) // mantener duración
    finMinAjustado = cierre
  }

  // 2. no_antes_de – desplazar inicio si es necesario
  if (exNoAntes && exNoAntes.valor) {
    const limite = timeToMinutes(exNoAntes.valor)
    if (inicioMinAjustado < limite) {
      const desplaza = limite - inicioMinAjustado
      inicioMinAjustado += desplaza
      finMinAjustado += desplaza
    }
  }

  // 3. no_despues_de – desplazar fin si es necesario (ignorar si siempre_cierre presente)
  if (exNoDespues && exNoDespues.valor && !exSiempreCierre) {
    const limite = timeToMinutes(exNoDespues.valor)
    if (finMinAjustado > limite) {
      const exceso = finMinAjustado - limite
      finMinAjustado -= exceso
      inicioMinAjustado = Math.max(inicioMinAjustado - exceso, 0)
    }
  }

  // 4. solo_matutino – asegurar fin ≤ 15:00 (a menos que siempre_cierre lo anule)
  if (exSoloMatutino && !exSiempreCierre) {
    const limite = timeToMinutes('15:00')
    if (finMinAjustado > limite) {
      const exceso = finMinAjustado - limite
      finMinAjustado = limite
      inicioMinAjustado = Math.max(inicioMinAjustado - exceso, 0)
    }
  }

  // 5. solo_nocturno – asegurar inicio ≥ 17:00
  if (exSoloNocturno) {
    const limite = timeToMinutes('17:00')
    if (inicioMinAjustado < limite) {
      const desplaza = limite - inicioMinAjustado
      inicioMinAjustado = limite
      finMinAjustado += desplaza
    }
  }

  // Validar duración mínima
  const duracion = finMinAjustado - inicioMinAjustado
  if (duracion < DURACION_MINIMA) {
    errores.push('Excepción hace imposible asignar jornada de duración mínima (1 hora)')
    // Intentar ajustar ignorando la excepción menos prioritaria
    // Por simplicidad, revertir al horario original
    inicioMinAjustado = inicioMin
    finMinAjustado = finMin
  }

  return { inicioMinAjustado, finMinAjustado, errores }
}

// ========================================
// PASO 1 — ASIGNAR FRANCOS
// ========================================

function asignarFrancos(
  cajeros: Colaborador[],
  necesidad: Franja[],
  excepciones: ExcepcionSemanal[]
): Map<string, number> {
  const francosMap = new Map<string, number>()
  const francosPorDia = Array(7).fill(0)
  const francosFullPorDia = Array(7).fill(0)

  for (const cajero of cajeros) {
    if (cajero.tipo === 'AUX') continue

    // Verificar excepción de franco
    const excepcion = excepciones.find(e =>
      e.colaboradorNombre === cajero.nombre &&
      e.tipo === 'franco_dia'
    )
    if (excepcion && excepcion.valor !== undefined) {
      const diaExcepcion = parseInt(excepcion.valor || '0')
      francosMap.set(cajero.id, diaExcepcion)
      francosPorDia[diaExcepcion]++
      if (cajero.tipo === 'FULL') {
        francosFullPorDia[diaExcepcion]++
      }
      continue
    }

    // Elegir día con menor necesidad respetando límites
    const necesidadPorDia = Array.from({length: 7}, (_, di) =>
      calcularNecesidadDia(necesidad, di)
    )
    const diasOrdenados = Array.from({length: 7}, (_, i) => i)
      .sort((a, b) => necesidadPorDia[a] - necesidadPorDia[b])

    let diaElegido = -1
    for (const dia of diasOrdenados) {
      // Límites diferentes según tipo
      if (cajero.tipo === 'FULL') {
        // FULL: máximo 1 FULL por día y máximo 2 cajeros totales por día
        if (francosFullPorDia[dia] < 1 && francosPorDia[dia] < 2) {
          diaElegido = dia
          break
        }
      } else {
        // PART: máximo 2 cajeros totales por día
        if (francosPorDia[dia] < 2) {
          diaElegido = dia
          break
        }
      }
    }
    if (diaElegido === -1) diaElegido = diasOrdenados[0]

    francosMap.set(cajero.id, diaElegido)
    francosPorDia[diaElegido]++
    if (cajero.tipo === 'FULL') {
      francosFullPorDia[diaElegido]++
    }
  }

  return francosMap
}

// ========================================
// PASO 2 — ASIGNAR JORNADAS FULL
// ========================================

function asignarJornadasFull(
  _cajero: Colaborador,
  franco: number,
  necesidad: Franja[],
  cajerosHasta2230PorDia: number[] = Array(7).fill(0),
  cupo2200PorDia: number[] = Array(7).fill(0),
  indiceFull: number = 0,
  excepciones: ExcepcionSemanal[] = [],
  errores: string[] = []
): JornadaAsignada[] {
  const exNoAntes = obtenerExcepcion(excepciones, _cajero.nombre, 'no_antes_de')
  const exNoDespues = obtenerExcepcion(excepciones, _cajero.nombre, 'no_despues_de')
  const exSiempreCierre = obtenerExcepcion(excepciones, _cajero.nombre, 'siempre_cierre')
  const exSoloMatutino = obtenerExcepcion(excepciones, _cajero.nombre, 'solo_matutino')
  const exSoloNocturno = obtenerExcepcion(excepciones, _cajero.nombre, 'solo_nocturno')

  const diasTrabajados = Array.from({length: 7}, (_, i) => i)
    .filter(d => d !== franco)

  // Ordenar por necesidad tarde descendente
  const necesidadTarde = diasTrabajados.map(d => ({
    dia: d,
    nec: calcularNecesidadDia(necesidad, d, '17:00', '22:00')
  })).sort((a, b) => b.nec - a.nec)

  // Distribuir: top3=9h, mid2=8h, bottom1=5h(franco_medio)
  const distribucion = new Map<number, number>()
  const duraciones = [9,9,9,8,8,5]
  const desplazamiento = indiceFull % 2
  necesidadTarde.forEach((item, idx) => {
    const pos = (idx + desplazamiento) % duraciones.length
    distribucion.set(item.dia, duraciones[pos])
  })

  const jornadas: JornadaAsignada[] = []
  let finDiaAnterior = -1
  let diaAnterior = -1

  for (let dia = 0; dia < 7; dia++) {
    if (dia === franco) {
      jornadas.push({
        dia, esFranco: true, turnos: [], horas: 0, rol: 'franco'
      })
      finDiaAnterior = -1
      diaAnterior = dia
      continue
    }

    const horas = distribucion.get(dia) || 8
    const esFrancoMedio = horas === 5

    // Horarios base según duración
    let inicioMin = horas === 9 ? timeToMinutes('13:30') :
                    horas === 8 ? timeToMinutes('14:30') :
                    timeToMinutes('17:30')
    const duracionMin = horas * 60

    // Verificar descanso 12h con día anterior
    if (finDiaAnterior > 0 && diaAnterior === dia - 1) {
      const minimoInicio = finDiaAnterior + 12 * 60 - 24 * 60
      if (minimoInicio > inicioMin) inicioMin = minimoInicio
    }

    const finMin = inicioMin + duracionMin

    // Aplicar excepciones
    const { inicioMinAjustado, finMinAjustado, errores: erroresEx } = aplicarExcepcionesHorario(
      inicioMin, finMin, exNoAntes, exNoDespues, exSiempreCierre, exSoloMatutino, exSoloNocturno
    )
    if (erroresEx.length > 0 && errores) {
      errores.push(...erroresEx)
    }

    const cupo2200 = cupo2200PorDia[dia]
    let finMinAjustada = finMinAjustado
    // Si hay excepción siempre_cierre, forzar fin a 22:30 sin verificar cupo
    if (exSiempreCierre) {
      finMinAjustada = timeToMinutes('22:30')
      cajerosHasta2230PorDia[dia]++
    } else if (finMinAjustado >= timeToMinutes('22:00')) {
      // La jornada llega al menos a las 22:00
      if (cajerosHasta2230PorDia[dia] < cupo2200) {
        // Aún hay cupo para cajeros hasta las 22:30
        finMinAjustada = Math.min(finMinAjustado, timeToMinutes('22:30'))
      } else {
        // No hay cupo, terminar a las 22:00
        finMinAjustada = Math.min(finMinAjustado, timeToMinutes('22:00'))
      }
    } // else: la jornada termina antes de 22:00, no se ajusta
    const inicio = minutesToTime(inicioMinAjustado)
    const fin = minutesToTime(finMinAjustada)
    if (finMinAjustada === timeToMinutes('22:30') && !exSiempreCierre) {
      cajerosHasta2230PorDia[dia]++
    }

    jornadas.push({
      dia,
      esFranco: false,
      turnos: [{ inicio, fin }],
      horas,
      rol: esFrancoMedio ? 'franco_medio' : 'cajero'
    })

    finDiaAnterior = timeToMinutes(fin)
    diaAnterior = dia
  }

  return jornadas
}

// ========================================
// PASO 3 — ASIGNAR JORNADAS PART
// ========================================

const PART_TARDE = [
  'claudia altamirano', 'giuliana ciarlante',
  'mariana soruco', 'martina beron'
]
const PART_MANANA = [
  'ignacio barrios', 'jorgelina nanez', 'tobias benitez'
]

function getTurnoPartTime(cajero: Colaborador): 'tarde' | 'manana' {
  const nombre = cajero.nombre.toLowerCase()
  if (PART_MANANA.some(n => nombre.includes(n.split(' ')[0])))
    return 'manana'
  return 'tarde'
}

function asignarJornadasPart(
  cajero: Colaborador,
  franco: number,
  necesidad: Franja[],
  cajerosHasta2230PorDia: number[] = Array(7).fill(0),
  cupo2200PorDia: number[] = Array(7).fill(0),
  excepciones: ExcepcionSemanal[] = [],
  errores: string[] = []
): JornadaAsignada[] {
  const turno = getTurnoPartTime(cajero)
  // Obtener excepciones, filtrando incompatibilidades según turno
  const exNoAntes = obtenerExcepcion(excepciones, cajero.nombre, 'no_antes_de')
  const exNoDespues = obtenerExcepcion(excepciones, cajero.nombre, 'no_despues_de')
  const exSiempreCierre = turno === 'tarde' ? obtenerExcepcion(excepciones, cajero.nombre, 'siempre_cierre') : undefined
  const exSoloMatutino = turno === 'manana' ? obtenerExcepcion(excepciones, cajero.nombre, 'solo_matutino') : undefined
  const exSoloNocturno = turno === 'tarde' ? obtenerExcepcion(excepciones, cajero.nombre, 'solo_nocturno') : undefined
  const diasTrabajados = Array.from({length: 7}, (_, i) => i)
    .filter(d => d !== franco)

  const franjaRef = turno === 'tarde' ?
    { ini: '17:00', fin: '22:30' } :
    { ini: '09:00', fin: '14:00' }

  // Ordenar días por necesidad en su franja
  const diasOrdenados = diasTrabajados
    .map(d => ({
      dia: d,
      nec: calcularNecesidadDia(necesidad, d, franjaRef.ini, franjaRef.fin)
    }))
    .sort((a, b) => b.nec - a.nec)

  // Distribuir 32h en 6 días: 2 días de 6h + 4 días de 5h
  const horasPorDia = new Map<number, number>()
  diasOrdenados.forEach((item, idx) => {
    horasPorDia.set(item.dia, idx < 2 ? 6 : 5)
  })

  // Verificar suma = 32h
  const totalHoras = Array.from(horasPorDia.values())
    .reduce((s, h) => s + h, 0)
  if (totalHoras !== 32) {
    // Ajustar último día
    const ultimoDia = diasOrdenados[diasOrdenados.length - 1].dia
    const diff = 32 - totalHoras
    horasPorDia.set(ultimoDia, (horasPorDia.get(ultimoDia) || 5) + diff)
  }

  const jornadas: JornadaAsignada[] = []
  let finDiaAnterior = -1
  let diaAnterior = -1

  for (let dia = 0; dia < 7; dia++) {
    if (dia === franco) {
      jornadas.push({
        dia, esFranco: true, turnos: [], horas: 0, rol: 'franco'
      })
      finDiaAnterior = -1
      diaAnterior = dia
      continue
    }

    const horas = horasPorDia.get(dia) || 5

    let inicioMin: number
    let finMin: number

    let inicioMinBase: number
    let finMinBase: number
    if (turno === 'tarde') {
      // PART tarde compite por cupo para cubrir franja 22:00-22:30
      const cupo2200 = cupo2200PorDia[dia]
      if (exSiempreCierre) {
        // Siempre cierre: forzar fin a 22:30 sin verificar cupo
        finMinBase = timeToMinutes('22:30')
        cajerosHasta2230PorDia[dia]++
      } else if (cajerosHasta2230PorDia[dia] < cupo2200) {
        // Aún hay cupo para cajeros hasta las 22:30
        finMinBase = timeToMinutes('22:30')
        cajerosHasta2230PorDia[dia]++
      } else {
        // No hay cupo, terminar a las 22:00
        finMinBase = timeToMinutes('22:00')
      }
      inicioMinBase = finMinBase - horas * 60
    } else {
      inicioMinBase = timeToMinutes('09:00')
      // Verificar descanso con día anterior
      if (finDiaAnterior > 0 && diaAnterior === dia - 1) {
        const minimoInicio = finDiaAnterior + 12 * 60 - 24 * 60
        if (minimoInicio > inicioMinBase) inicioMinBase = minimoInicio
      }
      finMinBase = inicioMinBase + horas * 60
    }

    // Aplicar excepciones compatibles
    const { inicioMinAjustado, finMinAjustado, errores: erroresEx } = aplicarExcepcionesHorario(
      inicioMinBase, finMinBase, exNoAntes, exNoDespues, exSiempreCierre, exSoloMatutino, exSoloNocturno
    )
    if (erroresEx.length > 0 && errores) {
      errores.push(...erroresEx)
    }
    inicioMin = inicioMinAjustado
    finMin = finMinAjustado

    const inicio = minutesToTime(inicioMin)
    const fin = minutesToTime(finMin)

    jornadas.push({
      dia,
      esFranco: false,
      turnos: [{ inicio, fin }],
      horas,
      rol: 'cajero'
    })

    finDiaAnterior = timeToMinutes(fin)
    diaAnterior = dia
  }

  return jornadas
}

// ========================================
// PASO 5 — ASIGNAR AUXILIARES
// ========================================

function asignarAuxiliares(
  auxiliares: Auxiliar[],
  horariosCajeros: HorarioColaborador[],
  necesidad: Franja[]
): HorarioColaborador[] {
  let cobertura = calcularCobertura(horariosCajeros, necesidad)
  const horariosAux: HorarioColaborador[] = []

  // Precalcular auxiliares reservados para cierre por día
  const auxReservadosCierrePorDia: Set<string>[] = Array.from({ length: 7 }, () => new Set())
  for (let dia = 0; dia < 7; dia++) {
    // Filtrar auxiliares activos con disponibilidad hasta 23:00 este día
    const auxConCierre = auxiliares.filter(aux => {
      if (!aux.activo) return false
      const horarioDia = aux.horarioSemanal[dia]
      if (!horarioDia || !horarioDia.trim()) return false
      const { turnos } = parsearHorarioDia(horarioDia)
      return turnos.some(t => timeToMinutes(t.fin) >= timeToMinutes('23:00'))
    })
    // Seleccionar hasta 2 auxiliares (los primeros en la lista)
    const auxReservados = auxConCierre.slice(0, 2)
    auxReservados.forEach(aux => auxReservadosCierrePorDia[dia].add(aux.id))
  }

  for (const aux of auxiliares) {
    if (!aux.activo) continue

    const jornadas: JornadaAsignada[] = []

    // Identificar franco del auxiliar (día con horario vacío)
    const diaFranco = aux.horarioSemanal.findIndex(h => !h || !h.trim())

    for (let dia = 0; dia < 7; dia++) {
      // Si es franco del auxiliar
      if (dia === diaFranco) {
        jornadas.push({
          dia, esFranco: true, turnos: [], horas: 0, rol: 'franco'
        })
        continue
      }

      const horarioDia = aux.horarioSemanal[dia]
      const { turnos: turnosDisponibles, esFranco } =
        parsearHorarioDia(horarioDia)

      if (esFranco || !turnosDisponibles.length) {
        jornadas.push({
          dia, esFranco: false, turnos: [], horas: 0,
          rol: 'aux_supervisor'
        })
        continue
      }


      // Reservar cierre: si este auxiliar está entre los seleccionados para cierre este día
      const reservarParaCierre = auxReservadosCierrePorDia[dia].has(aux.id)

      // Franjas con bache este día
      const franjasConBache: string[] = []
      for (let fi = 0; fi < necesidad.length; fi++) {
        const bache = necesidad[fi].necesidad[dia] - cobertura[fi][dia]
        if (bache <= 0) continue

        const franjaMin = timeToMinutes(necesidad[fi].hora)

        // Franja 08:00-09:00: solo 1 AUX, sin cajeros
        if (franjaMin >= timeToMinutes('08:00') &&
            franjaMin < timeToMinutes('09:00')) {
          if (franjaEnTurno(necesidad[fi].hora, turnosDisponibles)) {
            franjasConBache.push(necesidad[fi].hora)
          }
          continue
        }

        // Si está reservado para cierre, no cubrir 22:00-23:00
        if (reservarParaCierre &&
            franjaMin >= timeToMinutes('22:00')) continue

        // Verificar disponibilidad
        if (franjaEnTurno(necesidad[fi].hora, turnosDisponibles)) {
          franjasConBache.push(necesidad[fi].hora)
        }
      }

      // Agrupar franjas consecutivas en bloques
      const turnosAsignados: Turno[] = []
      if (franjasConBache.length > 0) {
        let bloqueInicio = franjasConBache[0]
        let bloqueFin = minutesToTime(
          timeToMinutes(franjasConBache[0]) + 30
        )

        for (let i = 1; i < franjasConBache.length; i++) {
          const franjaActual = timeToMinutes(franjasConBache[i])
          const franjaAnterior = timeToMinutes(franjasConBache[i - 1])

          if (franjaActual - franjaAnterior === 30) {
            // Consecutiva, extender bloque
            bloqueFin = minutesToTime(franjaActual + 30)
          } else {
            // No consecutiva, cerrar bloque y abrir nuevo
            turnosAsignados.push({ inicio: bloqueInicio, fin: bloqueFin })
            bloqueInicio = franjasConBache[i]
            bloqueFin = minutesToTime(franjaActual + 30)
          }
        }
        turnosAsignados.push({ inicio: bloqueInicio, fin: bloqueFin })
      }

      const horasTotales = turnosAsignados.reduce((s, t) =>
        s + (timeToMinutes(t.fin) - timeToMinutes(t.inicio)) / 60, 0
      )

      jornadas.push({
        dia,
        esFranco: false,
        turnos: turnosAsignados,
        horas: horasTotales,
        rol: 'aux_supervisor'
      })

      // Actualizar cobertura con este auxiliar
      if (turnosAsignados.length > 0) {
        for (let fi = 0; fi < necesidad.length; fi++) {
          if (franjaEnTurno(necesidad[fi].hora, turnosAsignados)) {
            cobertura[fi][dia]++
          }
        }
      }
    }

    horariosAux.push({
      colaboradorId: aux.id,
      rolGeneral: 'aux_supervisor',
      jornadas,
      totalHoras: jornadas.reduce((s, j) => s + j.horas, 0),
      errores: []
    })
  }

  return horariosAux
}

// ========================================
// PASO 6 — ASIGNAR EVENTUALES
// ========================================

function asignarEventuales(
  eventuales: Eventual[],
  horariosExistentes: HorarioColaborador[],
  necesidad: Franja[]
): HorarioColaborador[] {
  let cobertura = calcularCobertura(horariosExistentes, necesidad)
  const horariosEv: HorarioColaborador[] = []

  for (const ev of eventuales) {
    if (!ev.activo) continue

    const jornadas: JornadaAsignada[] = []
    const diaFranco = ev.horarioSemanal.findIndex(h => !h || !h.trim())

    for (let dia = 0; dia < 7; dia++) {
      if (dia === diaFranco) {
        jornadas.push({
          dia, esFranco: true, turnos: [], horas: 0, rol: 'franco'
        })
        continue
      }

      const horarioDia = ev.horarioSemanal[dia]
      const { turnos: turnosDisponibles, esFranco } =
        parsearHorarioDia(horarioDia)

      if (esFranco || !turnosDisponibles.length) {
        jornadas.push({
          dia, esFranco: false, turnos: [], horas: 0,
          rol: 'eventual_sector'
        })
        continue
      }

      const franjasConBache: string[] = []
      for (let fi = 0; fi < necesidad.length; fi++) {
        const bache = necesidad[fi].necesidad[dia] - cobertura[fi][dia]
        if (bache <= 0) continue
        if (franjaEnTurno(necesidad[fi].hora, turnosDisponibles)) {
          franjasConBache.push(necesidad[fi].hora)
        }
      }

      const turnosAsignados: Turno[] = []
      if (franjasConBache.length > 0) {
        let bloqueInicio = franjasConBache[0]
        let bloqueFin = minutesToTime(
          timeToMinutes(franjasConBache[0]) + 30
        )
        for (let i = 1; i < franjasConBache.length; i++) {
          const franjaActual = timeToMinutes(franjasConBache[i])
          const franjaAnterior = timeToMinutes(franjasConBache[i - 1])
          if (franjaActual - franjaAnterior === 30) {
            bloqueFin = minutesToTime(franjaActual + 30)
          } else {
            turnosAsignados.push({ inicio: bloqueInicio, fin: bloqueFin })
            bloqueInicio = franjasConBache[i]
            bloqueFin = minutesToTime(franjaActual + 30)
          }
        }
        turnosAsignados.push({ inicio: bloqueInicio, fin: bloqueFin })
      }

      const horasTotales = turnosAsignados.reduce((s, t) =>
        s + (timeToMinutes(t.fin) - timeToMinutes(t.inicio)) / 60, 0
      )

      jornadas.push({
        dia,
        esFranco: false,
        turnos: turnosAsignados,
        horas: horasTotales,
        rol: 'eventual_sector'
      })

      if (turnosAsignados.length > 0) {
        for (let fi = 0; fi < necesidad.length; fi++) {
          if (franjaEnTurno(necesidad[fi].hora, turnosAsignados)) {
            cobertura[fi][dia]++
          }
        }
      }
    }

    horariosEv.push({
      colaboradorId: ev.id,
      rolGeneral: 'eventual_sector',
      jornadas,
      totalHoras: jornadas.reduce((s, j) => s + j.horas, 0),
      errores: []
    })
  }

  return horariosEv
}

// ========================================
// FUNCIÓN PRINCIPAL
// ========================================

export function generarHorariosDeterministicos(
  necesidad: Franja[],
  cajeros: Colaborador[],
  auxiliares: Auxiliar[],
  eventuales: Eventual[],
  _fechas: string[],
  excepciones: ExcepcionSemanal[]
): ResultadoAsignacion {

  // PASO 1: Asignar francos
  const francosMap = asignarFrancos(cajeros, necesidad, excepciones)

  // PASO 2 y 3: Asignar jornadas cajeros
  const horariosCajeros: HorarioColaborador[] = []

  const cajerosFull = cajeros.filter(
    c => c.tipo === 'FULL' && c.activo
  )
  const cajerosPart = cajeros.filter(
    c => c.tipo === 'PART' && c.activo
  )
  const cajerosHasta2230PorDia = Array(7).fill(0)
  const cupo2200PorDia = Array.from({length: 7}, (_, dia) =>
    Math.max(1, necesidadEnFranja(necesidad, dia, '22:00'))
  )

  for (let i = 0; i < cajerosFull.length; i++) {
    const cajero = cajerosFull[i]
    const franco = francosMap.get(cajero.id) ?? 0
    const erroresCajero: string[] = []
    const jornadas = asignarJornadasFull(cajero, franco, necesidad, cajerosHasta2230PorDia, cupo2200PorDia, i, excepciones, erroresCajero)
    horariosCajeros.push({
      colaboradorId: cajero.id,
      rolGeneral: 'cajero',
      jornadas,
      totalHoras: jornadas.reduce((s,j) => s + j.horas, 0),
      errores: erroresCajero
    })
  }

  for (const cajero of cajerosPart) {
    const franco = francosMap.get(cajero.id) ?? 0
    const erroresCajero: string[] = []
    const jornadas = asignarJornadasPart(cajero, franco, necesidad, cajerosHasta2230PorDia, cupo2200PorDia, excepciones, erroresCajero)
    horariosCajeros.push({
      colaboradorId: cajero.id,
      rolGeneral: 'cajero',
      jornadas,
      totalHoras: jornadas.reduce((s,j) => s + j.horas, 0),
      errores: erroresCajero
    })
  }

  // PASO 5: Asignar auxiliares
  const horariosAux = asignarAuxiliares(
    auxiliares, horariosCajeros, necesidad
  )

  // PASO 6: Asignar eventuales
  const todosHastaNow = [...horariosCajeros, ...horariosAux]
  const horariosEv = asignarEventuales(
    eventuales, todosHastaNow, necesidad
  )

  // Combinar todos
  const horarios = [...horariosCajeros, ...horariosAux, ...horariosEv]

  // Calcular cobertura final
  const coberturaFranjas = calcularCobertura(horarios, necesidad)

  // Calcular faltantes
  const faltantesFranjas = necesidad.map((f, fi) =>
    f.necesidad.map((nec, di) =>
      Math.max(0, nec - coberturaFranjas[fi][di])
    )
  )

  // Calcular porcentaje
  let franjasCubiertas = 0
  let franjasConNecesidad = 0
  for (let fi = 0; fi < necesidad.length; fi++) {
    for (let di = 0; di < 7; di++) {
      if (necesidad[fi].necesidad[di] > 0) {
        franjasConNecesidad++
        if (coberturaFranjas[fi][di] >= necesidad[fi].necesidad[di]) {
          franjasCubiertas++
        }
      }
    }
  }
  const porcentajeCobertura = franjasConNecesidad > 0
    ? Math.round((franjasCubiertas / franjasConNecesidad) * 100)
    : 100

  // Generar alertas
  const alertas: string[] = []
  const dias = ['lunes','martes','miércoles','jueves',
    'viernes','sábado','domingo']

  necesidad.forEach((franja, fi) => {
    franja.necesidad.forEach((nec, di) => {
      const diff = nec - coberturaFranjas[fi][di]
      if (diff > 0) {
        alertas.push(
          `Falta ${diff} cajero(s) en ${franja.hora} el ${dias[di]}`
        )
      }
    })
  })

  return {
    horarios,
    coberturaFranjas,
    faltantesFranjas,
    alertas,
    porcentajeCobertura
  }
}

export {
  timeToMinutes,
  minutesToTime,
  parsearHorarioDia,
  calcularNecesidadDia,
  franjaEnTurno,
  calcularCobertura,
  asignarFrancos,
  asignarJornadasFull,
  asignarJornadasPart,
  asignarAuxiliares,
  asignarEventuales,
  getTurnoPartTime,
  PART_TARDE,
  PART_MANANA
}
