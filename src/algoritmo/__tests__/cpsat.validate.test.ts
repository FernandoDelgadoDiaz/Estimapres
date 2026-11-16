// BENCH-01 Issue #13: validación cruzada OFFLINE del resultado CP-SAT.
// El archivo Python resulta de fixtures 100% sintéticos. No se usa en producción.
// Ejecutar con AH2_VALIDATE_CPSAT=1 tras AH2_EXPORT_CPSAT + solver.py.
import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ejecutarPasada2 } from '../pasada2-auxiliares'
import { ejecutarPasada3 } from '../pasada3-eventuales'
import { calcularMetricasCobertura } from '../validador'
import { convertirOutputDeV2 } from '../adapter'
import { PERFIL_HORAS_VIGENTE } from '../contratos'
import type { InputAlgoritmo, Jornada, ResultadoSemanal } from '../types'
import { validarResultadoSemana } from '../../utils/validacionSemana'
import { HORAS_FRANJAS, type Colaborador, type Franja } from '../../types'
import { AUX_S47, EVENTUALES_S47, OPERATIVA_S47 } from './fixtures/semana47Anonimizada'

interface Fixture {
  escenario: string
  input: InputAlgoritmo
  baseline: { jornadas_full: Record<string, Jornada[]>; jornadas_part: Record<string, Jornada[]> }
}
interface PythonResult {
  escenario: string
  estado: string
  jornadas?: Record<string, Jornada[]>
  optimo_demostrado_solo_cajeros?: boolean
}

const activo = process.env.AH2_VALIDATE_CPSAT === '1'

function necesidadDelInput(inp: InputAlgoritmo): Franja[] {
  return HORAS_FRANJAS.map(hora => {
    const [h, m] = hora.split(':').map(Number)
    const slot = (h - 8) * 2 + (m >= 30 ? 1 : 0)
    return { hora, necesidad: Array.from({ length: 7 }, (_, d) => slot >= 0 && slot < 30 ? inp.demanda[d][slot] : 0) }
  })
}

function rosterDelInput(inp: InputAlgoritmo): Colaborador[] {
  return inp.colaboradores.filter(c => c.rol === 'FULL' || c.rol === 'PART').map(c => ({
    id: c.id, nombre: c.nombre, tipo: c.rol as 'FULL' | 'PART',
    horasSemanales: c.rol === 'FULL' ? 48 : (inp.contratos?.[c.id]?.objetivoSlots ?? 64) / 2,
    activo: true,
  }))
}

function evaluar(
  inp: InputAlgoritmo,
  full: Record<string, Jornada[]>,
  part: Record<string, Jornada[]>,
) {
  const todas = [...Object.values(full), ...Object.values(part)]
  const deficit_1 = inp.demanda.map((fila, d) => fila.map((n, s) => {
    const caja = todas.reduce((acum, semana) => acum + semana.filter(j =>
      j.dia === d && j.bloques.some(b => b.slot_inicio <= s && s < b.slot_fin)).length, 0)
    return Math.max(0, n - caja)
  }))
  const p1 = { jornadas_full: full, jornadas_part: part, deficit_1, infactibles: [] }
  const p2 = ejecutarPasada2(inp, p1)
  const p3 = ejecutarPasada3(inp, p2)
  const metricas = calcularMetricasCobertura(inp.demanda, full, part, p2.asignacion_aux, p3.asignacion_eventual, p3.deficit_3)
  const resultado: ResultadoSemanal = {
    semana: { desde: new Date('2026-11-16T12:00:00Z'), hasta: new Date('2026-11-22T12:00:00Z') },
    jornadas_full: full, jornadas_part: part,
    asignacion_aux: p2.asignacion_aux, asignacion_eventual: p3.asignacion_eventual,
    metricas, reporte_reglas: {
      duras_cumplidas: p2.violaciones_input.length === 0,
      violaciones: p2.violaciones_input, advertencias: [],
    },
  }
  const cajeros = rosterDelInput(inp)
  const ui = convertirOutputDeV2(resultado, cajeros, AUX_S47, EVENTUALES_S47)
  const validacion = validarResultadoSemana(ui, cajeros, AUX_S47, EVENTUALES_S47, {
    necesidad: necesidadDelInput(inp), excepciones: inp.excepciones ?? [],
    maxFrancosDia: inp.max_francos_dia,
    perfilHorasId: PERFIL_HORAS_VIGENTE.id,
    operativa: {
      ...OPERATIVA_S47,
      aperturaSoloAux: inp.apertura_solo_aux,
      sinAuxCierre: inp.sin_aux_cierre,
      supervisorJornadaCompleta: inp.supervisor_jornada_completa,
      francoMedioCorridos: inp.franco_medio_corridos,
    },
  })
  return {
    coberturaPct: metricas.cobertura_total_pct,
    faltantes: metricas.deficit_por_slot.flat().reduce((a, b) => a + b, 0) / 2,
    sobrantes: metricas.exceso_por_slot.flat().reduce((a, b) => a + b, 0) / 2,
    violaciones: validacion.violaciones.map(v => v.codigo),
  }
}

it.skipIf(!activo)(
  'BENCH-01: candidatos CP-SAT pasan por la misma cascada AUX/eventuales y el validador independiente',
  { timeout: 10 * 60 * 1000 },
  () => {
    const resultados: PythonResult[] = JSON.parse(readFileSync(resolve('tools/cpsat/resultados.json'), 'utf8'))
    expect(resultados).toHaveLength(8)
    const reporte: Array<Record<string, unknown>> = []
    const fallos: string[] = []
    for (const r of resultados) {
      if (!/^[a-z0-9-]+$/.test(r.escenario)) throw new Error('Nombre de escenario inseguro')
      const fuente: Fixture = JSON.parse(readFileSync(resolve('tools/cpsat/fixtures', r.escenario + '.json'), 'utf8'))
      const previo = evaluar(fuente.input, fuente.baseline.jornadas_full, fuente.baseline.jornadas_part)
      if (!r.jornadas) {
        reporte.push({ escenario: r.escenario, estado: r.estado, previo })
        continue
      }
      const full = Object.fromEntries(fuente.input.colaboradores.filter(c => c.rol === 'FULL').map(c =>
        [c.id, r.jornadas?.[c.id] ?? []])) as Record<string, Jornada[]>
      const part = Object.fromEntries(fuente.input.colaboradores.filter(c => c.rol === 'PART').map(c =>
        [c.id, r.jornadas?.[c.id] ?? []])) as Record<string, Jornada[]>
      const nuevo = evaluar(fuente.input, full, part)
      if (nuevo.violaciones.length) fallos.push(r.escenario + ': ' + nuevo.violaciones.join(', '))
      reporte.push({
        escenario: r.escenario, estado: r.estado, optimoParcial: r.optimo_demostrado_solo_cajeros,
        previo, nuevo, mejoraCoberturaPp: nuevo.coberturaPct - previo.coberturaPct,
      })
    }
    console.log('BENCH-01 VALIDACION CRUZADA SINTETICA:\n' + JSON.stringify(reporte, null, 2))
    expect(fallos, 'Ningún candidato CP-SAT con horario puede violar el validador de Aliada').toEqual([])
  },
)
