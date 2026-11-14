// #38 — Reproducción de la semana 47 (anonimizada) y contrato de la apertura 08:00–09:00.
import { describe, expect, it } from 'vitest'
import { prepararDisponibilidadSemana } from '../../utils/disponibilidadHabitual'
import { validarResultadoSemana } from '../../utils/validacionSemana'
import type { ResultadoAsignacion } from '../../types'
import { AUX_APERTURA_S47, AUX_S47, CAJEROS_S47, EVENTUALES_S47, OPERATIVA_S47 } from './fixtures/semana47Anonimizada'
import { NECESIDAD_S47, LUNES_S47 as LUNES, generarS47, composicionApertura } from './fixtures/aperturaHelpers'

describe('#38 — semana 47 anonimizada (apertura_solo_aux ON, configuración efectiva real)', () => {
  const r = generarS47()

  it('cada día, 08:00 y 08:30: exactamente 1 AUX (el presente), 0 FULL/PART y 0 eventuales', () => {
    for (let dia = 0; dia < 7; dia++) for (const slot of [0, 1] as const) {
      expect(composicionApertura(r, dia, slot), `día ${dia} slot ${slot}`).toEqual({ fullPart: 0, aux: [AUX_APERTURA_S47[dia]], eventual: [] })
    }
  })

  it('la cobertura informada en la apertura es la real (1 cuando la demanda es 1; nunca 2/1)', () => {
    for (let dia = 0; dia < 7; dia++) for (const fila of [2, 3]) { // filas 08:00 y 08:30 de HORAS_FRANJAS
      expect(r.coberturaFranjas[fila][dia], `día ${dia} fila ${fila}`).toBe(1)
    }
  })

  it('el validador no declara VALIDADO un horario con la composición de apertura incorrecta', () => {
    const disp = prepararDisponibilidadSemana(AUX_S47, EVENTUALES_S47, [], LUNES)
    const malo: ResultadoAsignacion = {
      ...r,
      cajaEventual: (r.cajaEventual ?? []).map(e => e.colaboradorId === 'ev-M'
        ? { ...e, slotsCajaPorDia: e.slotsCajaPorDia.map((fila, d) => fila.map((v, s) => (d !== 5 && s < 2) || v)) }
        : e),
    }
    const v = validarResultadoSemana(malo, CAJEROS_S47, disp.auxiliares, disp.eventuales, {
      necesidad: NECESIDAD_S47, excepciones: [], operativa: OPERATIVA_S47, huecosSupervision: disp.huecosSupervision,
    })
    expect(v.publicable).toBe(false)
    expect(v.violaciones.filter(x => x.codigo === 'OP_APERTURA_COMPOSICION').map(x => x.dia)).toEqual([0, 1, 2, 3, 4, 6])
  })
})
