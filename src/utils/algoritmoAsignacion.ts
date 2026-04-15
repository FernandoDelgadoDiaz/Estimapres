import {
  Franja,
  Colaborador,
  ExcepcionSemanal,
  JornadaAsignada,
  Turno,
  HorarioColaborador,
  Auxiliar,
  Eventual,
  ResultadoAsignacion
} from '../types'

// ========================================
// CONSTANTES GLOBALES
// ========================================

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

// ========================================
// UTILIDADES
// ========================================

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

function parsearHorarioDia(horario: string): { turnos: Turno[], horas: number, esFranco: boolean } {
  if (!horario || !horario.trim()) {
    return { turnos: [], horas: 0, esFranco: true }
  }
  const bloques = horario.split('|').map(b => b.trim()).filter(Boolean)
  const turnos: Turno[] = []
  let horas = 0
  for (const bloque of bloques) {
    const partes = bloque.split('-').map(s => s.trim())
    if (partes.length < 2) continue
    const inicio = partes[0].includes(':') ? partes[0] : `${partes[0].padStart(2, '0')}:00`
    const fin = partes[1].includes(':') ? partes[1] : `${partes[1].padStart(2, '0')}:00`
    turnos.push({ inicio, fin })
    horas += (timeToMinutes(fin) - timeToMinutes(inicio)) / 60
  }
  turnos.sort((a, b) => timeToMinutes(a.inicio) - timeToMinutes(b.inicio))
  return { turnos, horas, esFranco: false }
}

function franjaEnTurno(franja: string, turnos: Turno[]): boolean {
  const franjaMin = timeToMinutes(franja)
  return turnos.some(t =>
    franjaMin >= timeToMinutes(t.inicio) &&
    franjaMin < timeToMinutes(t.fin)
  )
}

function calcularCoberturaCajeros(horarios: HorarioColaborador[], necesidad: Franja[]): number[][] {
  const cob = necesidad.map(() => Array(7).fill(0))
  // Para evitar contar un mismo cajero dos veces en la misma franja cuando tiene turno cortado
  const yaContado = new Map<string, Set<number>>() // clave: `${colaboradorId}-${dia}` -> Set de índices de franja ya contados
  for (const h of horarios) {
    if (h.rolGeneral !== 'cajero') continue
    for (const j of h.jornadas) {
      if (j.esFranco || !j.turnos.length) continue
      const clave = `${h.colaboradorId}-${j.dia}`
      let setFrancas = yaContado.get(clave)
      if (!setFrancas) {
        setFrancas = new Set<number>()
        yaContado.set(clave, setFrancas)
      }
      for (let fi = 0; fi < necesidad.length; fi++) {
        if (franjaEnTurno(necesidad[fi].hora, j.turnos)) {
          // Si este cajero ya fue contado en esta franja este día, no incrementar
          if (!setFrancas.has(fi)) {
            cob[fi][j.dia]++
            setFrancas.add(fi)
          }
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

// ========================================
// 1. VALIDACIÓN DE FACTIBILIDAD
// ========================================

function validarFactibilidad(
  colaboradores: Colaborador[],
  auxiliares: Auxiliar[],
  eventuales: Eventual[],
  necesidad: Franja[]
): { valido: boolean; mensaje: string } {
  // Solo cajeros activos (FULL + PART) contribuyen a horas disponibles
  const cajerosActivos = colaboradores.filter(c => c.activo && (c.tipo === 'FULL' || c.tipo === 'PART'))
  const horasCajeros = cajerosActivos.reduce((sum, c) => sum + c.horasSemanales, 0)

  // Función para calcular horas disponibles de un horario semanal
  function horasDisponiblesDeHorario(horarioSemanal: string[]): number {
    let total = 0
    for (let dia = 0; dia < 7; dia++) {
      const horarioDia = horarioSemanal[dia]
      const { horas, esFranco } = parsearHorarioDia(horarioDia)
      if (!esFranco) total += horas
    }
    return total
  }

  // Horas disponibles de AUX activos
  const auxiliaresActivos = auxiliares.filter(a => a.activo)
  const horasAUX = auxiliaresActivos.reduce((sum, a) => sum + horasDisponiblesDeHorario(a.horarioSemanal), 0)

  // Horas disponibles de eventuales activos
  const eventualesActivos = eventuales.filter(e => e.activo)
  const horasEventuales = eventualesActivos.reduce((sum, e) => sum + horasDisponiblesDeHorario(e.horarioSemanal), 0)

  const horasDisponibles = horasCajeros + horasAUX + horasEventuales

  // Horas totales necesarias: cada franja es media hora, necesidad es cantidad de cajeros
  let horasNecesarias = 0
  for (const franja of necesidad) {
    for (let dia = 0; dia < 7; dia++) {
      horasNecesarias += franja.necesidad[dia] || 0
    }
  }
  // Convertir franjas de 30 minutos a horas
  horasNecesarias *= 0.5

  const umbral = horasNecesarias * 0.9 // 90%
  if (horasDisponibles < umbral) {
    return {
      valido: false,
      mensaje: `Horas insuficientes. Disponibles: ${horasDisponibles}h (Cajeros: ${horasCajeros}h, AUX: ${horasAUX}h, Eventuales: ${horasEventuales}h), Necesarias (90%): ${umbral.toFixed(1)}h (total ${horasNecesarias.toFixed(1)}h)`
    }
  }

  return {
    valido: true,
    mensaje: `Factible. Horas disponibles: ${horasDisponibles}h (Cajeros: ${horasCajeros}h, AUX: ${horasAUX}h, Eventuales: ${horasEventuales}h), necesarias: ${horasNecesarias.toFixed(1)}h`
  }
}

// ========================================
// 2. CSP: DEFINICIÓN DE VARIABLES Y DOMINIOS
// ========================================

type TurnoSymbol = 'franco' | 'mañana' | 'tarde' | 'cortado'
type AsignacionCSP = Map<string, TurnoSymbol[]> // colaboradorId -> array de 7 símbolos

/**
 * Genera dominios válidos para un cajero según su tipo y excepciones.
 * Retorna array de combinaciones (cada combinación es array de 7 símbolos).
 */
function generarDominioCajero(cajero: Colaborador, excepciones: ExcepcionSemanal[]): TurnoSymbol[][] {
  const combinaciones: TurnoSymbol[][] = []
  const exFrancoDia = obtenerExcepcion(excepciones, cajero.nombre, 'franco_dia')
  const exSoloMatutino = obtenerExcepcion(excepciones, cajero.nombre, 'solo_matutino')
  const exSoloNocturno = obtenerExcepcion(excepciones, cajero.nombre, 'solo_nocturno')

  // Si tiene excepción de franco en día fijo, restringir.
  let diasFrancoPosibles = Array.from({ length: 7 }, (_, i) => i)
  if (exFrancoDia?.valor) {
    const diaFranco = DIAS.indexOf(exFrancoDia.valor.toLowerCase())
    if (diaFranco !== -1) {
      diasFrancoPosibles = [diaFranco]
    }
  }

  if (cajero.tipo === 'FULL') {
    // FULL: 1 franco, 6 días trabajados. Distribución: 3×9h, 2×8h, 1×5h.
    // Simplificamos: asignamos símbolos 'mañana', 'tarde', 'cortado'. La duración se define luego.
    for (const francoDia of diasFrancoPosibles) {
      const diasTrabajados = Array.from({ length: 7 }, (_, i) => i).filter(d => d !== francoDia)
      // Turnos permitidos según excepciones
      let turnosPermitidos: TurnoSymbol[] = ['mañana', 'tarde', 'cortado']
      if (exSoloMatutino) turnosPermitidos = ['mañana']
      if (exSoloNocturno) turnosPermitidos = ['tarde']
      // Generar todas las secuencias de longitud 6 con repetición
      const secuencias = generarSecuencias(turnosPermitidos, 6)
      for (const secuencia of secuencias) {
        const combinacion: TurnoSymbol[] = Array(7).fill('franco')
        combinacion[francoDia] = 'franco'
        for (let i = 0; i < diasTrabajados.length; i++) {
          combinacion[diasTrabajados[i]] = secuencia[i]
        }
        combinaciones.push(combinacion)
      }
    }
  } else if (cajero.tipo === 'PART') {
    // PART: 1 franco, 6 días trabajados, mínimo 2 mañanas, total ≤31h, jornadas 4‑6h.
    for (const francoDia of diasFrancoPosibles) {
      const diasTrabajados = Array.from({ length: 7 }, (_, i) => i).filter(d => d !== francoDia)
      let turnosPermitidos: TurnoSymbol[] = ['mañana', 'tarde']
      if (exSoloMatutino) turnosPermitidos = ['mañana']
      if (exSoloNocturno) turnosPermitidos = ['tarde']
      const secuencias = generarSecuencias(turnosPermitidos, 6)
      for (const secuencia of secuencias) {
        const mañanas = secuencia.filter(t => t === 'mañana').length
        if (mañanas < 2) continue
        const combinacion: TurnoSymbol[] = Array(7).fill('franco')
        combinacion[francoDia] = 'franco'
        for (let i = 0; i < diasTrabajados.length; i++) {
          combinacion[diasTrabajados[i]] = secuencia[i]
        }
        combinaciones.push(combinacion)
      }
    }
  }
  return combinaciones
}

/**
 * Genera todas las secuencias de longitud n con elementos del conjunto dado (con repetición)
 */
function generarSecuencias<T>(conjunto: T[], n: number): T[][] {
  const resultados: T[][] = []
  const backtrack = (pos: number, actual: T[]) => {
    if (pos === n) {
      resultados.push([...actual])
      return
    }
    for (const elem of conjunto) {
      actual.push(elem)
      backtrack(pos + 1, actual)
      actual.pop()
    }
  }
  backtrack(0, [])
  return resultados
}

// ========================================
// 3. RESTRICCIONES GLOBALES
// ========================================

/**
 * Restricción global: máximo 2 cajeros con franco el mismo día.
 * Además, máximo 1 FULL por día (regla adicional).
 */
function cumpleRestriccionesGlobales(asignacion: AsignacionCSP, cajeros: Colaborador[]): boolean {
  // Mapa colaboradorId -> tipo
  const tipoPorId = new Map(cajeros.map(c => [c.id, c.tipo]))

  for (let dia = 0; dia < 7; dia++) {
    let francos = 0
    let fullFrancos = 0
    for (const [id, turnos] of Array.from(asignacion)) {
      if (turnos[dia] === 'franco') {
        francos++
        if (tipoPorId.get(id) === 'FULL') fullFrancos++
      }
    }
    if (francos > 2) return false
    if (fullFrancos > 1) return false
  }
  return true
}

// ========================================
// 4. BACKTRACKING CSP (MRV + HEURÍSTICAS)
// ========================================

function resolverCSP(
  cajeros: Colaborador[],
  dominios: Map<string, TurnoSymbol[][]>,
  _excepciones: ExcepcionSemanal[]
): AsignacionCSP | null {
  const asignacion = new Map<string, TurnoSymbol[]>()
  // Ordenar cajeros por menor dominio (MRV)
  const indices = cajeros.map((_, i) => i)
  indices.sort((a, b) => {
    const domA = dominios.get(cajeros[a].id)?.length || Infinity
    const domB = dominios.get(cajeros[b].id)?.length || Infinity
    return domA - domB
  })

  const backtrack = (idx: number): boolean => {
    if (idx === indices.length) {
      return true
    }
    const cajero = cajeros[indices[idx]]
    const dominio = dominios.get(cajero.id) || []
    // Ordenar valores por heurística: preferir combinaciones que agreguen menos francos en días ya cargados
    dominio.sort((a, b) => {
      let costoA = 0
      let costoB = 0
      for (let dia = 0; dia < 7; dia++) {
        if (a[dia] === 'franco') {
          // Contar francos existentes en este día
          let francosExistentes = 0
          for (const turnos of Array.from(asignacion.values())) {
            if (turnos[dia] === 'franco') francosExistentes++
          }
          costoA += francosExistentes
        }
        if (b[dia] === 'franco') {
          let francosExistentes = 0
          for (const turnos of Array.from(asignacion.values())) {
            if (turnos[dia] === 'franco') francosExistentes++
          }
          costoB += francosExistentes
        }
      }
      return costoA - costoB
    })

    for (const combinacion of dominio) {
      asignacion.set(cajero.id, combinacion)
      if (cumpleRestriccionesGlobales(asignacion, cajeros)) {
        if (backtrack(idx + 1)) {
          return true
        }
      }
      asignacion.delete(cajero.id)
    }
    return false
  }

  if (backtrack(0)) {
    return asignacion
  }
  return null
}

// ========================================
// 5. CONVERSIÓN A HORARIOS CONCRETOS
// ========================================

/**
 * Convierte asignación simbólica en horarios reales, respetando duraciones, descansos y excepciones.
 */
function convertirAsignacionAHorarios(
  asignacion: AsignacionCSP,
  cajeros: Colaborador[],
  necesidad: Franja[],
  excepciones: ExcepcionSemanal[],
  semilla: number
): HorarioColaborador[] {
  const horarios: HorarioColaborador[] = []
  const cajerosFull = cajeros.filter(c => c.tipo === 'FULL')
  const cajerosPart = cajeros.filter(c => c.tipo === 'PART')

  // Precalcular cupo para cierre 22:00-22:30 por día
  const cupo2200PorDia = Array.from({ length: 7 }, (_, dia) =>
    Math.max(1, necesidadEnFranja(necesidad, dia, '22:00'))
  )
  const cajerosHasta2230PorDia = Array(7).fill(0)

  // Asignar FULL
  for (let i = 0; i < cajerosFull.length; i++) {
    const cajero = cajerosFull[i]
    const simbolos = asignacion.get(cajero.id)
    if (!simbolos) continue
    const franco = simbolos.findIndex(s => s === 'franco')
    const jornadas = asignarJornadasFull(cajero, franco, simbolos, necesidad, cajerosHasta2230PorDia, cupo2200PorDia, i, semilla, excepciones)
    horarios.push({
      colaboradorId: cajero.id,
      rolGeneral: 'cajero',
      jornadas,
      totalHoras: jornadas.reduce((s, j) => s + j.horas, 0),
      errores: []
    })
  }

  // Asignar PART
  for (const cajero of cajerosPart) {
    const simbolos = asignacion.get(cajero.id)
    if (!simbolos) continue
    const franco = simbolos.findIndex(s => s === 'franco')
    const jornadas = asignarJornadasPart(cajero, franco, simbolos, necesidad, cajerosHasta2230PorDia, cupo2200PorDia, semilla, excepciones)
    horarios.push({
      colaboradorId: cajero.id,
      rolGeneral: 'cajero',
      jornadas,
      totalHoras: jornadas.reduce((s, j) => s + j.horas, 0),
      errores: []
    })
  }

  return horarios
}

// ========================================
// 6. ASIGNACIÓN DE JORNADAS FULL
// ========================================

function asignarJornadasFull(
  cajero: Colaborador,
  franco: number,
  simbolos: TurnoSymbol[],
  necesidad: Franja[],
  cajerosHasta2230PorDia: number[],
  cupo2200PorDia: number[],
  indiceFull: number,
  semilla: number,
  excepciones: ExcepcionSemanal[]
): JornadaAsignada[] {
  // Obtener excepciones relevantes
  const exNoAntes = obtenerExcepcion(excepciones, cajero.nombre, 'no_antes_de')
  const exNoDespues = obtenerExcepcion(excepciones, cajero.nombre, 'no_despues_de')
  const exSiempreCierre = obtenerExcepcion(excepciones, cajero.nombre, 'siempre_cierre')

  // Determinar duraciones por día: 3×9h, 2×8h, 1×5h (franco medio)
  const duraciones = [9, 9, 9, 8, 8, 5]
  const diasTrabajados = Array.from({ length: 7 }, (_, i) => i).filter(d => d !== franco)
  // Ordenar días trabajados por necesidad tarde descendente (priorizar días con más necesidad en tarde)
  diasTrabajados.sort((a, b) => {
    const necA = calcularNecesidadDia(necesidad, a, '17:00', '22:00')
    const necB = calcularNecesidadDia(necesidad, b, '17:00', '22:00')
    return necB - necA
  })
  const duracionPorDia = new Map<number, number>()
  for (let i = 0; i < diasTrabajados.length; i++) {
    duracionPorDia.set(diasTrabajados[i], duraciones[i])
  }

  const jornadas: JornadaAsignada[] = []
  let finDiaAnterior = -1
  let diaAnterior = -1

  for (let dia = 0; dia < 7; dia++) {
    if (dia === franco) {
      jornadas.push({
        dia,
        esFranco: true,
        turnos: [],
        horas: 0,
        rol: 'franco'
      })
      finDiaAnterior = -1
      diaAnterior = dia
      continue
    }

    const horas = duracionPorDia.get(dia) || 8
    const simbolo = simbolos[dia]
    const esFrancoMedio = horas === 5

    // Determinar horario según símbolo y duración
    let inicioMin: number
    let finMin: number
    if (simbolo === 'mañana') {
      // Mañana: inicio entre 08:00 y 10:00
      inicioMin = timeToMinutes('08:00') + (semilla * 30 + indiceFull * 17) % 120 // variación
      finMin = inicioMin + horas * 60
    } else if (simbolo === 'tarde') {
      // Tarde: fin a las 22:00 (o 22:30 si hay cupo)
      finMin = timeToMinutes('22:00')
      inicioMin = finMin - horas * 60
    } else { // cortado (solo FULL puede tener cortado)
      // Turno cortado: dos bloques separados al menos 4h (simplificado a un solo bloque por ahora)
      inicioMin = timeToMinutes('08:00') + (semilla * 30) % 120
      finMin = inicioMin + horas * 60
    }

    // Verificar descanso 12h con día anterior (si días consecutivos)
    if (finDiaAnterior > 0 && diaAnterior === dia - 1) {
      const minimoInicio = finDiaAnterior + 12 * 60 - 24 * 60 // finDiaAnterior es del día anterior, en minutos del mismo día
      if (minimoInicio > inicioMin) inicioMin = minimoInicio
    }

    // Aplicar excepción "siempre_cierre"
    if (exSiempreCierre) {
      finMin = timeToMinutes('22:30')
      inicioMin = finMin - horas * 60
      cajerosHasta2230PorDia[dia]++
    } else if (finMin >= timeToMinutes('22:00')) {
      // Cupo para cierre 22:00-22:30
      if (cajerosHasta2230PorDia[dia] < cupo2200PorDia[dia]) {
        finMin = Math.min(finMin, timeToMinutes('22:30'))
        cajerosHasta2230PorDia[dia]++
      } else {
        finMin = Math.min(finMin, timeToMinutes('22:00'))
      }
    }

    // Ajustes por excepciones de horario
    if (exNoAntes?.valor && inicioMin < timeToMinutes(exNoAntes.valor)) {
      const desplaza = timeToMinutes(exNoAntes.valor) - inicioMin
      inicioMin += desplaza
      finMin += desplaza
    }
    if (exNoDespues?.valor && finMin > timeToMinutes(exNoDespues.valor)) {
      const exceso = finMin - timeToMinutes(exNoDespues.valor)
      finMin -= exceso
      inicioMin = Math.max(inicioMin - exceso, 0)
    }

    const inicio = minutesToTime(inicioMin)
    const fin = minutesToTime(finMin)

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
// 7. ASIGNACIÓN DE JORNADAS PART
// ========================================

function asignarJornadasPart(
  cajero: Colaborador,
  franco: number,
  simbolos: TurnoSymbol[],
  _necesidad: Franja[],
  cajerosHasta2230PorDia: number[],
  cupo2200PorDia: number[],
  _semilla: number,
  excepciones: ExcepcionSemanal[]
): JornadaAsignada[] {
  const exNoAntes = obtenerExcepcion(excepciones, cajero.nombre, 'no_antes_de')
  const exNoDespues = obtenerExcepcion(excepciones, cajero.nombre, 'no_despues_de')
  const exSiempreCierre = obtenerExcepcion(excepciones, cajero.nombre, 'siempre_cierre')

  // Determinar duraciones por día: total 31h, jornadas 4-6h
  const duraciones = [6, 6, 5, 5, 5, 4] // ejemplo que suma 31
  const diasTrabajados = Array.from({ length: 7 }, (_, i) => i).filter(d => d !== franco)
  // Asignar duraciones según necesidad (simplificado)
  const duracionPorDia = new Map<number, number>()
  for (let i = 0; i < diasTrabajados.length; i++) {
    duracionPorDia.set(diasTrabajados[i], duraciones[i])
  }

  const jornadas: JornadaAsignada[] = []
  let finDiaAnterior = -1
  let diaAnterior = -1

  for (let dia = 0; dia < 7; dia++) {
    if (dia === franco) {
      jornadas.push({
        dia,
        esFranco: true,
        turnos: [],
        horas: 0,
        rol: 'franco'
      })
      finDiaAnterior = -1
      diaAnterior = dia
      continue
    }

    const horas = duracionPorDia.get(dia) || 5
    const simbolo = simbolos[dia]

    let inicioMin: number
    let finMin: number
    if (simbolo === 'mañana') {
      // PART mañana: inicio 09:00, ajustar por descanso 12h
      inicioMin = timeToMinutes('09:00')
      if (finDiaAnterior > 0 && diaAnterior === dia - 1) {
        const minimoInicio = finDiaAnterior + 12 * 60 - 24 * 60
        if (minimoInicio > inicioMin) inicioMin = minimoInicio
      }
      finMin = inicioMin + horas * 60
    } else { // tarde
      // PART tarde: fin a las 22:00 o 22:30 según cupo
      const cupo2200 = cupo2200PorDia[dia]
      if (exSiempreCierre) {
        finMin = timeToMinutes('22:30')
        cajerosHasta2230PorDia[dia]++
      } else if (cajerosHasta2230PorDia[dia] < cupo2200) {
        finMin = timeToMinutes('22:30')
        cajerosHasta2230PorDia[dia]++
      } else {
        finMin = timeToMinutes('22:00')
      }
      inicioMin = finMin - horas * 60
    }

    // Aplicar excepciones de horario
    if (exNoAntes?.valor && inicioMin < timeToMinutes(exNoAntes.valor)) {
      const desplaza = timeToMinutes(exNoAntes.valor) - inicioMin
      inicioMin += desplaza
      finMin += desplaza
    }
    if (exNoDespues?.valor && finMin > timeToMinutes(exNoDespues.valor)) {
      const exceso = finMin - timeToMinutes(exNoDespues.valor)
      finMin -= exceso
      inicioMin = Math.max(inicioMin - exceso, 0)
    }

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
// 8. FUNCIONES AUXILIARES
// ========================================

function calcularNecesidadDia(necesidad: Franja[], dia: number, franjaInicio?: string, franjaFin?: string): number {
  return necesidad.reduce((sum, f) => {
    if (franjaInicio && timeToMinutes(f.hora) < timeToMinutes(franjaInicio)) return sum
    if (franjaFin && timeToMinutes(f.hora) >= timeToMinutes(franjaFin)) return sum
    return sum + (f.necesidad[dia] || 0)
  }, 0)
}

// ========================================
// 9. ASIGNACIÓN DE AUXILIARES
// ========================================

function asignarAuxiliares(
  auxiliares: Auxiliar[],
  horariosCajeros: HorarioColaborador[],
  necesidad: Franja[]
): HorarioColaborador[] {
  // Calcular cobertura actual solo de cajeros
  let cobertura = calcularCoberturaCajeros(horariosCajeros, necesidad)
  const horariosAux: HorarioColaborador[] = []

  // Precalcular auxiliares reservados para cierre por día (máximo 2)
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
      const { turnos: turnosDisponibles, esFranco } = parsearHorarioDia(horarioDia)

      if (esFranco || !turnosDisponibles.length) {
        jornadas.push({
          dia, esFranco: false, turnos: [], horas: 0,
          rol: 'aux_supervisor'
        })
        continue
      }

      // Reservar cierre: si este auxiliar está entre los seleccionados para cierre este día
      const reservarParaCierre = auxReservadosCierrePorDia[dia].has(aux.id)

      // Franjas con bache este día (solo donde faltan cajeros)
      const franjasConBache: string[] = []
      for (let fi = 0; fi < necesidad.length; fi++) {
        const bache = necesidad[fi].necesidad[dia] - cobertura[fi][dia]
        if (bache <= 0) continue

        const franjaMin = timeToMinutes(necesidad[fi].hora)

        // Franja 08:00-09:00: solo 1 AUX, sin cajeros (regla especial)
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

      // Actualizar cobertura con este auxiliar (para cálculos posteriores de eventuales)
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
// 10. ASIGNACIÓN DE EVENTUALES
// ========================================

function asignarEventuales(
  eventuales: Eventual[],
  horariosExistentes: HorarioColaborador[],
  necesidad: Franja[]
): HorarioColaborador[] {
  // Calcular cobertura actual (cajeros + AUX)
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
      const { turnos: turnosDisponibles, esFranco } = parsearHorarioDia(horarioDia)

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
// 11. CÁLCULO DE COBERTURA GENERAL
// ========================================

function calcularCobertura(horarios: HorarioColaborador[], necesidad: Franja[]): number[][] {
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

// ========================================
// 12. GENERACIÓN DE SOLUCIÓN CSP COMPLETA
// ========================================

function generarSolucionCSP(
  cajeros: Colaborador[],
  auxiliares: Auxiliar[],
  eventuales: Eventual[],
  necesidad: Franja[],
  excepciones: ExcepcionSemanal[],
  semilla: number
): HorarioColaborador[] {
  // Filtrar cajeros activos
  const cajerosActivos = cajeros.filter(c => c.activo && (c.tipo === 'FULL' || c.tipo === 'PART'))

  // 1. Validar factibilidad
  const factibilidad = validarFactibilidad(cajerosActivos, auxiliares, eventuales, necesidad)
  if (!factibilidad.valido) {
    throw new Error(factibilidad.mensaje)
  }

  // 2. Generar dominios para cada cajero
  const dominios = new Map<string, TurnoSymbol[][]>()
  for (const cajero of cajerosActivos) {
    const dominio = generarDominioCajero(cajero, excepciones)
    if (dominio.length === 0) {
      throw new Error(`Cajero ${cajero.nombre} no tiene combinaciones válidas con las excepciones dadas`)
    }
    dominios.set(cajero.id, dominio)
  }

  // 3. Resolver CSP
  const asignacion = resolverCSP(cajerosActivos, dominios, excepciones)
  if (!asignacion) {
    throw new Error('No se pudo encontrar una solución válida con CSP')
  }

  // 4. Convertir asignación a horarios concretos de cajeros
  const horariosCajeros = convertirAsignacionAHorarios(asignacion, cajerosActivos, necesidad, excepciones, semilla)

  // 5. Asignar AUXILIARES
  const horariosAux = asignarAuxiliares(auxiliares, horariosCajeros, necesidad)

  // 6. Asignar EVENTUALES
  const todosHastaAhora = [...horariosCajeros, ...horariosAux]
  const horariosEv = asignarEventuales(eventuales, todosHastaAhora, necesidad)

  return [...horariosCajeros, ...horariosAux, ...horariosEv]
}

// ========================================
// 13. FUNCIÓN PRINCIPAL (LEGACY)
// ========================================

export function generarHorariosDeterministicos(
  necesidad: Franja[],
  cajeros: Colaborador[],
  auxiliares: Auxiliar[],
  eventuales: Eventual[],
  _fechas: string[],
  excepciones: ExcepcionSemanal[]
): ResultadoAsignacion {
  // Usar semilla 0 para la solución por defecto
  const horarios = generarSolucionCSP(cajeros, auxiliares, eventuales, necesidad, excepciones, 0)

  // Calcular métricas (solo cajeros)
  const coberturaFranjas = calcularCoberturaCajeros(horarios, necesidad)

  const faltantesFranjas = necesidad.map((f, fi) =>
    f.necesidad.map((nec, di) => Math.max(0, nec - coberturaFranjas[fi][di]))
  )

  // Calcular porcentaje de cobertura
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
  necesidad.forEach((franja, fi) => {
    franja.necesidad.forEach((nec, di) => {
      const diff = nec - coberturaFranjas[fi][di]
      if (diff > 0) {
        alertas.push(`Falta ${diff} cajero(s) en ${franja.hora} el ${DIAS[di]}`)
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