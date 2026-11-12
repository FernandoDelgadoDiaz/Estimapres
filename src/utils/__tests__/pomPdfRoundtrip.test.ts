// POM-01 (#8): ida y vuelta con pdf.js real (no solo texto): PDF sintético generado
// con jsPDF → extracción con pdf.js (build legacy para Node) → contrato POM.
import { describe, expect, it } from 'vitest'
import { jsPDF } from 'jspdf'
import { textoPDFNode } from './fixtures/pdfTextoNode'
import { interpretarTextoPOM } from '../pdfParser'
import { MATRIZ_POM_SINTETICA } from './fixtures/pomSintetico'

describe('POM-01: PDF → pdf.js → contrato', () => {
  it('recupera semana y matriz de un PDF de 3 páginas con «Diferencia» y «Estimado»', async () => {
    const doc = new jsPDF()
    doc.setFontSize(9)
    doc.text('Programacion semanal 2026-11-16 - 2026-11-22', 10, 10)
    doc.text('Programacion de personal (sin datos)', 10, 20)
    doc.addPage(); doc.text('Pagina 2', 10, 10)
    doc.addPage()
    doc.text('Diferencia de cajas necesarias', 10, 10)
    doc.text('Horario Lun Mar Mie Jue Vie Sab Dom', 10, 15)
    MATRIZ_POM_SINTETICA.forEach(([h, v], i) => doc.text(`${h}:00 ${v.map(x => x - 2).join(' ')}`, 10, 20 + i * 4))
    doc.addPage()
    doc.text('Estimado de cajas necesarias', 10, 10)
    doc.text('Horario Lun Mar Mie Jue Vie Sab Dom', 10, 15)
    MATRIZ_POM_SINTETICA.forEach(([h, v], i) => doc.text(`${h}:00 ${v.join(' ')}`, 10, 20 + i * 4))

    const r = interpretarTextoPOM(await textoPDFNode(new Uint8Array(doc.output('arraybuffer'))), 'x.pdf')
    expect(r.semana).toEqual({ ok: true, semana: { lunes: '2026-11-16', domingo: '2026-11-22', fuente: 'texto' } })
    expect(r.franjas.map(f => [f.hora, f.necesidad])).toEqual(MATRIZ_POM_SINTETICA)
    expect(r.horasCaja).toBe(406)
  })
})
