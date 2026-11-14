// #38 — H-A2 (supervisión 09:00–22:00) obligatoria con cualquier valor de «apertura solo AUX»,
// incluso con cero AUX. Concordancia diagnóstico previo ↔ motor ↔ validación ↔ edición ↔ PDF.
import { describe, expect, it } from 'vitest'
import { prepararDisponibilidadSemana } from '../disponibilidadHabitual'
import { validarResultadoSemana, estadoValidacion } from '../validacionSemana'
import { aplicarEdicionConRecalculo } from '../../hooks/useAsignacion'
import { generarPDF } from '../exportPDF'
import { textoPDFNode } from './fixtures/pdfTextoNode'
import { convertirInputAV2 } from '../../algoritmo/adapter'
import { ejecutarAlgoritmo } from '../../algoritmo/orquestador'
import type { Auxiliar } from '../../types'
import { CAJEROS_S47, EVENTUALES_S47, OPERATIVA_S47 } from '../../algoritmo/__tests__/fixtures/semana47Anonimizada'
import { NECESIDAD_S47, LUNES_S47, generar } from '../../algoritmo/__tests__/fixtures/aperturaHelpers'

const aux = (id: string, h: string): Auxiliar => ({ id, nombre: `Aux ${id}`, activo: true, horarioSemanal: Array(7).fill(h) })
const ESCENARIOS: Record<string, { auxiliares: Auxiliar[]; ha2: boolean; ha1SiOn: boolean }> = {
  'cero AUX': { auxiliares: [], ha2: true, ha1SiOn: true },
  'AUX solo en la apertura': { auxiliares: [aux('ap', '08:00-09:00')], ha2: true, ha1SiOn: false },
  'AUX solo por la tarde': { auxiliares: [aux('tarde', '14:00-23:00')], ha2: true, ha1SiOn: true },
  'supervisión completa': { auxiliares: [aux('m', '08:00-16:00'), aux('t', '15:00-23:00')], ha2: false, ha1SiOn: false },
}
const DIAS = [0, 1, 2, 3, 4, 5, 6]

function correr(auxiliares: Auxiliar[], aperturaSoloAux: boolean) {
  const op = { ...OPERATIVA_S47, aperturaSoloAux }
  const disp = prepararDisponibilidadSemana(auxiliares, EVENTUALES_S47, [], LUNES_S47, { aperturaSoloAux })
  const motor = ejecutarAlgoritmo(convertirInputAV2(NECESIDAD_S47, CAJEROS_S47, disp.auxiliares, disp.eventuales, [], op))
  const r = generar(op, disp.auxiliares, disp.eventuales)
  const v = validarResultadoSemana(r, CAJEROS_S47, disp.auxiliares, disp.eventuales, {
    necesidad: NECESIDAD_S47, excepciones: [], operativa: op, huecosSupervision: disp.huecosSupervision,
  })
  return { op, disp, motor, r, v }
}
const dias = (xs: { dia?: number }[]) => [...new Set(xs.map(x => x.dia))].sort()

for (const [nombre, esc] of Object.entries(ESCENARIOS)) {
  for (const aperturaSoloAux of [false, true]) {
    describe(`#38 H-A2 · ${nombre} · apertura solo AUX ${aperturaSoloAux ? 'ON' : 'OFF'}`, () => {
      const { disp, motor, v } = correr(esc.auxiliares, aperturaSoloAux)

      it('diagnóstico previo, motor y validación final coinciden en H-A2 (días afectados)', () => {
        const diag = dias(disp.huecosSupervision.filter(h => h.tipo === 'SUPERVISION'))
        const mot = dias(motor.reporte_reglas.violaciones.filter(x => x.regla === 'H-A2'))
        const val = dias(v.violaciones.filter(x => x.codigo === 'H-A2'))
        expect(diag).toEqual(esc.ha2 ? DIAS : [])
        expect(mot).toEqual(diag)
        expect(val).toEqual(diag)
      })

      it('H-A1 solo existe con apertura ON y sin AUX presente 08:00–09:00 (OFF nunca lo exige)', () => {
        const esperado = aperturaSoloAux && esc.ha1SiOn ? DIAS : []
        expect(dias(disp.huecosSupervision.filter(h => h.tipo === 'APERTURA'))).toEqual(esperado)
        expect(dias(motor.reporte_reglas.violaciones.filter(x => x.regla === 'H-A1'))).toEqual(esperado)
        expect(dias(v.violaciones.filter(x => x.codigo === 'H-A1'))).toEqual(esperado)
      })

      it(esc.ha2 ? 'la falta de supervisión deja la semana en BORRADOR' : 'con supervisión completa no hay avisos falsos de supervisión ni de apertura', () => {
        if (esc.ha2) {
          expect(v.publicable).toBe(false)
          expect(estadoValidacion(v)).toMatch(/^BORRADOR/)
        } else {
          expect(v.violaciones.filter(x => ['H-A1', 'H-A2', 'OP_APERTURA_COMPOSICION'].includes(x.codigo))).toEqual([])
          expect(v.publicable).toBe(true)
        }
      })
    })
  }
}

describe('#38 H-A2 · cero AUX con OFF', () => {
  it('la apertura con FULL/PART es válida, pero la ausencia total de supervisión no pasa', () => {
    const { v } = correr([], false)
    expect(v.violaciones.filter(x => x.codigo === 'OP_APERTURA_COMPOSICION')).toEqual([])
    const ha2 = v.violaciones.filter(x => x.codigo === 'H-A2')
    expect(ha2).toHaveLength(7)
    expect(ha2[0].detalle).toMatch(/no hay ningún supervisor \(AUX\) disponible/)
  })

  it('el PDF sale como BORRADOR y lista H-A2', async () => {
    const { r, v } = correr([], false)
    const pdf = generarPDF(r, CAJEROS_S47, 'S', [], EVENTUALES_S47, { sucursal: '000', validacion: v, estado: estadoValidacion(v) })
    const texto = (await textoPDFNode(new Uint8Array(pdf.output('arraybuffer')))).replace(/\s+/g, ' ')
    expect(texto).toMatch(/Estado: BORRADOR/)
    expect(texto).toContain('H-A2')
  })
})

describe('#38 H-A2 · edición manual', () => {
  const op = { ...OPERATIVA_S47, aperturaSoloAux: false }
  const auxiliares = ESCENARIOS['supervisión completa'].auxiliares
  const nombrePorId = Object.fromEntries([...CAJEROS_S47, ...auxiliares, ...EVENTUALES_S47].map(p => [p.id, p.nombre]))
  const ctx = {
    necesidadFranjas: NECESIDAD_S47.map(f => f.necesidad), operativa: op, nombrePorId,
    disponibilidad: Object.fromEntries([...auxiliares, ...EVENTUALES_S47].map(p => [p.id, p.horarioSemanal])),
  }
  const validar = (r: ReturnType<typeof generar>) =>
    validarResultadoSemana(r, CAJEROS_S47, auxiliares, EVENTUALES_S47, { necesidad: NECESIDAD_S47, excepciones: [], operativa: op })

  it('una edición que deja un tramo sin AUX produce H-A2 ese día; restaurarla lo resuelve', () => {
    const r0 = generar(op, auxiliares, EVENTUALES_S47)
    expect(validar(r0).violaciones.filter(x => x.codigo === 'H-A2')).toEqual([])
    const conHueco = aplicarEdicionConRecalculo(r0, 't', 4, { esFranco: false, turnos: [{ inicio: '18:00', fin: '23:00' }] }, 'Aux t', ctx)
    const ha2 = validar(conHueco).violaciones.filter(x => x.codigo === 'H-A2')
    expect(ha2.map(x => x.dia)).toEqual([4])
    expect(ha2[0].detalle).toMatch(/16:00/)
    const restaurado = aplicarEdicionConRecalculo(conHueco, 't', 4, { esFranco: false, turnos: [{ inicio: '15:00', fin: '23:00' }] }, 'Aux t', ctx)
    expect(validar(restaurado).violaciones.filter(x => x.codigo === 'H-A2')).toEqual([])
  })

  it('dar franco al único AUX de la mañana deja ese día sin supervisión 09:00–15:00', () => {
    const r0 = generar(op, auxiliares, EVENTUALES_S47)
    const r = aplicarEdicionConRecalculo(r0, 'm', 2, { esFranco: true, turnos: [] }, 'Aux m', ctx)
    const ha2 = validar(r).violaciones.filter(x => x.codigo === 'H-A2')
    expect(ha2.map(x => x.dia)).toEqual([2])
    expect(validar(r).publicable).toBe(false)
  })
})
