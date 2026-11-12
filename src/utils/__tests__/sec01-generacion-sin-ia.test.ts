// SEC-01 (#4): la desactivación de sugerencias IA no debe alterar la generación
// matemática ni volver a introducir rutas de red/claves hacia Anthropic.
import { describe, expect, it, vi, afterEach } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { asignarHorariosConIA } from '../iaAsignacion'
import { convertirInputAV2, convertirOutputDeV2 } from '../../algoritmo/adapter'
import { ejecutarAlgoritmo } from '../../algoritmo/orquestador'
import { normalizarExcepciones } from '../preferencias'
import { HORAS_FRANJAS, type Colaborador, type Franja, type Auxiliar, type Eventual } from '../../types'

// Datos sintéticos (sin personas reales).
const necesidad: Franja[] = HORAS_FRANJAS.map((hora) => {
  const h = Number(hora.slice(0, 2))
  const base = h < 8 ? 0 : h < 12 ? 2 : h < 17 ? 3 : h < 21 ? 4 : 2
  return { hora, necesidad: [0, 1, 2, 3, 4, 5, 6].map((d) => (base === 0 ? 0 : base + (d === 5 ? 1 : 0))) }
})
const cajeros: Colaborador[] = [
  { id: 'f1', nombre: 'Full Uno', tipo: 'FULL', horasSemanales: 48, activo: true },
  { id: 'f2', nombre: 'Full Dos', tipo: 'FULL', horasSemanales: 48, activo: true },
  { id: 'f3', nombre: 'Full Tres', tipo: 'FULL', horasSemanales: 48, activo: true },
  { id: 'p1', nombre: 'Part Uno', tipo: 'PART', horasSemanales: 31, activo: true },
  { id: 'p2', nombre: 'Part Dos', tipo: 'PART', horasSemanales: 31, activo: true },
]
const auxiliares: Auxiliar[] = [
  { id: 'a1', nombre: 'Aux Uno', horarioSemanal: ['08:00-16:00', '08:00-16:00', '', '08:00-16:00', '08:00-16:00', '08:00-16:00', '08:00-16:00'], activo: true },
]
const eventuales: Eventual[] = [
  { id: 'e1', nombre: 'Ev Uno', sector: 'X', horarioSemanal: ['', '', '', '', '', '17:00-21:00', ''], activo: true },
]
const fechas = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']

describe('SEC-01: generación de horarios sin IA', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('no realiza llamadas de red y devuelve exactamente el resultado del motor determinístico', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const resultado = await asignarHorariosConIA(necesidad, cajeros, auxiliares, eventuales, fechas)

    const esperado = convertirOutputDeV2(
      ejecutarAlgoritmo(convertirInputAV2(necesidad, cajeros, auxiliares, eventuales, normalizarExcepciones([]))),
      cajeros, auxiliares, eventuales,
    )
    expect(fetchMock).not.toHaveBeenCalled()
    expect(resultado).toEqual(esperado)
    expect(resultado.horarios.length).toBeGreaterThan(0)
    expect(resultado.alertas.some((a) => a.startsWith('💡'))).toBe(false)
  })

  it('es reproducible: dos ejecuciones con la misma entrada dan el mismo resultado', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const r1 = await asignarHorariosConIA(necesidad, cajeros, auxiliares, eventuales, fechas)
    const r2 = await asignarHorariosConIA(necesidad, cajeros, auxiliares, eventuales, fechas)
    expect(r2).toEqual(r1)
  })
})

describe('SEC-01: guardas estáticas contra rutas inseguras a Anthropic', () => {
  const raiz = join(__dirname, '..', '..', '..')
  const archivos = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n)
      if (statSync(p).isDirectory()) return n === '__tests__' ? [] : archivos(p)
      return /\.(ts|tsx|js|jsx|mjs)$/.test(n) ? [p] : []
    })
  const fuentes = [...archivos(join(raiz, 'src')), ...archivos(join(raiz, 'netlify', 'functions'))]

  it.each([
    ['SDK de Anthropic', /@anthropic-ai\/sdk/],
    ['cliente de navegador', /dangerouslyAllowBrowser/],
    ['URL de la API', /api\.anthropic\.com/],
    ['clave VITE_* de Claude/Anthropic', /VITE_\w*(CLAUDE|ANTHROPIC)/i],
    ['lectura de CLAUDE_API_KEY', /CLAUDE_API_KEY|ANTHROPIC_API_KEY/],
    ['llamada al proxy desde el cliente', /functions\/claude-proxy/],
  ])('ningún archivo de src/ ni netlify/functions usa %s', (_n, patron) => {
    const hits = fuentes.filter((f) => patron.test(readFileSync(f, 'utf8'))).map((f) => relative(raiz, f))
    expect(hits).toEqual([])
  })

  it('.env.example no indica claves de Anthropic con prefijo VITE_ (se exponen al navegador)', () => {
    const env = readFileSync(join(raiz, '.env.example'), 'utf8')
    expect(env).not.toMatch(/^\s*VITE_\w*(CLAUDE|ANTHROPIC)/im)
  })
})
