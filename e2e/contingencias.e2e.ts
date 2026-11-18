import { expect, test } from '@playwright/test'

test('registra, busca, revisa y aprueba una ausencia en el laboratorio aislado', async ({page}) => {
  await page.goto('/lab-contingencias.html')
  await expect(page.getByRole('heading',{ name:'Replanificar cajas' })).toBeVisible()
  await page.getByLabel('Colaborador').selectOption('f0')
  await page.getByRole('button',{name:'Registrar ausencia'}).click()
  await expect(page.getByText('2026-11-16 al 2026-11-18 · confirmada')).toBeVisible()
  await page.getByRole('button',{name:'Buscar cobertura'}).click()
  await expect(page.getByRole('heading',{name:'Revisar cambios'})).toBeVisible()
  await page.getByText('Ver semana completa').click()
  await expect(page.getByRole('row',{name:/2026-11-16 Intacta/})).toBeVisible()
  await page.getByRole('button',{name:'Aprobar en laboratorio'}).click()
  await expect(page.getByRole('status')).toHaveText('Propuesta aprobada en laboratorio')
  await page.getByRole('button',{name:'Anular'}).click()
  await expect(page.getByRole('button',{name:'Buscar cobertura'})).toBeDisabled()
  await expect(page.getByText(/2 eventos · 1 versiones aprobadas/)).toBeVisible()
})
