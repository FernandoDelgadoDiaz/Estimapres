// POM-01 (#8): validación LOCAL contra un PDF POM real, sin subirlo al repositorio.
// Se omite salvo que se defina POM_PDF:
//   POM_PDF=/ruta/Programacion\ semanal\ 2026-11-16\ -\ 2026-11-22.pdf npx vitest run pom-real.local
// Solo imprime datos numéricos (semana, totales, máximos, avisos): ningún nombre.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { textoPDFNode } from './fixtures/pdfTextoNode'
import { interpretarTextoPOM } from '../pdfParser'

const ruta = process.env.POM_PDF

describe.skipIf(!ruta)('POM-01: PDF real (local, opcional)', () => {
  it('cumple el contrato y reporta el resumen numérico', async () => {
    const texto = await textoPDFNode(new Uint8Array(readFileSync(ruta!)))
    const r = interpretarTextoPOM(texto, ruta!.split('/').pop())
    const porDia = [0, 1, 2, 3, 4, 5, 6].map(d => r.franjas.reduce((s, f) => s + f.necesidad[d], 0) / 2)
    const max = Math.max(...r.franjas.flatMap(f => f.necesidad))
    const picos = r.franjas.flatMap(f => f.necesidad.map((v, d) => (v === max ? `${'LMXJVSD'[d]} ${f.hora}` : null))).filter(Boolean)
    console.log(JSON.stringify({ semana: r.semana, horasCaja: r.horasCaja, horasCajaPorDia: porDia, max, picos, avisos: r.avisos }, null, 2))
    expect(r.franjas).toHaveLength(31)
  })
})
