// PUB-01 (#12, parte sin migración): validación de la semana y su reflejo en el PDF.
import { describe, expect, it } from 'vitest'
import { asignarHorariosConIA } from '../iaAsignacion'
import { validarResultadoSemana, estadoValidacion } from '../validacionSemana'
import { generarPDF } from '../exportPDF'
import { textoPDFNode } from './fixtures/pdfTextoNode'
import { HORAS_FRANJAS, type Auxiliar, type Colaborador, type ResultadoAsignacion } from '../../types'

const necesidad = HORAS_FRANJAS.map(hora => {
  const h = Number(hora.slice(0, 2))
  return { hora, necesidad: Array(7).fill(h < 8 ? 0 : h < 14 ? 2 : 3) }
})
const cajeros: Colaborador[] = [
  { id: 'f1', nombre: 'Persona Full Uno', tipo: 'FULL', horasSemanales: 48, activo: true },
  { id: 'f2', nombre: 'Persona Full Dos', tipo: 'FULL', horasSemanales: 48, activo: true },
  { id: 'p1', nombre: 'Persona Part Uno', tipo: 'PART', horasSemanales: 31, activo: true },
]
// #38: con «apertura solo AUX» (predeterminada) la semana necesita un supervisor presente en la apertura.
const auxiliares: Auxiliar[] = [{ id: 'a1', nombre: 'Persona Aux Uno', activo: true, horarioSemanal: Array(7).fill('08:00-22:30') }]
const fechas = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']

async function generar(): Promise<ResultadoAsignacion> {
  const g = globalThis as { fetch?: unknown }
  const f = g.fetch; g.fetch = async () => { throw new Error('offline') } // sin red en tests
  try { return await asignarHorariosConIA(necesidad, cajeros, auxiliares, [], fechas) } finally { g.fetch = f }
}

describe('PUB-01: validación de la semana generada', () => {
  it('la salida del motor es VALIDADA (sin violaciones) con el perfil actual', async () => {
    const r = await generar()
    const v = validarResultadoSemana(r, cajeros, auxiliares, [], { necesidad, excepciones: [] })
    expect(v.violaciones).toEqual([])
    expect(estadoValidacion(v)).toBe('VALIDADO: sin violaciones de reglas (perfil normativo pendiente de validación jurídica)')
  })

  it('#38: sin ningún AUX y con «apertura solo AUX» activa, nunca es VALIDADO', async () => {
    const r = await generar()
    const v = validarResultadoSemana({ ...r, cajaAux: [] }, cajeros, auxiliares, [], { necesidad, excepciones: [] })
    expect(v.publicable).toBe(false)
    expect(v.violaciones.filter(x => x.codigo === 'OP_APERTURA_COMPOSICION')).toHaveLength(7)
    expect(estadoValidacion(v)).toMatch(/^BORRADOR/)
  })

  it('una edición manual que rompe una regla pasa a BORRADOR', async () => {
    const r = await generar()
    const h = r.horarios.find(x => x.colaboradorId === 'p1')!
    const j = h.jornadas.find(x => !x.esFranco)!
    j.turnos = [{ inicio: '09:00', fin: '18:00' }]; j.horas = 9
    const v = validarResultadoSemana(r, cajeros, auxiliares, [], { necesidad, excepciones: [] })
    expect(v.publicable).toBe(false)
    expect(v.violaciones.map(x => x.codigo)).toContain('NORM_HORAS_DIA_MAX')
    expect(estadoValidacion(v)).toMatch(/^BORRADOR: \d+ violaci/)
  })

  it('aplica excepciones con día textual (normalizadas) y el franco fijo se valida', async () => {
    const r = await generar()
    const francoReal = r.horarios.find(x => x.colaboradorId === 'p1')!.jornadas.find(j => j.esFranco)!.dia
    const otro = (francoReal + 1) % 7
    const exc = [{ id: 'e', colaboradorNombre: 'Persona Part Uno', tipo: 'franco_dia' as const, valor: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][otro], descripcion: 'franco fijo' }]
    const v = validarResultadoSemana(r, cajeros, auxiliares, [], { necesidad, excepciones: exc })
    expect(v.violaciones.filter(x => x.codigo === 'OP_FRANCO_DIA').length).toBe(2)
  })
})

describe('PUB-01: PDF con identificación, estado y anexo', () => {
  it('el PDF reabierto conserva sucursal, fechas, estado, nombres y anexo de validación', async () => {
    const r = await generar()
    const v = validarResultadoSemana(r, cajeros, auxiliares, [], { necesidad, excepciones: [] })
    const pdf = generarPDF(r, cajeros, 'Semana 47 - noviembre 2026', auxiliares, [], { sucursal: '091', fechas, validacion: v, estado: estadoValidacion(v) })
    const texto = (await textoPDFNode(new Uint8Array(pdf.output('arraybuffer')))).replace(/\s+/g, ' ')
    expect(texto).toContain('Sucursal 091')
    expect(texto).toContain('Semana 16/11/2026 al 22/11/2026')
    expect(texto).toContain('Estado: VALIDADO')
    for (const c of cajeros) expect(texto).toContain(c.nombre)
    expect(texto).toContain('Validación y faltantes')
    expect(texto).toContain('Sin violaciones de reglas normativas ni operativas.')
  })

  it('con violaciones, el anexo las lista y el estado dice BORRADOR', async () => {
    const r = await generar()
    const j = r.horarios.find(x => x.colaboradorId === 'p1')!.jornadas.find(x => !x.esFranco)!
    j.turnos = [{ inicio: '09:00', fin: '18:00' }]; j.horas = 9
    const v = validarResultadoSemana(r, cajeros, auxiliares, [], { necesidad, excepciones: [] })
    const pdf = generarPDF(r, cajeros, 'S', [], [], { sucursal: '091', fechas, validacion: v, estado: estadoValidacion(v) })
    const texto = (await textoPDFNode(new Uint8Array(pdf.output('arraybuffer')))).replace(/\s+/g, ' ')
    expect(texto).toMatch(/Estado: BORRADOR/)
    expect(texto).toContain('NORM_HORAS_DIA_MAX')
  })

  it('sin meta, el PDF se genera como antes (compatibilidad)', async () => {
    const r = await generar()
    const texto = await textoPDFNode(new Uint8Array(generarPDF(r, cajeros, 'S').output('arraybuffer')))
    expect(texto).not.toContain('Validación y faltantes')
    expect(texto).toContain('Horarios Semanales - S')
  })
})
