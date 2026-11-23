// AH2-063 · Rotación mensual: continuidad dentro del mes, rotación al cambiar de mes y domingos parejos.
import { describe, expect, it } from 'vitest'
import { mesDeSemana, rotacionMensual, CONTINUIDAD, ROTACION, PREFIERE_DOMINGO } from '../rotacionMensual'
import { convertirInputAV2 } from '../../algoritmo/adapter'
import { generarConMultiArranque } from '../generacionMultiArranque'
import { clasificarJornadaUI } from '../preferencias'
import type { HorarioColaborador, SemanaHistorial } from '../../types'
import { AUX_S47, CAJEROS_S47, EVENTUALES_S47, OPERATIVA_S47 } from '../../algoritmo/__tests__/fixtures/semana47Anonimizada'
import { NECESIDAD_S47, generar } from '../../algoritmo/__tests__/fixtures/aperturaHelpers'

const cajeros = CAJEROS_S47.map(c => ({ id: c.id, nombre: c.nombre }))
const semana = (fechaLunes: string, horarios: HorarioColaborador[]): SemanaHistorial =>
  ({ id: fechaLunes, fechaLunes, version: 1, descripcion: '', generadoEl: `${fechaLunes}T00:00:00Z`, editadoManualmente: false, horarios, resumenPorColaborador: {} })
const j = (dia: number, inicio: string, fin: string) => ({ dia, turnos: [{ inicio, fin }], horas: 8, esFranco: false, rol: 'cajero' as const })
const f = (dia: number) => ({ dia, turnos: [], horas: 0, esFranco: true, rol: 'franco' as const })
/** Semana tipo: siempre mañana o siempre cierre, franco el día `franco`. */
const fila = (id: string, tipo: 'manana' | 'cierre', franco: number): HorarioColaborador => ({
  colaboradorId: id, rolGeneral: 'cajero', errores: [], totalHoras: 48,
  jornadas: Array.from({ length: 7 }, (_, d) => d === franco ? f(d) : tipo === 'manana' ? j(d, '09:00', '17:00') : j(d, '14:30', '22:30')),
})

describe('AH2-063 · mes de cada semana (el del jueves: 4 o más días)', () => {
  it.each([['2026-11-23', '2026-11'], ['2026-11-30', '2026-12'], ['2026-12-28', '2026-12'], ['2027-01-04', '2027-01'], ['2027-03-29', '2027-04']])('%s → %s', (lunes, mes) => {
    expect(mesDeSemana(lunes)).toBe(mes)
  })
})

describe('AH2-063 · preferencias que arma', () => {
  const [a, b] = cajeros
  it('mismo mes: continuidad día por día (salvo el domingo, que se reparte)', () => {
    const { sesgos, explicacion } = rotacionMensual([semana('2026-11-16', [fila(a.id, 'manana', 2)])], '2026-11-23', { cajeros })
    expect(explicacion.modo).toBe('continuidad')
    expect(sesgos[a.nombre].porDia![0].manana).toBe(CONTINUIDAD)
    expect(sesgos[a.nombre].porDia![2].franco).toBe(CONTINUIDAD)
    expect(sesgos[a.nombre].porDia![6]?.manana).toBeUndefined()
  })
  it('mes nuevo: evita el turno que predominó; con «Turno (pedido)» no rota', () => {
    const nov = ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23'].map(l => semana(l, [fila(a.id, 'cierre', 1), fila(b.id, 'manana', 3)]))
    const r = rotacionMensual(nov, '2026-11-30', { cajeros, conTurnoPedido: new Set([b.nombre]) })
    expect(r.explicacion.modo).toBe('cambio_de_mes')
    expect(r.sesgos[a.nombre].cierre).toBe(-ROTACION)
    expect(r.sesgos[a.nombre].porDia?.[0]).toBeUndefined() // sin continuidad entre meses
    expect(r.sesgos[b.nombre]?.manana).toBeUndefined()
  })
  it('domingos parejos y «Prefiere trabajar los domingos»', () => {
    const [c] = cajeros.slice(2)
    // a trabajó los dos domingos, b ninguno, c pide domingos.
    const hist = ['2026-11-09', '2026-11-16'].map(l => semana(l, [fila(a.id, 'manana', 2), fila(b.id, 'manana', 6), fila(c.id, 'manana', 6)]))
    const { sesgos } = rotacionMensual(hist, '2026-11-23', { cajeros, prefierenDomingo: new Set([c.nombre]) })
    expect(sesgos[a.nombre].porDia![6].franco).toBeGreaterThan(0)  // trabajó más: tiende a franco el domingo
    expect(sesgos[b.nombre].porDia![6].franco).toBeLessThan(0)     // trabajó menos: tiende a trabajarlo
    expect(sesgos[c.nombre].porDia![6].franco).toBe(-PREFIERE_DOMINGO)
  })
})

describe('AH2-063 · con el motor: semanas del mismo mes cambian menos, sin perder cobertura', () => {
  // Decisión del propietario (23/11): hasta 2 h menos de cobertura por semana a cambio de no cambiar horarios dentro del mes.
  it('la semana siguiente con continuidad cambia menos tipos de turno que sin ella', () => {
    const base = generar({ ...OPERATIVA_S47, aperturaSoloAux: true })
    const hist = [semana('2026-11-16', base.horarios)]
    const { sesgos } = rotacionMensual(hist, '2026-11-23', { cajeros })
    // Semana siguiente con varias diferencias chicas de necesidad.
    const nec = NECESIDAD_S47.map((x, i) => ({ ...x, necesidad: x.necesidad.map((n, d) => (d + i) % 5 === 0 && n > 1 ? n - 1 : (d + i) % 7 === 0 ? n + 1 : n) }))
    const correr = (prefs?: typeof sesgos) => {
      const input = convertirInputAV2(nec, CAJEROS_S47, AUX_S47, EVENTUALES_S47, [], { ...OPERATIVA_S47, aperturaSoloAux: true, preferenciasPorNombre: prefs })
      return generarConMultiArranque({ input, cajeros: CAJEROS_S47, auxiliares: AUX_S47, eventuales: EVENTUALES_S47, contexto: { necesidad: nec, excepciones: [], operativa: { ...OPERATIVA_S47, aperturaSoloAux: true } },
        continuidad: prefs ? { semanaAnterior: base.horarios, margenHoras: 2 } : undefined }).resultado
    }
    const cambios = (r: ReturnType<typeof correr>) => r.horarios.filter(h => h.rolGeneral === 'cajero').reduce((n, h) => {
      const prev = base.horarios.find(x => x.colaboradorId === h.colaboradorId)!
      return n + h.jornadas.filter(x => x.dia !== 6 && clasificarJornadaUI(x) !== clasificarJornadaUI(prev.jornadas[x.dia])).length
    }, 0)
    const falt = (r: ReturnType<typeof correr>) => r.faltantesFranjas.flat().reduce((a, b) => a + b, 0)
    const con = correr(sesgos), sin = correr()
    expect(cambios(con)).toBeLessThan(cambios(sin))
    expect(falt(con) / 2).toBeLessThanOrEqual(falt(sin) / 2 + 2) // faltantesFranjas en medias horas; margen 2 h
  }, 120_000)
})

describe('AH2-063 · elección con margen', () => {
  it('gana el que menos cambia si no supera el faltante del mejor + margen', async () => {
    const { elegirConContinuidad } = await import('../continuidad')
    const c = [{ f: 2.5, cambios: 31 }, { f: 5, cambios: 4 }, { f: 3, cambios: 10 }]
    expect(elegirConContinuidad(c, x => x.f, x => x.cambios, 2)).toEqual({ f: 3, cambios: 10 })   // 5 h supera 2,5 + 2
    expect(elegirConContinuidad(c, x => x.f, x => x.cambios, 3)).toEqual({ f: 5, cambios: 4 })
    expect(elegirConContinuidad(c, x => x.f, x => x.cambios, 0)).toEqual({ f: 2.5, cambios: 31 }) // 0 = cobertura primero
  })
})

describe('AH2-063 · sin semana elegida', () => {
  it('un lunes vacío o inválido no rompe la pantalla', () => {
    expect(rotacionMensual([], '', { cajeros }).sesgos).toEqual({})
    expect(rotacionMensual([], 'no-es-fecha', { cajeros }).explicacion.modo).toBe('sin_historia')
  })
})
