import { describe, expect, it } from 'vitest'
import { aplicarPublicacion, tramoEfectivoEn, verificarSinSolapamientos, vigenciaVacia, type EstadoVigencia, type SolicitudPublicacion } from '../vigencia'
import { fechasEntre, sumarDias } from '../fechas'
import { prng } from './fixtures'

const S = 's091'
const pub = (estado: EstadoVigencia, publicacionId: string, hoy: string, tramos: SolicitudPublicacion['tramos'], revisionEsperada = estado.revision) =>
  aplicarPublicacion(estado, { publicacionId, sucursalId: S, revisionEsperada, hoy, tramos })
const vigenteEn = (e: EstadoVigencia, f: string) => tramoEfectivoEn(e.tramos, S, f)?.versionId ?? null
const valor = <T>(r: { ok: true; valor: T } | { ok: false; errores: unknown[] }): T => { if (!r.ok) throw new Error(JSON.stringify(r.errores)); return r.valor }
const codigos = (r: { ok: boolean; errores?: Array<{ codigo: string }> }) => (r.ok ? [] : r.errores!.map(e => e.codigo))

describe('B1 · vigencia por intervalos: reemplazo desde el miércoles (AH2-030)', () => {
  // Semana 16–22/11. V1 se publica el viernes 13. El martes 17 se replanifica desde el miércoles 18.
  const p1 = valor(pub(vigenciaVacia(S), 'P1', '2026-11-13', [{ versionId: 'V1', desde: '2026-11-16', hasta: '2026-11-22' }]))

  it('lunes y martes siguen en V1; de miércoles a domingo rige V2; V1 se recorta, no se reescribe', () => {
    const p2 = valor(pub(p1.estado, 'P2', '2026-11-17', [{ versionId: 'V2', desde: '2026-11-18', hasta: '2026-11-22' }]))
    expect(['2026-11-16', '2026-11-17'].map(f => vigenteEn(p2.estado, f))).toEqual(['V1', 'V1'])
    expect(fechasEntre('2026-11-18', '2026-11-22').map(f => vigenteEn(p2.estado, f))).toEqual(Array(5).fill('V2'))
    expect(p2.recortes).toEqual([{ tramoId: 'P1:0', versionId: 'V1', hastaEfectivoAnterior: '2026-11-22', hastaEfectivoNuevo: '2026-11-17' }])
    const t1 = p2.estado.tramos.find(t => t.id === 'P1:0')!
    expect(t1).toMatchObject({ desde: '2026-11-16', hasta: '2026-11-22', hastaEfectivo: '2026-11-17', recortadoPor: 'P2' }) // dato original intacto
    expect(p2.estado.revision).toBe(2)
    expect(p2.versionesSinVigencia).toEqual([])
    expect(verificarSinSolapamientos(p2.estado.tramos).ok).toBe(true)
    expect(p1.estado.tramos[0].hastaEfectivo).toBe('2026-11-22') // el estado anterior no se mutó
  })

  it('reemplazo de un tramo que todavía no empezó: se anula y la versión queda sin vigencia', () => {
    const p2 = valor(pub(p1.estado, 'P2', '2026-11-14', [{ versionId: 'V2', desde: '2026-11-16', hasta: '2026-11-22' }]))
    expect(p2.estado.tramos.find(t => t.id === 'P1:0')!.hastaEfectivo).toBeNull()
    expect(p2.versionesSinVigencia).toEqual(['V1'])
  })

  it('reemplazo solo del miércoles: el resto de la semana continúa en V1 (tramo de continuación)', () => {
    const p2 = valor(pub(p1.estado, 'P2', '2026-11-17', [{ versionId: 'V2', desde: '2026-11-18', hasta: '2026-11-18' }]))
    expect(fechasEntre('2026-11-16', '2026-11-22').map(f => vigenteEn(p2.estado, f))).toEqual(['V1', 'V1', 'V2', 'V1', 'V1', 'V1', 'V1'])
    expect(p2.creados.map(t => t.continuaDe ?? null)).toEqual([null, 'P1:0'])
    // Dos tramos dentro del mismo tramo anterior en una sola publicación (miércoles y viernes).
    const p3 = valor(pub(p1.estado, 'P3', '2026-11-17', [{ versionId: 'V3', desde: '2026-11-20', hasta: '2026-11-20' }, { versionId: 'V2', desde: '2026-11-18', hasta: '2026-11-18' }]))
    expect(fechasEntre('2026-11-16', '2026-11-22').map(f => vigenteEn(p3.estado, f))).toEqual(['V1', 'V1', 'V2', 'V1', 'V3', 'V1', 'V1'])
    expect(verificarSinSolapamientos(p3.estado.tramos).ok).toBe(true)
  })

  it('nunca afecta hoy ni días transcurridos: el reemplazo empieza como mínimo mañana (I4, D14)', () => {
    expect(codigos(pub(p1.estado, 'P2', '2026-11-18', [{ versionId: 'V2', desde: '2026-11-18', hasta: '2026-11-22' }]))).toEqual(['FECHA_NO_FUTURA'])
    expect(codigos(pub(p1.estado, 'P2', '2026-11-19', [{ versionId: 'V2', desde: '2026-11-17', hasta: '2026-11-22' }]))).toEqual(['FECHA_NO_FUTURA'])
  })

  it('valida tramos invertidos, superpuestos entre sí, vacíos, de otra sucursal y fechas inválidas', () => {
    expect(codigos(pub(p1.estado, 'P2', '2026-11-13', [{ versionId: 'V2', desde: '2026-11-20', hasta: '2026-11-18' }]))).toContain('TRAMO_INVERTIDO')
    expect(codigos(pub(p1.estado, 'P2', '2026-11-13', [{ versionId: 'A', desde: '2026-11-16', hasta: '2026-11-18' }, { versionId: 'B', desde: '2026-11-18', hasta: '2026-11-20' }]))).toContain('TRAMOS_NUEVOS_SOLAPADOS')
    expect(codigos(pub(p1.estado, 'P2', '2026-11-13', []))).toContain('TRAMO_INVERTIDO')
    expect(codigos(aplicarPublicacion(p1.estado, { publicacionId: 'X', sucursalId: 'otra', revisionEsperada: 1, hoy: '2026-11-13', tramos: [] }))).toEqual(['SUCURSAL_DISTINTA'])
    expect(codigos(pub(p1.estado, 'P2', '2026-11-13', [{ versionId: 'V2', desde: '2026-11-31', hasta: '2026-12-01' }]))).toContain('FECHA_INVALIDA')
  })
})

describe('B1 · concurrencia simulada (control optimista)', () => {
  it('dos publicaciones leídas sobre la misma revisión: una gana y la otra recibe CONFLICTO; tras releer, se aplica sin solapes', () => {
    const base = valor(pub(vigenciaVacia(S), 'P1', '2026-11-13', [{ versionId: 'V1', desde: '2026-11-16', hasta: '2026-11-22' }])).estado
    const leida = base.revision
    const a = valor(pub(base, 'PA', '2026-11-17', [{ versionId: 'VA', desde: '2026-11-18', hasta: '2026-11-22' }], leida))
    const b = pub(a.estado, 'PB', '2026-11-17', [{ versionId: 'VB', desde: '2026-11-19', hasta: '2026-11-22' }], leida)
    expect(codigos(b)).toEqual(['CONFLICTO_CONCURRENCIA'])
    expect(b.ok ? null : b.errores[0].detalle).toEqual({ revisionEsperada: 1, revisionActual: 2 })
    const b2 = valor(pub(a.estado, 'PB', '2026-11-17', [{ versionId: 'VB', desde: '2026-11-19', hasta: '2026-11-22' }]))
    expect(fechasEntre('2026-11-16', '2026-11-22').map(f => vigenteEn(b2.estado, f))).toEqual(['V1', 'V1', 'VA', 'VB', 'VB', 'VB', 'VB'])
    expect(verificarSinSolapamientos(b2.estado.tramos).ok).toBe(true)
  })

  it('verificarSinSolapamientos detecta tramos efectivos que se pisan (última barrera, como la restricción de exclusión de P2)', () => {
    const r = verificarSinSolapamientos([
      { id: 'a', sucursalId: S, publicacionId: 'p', versionId: 'v', desde: '2026-11-16', hasta: '2026-11-22', hastaEfectivo: '2026-11-22' },
      { id: 'b', sucursalId: S, publicacionId: 'q', versionId: 'w', desde: '2026-11-20', hasta: '2026-11-26', hastaEfectivo: '2026-11-26' },
      { id: 'c', sucursalId: 'otra', publicacionId: 'r', versionId: 'x', desde: '2026-11-16', hasta: '2026-11-22', hastaEfectivo: '2026-11-22' },
    ])
    expect(codigos(r)).toEqual(['SOLAPAMIENTO_VIGENCIA'])
  })
})

describe('B1 · propiedad: secuencias aleatorias de publicaciones y reemplazos', () => {
  it('200 secuencias: nunca hay solapamientos, cada fecha tiene a lo sumo un tramo y lo transcurrido no cambia', () => {
    for (let semilla = 1; semilla <= 200; semilla++) {
      const r = prng(semilla)
      let estado = vigenciaVacia(S)
      let hoy = '2026-11-01'
      const primerLunes = '2026-11-02'
      for (let paso = 0; paso < 25; paso++) {
        hoy = sumarDias(hoy, Math.floor(r() * 3))
        const desde = sumarDias(hoy, 1 + Math.floor(r() * 20))
        const largo = Math.floor(r() * 10)
        const solicitud = { versionId: `V${semilla}-${paso}`, desde, hasta: sumarDias(desde, largo) }
        const antes = new Map(fechasEntre(primerLunes, hoy).map(f => [f, vigenteEn(estado, f)]))
        // Ocasionalmente, una publicación con revisión vieja (otra pestaña): debe fallar sin efecto.
        const revision = r() < 0.15 ? estado.revision - 1 : estado.revision
        const res = pub(estado, `P${paso}`, hoy, [solicitud], revision)
        if (revision !== estado.revision) { expect(codigos(res)).toContain('CONFLICTO_CONCURRENCIA'); continue }
        estado = valor(res).estado
        expect(verificarSinSolapamientos(estado.tramos).ok).toBe(true)
        for (const [f, v] of antes) expect(vigenteEn(estado, f), `semilla ${semilla} paso ${paso} fecha ${f}`).toBe(v) // I4
        for (const f of fechasEntre(solicitud.desde, solicitud.hasta)) expect(vigenteEn(estado, f)).toBe(solicitud.versionId)
        for (const f of fechasEntre(primerLunes, sumarDias(hoy, 40))) {
          expect(estado.tramos.filter(t => t.hastaEfectivo !== null && t.desde <= f && f <= t.hastaEfectivo).length).toBeLessThanOrEqual(1)
        }
      }
    }
  })
})
