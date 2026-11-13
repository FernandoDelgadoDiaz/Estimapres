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
