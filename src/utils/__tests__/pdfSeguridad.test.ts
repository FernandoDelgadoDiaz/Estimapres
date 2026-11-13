import { beforeEach, describe, expect, it, vi } from 'vitest'
import { extraerNecesidadDesdePDF } from '../pdfParser'
import { abrirPDFNode } from './fixtures/pdfTextoNode'

const { navegador, node } = vi.hoisted(() => ({
  navegador: vi.fn(),
  node: vi.fn(),
}))

vi.mock('pdfjs-dist', () => ({ getDocument: navegador }))
vi.mock('pdfjs-dist/legacy/build/pdf.js', () => ({
  default: { getDocument: node },
}))

describe('CVE-2024-4367: apertura de PDF con evaluación desactivada', () => {
  beforeEach(() => {
    navegador.mockReset()
    node.mockReset()
  })

  it('pasa isEvalSupported: false al abrir un POM en el navegador', async () => {
    navegador.mockReturnValue({ promise: Promise.resolve({ numPages: 0 }) })
    const data = new ArrayBuffer(4)
    const file = new File([data], 'pom.pdf', { type: 'application/pdf' })

    // El documento vacío no tiene tabla POM, pero recorre la apertura real.
    await expect(extraerNecesidadDesdePDF(file)).rejects.toThrow()
    expect(navegador).toHaveBeenCalledExactlyOnceWith({
      data,
      isEvalSupported: false,
    })
  })

  it('pasa la misma opción en el lector de Node usado por las pruebas de PDF', async () => {
    const data = new Uint8Array([1, 2, 3])
    node.mockReturnValue({ promise: Promise.resolve({ numPages: 1 }) })

    await expect(abrirPDFNode(data)).resolves.toEqual({ numPages: 1 })
    expect(node).toHaveBeenCalledExactlyOnceWith({ data, isEvalSupported: false })
  })
})
