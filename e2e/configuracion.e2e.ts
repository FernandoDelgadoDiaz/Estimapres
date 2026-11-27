import { expect, test } from '@playwright/test'
import { CAJEROS_DE_PRUEBA, AUXILIARES_DE_PRUEBA } from './fixtures/roster'

test.beforeEach(async ({ page }) => {
  await page.route('**/*', r => new URL(r.request().url()).origin === 'http://127.0.0.1:4176' ? r.continue() : r.abort())
  await page.addInitScript(({ c, a }) => {
    if (sessionStorage.getItem('cfg')) return
    sessionStorage.setItem('cfg', '1')
    localStorage.setItem('aliada_sucursal_actual', '900')
    localStorage.setItem('cajeros_colaboradores::900', JSON.stringify(c))
    localStorage.setItem('aliada_auxiliares::900', JSON.stringify(a))
  }, { c: CAJEROS_DE_PRUEBA, a: AUXILIARES_DE_PRUEBA })
})

test('Configuración: campos simples que se guardan y se aplican, sin textos técnicos', async ({ page }) => {
  await page.goto('/reglas')
  await expect(page.getByRole('heading', { name: 'Configuración', level: 1 })).toBeVisible()
  for (const tecnico of ['default', 'algoritmo', 'AUX', 'FULL/PART', 'Reglas configuradas']) await expect(page.getByText(tecnico, { exact: false })).toHaveCount(0)

  // Interruptor de apertura: se guarda y Nueva semana lo usa.
  const apertura = page.getByRole('switch', { name: 'La caja la abre un supervisor (08:00 a 09:00)' })
  await expect(apertura).toHaveAttribute('aria-checked', 'true')
  await apertura.click()
  await expect(apertura).toHaveAttribute('aria-checked', 'false')

  // Máximo de francos y eventuales
  await page.getByLabel('Máximo de personas de franco el mismo día (supervisores incluidos)').fill('3')
  await page.getByLabel('Tramos de caja por día', { exact: true }).selectOption('2')
  // AH2-070: tramos de caja de supervisores, 2 por defecto.
  await expect(page.getByLabel('Tramos de caja por día de cada supervisor')).toHaveValue('2')
  // AH2-067: cambiar la hora varias veces deja una sola regla (la última).
  await page.getByLabel('No atienden caja después de las').selectOption('22:00')
  await page.getByLabel('No atienden caja después de las').selectOption('21:00')
  await page.getByLabel('Tramos de caja por día', { exact: true }).selectOption('3')
  await page.getByLabel('Tramos de caja por día', { exact: true }).selectOption('2')

  // Regla por persona: franco fijo
  await page.getByLabel('Persona', { exact: true }).selectOption({ label: 'Part A (PART)' })
  await page.getByLabel('Regla', { exact: true }).selectOption('franco_fijo')
  await page.getByLabel('Día', { exact: true }).selectOption('2')
  await page.getByRole('button', { name: 'Agregar' }).first().click()
  await expect(page.getByText('Part A: franco fijo los Mié')).toBeVisible()

  // AH2-056: pedido de turno. El desplegable muestra solo los turnos del contrato de la persona.
  await page.getByLabel('Regla', { exact: true }).selectOption('turno')
  await page.getByLabel('Persona', { exact: true }).selectOption({ label: 'Part A (PART)' })
  const turnos = page.getByLabel('Turno', { exact: true })
  await expect(turnos.locator('option')).toHaveText([/Solo mañana/, /Solo tarde/, /Solo noche/, /Solo cierre/])
  await page.getByLabel('Persona', { exact: true }).selectOption({ index: 1 })
  await expect(turnos.locator('option')).toHaveText([/Solo mañana/, /Solo intermedio/, /Solo tarde/, /Solo cortado/, /Solo cierre/])
  // AH2-058: sin opciones repetidas fuera de «Turno».
  await expect(page.getByLabel('Regla', { exact: true }).locator('option')).toHaveText(['Turno (pedido)', 'Franco fijo', 'No entra antes de', 'No sale después de', 'Prefiere trabajar los domingos'])
  await turnos.selectOption('cortado')
  await page.getByLabel('Período', { exact: true }).selectOption('anio')
  await page.getByRole('button', { name: 'Agregar' }).first().click()
  await expect(page.getByText(/: solo cortado$/)).toBeVisible()
  // AH2-071: horas adicionales solo para PART; se guardan con horas y modo.
  await page.getByLabel('Persona', { exact: true }).selectOption({ label: 'Part A (PART)' })
  await page.getByLabel('Regla', { exact: true }).selectOption('horas_adicionales')
  await page.getByLabel('Horas semanales').fill('42')
  await page.getByLabel('Modo de horas').selectOption('exacto')
  await page.getByLabel('Período', { exact: true }).selectOption('semana')
  await page.getByRole('button', { name: 'Agregar' }).first().click()
  await expect(page.getByText('Part A: horas adicionales PART 42 h')).toBeVisible()
  const adicionales = await page.evaluate(() => (JSON.parse(localStorage.getItem('aliada_reglas_configurables::900') ?? '[]') as Array<{ tipo: string; cantidad?: number; modoHoras?: string }>).filter(r => r.tipo === 'horas_adicionales'))
  expect(adicionales).toEqual([expect.objectContaining({ cantidad: 42, modoHoras: 'exacto' })])
  // Opciones fuera de la pantalla del supervisor (decisión del propietario).
  await expect(page.getByRole('option', { name: /Lo armo yo/ })).toHaveCount(0)
  await expect(page.getByText('Qué eventuales atienden caja')).toHaveCount(0)

  // Mínimo de cajeros con validación del horario
  await page.getByLabel('Horario del mínimo').fill('12 a')
  await page.getByRole('button', { name: 'Agregar' }).nth(1).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByLabel('Horario del mínimo').fill('12 a 14')
  await page.getByRole('button', { name: 'Agregar' }).nth(1).click()
  await expect(page.getByText('Mínimo 2 cajeros todos los días de 12:00 a 14:00')).toBeVisible()

  // Persistencia tras recargar
  await page.reload()
  await expect(page.getByRole('switch', { name: 'La caja la abre un supervisor (08:00 a 09:00)' })).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByLabel('Máximo de personas de franco el mismo día (supervisores incluidos)')).toHaveValue('3')
  await expect(page.getByLabel('Tramos de caja por día', { exact: true })).toHaveValue('2')
  await expect(page.getByLabel('No atienden caja después de las')).toHaveValue('21:00')
  await expect(page.getByText('Part A: franco fijo los Mié')).toBeVisible()

  // Pausar y quitar
  await page.getByRole('switch', { name: 'Pausar Part A: franco fijo los Mié' }).click()
  await expect(page.getByRole('switch', { name: 'Activar Part A: franco fijo los Mié' })).toHaveAttribute('aria-checked', 'false')
  page.once('dialog', d => void d.accept())
  await page.getByRole('listitem').filter({ hasText: 'Part A: franco fijo' }).getByRole('button', { name: 'Quitar' }).click()
  await expect(page.getByText('Part A: franco fijo los Mié')).toHaveCount(0)

  // Sin opciones avanzadas en la pantalla del supervisor (decisión del propietario).
  await expect(page.getByText('Opciones avanzadas')).toHaveCount(0)
  await expect(page.getByText('Exportar JSON')).toHaveCount(0)

  // Lo guardado es lo que usa la generación: misma regla de la sucursal, sin duplicados.
  const reglas = await page.evaluate(() => JSON.parse(localStorage.getItem('aliada_reglas_configurables::900') ?? '[]') as Array<{ tipo: string; activa: boolean; cantidad?: number; hora?: string }>)
  expect(reglas.filter(r => r.tipo === 'eventuales_caja_hora_limite')).toEqual([expect.objectContaining({ hora: '21:00', activa: true })])
  expect(reglas.filter(r => r.tipo === 'max_bloques_caja_eventual_dia')).toEqual([expect.objectContaining({ cantidad: 2, activa: true })])
  expect(reglas.filter(r => r.tipo === 'apertura_solo_aux')).toEqual([expect.objectContaining({ activa: false })])
  expect(reglas.filter(r => r.tipo === 'max_francos_dia')).toEqual([expect.objectContaining({ cantidad: 3, activa: true })])
})
