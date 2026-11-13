import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { abrirPDFNode } from './fixtures/pdfTextoNode'
import { describe, expect, it } from 'vitest'
import { generarPDF } from '../exportPDF'
import { fechasDeSemana } from '../pomContrato'
import { HORAS_FRANJAS, type Auxiliar, type Colaborador, type Eventual, type HorarioColaborador, type ResultadoAsignacion } from '../../types'
import type { ResultadoValidacion } from '../../algoritmo/validadorIndependiente'

const fechas = fechasDeSemana('2026-11-16')
const columnas = ['Lun 16/11', 'Mar 17/11', 'Mié 18/11', 'Jue 19/11', 'Vie 20/11', 'Sáb 21/11', 'Dom 22/11']
const ids = (i: number) => String(i + 1).padStart(3, '0')
const caja = (n: number) => HORAS_FRANJAS.map(() => Array<number>(7).fill(n))
const pdfPt = (mm: number) => mm * 72 / 25.4

function fixture(cantidad: number) {
  const cajeros: Colaborador[] = []
  const aux: Auxiliar[] = []
  const eventuales: Eventual[] = []
  const nominal = Array.from({ length: cantidad }, (_, i) => {
    const id = `qa-${ids(i)}`
    const nombre = i % 5 === 0
      ? `Sintético ${ids(i)} · Colaborador con nombre compuesto para revisar el apellido completo y la última palabra`
      : `Sintético ${ids(i)}`
    const tipo = (['FULL', 'PART', 'AUX', 'EVENTUAL'] as const)[i % 4]
    const persona = { id, nombre, activo: true }
    if (tipo === 'AUX') aux.push({ ...persona, horarioSemanal: [] })
    else if (tipo === 'EVENTUAL') eventuales.push({ ...persona, horarioSemanal: [], sector: 'Prueba' })
    else cajeros.push({ ...persona, tipo, horasSemanales: 0 })
    const franjas = [
      tipo === 'FULL' ? ['08:00-12:00', '17:00-21:30'] : ['08:00-12:00'],
      ['09:00-13:00'],
      [],
      ['11:00-15:00'],
      ['12:00-16:00'],
      ['13:00-17:00'],
      ['14:00-18:00'],
    ]
    const esperado = franjas.map((bloques, d) => d === 2
      ? [tipo === 'EVENTUAL' ? 'Sin caja' : 'FRANCO']
      : bloques)
    const jornadas: HorarioColaborador['jornadas'] = franjas.map((bloques, dia) => ({
      dia,
      turnos: bloques.map(b => { const [inicio, fin] = b.split('-'); return { inicio, fin } }),
      horas: bloques.length === 2 ? 8.5 : bloques.length * 4,
      esFranco: bloques.length === 0,
      rol: bloques.length ? 'cajero' : 'franco',
    }))
    const horario: HorarioColaborador = {
      colaboradorId: id, jornadas: jornadas.reverse(), errores: [],
      rolGeneral: tipo === 'AUX' ? 'aux_supervisor' : tipo === 'EVENTUAL' ? 'eventual_sector' : 'cajero',
      totalHoras: jornadas.reduce((sum, j) => sum + j.horas, 0),
    }
    return { nombre, tipo, esperado, horario }
  })
  const resultado: ResultadoAsignacion = {
    horarios: nominal.map(n => n.horario),
    coberturaFranjas: caja(99),
    faltantesFranjas: caja(0),
    porcentajeCobertura: 90,
    alertas: Array.from({ length: cantidad }, (_, i) =>
      `Alerta sintética ${ids(i)}. Revisar las franjas con baja cobertura y confirmar disponibilidad. Fin del aviso ${ids(i)}.`),
    cajaAux: aux.map(a => ({
      colaboradorId: a.id, nombre: a.nombre,
      slotsCajaPorDia: Array.from({ length: 7 }, () => Array.from({ length: 30 }, (_, s) => s === 4 || s === 6)),
    })),
  }
  const validacion: ResultadoValidacion = {
    ok: cantidad !== 60, publicable: cantidad !== 60,
    violaciones: cantidad === 60 ? Array.from({ length: 45 }, (_, i) => ({
      codigo: `QA_${ids(i)}`, nivel: 'OPERATIVA' as const, dia: i % 7,
      detalle: `Incidencia sintética ${ids(i)}. Revisar el turno de esta fecha para comprobar cortes de página y conservar todo el detalle.`,
    })) : [],
    metricas: { cobertura: caja(3), faltantes: caja(0), sobrantes: caja(1), horasCajaFaltantes: 0, horasCajaSobrantes: 108.5 },
  }
  return { cajeros, aux, eventuales, nominal, resultado, validacion }
}

describe('PDF semanal A4', () => {
  it.each([25, 40, 60])('conserva las %i personas y todas las columnas al volver a abrir el PDF', async cantidad => {
    const { cajeros, aux, eventuales, nominal, resultado, validacion } = fixture(cantidad)
    const pdf = generarPDF(resultado, cajeros, 'Semana de prueba', aux, eventuales, {
      sucursal: '900', fechas, version: 3, validacion,
    })
    const buffer = new Uint8Array(pdf.output('arraybuffer'))
    const salidaQA = process.env.AH2_PDF_QA_DIR
    if (salidaQA) writeFileSync(join(salidaQA, `horarios-${cantidad}.pdf`), buffer)

    const pdfReabierto = await abrirPDFNode(buffer)
    const titulos = new Map<string, number>()
    const nombresVistos: string[] = []
    const textos: string[] = []
    try {
      for (let i = 1; i <= pdfReabierto.numPages; i++) {
        const pagina = await pdfReabierto.getPage(i)
        const [, , ancho, alto] = pagina.view
        expect(ancho).toBeCloseTo(841.89, 1)
        expect(alto).toBeCloseTo(595.28, 1)
        const { items } = await pagina.getTextContent()
        const texto = items.flatMap(t => 'str' in t && t.str.trim()
          ? [{ str: t.str.trim(), x: t.transform[4], y: t.transform[5], ancho: t.width }]
          : [])
        const paginaTexto = texto.map(t => t.str).join(' ')
        textos.push(paginaTexto)
        expect(paginaTexto).toContain(`Página ${i} de ${pdfReabierto.numPages}`)
        expect(paginaTexto).toContain('Sucursal 900')
        expect(paginaTexto).toContain('Semana 16/11/2026 al 22/11/2026')
        expect(paginaTexto).toContain('Versión 3')
        expect(paginaTexto).toContain(validacion.publicable ? 'Estado: VALIDADO' : 'Estado: BORRADOR')
        for (const t of texto) {
          expect(t.x).toBeGreaterThan(pdfPt(11))
          expect(t.x + t.ancho).toBeLessThan(ancho - pdfPt(11))
          expect(t.y).toBeGreaterThan(pdfPt(6))
          expect(t.y).toBeLessThan(alto - pdfPt(10))
        }
        const titulo = texto[0].str
        titulos.set(titulo, (titulos.get(titulo) ?? 0) + 1)
        if (titulo !== 'Horarios Semanales') continue
        for (const col of columnas) expect(paginaTexto).toContain(col)

        const xTipo = pdfPt(12 + 58)
        const xHoras = pdfPt(12 + 79)
        const xDias = pdfPt(12 + 94)
        const anchoDia = (ancho - pdfPt(24 + 94)) / 7
        const celdas = (x0: number, x1: number, y0: number, y1: number) =>
          texto.filter(t => t.x >= x0 && t.x < x1 && t.y >= y0 && t.y <= y1).map(t => t.str)
        const personas = texto.filter(t => t.x < xTipo && /^Sintético \d{3}/.test(t.str))
        expect(personas.length).toBeGreaterThan(0)
        for (const persona of personas) {
          const n = Number(persona.str.match(/\d{3}/)![0]) - 1
          const esperado = nominal[n]
          // El centro de tipo/horas queda a la altura de la primera o segunda línea del nombre.
          const tipo = texto.find(t => t.x >= xTipo && t.x < xHoras && Math.abs(t.y - persona.y) < 12)
          expect(tipo?.str).toBe(esperado.tipo)
          const centro = tipo!.y
          const mediaAltura = esperado.nombre.length > 30 ? 13 : 9
          const textoNombre = celdas(pdfPt(12), xTipo, centro - mediaAltura, centro + mediaAltura).join(' ')
          expect(textoNombre).toBe(esperado.nombre)
          nombresVistos.push(textoNombre)
          expect(celdas(xHoras, xDias, centro - 2, centro + 2)).toEqual([
            `${String(esperado.horario.totalHoras).replace('.', ',')} h`,
          ])
          esperado.esperado.forEach((bloques, d) => {
            expect(celdas(xDias + d * anchoDia, xDias + (d + 1) * anchoDia, centro - 8, centro + 8)).toEqual(bloques)
          })
        }
      }
    } finally {
      await pdfReabierto.destroy()
    }
    expect(nombresVistos).toEqual(nominal.map(n => n.nombre))
    expect(titulos.get('Horarios Semanales')).toBeGreaterThan(1)
    expect(titulos.get('Cobertura por franja')).toBe(1)
    expect(textos.find(t => t.startsWith('Cobertura por franja'))).toContain('3/2')
    expect(textos.join(' ')).toContain('10:00-10:30 11:00-11:30')
    for (let i = 0; i < cantidad; i++) expect(textos.join(' ')).toContain(`Fin del aviso ${ids(i)}.`)
    if (cantidad === 60) {
      expect(titulos.get('Validación y faltantes')).toBeGreaterThan(1)
      for (let i = 0; i < 45; i++) expect(textos.join(' ')).toContain(`Incidencia sintética ${ids(i)}.`)
    }
  })
})
