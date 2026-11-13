// Extracción de texto con pdf.js en Node (build legacy, sin worker), igual que
// extraerTextoPDF del navegador: ítems unidos por espacio, páginas concatenadas.
import pdfjs from 'pdfjs-dist/legacy/build/pdf.js'

export function abrirPDFNode(data: Uint8Array) {
  return pdfjs.getDocument({ data, isEvalSupported: false }).promise
}

export async function textoPDFNode(data: Uint8Array): Promise<string> {
  const pdf = await abrirPDFNode(data)
  let t = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const c = await (await pdf.getPage(i)).getTextContent()
    t += ' ' + c.items.map(it => ('str' in it ? it.str : '')).join(' ')
  }
  return t
}
