// #7 · AH2-020 — Medición de bloqueo de interfaz de la generación con multi-arranque.
// NO forma parte de la suite E2E (no termina en .e2e.ts). Se corre con:
//   npm run build && npx playwright test -c playwright.perf.config.ts
// Opcional: AH2_PERF_OUT=<archivo.json>, AH2_PERF_MODO=hilo (modo compatible). Datos 100 % sintéticos; sin red (todo externo se aborta).
//
// Mide 9, 20, 35 y 55 cajeros con ralentización del hilo de la página por CDP (1×, 4×, 6×).
//   - tiempo desde el clic en «Generar» hasta ver «Horarios generados»;
//   - la tarea larga más larga (PerformanceObserver 'longtask') = congelamiento de la interfaz;
//   - cuadros pintados durante la generación (requestAnimationFrame): 0 ⇒ la pantalla no se actualiza
//     (ni siquiera el indicador «generando…»).
import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { jsPDF } from 'jspdf'
import { MATRIZ_POM_SINTETICA } from '../src/utils/__tests__/fixtures/pomSintetico'
import { AUXILIARES_DE_PRUEBA } from './fixtures/roster'

function pdfPom(factor: number) {
  const pdf = new jsPDF()
  pdf.text('Programación semanal 2026-11-16 - 2026-11-22', 12, 12)
  pdf.addPage()
  pdf.text('Resumen sintético', 12, 12)
  pdf.addPage()
  pdf.setFontSize(8)
  const cabecera = 'Horario Lunes Martes Miércoles Jueves Viernes Sábado Domingo'
  pdf.text('Diferencia de cajas necesarias', 12, 14)
  pdf.text(cabecera, 12, 20)
  MATRIZ_POM_SINTETICA.forEach(([hora], i) => pdf.text(`${hora}:00 -1 -1 -1 -1 -1 -1 -1`, 12, 26 + i * 5))
  pdf.text('Estimado de cajas necesarias', 105, 14)
  pdf.text(cabecera, 105, 20)
  MATRIZ_POM_SINTETICA.forEach(([hora, demanda], i) => pdf.text(`${hora}:00 ${demanda.map(n => n * factor).join(' ')}`, 105, 26 + i * 5))
  return Buffer.from(pdf.output('arraybuffer'))
}

const DOTACIONES = [
  { total: 9, full: 4, part: 5, factor: 1, maxFrancos: 2 }, // tamaño de la 091 (semana 47 anonimizada)
  { total: 20, full: 6, part: 14, factor: 2, maxFrancos: 4 },
  { total: 35, full: 10, part: 25, factor: 3, maxFrancos: 6 },
  { total: 55, full: 15, part: 40, factor: 5, maxFrancos: 10 },
]
const CPU = [1, 4, 6]
const modo = process.env.AH2_PERF_MODO === 'hilo' ? 'hilo' : 'worker'
const filas: unknown[] = []

test.afterAll(() => { if (process.env.AH2_PERF_OUT) writeFileSync(process.env.AH2_PERF_OUT, JSON.stringify(filas, null, 2)) })

for (const d of DOTACIONES) for (const rate of CPU) {
  test(`dotación ${d.total} · CPU ${rate}×`, async ({ page }) => {
    test.setTimeout(10 * 60 * 1000)
    await page.route('**/*', route => (new URL(route.request().url()).origin === 'http://127.0.0.1:4177' ? route.continue() : route.abort()))
    const cajeros = [
      ...Array.from({ length: d.full }, (_, i) => ({ id: `f${i}`, nombre: `Full ${i}`, tipo: 'FULL', horasSemanales: 48, activo: true })),
      ...Array.from({ length: d.part }, (_, i) => ({ id: `p${i}`, nombre: `Part ${i}`, tipo: 'PART', horasSemanales: i % 3 === 0 ? 24 : 32, activo: true })),
    ]
    const reglas = [{ id: 'r-francos', ambito: 'local', tipo: 'max_francos_dia', cantidad: d.maxFrancos, activa: true, descripcion: 'Tope francos', creadaEl: '2026-11-01T00:00:00.000Z' }]
    await page.addInitScript(({ cajeros, auxiliares, reglas, modo }) => {
      const WorkerOriginal = window.Worker
      Object.assign(window, { w1Ejecuciones: 0 })
      window.Worker = new Proxy(WorkerOriginal, {
        construct(target, args) {
          if (!String(args[0]).includes('generacion.worker')) return Reflect.construct(target, args)
          if (modo === 'hilo') throw new Error('Medición del camino síncrono')
          const worker: Worker = Reflect.construct(target, args)
          const enviar = worker.postMessage.bind(worker)
          worker.postMessage = (mensaje: unknown) => {
            const w = window as Window & { w1Ejecuciones: number }
            w.w1Ejecuciones++
            enviar(mensaje)
          }
          return worker
        },
      })
      if (sessionStorage.getItem('ah2-perf')) return
      sessionStorage.setItem('ah2-perf', '1')
      localStorage.setItem('aliada_sucursal_actual', '900')
      localStorage.setItem('cajeros_colaboradores::900', JSON.stringify(cajeros))
      localStorage.setItem('aliada_auxiliares::900', JSON.stringify(auxiliares))
      localStorage.setItem('aliada_eventuales::900', '[]')
      localStorage.setItem('aliada_reglas_configurables::900', JSON.stringify(reglas))
    }, { cajeros, auxiliares: AUXILIARES_DE_PRUEBA, reglas, modo })
    await page.goto('/nueva-semana')
    await page.locator('input[type=file]').setInputFiles({ name: 'pom.pdf', mimeType: 'application/pdf', buffer: pdfPom(d.factor) })
    await expect(page.getByTestId('semana-pom')).toContainText('2026-11-16 al 2026-11-22')
    const boton = page.getByRole('button', { name: /Generar horarios automáticamente/ })
    await expect(boton).toBeEnabled()
    await boton.scrollIntoViewIfNeeded()
    await page.evaluate(() => document.fonts.ready.then(() => undefined))

    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate })
    let cancelacionMs: number | undefined
    if (modo === 'worker' && d.total === 55 && rate === 6) {
      await boton.click()
      await page.waitForFunction(() => (window as Window & { w1Ejecuciones?: number }).w1Ejecuciones === 1)
      const cancelar = page.getByRole('button', { name: 'Cancelar generación' })
      cancelacionMs = await cancelar.evaluate(el => {
        const inicio = performance.now()
        const botonCancelar = el as HTMLButtonElement
        botonCancelar.click()
        return new Promise<number>(resolve => {
          const observar = () => {
            if (el.isConnected) requestAnimationFrame(observar)
            else resolve(Math.round(performance.now() - inicio))
          }
          requestAnimationFrame(observar)
        })
      })
      await expect(boton).toBeEnabled()
      await expect(page.getByRole('heading', { name: 'Horarios generados' })).toHaveCount(0)
      expect(await page.evaluate(() => JSON.parse(localStorage.getItem('aliada_historial_semanas::900') ?? '[]').length)).toBe(0)
    }
    await boton.evaluate(el => {
      const w = window as unknown as {
        __lt: { inicio: number; duracion: number }[]; __inicio: number; __fin: number; __frames: number; __medir: boolean; __indicador: boolean; __timer: number | null
      }
      w.__lt = []; w.__frames = 0; w.__medir = true; w.__indicador = false; w.__timer = null; w.__inicio = 0; w.__fin = 0
      new PerformanceObserver(l => { for (const e of l.getEntries()) w.__lt.push({ inicio: e.startTime, duracion: e.duration }) }).observe({ type: 'longtask' })
      el.addEventListener('click', () => {
        // Probe de respuesta del hilo principal durante el cálculo.
        const inicio = w.__inicio = performance.now()
        setTimeout(() => { w.__timer = performance.now() - inicio - 100 }, 100)
      }, { once: true })
      const tic = () => {
        if (!w.__medir) return
        w.__frames++
        if (!w.__fin && document.querySelector('[data-testid=resultado-generacion]')) w.__fin = performance.now()
        if (document.querySelector('[role=status]')?.textContent?.includes('generando')) w.__indicador = true
        requestAnimationFrame(tic)
      }
      requestAnimationFrame(tic)
    })
    const framesAntes = await page.evaluate(() => (window as unknown as { __frames: number }).__frames)
    const t0 = Date.now()
    await boton.click()
    await page.evaluate(() => new Promise<void>(resolve => {
      const listo = () => document.querySelector('[data-testid=horarios-completos]')
      if (listo()) { resolve(); return }
      const observer = new MutationObserver(() => {
        if (!listo()) return
        observer.disconnect()
        resolve()
      })
      observer.observe(document.getElementById('root')!, { childList: true, subtree: true })
    }))
    const ms = Date.now() - t0
    // Dejar que PerformanceObserver reciba la tarea que pinta el resultado.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0))))
    const m = await page.evaluate(() => {
      const w = window as unknown as { __lt: { inicio: number; duracion: number }[]; __inicio: number; __fin: number; __frames: number; __medir: boolean; __indicador: boolean; __timer: number | null; w1Ejecuciones: number }
      w.__medir = false
      const hs = JSON.parse(localStorage.getItem('aliada_historial_semanas::900') ?? '[]')
      return { lt: w.__lt.filter(t => t.inicio + t.duracion >= w.__inicio).map(t => [Math.round(t.inicio - w.__inicio), Math.round(t.duracion)]), fin: Math.round(w.__fin - w.__inicio), frames: w.__frames, indicador: w.__indicador, timer: w.__timer, ejecuciones: w.w1Ejecuciones, generacion: hs[hs.length - 1]?.generacion, estado: document.querySelector('[data-testid=estado-validacion]')?.textContent?.slice(0, 40) }
    })
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    await expect(page.getByRole('heading', { name: 'Horarios generados' })).toBeVisible()
    const salida = await page.evaluate(() => {
      const historial = JSON.parse(localStorage.getItem('aliada_historial_semanas::900') ?? '[]')
      const { horarios, coberturaFranjas, faltantesFranjas, cumplimientoHoras } = historial[historial.length - 1]
      return JSON.stringify({ horarios, coberturaFranjas, faltantesFranjas, cumplimientoHoras })
    })
    const fila = {
      huella: createHash('sha256').update(salida).digest('hex'),
      modo, cancelacionMs, dotacion: d.total, cpu: rate, msHastaResultado: ms, demoraTimerMs: Math.round(m.timer ?? 0),
      tareaLargaMaxMs: Math.round(Math.max(0, ...m.lt.map(([, duracion]) => duracion))), tareasLargas: m.lt.length, detalleTareas: m.lt, primerPintadoMs: m.fin,
      cuadrosDuranteGeneracion: m.frames - framesAntes, indicadorPintado: m.indicador,
      estrategia: m.generacion?.estrategia, omitidas: m.generacion?.omitidas, validacion: m.generacion?.validacion, cobertura: m.generacion?.coberturaElegidaPct, respaldo: m.generacion?.coberturaRespaldoPct, estado: m.estado,
    }
    filas.push(fila)
    console.log(JSON.stringify(fila))
    expect(m.generacion?.versionAlgoritmo).toMatch(/^ah2-/)
    expect(m.ejecuciones).toBe(modo === 'worker' ? (cancelacionMs === undefined ? 1 : 2) : 0)
    if (modo === 'worker') {
      expect.soft(fila.tareaLargaMaxMs).toBeLessThan(200)
      expect.soft(fila.demoraTimerMs).toBeLessThan(200)
      if (cancelacionMs !== undefined) expect.soft(cancelacionMs).toBeLessThan(200)
      expect(fila.cuadrosDuranteGeneracion).toBeGreaterThan(0)
    }
  })
}
