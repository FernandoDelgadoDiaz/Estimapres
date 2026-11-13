import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Auxiliar, Colaborador, Eventual } from '../../types'
import {
  CLAVES_ROSTER,
  actualizarCacheRoster,
  cargarGrupoRoster,
  invalidarCacheBackend,
  invalidarCacheRoster,
  type GrupoRoster,
} from '../almacen'

const { backend, from, asegurarSesion } = vi.hoisted(() => ({
  backend: { configurado: true },
  from: vi.fn(),
  asegurarSesion: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  get supabase() { return backend.configurado ? { from } : null },
  asegurarSesion,
}))

const turno = ['09:00-15:00', '', '', '', '', '', '']
const cajero: Colaborador = { id: 'caja-091-001', nombre: 'Cajero de prueba', tipo: 'PART', horasSemanales: 24, activo: false }
const auxiliar = { id: 'aux-091-001', nombre: 'Auxiliar de prueba', horarioSemanal: turno, activo: true }
const eventual = { id: 'ev-091-001', nombre: 'Eventual de prueba', horarioSemanal: turno, sector: 'Prueba', activo: false }

const filas = {
  cajero: { id: cajero.id, nombre: cajero.nombre, tipo: cajero.tipo, horas_semanales: 24, activo: false },
  auxiliar: { id: auxiliar.id, nombre: auxiliar.nombre, horario_semanal: turno, activo: true },
  eventual: { id: eventual.id, nombre: eventual.nombre, horario_semanal: turno, sector: eventual.sector, activo: false },
}

function tablaRoster(datos: Partial<Record<GrupoRoster, object[]>> = {}) {
  const eqSucursal = vi.fn().mockReturnThis()
  const seleccionar = vi.fn(() => ({
    eq: (columna: string, grupo: GrupoRoster) => {
      expect(columna).toBe('grupo')
      return {
        eq: eqSucursal,
        order: () => Promise.resolve({ data: datos[grupo] ?? [], error: null }),
      }
    },
  }))
  const insert = vi.fn().mockResolvedValue({ error: null })
  const upsert = vi.fn().mockResolvedValue({ error: null })
  const borrar = vi.fn()
  from.mockReturnValue({ select: seleccionar, insert, upsert, delete: borrar })

  return () => {
    expect(from).toHaveBeenCalledWith('colaboradores')
    expect(eqSucursal).toHaveBeenCalledWith('sucursal_id', '091')
    expect(insert).not.toHaveBeenCalled()
    expect(upsert).not.toHaveBeenCalled()
    expect(borrar).not.toHaveBeenCalled()
  }
}

describe('carga del roster de una cuenta', () => {
  beforeEach(() => {
    backend.configurado = true
    asegurarSesion.mockReset().mockResolvedValue('cuenta-simulada')
    from.mockReset()
    invalidarCacheBackend()
    invalidarCacheRoster()

    const dispositivo = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => dispositivo.get(key) ?? null,
      setItem: (key: string, value: string) => dispositivo.set(key, value),
    })
  })

  afterEach(() => vi.unstubAllGlobals())

  it('deja vacía la cuenta de 091 aunque el navegador tenga un roster anterior', async () => {
    localStorage.setItem(CLAVES_ROSTER.cajero, JSON.stringify([cajero]))
    localStorage.setItem(CLAVES_ROSTER.eventual, JSON.stringify([eventual]))
    const comprobarSoloLectura = tablaRoster()

    for (const grupo of ['cajero', 'auxiliar', 'eventual'] as const) {
      await expect(cargarGrupoRoster(grupo)).resolves.toEqual([])
    }

    comprobarSoloLectura()
    actualizarCacheRoster('cajero', [])
    expect(localStorage.getItem(CLAVES_ROSTER.cajero)).toBe(JSON.stringify([cajero]))
  })

  it('conserva IDs, configuración y estado de los grupos existentes', async () => {
    const comprobarSoloLectura = tablaRoster({
      cajero: [filas.cajero], auxiliar: [filas.auxiliar], eventual: [filas.eventual],
    })

    await expect(cargarGrupoRoster<Colaborador>('cajero')).resolves.toEqual([cajero])
    await expect(cargarGrupoRoster<Auxiliar>('auxiliar')).resolves.toEqual([auxiliar])
    await expect(cargarGrupoRoster<Eventual>('eventual')).resolves.toEqual([eventual])

    comprobarSoloLectura()
  })

  it('no completa un grupo parcial con ejemplos ni con colaboradores de otro dispositivo', async () => {
    localStorage.setItem(CLAVES_ROSTER.cajero, JSON.stringify([{ ...cajero, id: 'otra-caja' }]))
    localStorage.setItem(CLAVES_ROSTER.auxiliar, JSON.stringify([auxiliar]))
    const comprobarSoloLectura = tablaRoster({ cajero: [filas.cajero] })

    await expect(cargarGrupoRoster<Colaborador>('cajero')).resolves.toEqual([cajero])
    await expect(cargarGrupoRoster('auxiliar')).resolves.toEqual([])
    await expect(cargarGrupoRoster('eventual')).resolves.toEqual([])

    comprobarSoloLectura()
  })

  it('si falla una consulta autenticada, no usa el roster del dispositivo y permite volver a leer', async () => {
    localStorage.setItem(CLAVES_ROSTER.cajero, JSON.stringify([cajero]))
    const comprobarSoloLectura = tablaRoster({ cajero: [filas.cajero] })
    const consultaFallida = { eq: () => consultaFallida, order: async () => ({
      data: null, error: { message: 'Sin conexión' },
    }) }
    from.mockReturnValueOnce({ select: () => consultaFallida })

    await expect(cargarGrupoRoster('cajero')).rejects.toThrow('Sin conexión')
    await expect(cargarGrupoRoster('cajero')).resolves.toEqual([cajero])

    comprobarSoloLectura()
  })

  it('en modo local empieza vacío y conserva las altas explícitas en el dispositivo', async () => {
    backend.configurado = false

    await expect(cargarGrupoRoster('cajero')).resolves.toEqual([])
    actualizarCacheRoster('cajero', [cajero])
    invalidarCacheRoster()
    await expect(cargarGrupoRoster('cajero')).resolves.toEqual([cajero])
    expect(from).not.toHaveBeenCalled()
  })
})
