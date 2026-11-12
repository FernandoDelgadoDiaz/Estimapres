import { describe, expect, it } from 'vitest'
import {
  detectarSemanaPOM, parsearTablaEstimado, fechasDeSemana, esLunesISO, ErrorContratoPOM, extraerFechas,
} from '../pomContrato'
import { interpretarTextoPOM } from '../pdfParser'
import { convertirInputAV2 } from '../../algoritmo/adapter'
import { HORAS_FRANJAS } from '../../types'
import { MATRIZ_POM_SINTETICA, SEMANA_REFERENCIA, textoPOMSintetico } from './fixtures/pomSintetico'

const errores = (fn: () => unknown): string[] => {
  try { fn() } catch (e) { if (e instanceof ErrorContratoPOM) return e.errores; throw e }
  throw new Error('se esperaba ErrorContratoPOM')
}

describe('POM-01: fixture sintético de referencia', () => {
  it('tiene 31×7 valores, ceros 07:00/07:30, pico 7 sáb 19:30–21:00 y 406 horas-caja', () => {
    expect(MATRIZ_POM_SINTETICA.map(([h]) => h)).toEqual(HORAS_FRANJAS)
    expect(MATRIZ_POM_SINTETICA.every(([, v]) => v.length === 7)).toBe(true)
    expect(MATRIZ_POM_SINTETICA[0][1].concat(MATRIZ_POM_SINTETICA[1][1]).every(v => v === 0)).toBe(true)
    const sab = Object.fromEntries(MATRIZ_POM_SINTETICA.map(([h, v]) => [h, v[5]]))
    expect([sab['19:30'], sab['20:00'], sab['20:30']]).toEqual([7, 7, 7])
    expect(Math.max(...MATRIZ_POM_SINTETICA.flatMap(([, v]) => v))).toBe(7)
    expect(MATRIZ_POM_SINTETICA.flatMap(([, v]) => v).reduce((a, b) => a + b, 0) / 2).toBe(406)
  })
})

describe('POM-01: tabla «Estimado de cajas necesarias»', () => {
  it('extrae la matriz exacta ignorando la tabla «Diferencia» (antes o después)', () => {
    for (const diferenciaPrimero of [true, false]) {
      const r = parsearTablaEstimado(textoPOMSintetico({ diferenciaPrimero }))
      expect(r.franjas.map(f => [f.hora, f.necesidad])).toEqual(MATRIZ_POM_SINTETICA)
      expect(r.horasCaja).toBe(406)
      expect(r.avisos).toEqual([])
    }
  })

  it('error explícito ante fila duplicada', () => {
    const est = [...MATRIZ_POM_SINTETICA]
    est.splice(10, 0, MATRIZ_POM_SINTETICA[10])
    expect(errores(() => parsearTablaEstimado(textoPOMSintetico({ estimado: est })))).toEqual(
      expect.arrayContaining([expect.stringMatching(/12:00: fila duplicada/)]),
    )
  })

  it('error explícito ante valor negativo o no entero en «Estimado»', () => {
    const neg = MATRIZ_POM_SINTETICA.map(([h, v]) => [h, h === '15:00' ? [3, -1, 3, 3, 4, 4, 3] : v] as [string, number[]])
    expect(errores(() => parsearTablaEstimado(textoPOMSintetico({ estimado: neg })))).toEqual(
      expect.arrayContaining([expect.stringMatching(/15:00, día 2: valor «-1»/)]),
    )
    const txt = textoPOMSintetico().replace('15:00:00 3 3 3 3 4 4 3', '15:00:00 3 3.5 3 3 4 4 3')
    expect(errores(() => parsearTablaEstimado(txt))).toEqual(
      expect.arrayContaining([expect.stringMatching(/15:00, día 2: valor «3\.5»/)]),
    )
  })

  it('error explícito ante franja faltante en medio de la tabla', () => {
    const est = MATRIZ_POM_SINTETICA.filter(([h]) => h !== '14:30')
    expect(errores(() => parsearTablaEstimado(textoPOMSintetico({ estimado: est })))).toEqual(
      expect.arrayContaining(['Falta la franja 14:30 dentro de la tabla.']),
    )
  })

  it('error ante columna faltante (fila con 6 valores) porque deja un hueco', () => {
    const txt = textoPOMSintetico().replace('16:00:00 4 4 4 4 5 5 4', '16:00:00 4 4 4 4 5 5')
    expect(errores(() => parsearTablaEstimado(txt)).join('\n')).toMatch(/Falta la franja|fuera de orden/)
  })

  it('error ante filas fuera de orden', () => {
    const est = [...MATRIZ_POM_SINTETICA]
    ;[est[12], est[13]] = [est[13], est[12]]
    expect(errores(() => parsearTablaEstimado(textoPOMSintetico({ estimado: est })))).toEqual(
      expect.arrayContaining([expect.stringMatching(/fuera de orden/)]),
    )
  })

  it('tabla que empieza a las 08:00: aviso (no error) y 07:00/07:30 en 0', () => {
    const r = parsearTablaEstimado(textoPOMSintetico({ estimado: MATRIZ_POM_SINTETICA.slice(2) }))
    expect(r.horasCaja).toBe(406)
    expect(r.avisos).toEqual(['La tabla empieza en 08:00; franjas anteriores se toman como 0.'])
    expect(r.franjas[0].necesidad).toEqual([0, 0, 0, 0, 0, 0, 0])
  })

  it('demanda fuera de grilla (22:30 > 0) es error; con 0 solo aviso. No se inventa 22:30–23:00', () => {
    const con = [...MATRIZ_POM_SINTETICA, ['22:30', [1, 0, 0, 0, 0, 0, 0]] as [string, number[]]]
    expect(errores(() => parsearTablaEstimado(textoPOMSintetico({ estimado: con })))).toEqual(
      expect.arrayContaining([expect.stringMatching(/22:30: demanda fuera de la grilla/)]),
    )
    const cero = [...MATRIZ_POM_SINTETICA, ['22:30', [0, 0, 0, 0, 0, 0, 0]] as [string, number[]]]
    const r = parsearTablaEstimado(textoPOMSintetico({ estimado: cero }))
    expect(r.franjas).toHaveLength(31)
    expect(r.avisos.join()).toMatch(/22:30: fila fuera de la grilla con demanda 0/)
  })

  it('sin tabla «Estimado» o toda en 0 → error', () => {
    expect(errores(() => parsearTablaEstimado('Diferencia de cajas necesarias 08:00 1 1 1 1 1 1 1'))[0]).toMatch(/No se encontró/)
    const ceros = MATRIZ_POM_SINTETICA.map(([h]) => [h, [0, 0, 0, 0, 0, 0, 0]] as [string, number[]])
    expect(errores(() => parsearTablaEstimado(textoPOMSintetico({ estimado: ceros })))[0]).toMatch(/no tiene demanda/)
  })

  it('la fila 22:00 llega al motor como slot 28 (22:00–22:30) y el slot 29 queda en 0', () => {
    const { franjas } = parsearTablaEstimado(textoPOMSintetico())
    const input = convertirInputAV2(franjas, [], [], [], [])
    expect(input.demanda.map(d => d[28])).toEqual([2, 2, 2, 2, 3, 3, 2])
    expect(input.demanda.map(d => d[29])).toEqual([0, 0, 0, 0, 0, 0, 0])
    expect(input.demanda.flat().reduce((a, b) => a + b, 0) / 2).toBe(406)
  })
})

describe('POM-01: semana del documento', () => {
  it('detecta 16–22/11/2026 del encabezado aunque el reloj marque otra fecha', () => {
    expect(detectarSemanaPOM(textoPOMSintetico())).toEqual({
      ok: true, semana: { ...SEMANA_REFERENCIA, fuente: 'texto' },
    })
  })

  it('acepta formato dd/mm/yyyy', () => {
    const r = detectarSemanaPOM('Semana del 16/11/2026 al 22/11/2026')
    expect(r.ok && r.semana.lunes).toBe('2026-11-16')
  })

  it('usa el nombre del archivo si el texto no tiene la semana', () => {
    const r = detectarSemanaPOM('sin fechas', 'Programacion semanal 2026-11-16 - 2026-11-22.pdf')
    expect(r).toEqual({ ok: true, semana: { ...SEMANA_REFERENCIA, fuente: 'archivo' } })
  })

  it('rango que no empieza en lunes → no encontrada (no se adivina)', () => {
    expect(detectarSemanaPOM('Programación 2026-11-17 - 2026-11-23')).toEqual({ ok: false, motivo: 'no_encontrada', candidatas: [] })
  })

  it('dos semanas posibles → ambigua', () => {
    const r = detectarSemanaPOM('2026-11-16 - 2026-11-22 y 2026-11-23 - 2026-11-29')
    expect(r).toEqual({ ok: false, motivo: 'ambigua', candidatas: ['2026-11-16', '2026-11-23'] })
  })

  it('ignora fechas imposibles', () => {
    expect(extraerFechas('31/02/2026 2026-13-01 16/11/2026')).toHaveLength(1)
  })

  it('fechasDeSemana / esLunesISO', () => {
    expect(fechasDeSemana('2026-11-16')).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'])
    expect(fechasDeSemana('2026-12-28')[6]).toBe('2027-01-03')
    expect(esLunesISO('2026-11-16')).toBe(true)
    expect(esLunesISO('2026-11-17')).toBe(false)
    expect(esLunesISO('')).toBe(false)
  })
})

describe('POM-01: interpretarTextoPOM (lo que usa la UI)', () => {
  it('devuelve matriz, semana, avisos y totales coherentes', () => {
    const r = interpretarTextoPOM(textoPOMSintetico(), 'archivo.pdf')
    expect(r.semana).toEqual({ ok: true, semana: { ...SEMANA_REFERENCIA, fuente: 'texto' } })
    expect(r.totalDemanda).toBe(812)
    expect(r.horasCaja).toBe(406)
    expect(r.franjas).toHaveLength(31)
  })
})
