// BENCH-01 / Issue #13 — Exporta SOLO fixtures sintéticos; nunca consulta Supabase.
// Ejecutar explícitamente: AH2_EXPORT_CPSAT=1 npx vitest run src/algoritmo/__tests__/cpsat.export.test.ts
import { expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { convertirInputAV2 } from '../adapter'
import { generarConMultiArranque } from '../../utils/generacionMultiArranque'
import { validarResultadoSemana } from '../../utils/validacionSemana'
import { MATRIZ_POM_SINTETICA } from '../../utils/__tests__/fixtures/pomSintetico'
import { escenarioSintetico, type Escenario } from './fixtures/escenariosSinteticos'
import { CAJEROS_S47, AUX_S47, EVENTUALES_S47, OPERATIVA_S47 } from './fixtures/semana47Anonimizada'
import type { Franja, ExcepcionSemanal } from '../../types'

const habilitado = process.env.AH2_EXPORT_CPSAT === '1'

const base: Escenario = {
  id: 47,
  modo: 'sintetico-406-horas',
  necesidad: MATRIZ_POM_SINTETICA.map(([hora, necesidad]): Franja => ({ hora, necesidad: [...necesidad] })),
  cajeros: CAJEROS_S47,
  excepciones: [],
}
const fixed = (colaboradorNombre: string, dia: number): ExcepcionSemanal => ({
  id: 'franco-fijo-sintetico',
  colaboradorNombre,
  tipo: 'franco_dia',
  valor: String(dia),
  descripcion: 'fixture sintético',
})
const morning = (colaboradorNombre: string, i: number): ExcepcionSemanal => ({
  id: 'solo-mananias-' + i,
  colaboradorNombre,
  tipo: 'solo_matutino',
  descripcion: 'fixture sintético restrictivo',
})

it.skipIf(!habilitado)(
  'BENCH-01 exporta 8 escenarios sintéticos y el respaldo del motor productivo',
  { timeout: 15 * 60 * 1000 },
  () => {
    const escenarios: Array<{ nombre: string; escenario: Escenario }> = [
      { nombre: 'semana47-sintetica', escenario: base },
      { nombre: 'dotacion-menos-1', escenario: { ...base, cajeros: base.cajeros.slice(0, -1) } },
      { nombre: 'dotacion-menos-2', escenario: { ...base, cajeros: base.cajeros.slice(0, -2) } },
      { nombre: 'solo-mananas', escenario: {
        ...base, excepciones: base.cajeros.filter(c => c.tipo === 'PART').map(c => morning(c.nombre, base.cajeros.indexOf(c))),
      } },
      { nombre: 'franco-fijo', escenario: { ...base, excepciones: [fixed(base.cajeros[0].nombre, 2)] } },
      { nombre: 'pico-extremo', escenario: { ...base, necesidad: base.necesidad.map(f =>
        f.hora === '19:30' ? { ...f, necesidad: f.necesidad.map((n, d) => d === 5 ? n + 4 : n) } : f) } },
      { nombre: 'escenario-100', escenario: escenarioSintetico(100) },
      { nombre: 'escenario-130', escenario: escenarioSintetico(130) },
    ]
    const destino = resolve('tools/cpsat/fixtures')
    mkdirSync(destino, { recursive: true })
    for (const { nombre, escenario } of escenarios) {
      const input = convertirInputAV2(
        escenario.necesidad, escenario.cajeros, AUX_S47, EVENTUALES_S47,
        escenario.excepciones, { ...OPERATIVA_S47 },
      )
      const contexto = {
        necesidad: escenario.necesidad,
        excepciones: escenario.excepciones,
        operativa: OPERATIVA_S47,
      }
      const prod = generarConMultiArranque({
        input, cajeros: escenario.cajeros, auxiliares: AUX_S47, eventuales: EVENTUALES_S47,
        contexto, presupuestoMs: 20_000,
      })
      const val = validarResultadoSemana(
        prod.resultado, escenario.cajeros, AUX_S47, EVENTUALES_S47, contexto,
      )
      const payload = {
        escenario: nombre,
        input,
        baseline: {
          jornadas_full: prod.resultadoV2.jornadas_full,
          jornadas_part: prod.resultadoV2.jornadas_part,
        },
        baseline_validador_violaciones: val.violaciones.length,
        baseline_estrategia: prod.seleccion.estrategia,
        nota: 'Fixture sintético. Métricas CP-SAT vs producto comparadas SOLO en cajeros FULL/PART.',
      }
      writeFileSync(resolve(destino, nombre + '.json'), JSON.stringify(payload, null, 2), 'utf8')
    }
    expect(escenarios).toHaveLength(8)
  },
)
