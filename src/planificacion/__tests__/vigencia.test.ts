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
    // Anidados: B y C están dentro de A (dos solapamientos, aunque B termine antes que C empiece); contiguos no se solapan.
    const t = (id: string, desde: string, hasta: string, hastaEfectivo: string | null = hasta) => ({ id, sucursalId: S, publicacionId: 'p', versionId: id, desde, hasta, hastaEfectivo })
    expect(codigos(verificarSinSolapamientos([t('A', '2026-11-01', '2026-11-10'), t('B', '2026-11-02', '2026-11-03'), t('C', '2026-11-05', '2026-11-06')]))).toEqual(['SOLAPAMIENTO_VIGENCIA', 'SOLAPAMIENTO_VIGENCIA'])
    expect(verificarSinSolapamientos([t('A', '2026-11-01', '2026-11-10'), t('B', '2026-11-11', '2026-11-12'), t('X', '2026-11-05', '2026-11-12', null)]).ok).toBe(true)
  })
})

describe('B1 · identificadores: nunca se duplican en silencio', () => {
  const base = valor(pub(vigenciaVacia(S), 'P1', '2026-11-13', [{ versionId: 'V1', desde: '2026-11-16', hasta: '2026-11-22' }])).estado

  it('reutilizar un id de publicación ya aplicado se rechaza (antes generaba «P1:0» repetido)', () => {
    expect(codigos(pub(base, 'P1', '2026-11-17', [{ versionId: 'V2', desde: '2026-11-18', hasta: '2026-11-22' }]))).toEqual(['ID_DUPLICADO'])
  })

  it('ids de publicación con «:» (separador reservado), vacíos o demasiado largos se rechazan', () => {
    for (const id of ['P1:0', 'P1:cont:0:P1:0', '', 'x'.repeat(65), 'con espacio']) {
      expect(codigos(pub(base, id, '2026-11-17', [{ versionId: 'V2', desde: '2026-11-18', hasta: '2026-11-22' }])), id).toEqual(['ID_INVALIDO'])
    }
    expect(pub(base, '3f2b8c1e-9d4a-4c6b-8e2f-1a2b3c4d5e6f', '2026-11-17', [{ versionId: 'V2', desde: '2026-11-18', hasta: '2026-11-22' }]).ok).toBe(true)
  })

  it('un estado de entrada con ids de tramo repetidos se rechaza', () => {
    const corrupto: EstadoVigencia = { ...base, tramos: [...base.tramos, { ...base.tramos[0] }] }
    expect(codigos(pub(corrupto, 'P2', '2026-11-17', [{ versionId: 'V2', desde: '2026-11-18', hasta: '2026-11-22' }]))).toEqual(['ID_DUPLICADO'])
  })

  it('una misma publicación con dos tramos sobre el mismo tramo anterior genera continuaciones con ids distintos', () => {
    const r = valor(pub(base, 'P2', '2026-11-13', [{ versionId: 'A', desde: '2026-11-17', hasta: '2026-11-17' }, { versionId: 'B', desde: '2026-11-19', hasta: '2026-11-19' }, { versionId: 'C', desde: '2026-11-21', hasta: '2026-11-21' }]))
    const ids = r.estado.tramos.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(fechasEntre('2026-11-16', '2026-11-22').map(f => vigenteEn(r.estado, f))).toEqual(['V1', 'A', 'V1', 'B', 'V1', 'C', 'V1'])
  })
})

/**
 * Vigencia por fecha calculada con un barrido de intervalos (O(días cubiertos)), independiente de
 * tramoEfectivoEn: sirve de oráculo para la prueba de propiedad.
 */
function mapaVigencia(e: EstadoVigencia): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const t of e.tramos) {
    if (t.hastaEfectivo === null || t.hastaEfectivo < t.desde) continue
    for (const f of fechasEntre(t.desde, t.hastaEfectivo)) { const l = m.get(f); if (l) l.push(t.versionId); else m.set(f, [t.versionId]) }
  }
  return m
}

describe('B1 · propiedad: secuencias aleatorias de publicaciones y reemplazos', () => {
  // Los invariantes se verifican con lógica plana y se acumulan las violaciones; se afirma una vez
  // por secuencia. (La versión anterior hacía ~750 000 llamadas a expect: ese costo, no el del
  // dominio, superaba los 5 s del timeout en CI.) Mismas 200 secuencias × 25 pasos y mismos invariantes.
  it('200 secuencias: nunca hay solapamientos, cada fecha tiene a lo sumo un tramo y lo transcurrido no cambia', () => {
    let verificaciones = 0, publicadas = 0, conflictos = 0
    for (let semilla = 1; semilla <= 200; semilla++) {
      const r = prng(semilla)
      const fallos: string[] = []
      let estado = vigenciaVacia(S)
      let hoy = '2026-11-01'
      for (let paso = 0; paso < 25; paso++) {
        hoy = sumarDias(hoy, Math.floor(r() * 3))
        const desde = sumarDias(hoy, 1 + Math.floor(r() * 20))
        const largo = Math.floor(r() * 10)
        const solicitud = { versionId: `V${semilla}-${paso}`, desde, hasta: sumarDias(desde, largo) }
        const antes = mapaVigencia(estado)
        // Ocasionalmente, una publicación con revisión vieja (otra pestaña): debe fallar sin efecto.
        const revision = r() < 0.15 ? estado.revision - 1 : estado.revision
        const res = pub(estado, `P${paso}`, hoy, [solicitud], revision)
        if (revision !== estado.revision) {
          conflictos++
          if (res.ok || !res.errores.some(e => e.codigo === 'CONFLICTO_CONCURRENCIA')) fallos.push(`paso ${paso}: revisión vieja aceptada`)
          continue
        }
        if (!res.ok) { fallos.push(`paso ${paso}: publicación válida rechazada ${JSON.stringify(res.errores)}`); continue }
        publicadas++
        estado = res.valor.estado
        const despues = mapaVigencia(estado)
        if (!verificarSinSolapamientos(estado.tramos).ok) fallos.push(`paso ${paso}: verificarSinSolapamientos falló`)
        if (new Set(estado.tramos.map(t => t.id)).size !== estado.tramos.length) fallos.push(`paso ${paso}: ids de tramo repetidos`)
        for (const [f, vs] of despues) { verificaciones++; if (vs.length > 1) fallos.push(`paso ${paso}: ${f} con ${vs.length} tramos`) }
        // I4: lo transcurrido (≤ hoy) no cambia, en ambos sentidos (ni se pierde ni se gana vigencia).
        for (const f of new Set([...antes.keys(), ...despues.keys()])) {
          if (f > hoy) continue
          verificaciones++
          if ((despues.get(f) ?? []).join() !== (antes.get(f) ?? []).join()) fallos.push(`paso ${paso}: cambió la fecha transcurrida ${f}`)
        }
        for (const f of fechasEntre(solicitud.desde, solicitud.hasta)) {
          verificaciones++
          if ((despues.get(f) ?? []).join() !== solicitud.versionId) fallos.push(`paso ${paso}: ${f} no quedó en ${solicitud.versionId}`)
          if (tramoEfectivoEn(estado.tramos, S, f)?.versionId !== solicitud.versionId) fallos.push(`paso ${paso}: tramoEfectivoEn difiere en ${f}`)
        }
      }
      expect(fallos, `semilla ${semilla}`).toEqual([])
    }
    // La prueba debe ejercitar de verdad el dominio (no pasar en vacío).
    expect(publicadas).toBeGreaterThan(4000)
    expect(conflictos).toBeGreaterThan(400)
    expect(verificaciones).toBeGreaterThan(150_000)
  })
})
