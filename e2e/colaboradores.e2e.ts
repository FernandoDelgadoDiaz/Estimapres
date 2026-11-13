import { expect, test } from '@playwright/test'

test('091 empieza sin ejemplos y conserva un alta manual tras recargar', async ({ page }) => {
  await page.goto('/colaboradores')
  const activos = page.getByText('0 activos de 0 total', { exact: true })
  const agregar = page.getByRole('button', { name: /Agregar cajero/ })
  await expect(agregar).toBeEnabled()
  await expect(activos).toBeVisible()

  await page.getByRole('button', { name: 'Auxiliares', exact: true }).click()
  await expect(page.getByRole('button', { name: /Agregar auxiliar/ })).toBeEnabled()
  await expect(page.getByRole('button', { name: /Restaurar horarios de prueba/ })).toHaveCount(0)
  await expect(page.getByText('Aux A', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Cajeros', exact: true }).click()

  await agregar.click()
  await page.getByPlaceholder('Ej: Full A').fill('Cajero agregado en prueba')
  await page.getByRole('button', { name: 'Agregar', exact: true }).click()
  await expect(page.getByText('Cajero agregado en prueba', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('1 activos de 1 total', { exact: true })).toBeVisible()
  await expect(page.getByText('Cajero agregado en prueba', { exact: true })).toBeVisible()
})

test('alta y edición de un auxiliar desde teclado, con persistencia y horario completo', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 980 })
  await page.goto('/colaboradores')
  await page.getByRole('button', { name: 'Auxiliares', exact: true }).click()
  const agregar = page.getByRole('button', { name: /Agregar auxiliar/ })
  await agregar.click()
  const dialogo = page.getByRole('dialog')
  const nombre = dialogo.getByLabel('Nombre completo')
  await expect(nombre).toBeFocused()
  await nombre.press('Escape')
  await expect(dialogo).toHaveCount(0)
  await expect(page.getByText('Nuevo auxiliar', { exact: true })).toHaveCount(0)
  await agregar.click()
  await nombre.pressSequentially('Auxiliar de Prueba Nombre Compuesto')
  if (process.env.AH2_CAPTURAS) await page.screenshot({ path: process.env.AH2_CAPTURAS + '/alta-auxiliar.png' })
  await nombre.press('Enter')
  await expect(dialogo).toHaveCount(0)
  let lunes = page.getByRole('textbox', { name: 'Auxiliar de Prueba Nombre Compuesto, Lun' })
  await lunes.fill('08.00 a 12.30 Y 17hs a 22hs')
  await expect(page.getByText('9 h 30 min', { exact: true })).toBeVisible()
  await lunes.press('Tab')
  await expect(lunes).toHaveValue('08:00 - 12:30\n17:00 - 22:00')
  expect(await lunes.evaluate(n => n.scrollHeight <= n.clientHeight + 1 && n.scrollWidth <= n.clientWidth + 1)).toBe(true)
  if (process.env.AH2_CAPTURAS) await page.screenshot({ path: process.env.AH2_CAPTURAS + '/grilla-auxiliar.png' })
  await lunes.fill('17:00 a 08:00')
  await lunes.press('Tab')
  await expect(page.getByRole('alert')).toContainText('posterior al inicio')
  await page.reload()
  await page.getByRole('button', { name: 'Auxiliares', exact: true }).click()
  await expect(lunes).toHaveValue('08:00 - 12:30\n17:00 - 22:00')
  await page.getByRole('button', { name: 'Editar ficha' }).click()
  await nombre.fill('Auxiliar de Prueba Editado')
  await dialogo.getByRole('button', { name: 'Guardar auxiliar' }).click()
  lunes = page.getByRole('textbox', { name: 'Auxiliar de Prueba Editado, Lun' })
  await expect(lunes).toHaveValue('08:00 - 12:30\n17:00 - 22:00')
  await agregar.click()
  await nombre.fill('auxiliar de prueba editado')
  await nombre.press('Enter')
  await expect(dialogo.getByRole('alert')).toContainText('Ya hay un auxiliar')
})

test('muestra el máximo configurable y el aviso preventivo durante la edición eventual', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 980 })
  await page.goto('/colaboradores')
  await page.getByRole('button', { name: 'Eventuales', exact: true }).click()
  await page.getByRole('button', { name: 'Agregar eventual' }).click()
  for (const dia of ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']) {
    const campo = page.getByRole('textbox', { name: `Nuevo eventual, ${dia}` })
    await campo.fill('12 horas a 20 horas')
    if (dia === 'Dom') await expect(page.getByText('Advertencia: supera 48 h')).toBeVisible()
    await campo.press('Tab')
  }
  const limite = page.getByRole('spinbutton', { name: 'Máximo semanal' })
  await limite.fill('50')
  await limite.press('Tab')
  await expect(page.getByText('+6 h · Exceso')).toBeVisible()
  if (process.env.AH2_CAPTURAS) await page.screenshot({ path: process.env.AH2_CAPTURAS + '/alerta-eventual.png' })
  await page.reload()
  await page.getByRole('button', { name: 'Eventuales', exact: true }).click()
  await expect(limite).toHaveValue('50')
  await expect(page.getByText('+6 h · Exceso')).toBeVisible()
})

test('un auxiliar reaparece con el mismo ID tras recargar y volver a iniciar sesión', async ({ page }) => {
  const backend = 'https://aliada-pruebas.invalid'
  const uid = '00000000-0000-4000-8000-000000000091'
  const fichas = new Map<string, { id: string; grupo: string; nombre: string; local_id: string }>()
  // El servidor local conserva su configuración normal. Solo esta página
  // recibe el endpoint de prueba y todas sus peticiones se interceptan.
  await page.route('**/src/lib/supabase.ts*', async route => {
    const response = await route.fetch()
    const body = (await response.text())
      .replace('const url = import.meta.env.VITE_SUPABASE_URL', `const url = '${backend}'`)
      .replace('const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY', "const anonKey = 'clave-de-prueba'")
    await route.fulfill({ response, body })
  })
  await page.route(backend + '/**', async route => {
    const req = route.request()
    const url = new URL(req.url())
    if (url.pathname === '/auth/v1/token') {
      await route.fulfill({ json: {
        access_token: 'sesion.de.prueba', refresh_token: 'renovacion-prueba',
        token_type: 'bearer', expires_in: 3600, user: { id: uid, email: 'qa@example.invalid' },
      } })
    } else if (url.pathname === '/auth/v1/logout') {
      await route.fulfill({ status: 204 })
    } else if (url.pathname === '/rest/v1/colaboradores' && req.method() === 'POST') {
      const ficha = req.postDataJSON()
      expect(ficha.local_id).toBe(uid)
      expect(ficha.sucursal_id).toBe('091')
      fichas.set(ficha.id, ficha)
      await route.fulfill({ status: 201 })
    } else if (url.pathname === '/rest/v1/colaboradores') {
      await route.fulfill({ json: [...fichas.values()].filter(f => url.searchParams.get('grupo') === 'eq.' + f.grupo) })
    } else {
      await route.fulfill({ json: [] })
    }
  })

  const iniciar = async () => {
    await page.locator('input[type=email]').fill('qa@example.invalid')
    await page.locator('input[type=password]').fill('secreto-de-prueba')
    await page.getByRole('button', { name: 'Iniciar sesión' }).click()
    await page.getByRole('heading', { name: 'Colaboradores', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Auxiliares', exact: true }).click()
  }
  await page.goto('/colaboradores')
  await iniciar()
  await page.getByRole('button', { name: 'Agregar auxiliar' }).click()
  await page.getByLabel('Nombre completo').fill('Auxiliar Sintética Completa')
  const escritura = page.waitForResponse(r => r.url().includes('/rest/v1/colaboradores') && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Guardar auxiliar' }).click()
  expect((await escritura).status()).toBe(201)
  expect(fichas.size).toBe(1)
  const id = [...fichas.keys()][0]
  await page.reload()
  await page.getByRole('button', { name: 'Auxiliares', exact: true }).click()
  await expect(page.getByRole('rowheader', { name: 'Auxiliar Sintética Completa' })).toBeVisible()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await iniciar()
  await expect(page.getByRole('rowheader', { name: 'Auxiliar Sintética Completa' })).toBeVisible()
  expect([...fichas.keys()]).toEqual([id])
})
