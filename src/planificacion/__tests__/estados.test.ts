import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { revisarCaducidad, transicionar, validacionVigente, versionDesdeLegado, type Actor, type ContextoTransicion, type VersionPlan } from '../estados'
import { POLITICA_091, validacion, version } from './fixtures'

const SISTEMA: Actor = { tipo: 'sistema', id: 'validador' }
const SUP: Actor = { tipo: 'persona', id: 'sup-1', rol: 'supervisor' }
const APR: Actor = { tipo: 'persona', id: 'apr-1', rol: 'aprobador' }
const AGENTE: Actor = { tipo: 'agente', id: 'asistente-ia', rol: 'aprobador' }
const ctx = (actor: Actor, politica = POLITICA_091): ContextoTransicion => ({ actor, en: '2026-11-15T12:00:00Z', politica })
const codigo = (r: ReturnType<typeof transicionar>) => (r.ok ? null : r.errores[0].codigo)

function hasta(estado: 'VALIDADO' | 'APROBADO', base: VersionPlan = version('v1', '2026-11-16')): VersionPlan {
  let v = base
  const r1 = transicionar(v, { tipo: 'validar', resultado: validacion(v.huellaEntradas) }, ctx(SISTEMA))
  if (!r1.ok) throw new Error('validar')
  v = r1.valor.version
  if (estado === 'VALIDADO') return v
  const r2 = transicionar(v, { tipo: 'aprobar', huellaActual: v.huellaEntradas }, ctx(APR))
  if (!r2.ok) throw new Error('aprobar')
  return r2.valor.version
}

describe('B1 · máquina de estados: flujo oficial completo', () => {
  it('BORRADOR → VALIDADO → APROBADO → PUBLICADO (servidor, revalidado), con eventos y responsables', () => {
    const v0 = version('v1', '2026-11-16')
    const r1 = transicionar(v0, { tipo: 'validar', resultado: validacion('sha256:h1') }, ctx(SISTEMA))
    expect(r1.ok && r1.valor.version.estado).toBe('VALIDADO')
    const r2 = transicionar(r1.ok ? r1.valor.version : v0, { tipo: 'aprobar', huellaActual: 'sha256:h1' }, ctx(APR))
    expect(r2.ok && r2.valor.version).toMatchObject({ estado: 'APROBADO', aprobadaPor: 'apr-1' })
    const r3 = transicionar(r2.ok ? r2.valor.version : v0, { tipo: 'publicar', huellaActual: 'sha256:h1', revalidacionServidor: validacion('sha256:h1', 'servidor') }, ctx(APR))
    expect(r3.ok && r3.valor.version.estado).toBe('PUBLICADO')
    expect(r3.ok && r3.valor.evento).toMatchObject({ de: 'APROBADO', a: 'PUBLICADO', actor: APR })
    expect(r3.ok && r3.valor.evento.resumenValidacion).toMatch(/técnicamente en el servidor/)
  })

  it('el estado no se modifica en el lugar (funciones puras)', () => {
    const v0 = version('v1', '2026-11-16')
    const copia = JSON.parse(JSON.stringify(v0))
    transicionar(v0, { tipo: 'validar', resultado: validacion('sha256:h1') }, ctx(SISTEMA))
    expect(v0).toEqual(copia)
  })
})

describe('B1 · prueba local vs. oficial (I0)', () => {
  it('una versión de prueba local nunca llega a PUBLICADO, aunque esté aprobada y revalidada', () => {
    const local = hasta('APROBADO', version('v1', '2026-11-16', { ambito: 'prueba-local' }))
    expect(local.estado).toBe('APROBADO')
    const r = transicionar(local, { tipo: 'publicar', huellaActual: 'sha256:h1', revalidacionServidor: validacion('sha256:h1', 'servidor') }, ctx(APR))
    expect(codigo(r)).toBe('PUBLICACION_LOCAL_PROHIBIDA')
  })

  it('publicar exige revalidación hecha en el servidor y con la misma huella', () => {
    const v = hasta('APROBADO')
    expect(codigo(transicionar(v, { tipo: 'publicar', huellaActual: 'sha256:h1' }, ctx(APR)))).toBe('PUBLICACION_SIN_REVALIDACION_SERVIDOR')
    expect(codigo(transicionar(v, { tipo: 'publicar', huellaActual: 'sha256:h1', revalidacionServidor: validacion('sha256:h1', 'cliente') }, ctx(APR)))).toBe('PUBLICACION_SIN_REVALIDACION_SERVIDOR')
    expect(codigo(transicionar(v, { tipo: 'publicar', huellaActual: 'sha256:h1', revalidacionServidor: validacion('sha256:otra', 'servidor') }, ctx(APR)))).toBe('VALIDACION_CADUCADA')
    expect(codigo(transicionar(v, { tipo: 'publicar', huellaActual: 'sha256:h1', revalidacionServidor: validacion('sha256:h1', 'servidor', 'BORRADOR') }, ctx(APR)))).toBe('VALIDACION_CADUCADA')
  })

  it('una semana legada se preserva como borrador y no se publica retroactivamente (D4)', () => {
    const l = versionDesdeLegado({ id: 'old', sucursalId: 's091', fechaLunes: '2026-11-09', numero: 3, huellaEntradas: 'sha256:l' })
    expect(l).toMatchObject({ estado: 'BORRADOR', legado: true, ambito: 'prueba-local', cicloId: null })
    const forzada: VersionPlan = { ...l, ambito: 'servidor', estado: 'APROBADO' }
    expect(codigo(transicionar(forzada, { tipo: 'publicar', huellaActual: 'sha256:l', revalidacionServidor: validacion('sha256:l', 'servidor') }, ctx(APR)))).toBe('LEGADO_NO_PUBLICABLE')
  })
})

describe('B1 · validación técnica ligada a la huella y caducidad', () => {
  it('validar exige que la huella validada sea la de la versión; un resultado no VALIDADO deja BORRADOR', () => {
    const v = version('v1', '2026-11-16')
    expect(codigo(transicionar(v, { tipo: 'validar', resultado: validacion('sha256:otra') }, ctx(SISTEMA)))).toBe('VALIDACION_SIN_HUELLA')
    expect(codigo(transicionar(v, { tipo: 'validar', resultado: validacion('sha256:h1', 'cliente', 'BORRADOR') }, ctx(SISTEMA)))).toBe('VALIDACION_NO_SUPERADA')
    expect(codigo(transicionar(v, { tipo: 'validar', resultado: validacion('sha256:h1', 'cliente', 'SIN VERIFICAR') }, ctx(SISTEMA)))).toBe('VALIDACION_NO_SUPERADA')
    expect(codigo(transicionar(v, { tipo: 'validar', resultado: validacion('sha256:h1') }, ctx(SUP)))).toBe('ROL_NO_AUTORIZADO')
  })

  it('si cambia cualquier entrada, VALIDADO y APROBADO caducan a BORRADOR; aprobar con huella vieja falla', () => {
    const val = hasta('VALIDADO'), apr = hasta('APROBADO')
    expect(validacionVigente(val, 'sha256:h1')).toBe(true)
    expect(validacionVigente(val, 'sha256:h2')).toBe(false)
    expect(codigo(transicionar(val, { tipo: 'aprobar', huellaActual: 'sha256:h2' }, ctx(APR)))).toBe('VALIDACION_CADUCADA')
    for (const v of [val, apr]) {
      const c = revisarCaducidad(v, 'sha256:h2', { en: 't' })
      expect(c?.version).toMatchObject({ estado: 'BORRADOR', huellaEntradas: 'sha256:h2', aprobadaPor: undefined })
      expect(c?.evento.accion).toBe('caducar')
    }
    expect(revisarCaducidad(val, 'sha256:h1', { en: 't' })).toBeNull()
    const pub = { ...apr, estado: 'PUBLICADO' as const }
    expect(revisarCaducidad(pub, 'sha256:h2', { en: 't' })).toBeNull() // lo publicado no cambia
  })

  it('editar vuelve a BORRADOR y borra la validación; editar lo publicado está prohibido (I3)', () => {
    const r = transicionar(hasta('APROBADO'), { tipo: 'editar', nuevaHuella: 'sha256:h9' }, ctx(SUP))
    expect(r.ok && r.valor.version).toMatchObject({ estado: 'BORRADOR', huellaEntradas: 'sha256:h9', validacionTecnica: undefined })
    const pub: VersionPlan = { ...hasta('APROBADO'), estado: 'PUBLICADO' }
    expect(codigo(transicionar(pub, { tipo: 'editar', nuevaHuella: 'x' }, ctx(SUP)))).toBe('PUBLICADO_INMUTABLE')
    expect(codigo(transicionar({ ...pub, estado: 'REEMPLAZADO_TOTAL' }, { tipo: 'editar', nuevaHuella: 'x' }, ctx(SUP)))).toBe('PUBLICADO_INMUTABLE')
  })
})

describe('B1 · actores y roles (I8, D3)', () => {
  it('ningún agente ni proceso automático aprueba, publica ni descarta', () => {
    const val = hasta('VALIDADO'), apr = hasta('APROBADO')
    expect(codigo(transicionar(val, { tipo: 'aprobar', huellaActual: 'sha256:h1' }, ctx(AGENTE)))).toBe('ACTOR_NO_HUMANO')
    expect(codigo(transicionar(val, { tipo: 'aprobar', huellaActual: 'sha256:h1' }, ctx(SISTEMA)))).toBe('ACTOR_NO_HUMANO')
    expect(codigo(transicionar(apr, { tipo: 'publicar', huellaActual: 'sha256:h1', revalidacionServidor: validacion('sha256:h1', 'servidor') }, ctx(AGENTE)))).toBe('ACTOR_NO_HUMANO')
    expect(codigo(transicionar(val, { tipo: 'descartar' }, ctx(AGENTE)))).toBe('ACTOR_NO_HUMANO')
  })

  it('aprobación propia: permitida si la sucursal lo habilita (091); si no, rechazada', () => {
    const val = hasta('VALIDADO')
    expect(transicionar(val, { tipo: 'aprobar', huellaActual: 'sha256:h1' }, ctx(SUP)).ok).toBe(true)
    const sinPropia = { aprobacionPropiaPermitida: false }
    expect(codigo(transicionar(val, { tipo: 'aprobar', huellaActual: 'sha256:h1' }, ctx(SUP, sinPropia)))).toBe('ROL_NO_AUTORIZADO')
    const aprobadorCreador: Actor = { tipo: 'persona', id: 'sup-1', rol: 'aprobador' }
    expect(codigo(transicionar(val, { tipo: 'aprobar', huellaActual: 'sha256:h1' }, ctx(aprobadorCreador, sinPropia)))).toBe('APROBACION_PROPIA_NO_PERMITIDA')
  })

  it('auditor no aprueba ni publica; supervisor no publica', () => {
    const aud: Actor = { tipo: 'persona', id: 'aud', rol: 'auditor' }
    expect(codigo(transicionar(hasta('VALIDADO'), { tipo: 'aprobar', huellaActual: 'sha256:h1' }, ctx(aud)))).toBe('ROL_NO_AUTORIZADO')
    expect(codigo(transicionar(hasta('APROBADO'), { tipo: 'publicar', huellaActual: 'sha256:h1', revalidacionServidor: validacion('sha256:h1', 'servidor') }, ctx(SUP)))).toBe('ROL_NO_AUTORIZADO')
  })

  it('transiciones inválidas devuelven errores tipados', () => {
    const b = version('v1', '2026-11-16')
    expect(codigo(transicionar(b, { tipo: 'aprobar', huellaActual: 'sha256:h1' }, ctx(APR)))).toBe('TRANSICION_INVALIDA')
    expect(codigo(transicionar(b, { tipo: 'publicar', huellaActual: 'sha256:h1', revalidacionServidor: validacion('sha256:h1', 'servidor') }, ctx(APR)))).toBe('TRANSICION_INVALIDA')
    const desc = transicionar(b, { tipo: 'descartar', motivo: 'prueba' }, ctx(SUP))
    expect(desc.ok && desc.valor.evento.motivo).toBe('prueba')
    expect(codigo(transicionar(desc.ok ? desc.valor.version : b, { tipo: 'editar', nuevaHuella: 'x' }, ctx(SUP)))).toBe('TRANSICION_INVALIDA')
    expect(codigo(transicionar(b, { tipo: 'marcar-reemplazo-total', publicacionId: 'p' }, ctx(SISTEMA)))).toBe('TRANSICION_INVALIDA')
    const pub: VersionPlan = { ...hasta('APROBADO'), estado: 'PUBLICADO' }
    expect(codigo(transicionar(pub, { tipo: 'marcar-reemplazo-total', publicacionId: 'p' }, ctx(APR)))).toBe('ROL_NO_AUTORIZADO')
    expect(transicionar(pub, { tipo: 'marcar-reemplazo-total', publicacionId: 'p' }, ctx(SISTEMA)).ok).toBe(true)
  })
})

describe('B1 · textos (I13): validez técnica, nunca conformidad jurídica', () => {
  it('ningún texto del núcleo afirma «legal» ni «cumple la ley/normativa»', () => {
    const dir = join(__dirname, '..')
    const literales = readdirSync(dir).filter(f => f.endsWith('.ts'))
      .flatMap(f => readFileSync(join(dir, f), 'utf8').match(/(['"`])(?:\\.|(?!\1).)*\1/g) ?? [])
    expect(literales.length).toBeGreaterThan(30)
    for (const l of literales) expect(l).not.toMatch(/\blegal(es|mente)?\b|cumple (con )?la (ley|normativa)/i)
  })
})
