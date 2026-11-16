import { expect, test, type Page } from '@playwright/test'
import { convertirInputAV2 } from '../src/algoritmo/adapter'
import { generarEscenario, type Escenario } from '../src/algoritmo/__tests__/fixtures/escenariosSinteticos'
import { AUX_S47, CAJEROS_S47, EVENTUALES_S47, OPERATIVA_S47 } from '../src/algoritmo/__tests__/fixtures/semana47Anonimizada'
import { MATRIZ_POM_SINTETICA } from '../src/utils/__tests__/fixtures/pomSintetico'
import type { SolicitudGeneracion } from '../src/workers/generacion.worker'

function entrada({ necesidad, cajeros, excepciones }: Pick<Escenario, 'necesidad' | 'cajeros' | 'excepciones'>): SolicitudGeneracion['entrada'] {
  return {
    input: convertirInputAV2(necesidad, cajeros, AUX_S47, EVENTUALES_S47, excepciones, OPERATIVA_S47),
    cajeros,
    auxiliares: AUX_S47,
    eventuales: EVENTUALES_S47,
    contexto: { necesidad, excepciones, operativa: OPERATIVA_S47 },
  }
}

async function comparar(page: Page, entradas: SolicitudGeneracion['entrada'][]) {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:4176' ? route.continue() : route.abort())
  await page.goto('/')
  return page.evaluate(async entradas => {
    const rutaCliente = '/src/workers/generacionCliente.ts'
    const rutaMotor = '/src/utils/generacionMultiArranque.ts'
    const rutaValidador = '/src/utils/validacionSemana.ts'
    const { ejecutarEnWorker } = await import(rutaCliente) as typeof import('../src/workers/generacionCliente')
    const { generarConMultiArranque } = await import(rutaMotor) as typeof import('../src/utils/generacionMultiArranque')
    const { validarResultadoSemana } = await import(rutaValidador) as typeof import('../src/utils/validacionSemana')
    const diferencias: number[] = []
    let omitidasHilo = 0
    let omitidasWorker = 0
    let violaciones = 0
    let sumaCobertura = 0
    for (const [i, e] of entradas.entries()) {
      const hilo = generarConMultiArranque(e).resultado
      const worker = await ejecutarEnWorker(e)
      if (!worker) throw new Error('La comparación requiere el Worker real')
      const evaluar = (resultado: typeof hilo) => ({
        resultado,
        validacion: validarResultadoSemana(resultado, e.cajeros, e.auxiliares, e.eventuales, e.contexto),
      })
      const funcional = (x: unknown) => JSON.stringify(x, (k, v) => k === 'ms' || k === 'tiempoMs' ? undefined : v)
      const anterior = evaluar(hilo)
      const nuevo = evaluar(worker)
      if (funcional(anterior) !== funcional(nuevo)) diferencias.push(i)
      violaciones += nuevo.validacion.violaciones.length
      omitidasHilo += hilo.multiArranque!.omitidas.length
      omitidasWorker += worker.multiArranque!.omitidas.length
      sumaCobertura += worker.multiArranque!.coberturaElegidaPct
    }
    return { escenarios: entradas.length, diferencias, omitidasHilo, omitidasWorker, violaciones, coberturaMedia: sumaCobertura / entradas.length }
  }, entradas)
}

test('semana 47 sintética: el Worker y el hilo principal devuelven el mismo horario y validación', async ({ page }) => {
  const necesidad = MATRIZ_POM_SINTETICA.map(([hora, necesidad]) => ({ hora, necesidad }))
  const resultado = await comparar(page, [entrada({ necesidad, cajeros: CAJEROS_S47, excepciones: [] })])
  expect(resultado).toMatchObject({ escenarios: 1, diferencias: [], omitidasHilo: 0, omitidasWorker: 0, violaciones: 0 })
})

test('benchmark W1: equivalencia en los 200 escenarios AH2-020', async ({ page }) => {
  test.skip(process.env.AH2_WORKER_BENCH !== '1', 'Benchmark offline de 200 escenarios')
  test.setTimeout(10 * 60 * 1000)
  const resultado = await comparar(page, Array.from({ length: 200 }, (_, i) => entrada(generarEscenario(i))))
  console.log(JSON.stringify(resultado))
  expect(resultado).toMatchObject({ escenarios: 200, diferencias: [], omitidasHilo: 0, omitidasWorker: 0, violaciones: 0 })
})
