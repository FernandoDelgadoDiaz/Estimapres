import { describe, expect, it } from 'vitest'
import { historialEfectivo, type VersionConHorario } from '../historial'
import { aplicarPublicacion, vigenciaVacia } from '../vigencia'
import { versionDesdeLegado } from '../estados'
import { semana, version } from './fixtures'

const S = 's091'
const vh = (id: string, lunes: string, extra: Parameters<typeof version>[2] = {}, variante = 0): VersionConHorario =>
  ({ version: version(id, lunes, { estado: 'PUBLICADO', ...extra }), semana: semana(lunes, variante) })
const valor = <T>(r: { ok: true; valor: T } | { ok: false; errores: unknown[] }): T => { if (!r.ok) throw new Error(JSON.stringify(r.errores)); return r.valor }

// V1 publicada el 13/11 para 16–22/11; V2 (variante distinta) reemplaza desde el miércoles 18.
const e1 = valor(aplicarPublicacion(vigenciaVacia(S), { publicacionId: 'P1', sucursalId: S, revisionEsperada: 0, hoy: '2026-11-13', tramos: [{ versionId: 'V1', desde: '2026-11-16', hasta: '2026-11-22' }] })).estado
const e2 = valor(aplicarPublicacion(e1, { publicacionId: 'P2', sucursalId: S, revisionEsperada: 1, hoy: '2026-11-17', tramos: [{ versionId: 'V2', desde: '2026-11-18', hasta: '2026-11-22' }] })).estado
const V1 = vh('V1', '2026-11-16'), V2 = vh('V2', '2026-11-16', {}, 1)

describe('B1 · historial efectivo por fecha (AH2-031)', () => {
  it('cuenta lunes y martes de V1 (reemplazada después) y de miércoles en adelante de V2', () => {
    const h = valor(historialEfectivo({ sucursalId: S, desde: '2026-11-16', hasta: '2026-11-22', hoy: '2026-11-30', tramos: e2.tramos, versiones: [V1, V2] }))
    expect(h.map(d => d.versionId)).toEqual(['V1', 'V1', 'V2', 'V2', 'V2', 'V2', 'V2'])
    expect(h.every(d => d.fuente === 'oficial')).toBe(true)
    // El miércoles c1 trabaja el cierre de V2, no la mañana de V1.
    expect(h[2].jornadas.find(j => j.colaboradorId === 'c1')!.jornada.turnos[0].inicio).toBe('16:00')
  })

  it('nunca cuenta hoy ni fechas futuras', () => {
    const h = valor(historialEfectivo({ sucursalId: S, desde: '2026-11-16', hasta: '2026-11-22', hoy: '2026-11-19', tramos: e2.tramos, versiones: [V1, V2] }))
    expect(h.map(d => d.fecha)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18'])
  })

  it('borradores, aprobados sin publicar, descartados y prueba local nunca cuentan (aunque un tramo los apunte por error)', () => {
    for (const extra of [{ estado: 'BORRADOR' as const }, { estado: 'APROBADO' as const }, { estado: 'DESCARTADO' as const }, { ambito: 'prueba-local' as const }]) {
      const r = historialEfectivo({ sucursalId: S, desde: '2026-11-16', hasta: '2026-11-17', hoy: '2026-11-30', tramos: e2.tramos, versiones: [vh('V1', '2026-11-16', extra), V2] })
      expect(r.ok ? 'ok' : r.errores[0].codigo).toBe('TRAMO_SIN_VERSION_PUBLICADA')
    }
    // Una versión no publicada sin tramos simplemente no aparece.
    const otro = vh('B1', '2026-11-23', { estado: 'BORRADOR' })
    const h = valor(historialEfectivo({ sucursalId: S, desde: '2026-11-23', hasta: '2026-11-29', hoy: '2026-12-31', tramos: e2.tramos, versiones: [V1, V2, otro] }))
    expect(h).toEqual([])
  })

  it('un tramo anulado antes de empezar no aporta días', () => {
    const anulado = valor(aplicarPublicacion(e1, { publicacionId: 'P3', sucursalId: S, revisionEsperada: 1, hoy: '2026-11-14', tramos: [{ versionId: 'V3', desde: '2026-11-16', hasta: '2026-11-22' }] })).estado
    const h = valor(historialEfectivo({ sucursalId: S, desde: '2026-11-16', hasta: '2026-11-22', hoy: '2026-11-30', tramos: anulado.tramos, versiones: [V1, vh('V3', '2026-11-16')] }))
    expect(new Set(h.map(d => d.versionId))).toEqual(new Set(['V3']))
  })

  it('las ausencias se descuentan (no suman a la equidad) y quedan informadas', () => {
    const h = valor(historialEfectivo({
      sucursalId: S, desde: '2026-11-16', hasta: '2026-11-17', hoy: '2026-11-30', tramos: e2.tramos, versiones: [V1, V2],
      ausente: (c, f) => c === 'c2' && f === '2026-11-17',
    }))
    expect(h[1].ausentes).toEqual(['c2'])
    expect(h[1].jornadas.map(j => j.colaboradorId)).toEqual(['c1', 'c3'])
    expect(h[0].jornadas).toHaveLength(3)
  })

  it('semanas legadas: excluidas por defecto; con opt-in, etiquetadas «legado-presunto» y solo donde no hay vigencia oficial', () => {
    const leg = (n: number): VersionConHorario => ({ version: versionDesdeLegado({ id: `L${n}`, sucursalId: S, fechaLunes: '2026-11-09', numero: n, huellaEntradas: 'x' }), semana: semana('2026-11-09', n % 2) })
    const sin = valor(historialEfectivo({ sucursalId: S, desde: '2026-11-09', hasta: '2026-11-17', hoy: '2026-11-30', tramos: e2.tramos, versiones: [V1, V2] }))
    expect(sin.map(d => d.fecha)).toEqual(['2026-11-16', '2026-11-17'])
    const con = valor(historialEfectivo({ sucursalId: S, desde: '2026-11-09', hasta: '2026-11-17', hoy: '2026-11-30', tramos: e2.tramos, versiones: [V1, V2], legadoPresunto: [leg(1), leg(2)] }))
    expect(con.slice(0, 7).every(d => d.fuente === 'legado-presunto' && d.versionId === 'L2')).toBe(true) // última versión legada
    expect(con.slice(7).every(d => d.fuente === 'oficial')).toBe(true)
  })

  it('un tramo cuya fecha cae fuera de la semana de su versión es una inconsistencia', () => {
    const malo = valor(aplicarPublicacion(vigenciaVacia(S), { publicacionId: 'PX', sucursalId: S, revisionEsperada: 0, hoy: '2026-11-13', tramos: [{ versionId: 'V1', desde: '2026-11-16', hasta: '2026-11-23' }] })).estado
    const r = historialEfectivo({ sucursalId: S, desde: '2026-11-23', hasta: '2026-11-23', hoy: '2026-11-30', tramos: malo.tramos, versiones: [V1] })
    expect(r.ok ? null : r.errores[0].codigo).toBe('TRAMO_SIN_VERSION_PUBLICADA')
  })

  it('versiones con id repetido en la consulta se rechazan (no se elige una en silencio)', () => {
    const r = historialEfectivo({ sucursalId: S, desde: '2026-11-16', hasta: '2026-11-22', hoy: '2026-11-30', tramos: e2.tramos, versiones: [V1, V2, vh('V1', '2026-11-16', {}, 1)] })
    expect(r.ok ? null : r.errores[0].codigo).toBe('ID_DUPLICADO')
  })
})
