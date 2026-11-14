// #7 · AH2-020 — Medición de bloqueo de interfaz de la generación con multi-arranque.
// NO forma parte de la suite E2E (no termina en .e2e.ts). Se corre con:
//   npm run build && PLAYWRIGHT_CHROMIUM_EXECUTABLE=<chromium> npx playwright test -c playwright.perf.config.ts
// Opcional: AH2_PERF_OUT=<archivo.json>. Datos 100 % sintéticos; sin red (todo externo se aborta).
//
// Mide, por dotación (9 = tamaño 091, y 20 / 35 / 55 cajeros) y por ralentización de CPU (1×, 4×, 6× vía CDP,
// equivalente a equipos y celulares de gama baja):
//   - tiempo desde el clic en «Generar» hasta ver «Horarios generados»;
//   - la tarea larga más larga (PerformanceObserver 'longtask') = congelamiento de la interfaz;
//   - cuadros pintados durante la generación (requestAnimationFrame): 0 ⇒ la pantalla no se actualiza
//     (ni siquiera el indicador «generando…»).
import { expect, test } from '@playwright/test'
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
    await page.addInitScript(({ cajeros, auxiliares, reglas }) => {
      if (sessionStorage.getItem('ah2-perf')) return
      sessionStorage.setItem('ah2-perf', '1')
      localStorage.setItem('aliada_sucursal_actual', '900')
      localStorage.setItem('cajeros_colaboradores::900', JSON.stringify(cajeros))
      localStorage.setItem('aliada_auxiliares::900', JSON.stringify(auxiliares))
      localStorage.setItem('aliada_eventuales::900', '[]')
      localStorage.setItem('aliada_reglas_configurables::900', JSON.stringify(reglas))
    }, { cajeros, auxiliares: AUXILIARES_DE_PRUEBA, reglas })
    await page.goto('/nueva-semana')
    await page.locator('input[type=file]').setInputFiles({ name: 'pom.pdf', mimeType: 'application/pdf', buffer: pdfPom(d.factor) })
    await expect(page.getByTestId('semana-pom')).toContainText('2026-11-16 al 2026-11-22')
    const boton = page.getByRole('button', { name: /Generar horarios automáticamente/ })
    await expect(boton).toBeEnabled()

    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate })
    await page.evaluate(() => {
      const w = window as unknown as { __lt: number[]; __frames: number; __medir: boolean; __indicador: boolean }
      w.__lt = []; w.__frames = 0; w.__medir = true; w.__indicador = false
      new PerformanceObserver(l => { for (const e of l.getEntries()) w.__lt.push(e.duration) }).observe({ type: 'longtask' })
      // rAF corre justo antes de pintar: si ve el texto del indicador, el indicador llegó a pintarse.
      const tic = () => { if (!w.__medir) return; w.__frames++; if (document.body.textContent?.includes('está generando')) w.__indicador = true; requestAnimationFrame(tic) }
      requestAnimationFrame(tic)
    })
    const framesAntes = await page.evaluate(() => (window as unknown as { __frames: number }).__frames)
    const t0 = Date.now()
    await boton.click()
    await expect(page.getByRole('heading', { name: 'Horarios generados' })).toBeVisible({ timeout: 9 * 60 * 1000 })
    const ms = Date.now() - t0
    const m = await page.evaluate(() => {
      const w = window as unknown as { __lt: number[]; __frames: number; __medir: boolean; __indicador: boolean }
      w.__medir = false
      const hs = JSON.parse(localStorage.getItem('aliada_historial_semanas::900') ?? '[]')
      return { lt: w.__lt, frames: w.__frames, indicador: w.__indicador, generacion: hs[hs.length - 1]?.generacion, estado: document.querySelector('[data-testid=estado-validacion]')?.textContent?.slice(0, 40) }
    })
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
    const fila = {
      dotacion: d.total, cpu: rate, msHastaResultado: ms,
      tareaLargaMaxMs: Math.round(Math.max(0, ...m.lt)), tareasLargas: m.lt.length,
      cuadrosDuranteGeneracion: m.frames - framesAntes, indicadorPintado: m.indicador,
      estrategia: m.generacion?.estrategia, omitidas: m.generacion?.omitidas, validacion: m.generacion?.validacion, estado: m.estado,
    }
    filas.push(fila)
    console.log(JSON.stringify(fila))
    expect(m.generacion?.versionAlgoritmo).toMatch(/^ah2-/)
  })
}
