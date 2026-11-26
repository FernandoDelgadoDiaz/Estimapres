/**
 * AH2-066 · Francos parejos en la semana (decisión del propietario, 26/11/2026; todas las sucursales).
 *
 * El tope de francos por día cuenta a TODAS las personas de caja: cajeros FULL/PART y supervisores (AUX).
 *  - Si la sucursal cargó «Máximo de francos por día» en Configuración, ese es el tope de personas por día.
 *  - Si no cargó nada, el tope sale de la dotación repartida en los 7 días: cada persona tiene 1 franco por semana;
 *    los días de MENOS necesidad de cajas reciben el franco extra (ej. 11 personas → 2 en los 4 días más tranquilos
 *    y 1 en los 3 más cargados).
 *  - Los francos que ya están fijados (supervisores sin presencia ese día y cajeros con franco fijo) siempre entran:
 *    el tope de un día nunca queda por debajo de ellos.
 * Los motores reciben el tope que queda para los CAJEROS (tope del día − supervisores de franco ese día), y nunca
 * menos que lo necesario para que cada cajero tenga su franco.
 */
export interface EntradaTopesFrancos {
  /** Necesidad de cajas en horas por día (lunes a domingo). */
  necesidadPorDia: number[]
  cajeros: number
  /** Supervisores activos de la semana. */
  supervisores: number
  /** Supervisores sin presencia ese día (su franco), por día. */
  supervisoresDeFranco: number[]
  /** Cajeros con franco fijo ese día (reglas o cambios de la semana), por día. */
  francosFijosCajeros: number[]
  /** Máximo de personas de franco por día configurado por la sucursal (si existe). */
  maximoConfigurado?: number
}

export interface TopesFrancos {
  /** Tope de personas de franco por día (cajeros + supervisores). */
  personasPorDia: number[]
  /** Tope para los cajeros (lo que reciben los motores y el validador). */
  cajerosPorDia: number[]
  origen: 'configurado' | 'calculado'
}

export function topesFrancosPorDia(e: EntradaTopesFrancos): TopesFrancos {
  const dias = [0, 1, 2, 3, 4, 5, 6]
  let personas: number[]
  if (e.maximoConfigurado !== undefined) personas = dias.map(() => Math.max(1, Math.round(e.maximoConfigurado!)))
  else {
    const total = e.cajeros + e.supervisores
    const base = Math.floor(total / 7), resto = total % 7
    // Los días de menos necesidad reciben el franco extra (a igual necesidad, el primero de la semana).
    const orden = [...dias].sort((a, b) => (e.necesidadPorDia[a] ?? 0) - (e.necesidadPorDia[b] ?? 0) || a - b)
    personas = dias.map(() => base)
    for (const d of orden.slice(0, resto)) personas[d]++
  }
  // Los francos fijos siempre entran.
  personas = dias.map(d => Math.max(personas[d], (e.supervisoresDeFranco[d] ?? 0) + (e.francosFijosCajeros[d] ?? 0)))
  const cajeros = dias.map(d => Math.max(personas[d] - (e.supervisoresDeFranco[d] ?? 0), e.francosFijosCajeros[d] ?? 0, 0))
  // Cada cajero necesita su franco: si los topes no alcanzan, se abre lugar en los días de menos necesidad.
  const orden = [...dias].sort((a, b) => (e.necesidadPorDia[a] ?? 0) - (e.necesidadPorDia[b] ?? 0) || a - b)
  for (let i = 0; cajeros.reduce((a, b) => a + b, 0) < e.cajeros; i++) { const d = orden[i % 7]; cajeros[d]++; personas[d]++ }
  return { personasPorDia: personas, cajerosPorDia: cajeros, origen: e.maximoConfigurado !== undefined ? 'configurado' : 'calculado' }
}

/** Horas de necesidad por día a partir de la necesidad del POM (franjas de media hora). */
export function necesidadPorDia(necesidad: Array<{ necesidad: number[] }>): number[] {
  return [0, 1, 2, 3, 4, 5, 6].map(d => necesidad.reduce((n, f) => n + (f.necesidad[d] ?? 0), 0) / 2)
}

/** Cajeros con franco fijo por día (excepciones `franco_dia` ya normalizadas a índice), sin contar dos veces a la misma persona. */
export function francosFijosPorDia(excepciones: Array<{ tipo: string; valor?: string; colaboradorNombre?: string }>, cajeros: string[]): number[] {
  const nombres = new Set(cajeros)
  return [0, 1, 2, 3, 4, 5, 6].map(d => new Set(excepciones
    .filter(e => e.tipo === 'franco_dia' && Number(e.valor) === d && !!e.colaboradorNombre && nombres.has(e.colaboradorNombre))
    .map(e => e.colaboradorNombre)).size)
}

/** Supervisores sin presencia por día según su horario de la semana. */
export function supervisoresDeFrancoPorDia(auxiliares: Array<{ horarioSemanal: string[] }>): number[] {
  return [0, 1, 2, 3, 4, 5, 6].map(d => auxiliares.filter(a => !(a.horarioSemanal[d] ?? '').trim()).length)
}
