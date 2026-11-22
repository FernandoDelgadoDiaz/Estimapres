// AH2-057 · Horarios → Cargar ausencia → dos propuestas → aprobar → versión nueva con AUSENTE y nota.
import { test, expect } from '@playwright/test'
import { generar, LUNES_S47, NECESIDAD_S47 } from '../src/algoritmo/__tests__/fixtures/aperturaHelpers'
import { PERFIL_HORAS_VIGENTE } from '../src/algoritmo/contratos'
import { AUX_S47, CAJEROS_S47, EVENTUALES_S47, OPERATIVA_S47 } from '../src/algoritmo/__tests__/fixtures/semana47Anonimizada'

test('AH2-057: el supervisor carga una ausencia, elige una propuesta y queda una versión nueva', async ({ page }) => {
  test.setTimeout(90_000)
  const op = { ...OPERATIVA_S47, aperturaSoloAux: true }
  const r = generar(op, AUX_S47, EVENTUALES_S47)
  const semana = {
    id: 's47', fechaLunes: LUNES_S47, version: 1, descripcion: 'Semana 47', generadoEl: '2026-11-14T12:00:00Z', editadoManualmente: false,
    resumenPorColaborador: {}, horarios: r.horarios, cajaAux: r.cajaAux, cajaEventual: r.cajaEventual, coberturaFranjas: r.coberturaFranjas,
    faltantesFranjas: r.faltantesFranjas, porcentajeCobertura: r.porcentajeCobertura, necesidadFranjas: NECESIDAD_S47.map(f => f.necesidad),
    configOperativa: op, perfilHorasId: PERFIL_HORAS_VIGENTE.id, disponibilidadSemana: Object.fromEntries([...AUX_S47, ...EVENTUALES_S47].map(p => [p.id, p.horarioSemanal])),
  }
  const ausente = CAJEROS_S47.find(c => c.tipo === 'FULL' && r.horarios.find(h => h.colaboradorId === c.id)!.jornadas[2].turnos.length)!
  await page.clock.setFixedTime(new Date('2026-11-17T12:00:00-03:00')) // martes: aviso por el miércoles
  await page.addInitScript(({ c, a, e, s }) => {
    localStorage.setItem('cajeros_colaboradores', JSON.stringify(c))
    localStorage.setItem('aliada_auxiliares', JSON.stringify(a))
    localStorage.setItem('aliada_eventuales', JSON.stringify(e))
    localStorage.setItem('aliada_historial_semanas', JSON.stringify([s]))
  }, { c: CAJEROS_S47, a: AUX_S47, e: EVENTUALES_S47, s: semana })
  await page.setViewportSize({ width: 1400, height: 1000 })
  await page.goto('/horarios')
  await expect(page.getByTestId('estado-validacion')).toHaveCount(0)

  await page.getByRole('button', { name: 'Cargar ausencia' }).click()
  const panel = page.getByTestId('panel-ausencia')
  await panel.getByLabel('Persona ausente').selectOption(ausente.id)
  await expect(panel.getByLabel('Desde')).toHaveValue('2026-11-18')
  await panel.getByLabel('Hasta').fill('2026-11-19')
  await panel.getByLabel('Motivo').fill('Enfermedad')
  await panel.getByRole('button', { name: 'Buscar cobertura' }).click()
  const propuestas = page.getByTestId('propuestas-ausencia')
  await expect(propuestas).toBeVisible({ timeout: 30_000 })
  await expect(propuestas).toContainText('no viene: miércoles, jueves')
  await expect(propuestas).toContainText('Se replanifica desde el miércoles')
  await expect(page.getByTestId('propuesta-menor_impacto')).toBeVisible()
  // Sin aprobador no se puede aprobar.
  const aprobar = page.getByTestId('propuesta-menor_impacto').getByRole('button', { name: /Aprobar/ })
  await expect(aprobar).toBeDisabled()
  await propuestas.getByLabel('Aprueba').fill(AUX_S47[0].nombre)
  await expect(aprobar).toBeEnabled()
  if (process.env.SP) await panel.screenshot({ path: process.env.SP + '/ah2057-propuestas.png' })
  await aprobar.click()

  const ok = page.getByTestId('version-aprobada')
  await expect(ok).toContainText('versión 2')
  await expect(ok).toContainText(`aprobada por ${AUX_S47[0].nombre}`)
  await expect(ok).toContainText('Enfermedad')
  const fila = page.getByRole('row', { name: new RegExp(ausente.nombre) })
  await expect(fila.getByRole('cell').filter({ hasText: 'AUSENTE' })).toHaveCount([2, 3].filter(d => r.horarios.find(h => h.colaboradorId === ausente.id)!.jornadas[d].turnos.length).length)
  await expect(fila.getByRole('cell').filter({ hasText: 'AUSENTE' }).first()).toHaveCSS('background-color', 'rgb(254, 202, 202)')
  // La nueva versión sigue cumpliendo las reglas (no aparece el recuadro rojo).
  await expect(page.getByTestId('estado-validacion')).toHaveCount(0)
  const guardado = await page.evaluate(() => JSON.parse(localStorage.getItem('aliada_historial_semanas') ?? '[]'))
  expect(guardado.map((s: { version: number }) => s.version).sort()).toEqual([1, 2])
  const v2 = guardado.find((s: { version: number }) => s.version === 2)
  expect(v2.contingencia).toMatchObject({ aprobadoPor: AUX_S47[0].nombre, basadaEnVersion: 1, opcion: 'menor_impacto' })
  // PDF actualizado.
  const descarga = page.waitForEvent('download')
  await ok.getByRole('button', { name: 'Descargar PDF actualizado' }).click()
  expect((await descarga).suggestedFilename()).toContain('semana-47')
  if (process.env.SP) await page.screenshot({ path: process.env.SP + '/ah2057-version.png', fullPage: false })
})
