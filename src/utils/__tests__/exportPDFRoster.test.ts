import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { abrirPDFNode } from './fixtures/pdfTextoNode'
import { describe, expect, it } from 'vitest'
import { generarPDF, TITULO_CAJA, TITULO_PRESENCIA } from '../exportPDF'
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
      tipo === 'EVENTUAL' ? ['08:00-08:30', '09:00-09:30', '10:00-10:30', '11:00-11:30', '12:00-12:30', '13:00-13:30', '14:00-14:30'] : ['09:00-13:00'],
      [],
      ['11:00-15:00'],
      ['12:00-16:00'],
      ['13:00-17:00'],
      ['14:00-18:00'],
    ]
    // Cuadro de caja: FULL/PART = jornadas; AUX = solo sus franjas de caja; EVENTUAL = su caja.
    const esperado = franjas.map((bloques, d) => d === 2
      ? [tipo === 'EVENTUAL' ? 'Sin caja' : 'FRANCO']
      : tipo === 'AUX' ? ['10:00-10:30', '11:00-11:30']
        : d === 3 && tipo === 'FULL' ? [...bloques, 'Medio franco'] : bloques)
    const horasCaja = tipo === 'AUX' ? 6 : franjas.flat().reduce((h, b) => {
      const [i, f] = b.split('-').map(x => { const [hh, mm] = x.split(':').map(Number); return hh * 60 + mm })
      return h + (f - i) / 60
    }, 0)
    const jornadas: HorarioColaborador['jornadas'] = franjas.map((bloques, dia) => ({
      dia,
      turnos: bloques.map(b => { const [inicio, fin] = b.split('-'); return { inicio, fin } }),
      horas: bloques.length === 2 ? 8.5 : bloques.length * 4,
      esFranco: bloques.length === 0,
      rol: !bloques.length ? 'franco' : dia === 3 && tipo === 'FULL' ? 'franco_medio' : 'cajero',
    }))
    const horario: HorarioColaborador = {
      colaboradorId: id, jornadas: jornadas.reverse(), errores: [],
      rolGeneral: tipo === 'AUX' ? 'aux_supervisor' : tipo === 'EVENTUAL' ? 'eventual_sector' : 'cajero',
      totalHoras: jornadas.reduce((sum, j) => sum + j.horas, 0),
    }
    return { nombre, tipo, esperado, horario, horasCaja }
  })
  const resultado: ResultadoAsignacion = {
    horarios: nominal.map(n => n.horario),
    coberturaFranjas: caja(99),
    faltantesFranjas: caja(0),
    porcentajeCobertura: 90,
    alertas: Array.from({ length: cantidad }, (_, i) =>
      `Alerta sintética ${ids(i)}. Revisar las franjas con baja cobertura y confirmar disponibilidad. Fin del aviso ${ids(i)}.`),
    // AUX: en caja 10:00-10:30 y 11:00-11:30 salvo el miércoles (franco de presencia).
    cajaAux: aux.map(a => ({
      colaboradorId: a.id, nombre: a.nombre,
      slotsCajaPorDia: Array.from({ length: 7 }, (_, d) => Array.from({ length: 30 }, (_, s) => d !== 2 && (s === 4 || s === 6))),
    })),
    // EVENTUAL: su caja (fuente del cuadro de caja) coincide con sus franjas.
    cajaEventual: nominal.filter(n => n.tipo === 'EVENTUAL').map(n => ({
      colaboradorId: n.horario.colaboradorId, nombre: n.nombre,
      slotsCajaPorDia: Array.from({ length: 7 }, (_, d) => Array.from({ length: 30 }, (_, s) => {
        const t = 8 * 60 + s * 30
        return (n.horario.jornadas.find(j => j.dia === d)?.turnos ?? []).some(x => {
          const [hi, mi] = x.inicio.split(':').map(Number); const [hf, mf] = x.fin.split(':').map(Number)
          return hi * 60 + mi <= t && hf * 60 + mf > t
        })
      })),
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
          ? [{ str: t.str.trim(), x: t.transform[4], y: t.transform[5], ancho: t.width, tam: t.height }]
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
        // Baselines más la altura nominal de Helvetica. Exigir espacio vertical
        // también entre dos intervalos consecutivos en la misma columna.
        for (const [idx, a] of texto.entries()) {
          for (const b of texto.slice(idx + 1)) {
            const anchoComun = Math.min(a.x + a.ancho, b.x + b.ancho) - Math.max(a.x, b.x)
            if (anchoComun <= 2) continue
            const altoComun = Math.min(a.y + 1.08 * a.tam, b.y + 1.08 * b.tam) - Math.max(a.y - 0.26 * a.tam, b.y - 0.26 * b.tam)
            expect(altoComun, `Página ${i}: «${a.str}» / «${b.str}»`).toBeLessThanOrEqual(0.7)
          }
        }
        const titulo = texto[0].str
        titulos.set(titulo, (titulos.get(titulo) ?? 0) + 1)
        // El cuadro de presencia puede empezar a mitad de una página del cuadro de caja.
        const inicioPresencia = texto.find(t => t.str === TITULO_PRESENCIA && t !== texto[0])
        if (inicioPresencia) titulos.set(TITULO_PRESENCIA, (titulos.get(TITULO_PRESENCIA) ?? 0) + 1)
        if (titulo !== TITULO_CAJA) continue
        for (const col of columnas) expect(paginaTexto).toContain(col)

        const xTipo = pdfPt(12 + 54)
        const xHoras = pdfPt(12 + 76)
        const xDias = pdfPt(12 + 95)
        const anchoDia = (ancho - pdfPt(24 + 95)) / 7
        const yMin = inicioPresencia ? inicioPresencia.y + 1 : 0
        const celdas = (x0: number, x1: number, y0: number, y1: number) =>
          texto.filter(t => t.x >= x0 && t.x < x1 && t.y >= Math.max(y0, yMin) && t.y <= y1).map(t => t.str)
        const personas = texto.filter(t => t.x < xTipo && t.y > yMin && /^Sintético \d{3}/.test(t.str))
        expect(personas.length).toBeGreaterThan(0)
        for (const [indice, persona] of personas.entries()) {
          const n = Number(persona.str.match(/\d{3}/)![0]) - 1
          const esperado = nominal[n]
          // El centro de tipo/horas queda a la altura de la primera o segunda línea del nombre.
          const tipo = texto.find(t => t.x >= xTipo && t.x < xHoras && Math.abs(t.y - persona.y) < 12)
          expect(tipo?.str).toBe(esperado.tipo)
          const centro = tipo!.y
          const ySiguiente = personas[indice + 1]?.y ?? Math.max(pdfPt(15), yMin)
          const textoNombre = celdas(pdfPt(12), xTipo, ySiguiente + 1, centro + 2).join(' ')
          expect(textoNombre).toBe(esperado.nombre)
          nombresVistos.push(textoNombre)
          expect(celdas(xHoras, xDias, centro - 2, centro + 2)).toEqual([
            `${String(esperado.horasCaja).replace('.', ',')} h`,
          ])
          esperado.esperado.forEach((bloques, d) => {
            expect(celdas(xDias + d * anchoDia, xDias + (d + 1) * anchoDia, ySiguiente + 1, centro + 2)).toEqual(bloques)
          })
        }
      }
    } finally {
      await pdfReabierto.destroy()
    }
    const orden = ['FULL', 'PART', 'AUX', 'EVENTUAL']
    expect(nombresVistos).toEqual([...nominal].sort((a, b) => orden.indexOf(a.tipo) - orden.indexOf(b.tipo)).map(n => n.nombre))
    expect(titulos.get(TITULO_CAJA)).toBeGreaterThan(1)
    expect(titulos.get(TITULO_PRESENCIA)).toBeGreaterThanOrEqual(1)
    expect(textos.join(' ')).not.toContain('Asignaciones en caja')
    expect(titulos.get('Cobertura por franja')).toBeGreaterThanOrEqual(1)
    expect(textos.find(t => t.startsWith('Cobertura por franja'))).toContain('3/2')
    expect(textos.join(' ')).toContain('10:00-10:30 11:00-11:30')
    for (let i = 0; i < cantidad; i++) expect(textos.join(' ')).toContain(`Fin del aviso ${ids(i)}.`)
    if (cantidad === 60) {
      expect(titulos.get('Validación y faltantes')).toBeGreaterThan(1)
      for (let i = 0; i < 45; i++) expect(textos.join(' ')).toContain(`Incidencia sintética ${ids(i)}.`)
    }
  })
})
