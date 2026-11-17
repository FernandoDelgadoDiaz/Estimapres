import { expect, test } from '@playwright/test'
import { convertirInputAV2 } from '../src/algoritmo/adapter'
import { AUX_S47, CAJEROS_S47, EVENTUALES_S47, OPERATIVA_S47 } from '../src/algoritmo/__tests__/fixtures/semana47Anonimizada'
import { MATRIZ_POM_SINTETICA } from '../src/utils/__tests__/fixtures/pomSintetico'
import type { SolicitudCicloOffline } from '../src/workers/cicloOffline.worker'

test('A con ciclo explícito se ejecuta en Worker offline y conserva paridad', async ({ page }) => {
  await page.route('**/*', route => new URL(route.request().url()).origin === 'http://127.0.0.1:4176' ? route.continue() : route.abort())
  await page.goto('/')
  const necesidad = MATRIZ_POM_SINTETICA.map(([hora, necesidad]) => ({ hora, necesidad }))
  const datos: SolicitudCicloOffline = {
    entrada: {
      input: convertirInputAV2(necesidad, CAJEROS_S47, AUX_S47, EVENTUALES_S47, [], OPERATIVA_S47),
      cajeros: CAJEROS_S47, auxiliares: AUX_S47, eventuales: EVENTUALES_S47,
      contexto: { necesidad, excepciones: [], operativa: OPERATIVA_S47 },
    },
    ciclo: {
      lunes: '2026-11-16', sucursalId: 'prueba',
      calendario: [{ id: 'nov', sucursalId: 'prueba', nombre: 'Nov', modalidad: 'mensual', inicio: '2026-11-02', fin: '2026-11-29', estado: 'abierto', origen: 'sucursal' }],
      historial: { desde: '2026-11-02', hasta: '2026-11-15', hoy: '2026-11-16', tramos: [], versiones: [] },
    },
  }
  const medida = await page.evaluate(async datos => {
    const path = '/src/utils/optimizacionCiclos.ts'
    const { generarConCiclo } = await import(path) as typeof import('../src/utils/optimizacionCiclos')
    const baseline = generarConCiclo(datos.entrada, datos.ciclo)
    const start = performance.now()
    const { resultado, calculoMs } = await new Promise<{ resultado: typeof baseline; calculoMs: number }>((resolve,reject) => {
      const worker = new Worker('/src/workers/cicloOffline.worker.ts', { type: 'module' })
      worker.onmessage = ({data}) => {
        worker.terminate()
        if (data.error) reject(new Error(data.error))
        else resolve(data)
      }
      worker.onerror = e => { worker.terminate(); reject(new Error(e.message)) }
      worker.postMessage(datos)
    })
    return { paridad: JSON.stringify(resultado.resultado) === JSON.stringify(baseline.resultado),
      elegible: resultado.elegibleHibrido, calculoMs, totalMs: performance.now()-start }
  }, datos)
  console.log('A local offline: ' + JSON.stringify(medida))
  expect(medida).toMatchObject({ paridad: true, elegible: true })
  expect(medida.calculoMs).toBeGreaterThan(0)
})
