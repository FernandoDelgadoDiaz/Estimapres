/**
 * AH2-066 · Con topes de francos por día ajustados, el franco fijo de un cajero se reserva antes de repartir:
 * ningún otro puede tomar el único lugar de ese día. Entrada sintética (dotación grande del laboratorio AH2-040).
 */
import { describe, expect, it } from 'vitest'
import casos from './fixtures/ah2040SemanalCasosEstados.json'
import { ejecutarPasada1 } from '../pasada1-fullpart'
import type { InputAlgoritmo } from '../types'

const base = (casos as unknown as Array<{ nombre: string; data: { input: InputAlgoritmo } }>).find(c => c.nombre.startsWith('S11'))!.data.input

describe('AH2-066 · francos fijos con tope por día', () => {
  for (let d = 0; d < 7; d++) {
    it(`franco fijo del último cajero en el día ${d} con tope 1 ese día`, () => {
      const cajeros = base.colaboradores.filter(c => c.rol === 'FULL' || c.rol === 'PART')
      const ultimo = cajeros[cajeros.length - 1]
      const tope = Array(7).fill(2)
      tope[d] = 1
      const input: InputAlgoritmo = { ...structuredClone(base), max_francos_por_dia: tope,
        excepciones: [{ id: 'fijo', colaboradorNombre: ultimo.nombre, tipo: 'franco_dia', valor: String(d), descripcion: 'franco fijo' }] }
      const r = ejecutarPasada1(input)
      const semanas = { ...r.jornadas_full, ...r.jornadas_part }
      for (const c of cajeros) expect(semanas[c.id]?.length, c.id).toBe(7)
      expect(semanas[ultimo.id].find(j => j.dia === d)?.bloques.length).toBe(0)
      for (let k = 0; k < 7; k++) expect(cajeros.filter(c => semanas[c.id].find(j => j.dia === k)?.bloques.length === 0).length).toBeLessThanOrEqual(tope[k])
    })
  }
})
