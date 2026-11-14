import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { jsPDF } from 'jspdf'
import { MATRIZ_POM_SINTETICA } from '../src/utils/__tests__/fixtures/pomSintetico'
import { textoPDFNode } from '../src/utils/__tests__/fixtures/pdfTextoNode'
import { CAJEROS_DE_PRUEBA, AUXILIARES_DE_PRUEBA } from './fixtures/roster'

function pdfPom() {
  const pdf = new jsPDF()
  pdf.text('Programación semanal 2026-11-16 - 2026-11-22', 12, 12)
  pdf.text('Programación de referencia: Persona de referencia', 12, 22)
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
  MATRIZ_POM_SINTETICA.forEach(([hora, demanda], i) => pdf.text(`${hora}:00 ${demanda.join(' ')}`, 105, 26 + i * 5))
  return Buffer.from(pdf.output('arraybuffer'))
}

const eventual = {
  id: 'ev-sintetico',
  nombre: 'Eventual Sintético',
  sector: 'Prueba',
  horarioSemanal: Array(7).fill('18:00-20:00'),
  activo: true,
}

async function preparar(page: Page, auxiliarInvalido = false, extra: { auxiliares?: unknown[]; reglas?: unknown[] } = {}) {
  const externas: string[] = []
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin === 'http://127.0.0.1:4176') return route.continue()
    externas.push(url.origin)
    await route.abort()
  })
  await page.addInitScript(({ cajeros, auxiliares, eventual, auxiliarInvalido, reglas }) => {
    if (auxiliarInvalido) auxiliares[0].horarioSemanal[0] = '08:15-16:00'
    if (sessionStorage.getItem('ah2-fixture')) return
    sessionStorage.setItem('ah2-fixture', '1')
    localStorage.setItem('aliada_sucursal_actual', '900')
    localStorage.setItem('cajeros_colaboradores::900', JSON.stringify(cajeros))
    localStorage.setItem('aliada_auxiliares::900', JSON.stringify(auxiliares))
    localStorage.setItem('aliada_eventuales::900', JSON.stringify([eventual]))
    if (reglas) localStorage.setItem('aliada_reglas_configurables::900', JSON.stringify(reglas))
  }, { cajeros: CAJEROS_DE_PRUEBA, auxiliares: extra.auxiliares ?? AUXILIARES_DE_PRUEBA, eventual, auxiliarInvalido, reglas: extra.reglas })
  await page.goto('/nueva-semana')
  await page.locator('input[type=file]').setInputFiles({
    name: 'demanda-prueba.pdf',
    mimeType: 'application/pdf',
    buffer: pdfPom(),
  })
  await expect(page.getByTestId('semana-pom')).toContainText('2026-11-16 al 2026-11-22')
  await expect(page.getByTestId('semana-pom')).toContainText('detectada en el PDF')
  return externas
}

async function abrirEditor(page: Page) {
  await page.getByText('Cargar excepción por fecha', { exact: true }).click()
  await page.getByLabel('Autor', { exact: true }).fill('Supervisor de prueba')
}

test('POM → demanda → horario nominal → validación → PDF, con excepción de eventual', async ({ page }) => {
  const externas = await preparar(page)
  await expect(page.getByText('Supervisión cubierta según las franjas que comprueba el motor.')).toBeVisible()
  await expect(page.getByText('406 horas-caja', { exact: true })).toBeVisible()
  const pico = page.getByRole('row').filter({ has: page.getByRole('cell', { name: '19:30', exact: true }) })
  await expect(pico.getByRole('cell').nth(6)).toHaveText('7')
  await abrirEditor(page)
  await page.getByRole('combobox', { name: 'Persona', exact: true }).selectOption(eventual.id)
  await page.getByRole('combobox', { name: 'Fecha de la excepción' }).selectOption('2026-11-21')
  await page.getByLabel('Sin disponibilidad', { exact: true }).check()
  await page.getByLabel('Motivo', { exact: true }).fill('Ausencia de prueba')
  await page.getByRole('button', { name: 'Aplicar excepción' }).click()
  await page.getByText('Ver patrón habitual y excepciones aplicadas', { exact: true }).click()
  const fila = page.getByRole('row').filter({ hasText: 'Eventual Sintético' })
  await expect(fila.getByRole('cell').nth(5)).toHaveText('Sin disponibilidadExcepción')
  await expect(fila.getByRole('cell').nth(4)).toHaveText('18:00 - 20:00Habitual')

  await page.getByRole('button', { name: /Generar horarios automáticamente/ }).click()
  await expect(page.getByRole('heading', { name: 'Horarios generados' })).toBeVisible()
  await expect(page.getByTestId('estado-validacion')).toContainText('VALIDADO')
  await expect(page.getByTestId('estado-validacion')).toContainText('Horas-caja faltantes:')
  await expect(page.getByText('Full A', { exact: true }).first()).toBeVisible()
  const descarga = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar a PDF' }).click()
  const archivo = await (await descarga).path()
  const texto = (await textoPDFNode(new Uint8Array(await readFile(archivo!)))).replace(/\s+/g, ' ')
  for (const contenido of ['Sucursal 900', 'Semana 16/11/2026 al 22/11/2026', 'Estado: VALIDADO', 'Full A', 'Validación y faltantes']) {
    expect(texto).toContain(contenido)
  }
  expect(texto).not.toContain('Persona de referencia')
  expect(externas).toEqual([])
})

test('genera a partir del POM y el patrón habitual sin cargar excepciones', async ({ page }) => {
  const externas = await preparar(page)
  await expect(page.getByText('Supervisión cubierta según las franjas que comprueba el motor.')).toBeVisible()
  // #38: el estado efectivo de las reglas operativas se muestra antes de generar
  await expect(page.getByTestId('regla-efectiva-apertura_solo_aux')).toContainText('Apertura con supervisor: ACTIVADA (valor predeterminado)')
  await page.getByRole('button', { name: /Generar horarios automáticamente/ }).click()
  await expect(page.getByTestId('estado-validacion')).toContainText('VALIDADO')
  await expect(page.getByTestId('estado-validacion')).not.toContainText('OP_APERTURA')
  await expect(page.getByText('Aux A', { exact: true }).first()).toBeVisible()
  expect(externas).toEqual([])
})

test('#38 apertura OFF sin AUX de 08:00 a 09:00: no exige AUX en la apertura y pide un cajero FULL/PART', async ({ page }) => {
  const externas = await preparar(page, false, {
    auxiliares: [
      { id: 'aux-x', nombre: 'Aux X', activo: true, horarioSemanal: Array(7).fill('09:00-16:00') },
      { id: 'aux-y', nombre: 'Aux Y', activo: true, horarioSemanal: Array(7).fill('15:00-23:00') },
    ],
    reglas: [{ id: 'r-off', ambito: 'local', tipo: 'apertura_solo_aux', activa: false, descripcion: 'Apertura con cajero', creadaEl: '2026-11-01T00:00:00.000Z' }],
  })
  await expect(page.getByTestId('regla-efectiva-apertura_solo_aux')).toContainText('Apertura con supervisor: DESACTIVADA (configurada en Reglas)')
  await expect(page.getByText('Supervisión cubierta según las franjas que comprueba el motor.')).toBeVisible()
  await expect(page.getByText(/ningún supervisor \(AUX\) presente en la apertura/)).toHaveCount(0)
  await page.getByRole('button', { name: /Generar horarios automáticamente/ }).click()
  const estado = page.getByTestId('estado-validacion')
  await expect(estado).toBeVisible()
  await expect(estado).not.toContainText('ningún supervisor (AUX) presente en la apertura')
  await expect(estado).not.toContainText('AUX en caja (la apertura la abre un FULL/PART)')
  await expect(estado).not.toContainText('eventual(es) en caja')
  // Con 2 FULL (las únicas jornadas que pueden abrir a las 08:00) no alcanza para 7 días:
  // se informa la imposibilidad, sin sustituir por AUX/eventual ni forzar contratos.
  await expect(estado).toContainText('BORRADOR')
  await expect(estado).toContainText('ningún cajero FULL/PART abre dentro de su contrato')
  expect(externas).toEqual([])
})

test('avisa huecos de AUX antes de generar y marca el resultado como borrador', async ({ page }) => {
  const externas = await preparar(page)
  await abrirEditor(page)
  await page.getByRole('combobox', { name: 'Persona', exact: true }).selectOption('aux2')
  await page.getByLabel('Horario excepcional').fill('08:15-12:00')
  await page.getByLabel('Motivo', { exact: true }).fill('Licencia de prueba')
  await page.getByRole('button', { name: 'Aplicar excepción' }).click()
  await expect(page.getByRole('alert')).toContainText('Ingresá bloques en medias horas')
  await page.getByLabel('Sin disponibilidad', { exact: true }).check()
  await page.getByRole('button', { name: 'Aplicar excepción' }).click()
  await expect(page.getByText(/Faltantes de supervisión/)).toBeVisible()
  await expect(page.getByText(/lunes: ningún supervisor.*apertura/)).toBeVisible()
  await page.getByLabel('Sin disponibilidad', { exact: true }).check()
  await page.getByLabel('Motivo', { exact: true }).fill('Duplicado de prueba')
  await page.getByRole('button', { name: 'Aplicar excepción' }).click()
  await expect(page.getByRole('alert')).toContainText('Ya existe una excepción')

  await page.getByRole('button', { name: /Generar horarios automáticamente/ }).click()
  await expect(page.getByTestId('estado-validacion')).toContainText('BORRADOR')
  await expect(page.getByText('Aux B', { exact: true }).first()).toBeVisible()
  await expect(page.getByTestId('estado-validacion')).toContainText('apertura')
  expect(externas).toEqual([])
})

test('el patrón inconsistente bloquea y la excepción de fecha permite continuar', async ({ page }) => {
  await preparar(page, true)
  const generar = page.getByRole('button', { name: /Generar horarios automáticamente/ })
  await expect(page.getByRole('alert')).toContainText('horario habitual del lunes')
  await expect(generar).toBeDisabled()
  await abrirEditor(page)
  await page.getByRole('combobox', { name: 'Persona', exact: true }).selectOption('aux1')
  await page.getByLabel('Horario excepcional').fill('11:00-19:00')
  await page.getByLabel('Motivo', { exact: true }).fill('Corrección puntual de prueba')
  await page.getByRole('button', { name: 'Aplicar excepción' }).click()
  await expect(generar).toBeEnabled()
  await page.getByRole('button', { name: /Quitar excepción de Aux A/ }).click()
  await expect(generar).toBeDisabled()
  await page.getByLabel('Horario excepcional').fill('11:00-19:00')
  await page.getByLabel('Motivo', { exact: true }).fill('Corrección temporal de prueba')
  await page.getByRole('button', { name: 'Aplicar excepción' }).click()
  await expect(generar).toBeEnabled()
  await page.reload()
  await page.locator('input[type=file]').setInputFiles({
    name: 'demanda-prueba.pdf', mimeType: 'application/pdf', buffer: pdfPom(),
  })
  await expect(page.getByRole('alert')).toContainText('horario habitual del lunes')
  await expect(generar).toBeDisabled()
  await expect(page.getByRole('list', { name: 'Excepciones aplicadas' })).toHaveCount(0)
})

test('la edición nominal interpreta intervalos y actualiza horas antes de guardar', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 980 })
  await preparar(page)
  await page.getByRole('button', { name: /Generar horarios automáticamente/ }).click()
  const celda = page.getByRole('button', { name: 'Editar Full A, Lun', exact: true })
  await celda.click()
  const jornada = page.getByLabel('Intervalos de la jornada')
  await jornada.fill('9 a')
  await expect(page.getByRole('button', { name: 'Guardar cambio' })).toBeDisabled()
  await jornada.fill('08.00 a 13.00 Y 17hs a 22hs')
  await expect(page.getByRole('row').filter({ has: celda })).toContainText('Asignadas')
  await page.getByRole('button', { name: /^Guardar (?:cambio|de todos modos)$/ }).click()
  await expect(celda).toContainText('08:00 - 13:00')
  await expect(celda).toContainText('17:00 - 22:00')
  if (process.env.AH2_CAPTURAS) await page.screenshot({ path: process.env.AH2_CAPTURAS + '/edicion-horario.png' })
})

test('Último Horario reabre la semana guardada y exporta los turnos A4', async ({ page }) => {
  await preparar(page)
  await page.getByRole('button', { name: /Generar horarios automáticamente/ }).click()
  await expect(page.getByRole('heading', { name: 'Horarios generados' })).toBeVisible()
  await page.goto('/ultimo-horario')
  await expect(page.getByRole('row').filter({ hasText: 'Full A' })).toBeVisible()
  const descarga = page.waitForEvent('download')
  await page.getByRole('button', { name: /Exportar PDF/ }).click()
  const ruta = await (await descarga).path()
  const texto = await textoPDFNode(new Uint8Array(await readFile(ruta!)))
  expect(texto).toContain('Semana 16/11/2026 al 22/11/2026')
  expect(texto).toContain('Full A')
  expect(texto).toContain('Asignaciones en caja')
})
