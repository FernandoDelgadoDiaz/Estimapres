// PDF operativo: cuadro 1 «Horarios de caja» (FULL + PART + AUX + EVENTUAL, solo franjas
// de caja) y cuadro 2 «Horarios de presencia» (AUX + EVENTUAL, presencia registrada).
// Datos anonimizados de la semana 47. Con AH2_PDF_QA_DIR se guardan los PDFs para
// la revisión visual.
import { describe, expect, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  generarPDF, filasHorariosCaja, filasPresenciaApoyo,
  TITULO_CAJA, TITULO_PRESENCIA, SIN_CAJA, NO_DISPONIBLE, PRESENCIA_NO_REGISTRADA,
} from '../exportPDF'
import { abrirPDFNode } from './fixtures/pdfTextoNode'
import { fechasDeSemana } from '../pomContrato'
import { validarResultadoSemana, estadoValidacion } from '../validacionSemana'
import { aplicarEdicionConRecalculo } from '../../hooks/useAsignacion'
import type { Auxiliar, ResultadoAsignacion } from '../../types'
import { AUX_S47, CAJEROS_S47, EVENTUALES_S47, OPERATIVA_S47 } from '../../algoritmo/__tests__/fixtures/semana47Anonimizada'
import { NECESIDAD_S47, generar } from '../../algoritmo/__tests__/fixtures/aperturaHelpers'

const fechas = fechasDeSemana('2026-11-16')
const nombres = new Map<string, { nombre: string; tipo: string }>([
  ...CAJEROS_S47.map(c => [c.id, { nombre: c.nombre, tipo: c.tipo }] as const),
  ...AUX_S47.map(a => [a.id, { nombre: a.nombre, tipo: 'AUX' }] as const),
  ...EVENTUALES_S47.map(e => [e.id, { nombre: e.nombre, tipo: 'EVENTUAL' }] as const),
])
const presencia = Object.fromEntries([...AUX_S47, ...EVENTUALES_S47].map(p => [p.id, [...p.horarioSemanal]]))
const hora = (s: number) => `${String(8 + Math.floor(s / 2)).padStart(2, '0')}:${s % 2 ? '30' : '00'}`
/** Bloques esperados de una fila de 30 slots (fin exclusivo). */
const bloques = (f: boolean[]) => {
  const out: string[] = []
  let i = -1
  for (let s = 0; s <= 30; s++) {
    if (s < 30 && f[s]) { if (i < 0) i = s } else if (i >= 0) { out.push(`${hora(i)}-${hora(s)}`); i = -1 }
  }
  return out
}
const slotsCaja = (m: boolean[][]) => m.reduce((n, f) => n + f.filter(Boolean).length, 0)

function pdf(r: ResultadoAsignacion, extra: Parameters<typeof generarPDF>[5] = {}, aux: Auxiliar[] = AUX_S47) {
  const v = validarResultadoSemana(r, CAJEROS_S47, aux, EVENTUALES_S47, { necesidad: NECESIDAD_S47, excepciones: [], operativa: OPERATIVA_S47 })
  return generarPDF(r, CAJEROS_S47, 'Semana 47', aux, EVENTUALES_S47, {
    sucursal: '000', fechas, version: 4, validacion: v, estado: estadoValidacion(v),
    necesidadFranjas: NECESIDAD_S47.map(f => f.necesidad), presencia, ...extra,
  })
}

/** Texto por página + verificación geométrica: márgenes y sin superposiciones. */
async function inspeccionar(doc: ReturnType<typeof generarPDF>, nombreQA?: string) {
  const buffer = new Uint8Array(doc.output('arraybuffer'))
  if (process.env.AH2_PDF_QA_DIR && nombreQA) writeFileSync(join(process.env.AH2_PDF_QA_DIR, nombreQA), buffer)
  const abierto = await abrirPDFNode(buffer)
  const paginas: string[] = []
  const pt = (mm: number) => mm * 72 / 25.4
  try {
    for (let i = 1; i <= abierto.numPages; i++) {
      const pagina = await abierto.getPage(i)
      const [, , ancho, alto] = pagina.view
      const { items } = await pagina.getTextContent()
      const texto = items.flatMap(t => 'str' in t && t.str.trim() ? [{ str: t.str.trim(), x: t.transform[4], y: t.transform[5], w: t.width, h: t.height }] : [])
      for (const t of texto) {
        expect(t.x, `p${i} «${t.str}» margen izq.`).toBeGreaterThan(pt(11))
        expect(t.x + t.w, `p${i} «${t.str}» margen der.`).toBeLessThan(ancho - pt(11))
        expect(t.y).toBeGreaterThan(pt(6))
        expect(t.y).toBeLessThan(alto - pt(10))
      }
      for (const [k, a] of texto.entries()) for (const b of texto.slice(k + 1)) {
        if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) <= 2) continue
        const comun = Math.min(a.y + 1.08 * a.h, b.y + 1.08 * b.h) - Math.max(a.y - 0.26 * a.h, b.y - 0.26 * b.h)
        expect(comun, `p${i}: «${a.str}» / «${b.str}»`).toBeLessThanOrEqual(0.7)
      }
      paginas.push(texto.map(t => t.str).join(' '))
      expect(paginas[i - 1]).toContain(`Página ${i} de ${abierto.numPages}`)
    }
  } finally {
    await abierto.destroy()
  }
  return paginas
}

describe('PDF operativo — cuadro de caja', () => {
  const r = generar(OPERATIVA_S47)
  const filas = filasHorariosCaja(r, nombres)

  it('FULL, PART, AUX y EVENTUAL juntos en un solo cuadro, en ese orden', () => {
    expect(filas.map(f => f.tipo)).toEqual([...Array(4).fill('FULL'), ...Array(5).fill('PART'), ...Array(3).fill('AUX'), ...Array(3).fill('EVENTUAL')])
    expect(filas.map(f => f.colaboradorId)).toEqual([...CAJEROS_S47.map(c => c.id), ...AUX_S47.map(a => a.id), ...EVENTUALES_S47.map(e => e.id)])
  })

  it('AUX: exactamente sus franjas de cajaAux; horas = franjas, no presencia', () => {
    for (const a of r.cajaAux!) {
      const fila = filas.find(f => f.colaboradorId === a.colaboradorId)!
      a.slotsCajaPorDia.forEach((f, d) => {
        const esperado = bloques(f)
        const franco = !AUX_S47.find(x => x.id === a.colaboradorId)!.horarioSemanal[d]
        expect(fila.celdas[d], `${a.colaboradorId} d${d}`).toBe(esperado.length ? esperado.join('\n') : franco ? 'FRANCO' : SIN_CAJA)
      })
      expect(fila.horas).toBe(slotsCaja(a.slotsCajaPorDia) / 2)
      expect(fila.horas).toBeLessThan(20) // nunca la presencia semanal (≈ 48 h)
    }
  })

  it('EVENTUAL: exactamente sus franjas de cajaEventual; nunca su disponibilidad', () => {
    for (const e of r.cajaEventual!) {
      const fila = filas.find(f => f.colaboradorId === e.colaboradorId)!
      e.slotsCajaPorDia.forEach((f, d) => expect(fila.celdas[d]).toBe(bloques(f).join('\n') || SIN_CAJA))
      expect(fila.horas).toBe(slotsCaja(e.slotsCajaPorDia) / 2)
      expect(fila.celdas).not.toContain('06:00-14:00')
    }
  })

  it('FULL/PART: sus jornadas efectivas y horas = suma de franjas', () => {
    for (const c of CAJEROS_S47) {
      const fila = filas.find(f => f.colaboradorId === c.id)!
      expect(fila.horas).toBe(r.horarios.find(h => h.colaboradorId === c.id)!.totalHoras)
      expect(fila.celdas.filter(x => x === 'FRANCO')).toHaveLength(1)
    }
  })
})

describe('PDF operativo — cuadro de presencia', () => {
  const r = generar(OPERATIVA_S47)

  it('AUX con su jornada completa de presencia (turnos partidos y francos) y EVENTUAL con su disponibilidad registrada', () => {
    const filas = filasPresenciaApoyo(r, nombres, presencia)
    expect(filas.map(f => f.tipo)).toEqual(['AUX', 'AUX', 'AUX', 'EVENTUAL', 'EVENTUAL', 'EVENTUAL'])
    const auxA = filas.find(f => f.colaboradorId === 'aux-A')!
    expect(auxA.celdas[0]).toBe('08:00-14:00\n20:00-23:00')
    expect(auxA.celdas[6]).toBe('FRANCO')
    expect(auxA.horas).toBe(49)
    const evM = filas.find(f => f.colaboradorId === 'ev-M')!
    expect(evM.celdas).toEqual(['06:00-14:00', '06:00-14:00', '06:00-14:00', '06:00-14:00', '06:00-14:00', NO_DISPONIBLE, '06:00-14:00'])
    expect(evM.horas).toBe(48)
    // La presencia no se confunde con la caja: horas distintas en cada cuadro.
    expect(filasHorariosCaja(r, nombres).find(f => f.colaboradorId === 'ev-M')!.horas).not.toBe(48)
  })

  it('semana histórica sin disponibilidad registrada: «Presencia no registrada», nunca reconstruida desde la caja', () => {
    const filas = filasPresenciaApoyo(r, nombres, undefined)
    for (const f of filas.filter(x => x.tipo === 'EVENTUAL')) {
      expect(f.registrada).toBe(false)
      expect(f.celdas).toEqual(Array(7).fill(PRESENCIA_NO_REGISTRADA))
    }
    // Los AUX sí: su presencia es su fila de horarios guardada.
    expect(filas.filter(x => x.tipo === 'AUX').every(f => f.registrada)).toBe(true)
  })
})

describe('PDF operativo — documento', () => {
  it('dos cuadros diferenciados, sin la tabla redundante, compacto y sin superposiciones', async () => {
    const paginas = await inspeccionar(pdf(generar(OPERATIVA_S47)), 'pdf-s47-validado.pdf')
    const todo = paginas.join(' ')
    expect(paginas[0].startsWith(TITULO_CAJA)).toBe(true)
    expect(todo).toContain(TITULO_PRESENCIA)
    expect(todo).not.toContain('Asignaciones en caja')
    expect(todo).not.toContain('Horarios Semanales')
    expect(todo).toContain('Horas caja')
    expect(todo).toContain('Horas presencia')
    for (const p of paginas) expect(p).toContain('Sucursal 000 · Semana 16/11/2026 al 22/11/2026 · Versión 4')
    expect(paginas.every(p => p.includes('Estado: VALIDADO'))).toBe(true)
    expect(paginas.length).toBeLessThanOrEqual(4) // antes: 6 páginas
    // La caja del cuadro 1 aparece antes que la presencia del cuadro 2.
    expect(todo.indexOf(TITULO_CAJA)).toBeLessThan(todo.indexOf(TITULO_PRESENCIA))
  })

  it('soporta muchos bloques de 30 minutos (caja alternada todo el día) sin cortar filas ni superponer', async () => {
    const r = generar(OPERATIVA_S47)
    const alternado = { ...r, cajaAux: r.cajaAux!.map((a, i) => i ? a : { ...a, slotsCajaPorDia: a.slotsCajaPorDia.map(() => Array.from({ length: 30 }, (_, s) => s % 2 === 0)) }) }
    const paginas = await inspeccionar(pdf(alternado), 'pdf-s47-muchos-bloques.pdf')
    const todo = paginas.join(' ')
    for (let s = 0; s < 30; s += 2) expect(todo).toContain(`${hora(s)}-${hora(s + 1)}`)
    expect(filasHorariosCaja(alternado, nombres).find(f => f.colaboradorId === alternado.cajaAux![0].colaboradorId)!.horas).toBe(52.5)
  })

  it('la edición manual se refleja en ambos cuadros', async () => {
    const r0 = generar(OPERATIVA_S47)
    const ctx = {
      necesidadFranjas: NECESIDAD_S47.map(f => f.necesidad), operativa: OPERATIVA_S47,
      nombrePorId: Object.fromEntries([...nombres].map(([id, n]) => [id, n.nombre])), disponibilidad: presencia,
    }
    // Presencia de un AUX: el martes aux-C solo de 08:00 a 11:00.
    const r1 = aplicarEdicionConRecalculo(r0, 'aux-C', 1, { esFranco: false, turnos: [{ inicio: '08:00', fin: '11:00' }] }, 'Aux C', ctx)
    // Caja de un eventual fijada a mano: viernes ev-T1 de 15:00 a 16:00.
    const r2 = aplicarEdicionConRecalculo(r1, 'ev-T1', 4, { esFranco: false, turnos: [{ inicio: '15:00', fin: '16:00' }] }, 'Eventual T1', ctx)
    expect(filasPresenciaApoyo(r2, nombres, presencia).find(f => f.colaboradorId === 'aux-C')!.celdas[1]).toBe('08:00-11:00')
    const cajaC = filasHorariosCaja(r2, nombres).find(f => f.colaboradorId === 'aux-C')!.celdas[1]
    for (const b of cajaC.split('\n').filter(x => x.includes('-'))) expect(b <= '11:00').toBe(true) // nada fuera de su presencia
    expect(filasHorariosCaja(r2, nombres).find(f => f.colaboradorId === 'ev-T1')!.celdas[4]).toBe('15:00-16:00')
    // La presencia registrada del eventual no cambia por editar su caja.
    expect(filasPresenciaApoyo(r2, nombres, presencia).find(f => f.colaboradorId === 'ev-T1')!.celdas[4]).toBe('14:00-23:00')
    const todo = (await inspeccionar(pdf(r2), 'pdf-s47-editado.pdf')).join(' ')
    expect(todo).toContain('08:00-11:00')
    expect(todo).toContain('15:00-16:00')
  })

  it('histórico sin disponibilidad: lo informa sin inventar y conserva «SIN VERIFICAR»', async () => {
    const r = generar(OPERATIVA_S47)
    const v = validarResultadoSemana(r, CAJEROS_S47, AUX_S47, EVENTUALES_S47, {
      necesidad: NECESIDAD_S47, excepciones: [], operativa: OPERATIVA_S47, omitirDisponibilidadEventual: true,
      limitaciones: ['La semana no registró la disponibilidad resuelta de AUX y eventuales.'],
    })
    const doc = generarPDF(r, CAJEROS_S47, 'Semana 47', AUX_S47, EVENTUALES_S47, {
      sucursal: '000', fechas, version: 2, validacion: v, estado: estadoValidacion(v), presencia: undefined,
    })
    const paginas = await inspeccionar(doc, 'pdf-s47-historico.pdf')
    const todo = paginas.join(' ')
    expect(paginas.every(p => p.includes('Estado: SIN VERIFICAR'))).toBe(true)
    expect(todo).toContain(PRESENCIA_NO_REGISTRADA)
    expect(todo).not.toContain('06:00-14:00') // la disponibilidad actual del eventual no se usa
  })

  it('conserva el estado BORRADOR', async () => {
    const r = generar(OPERATIVA_S47)
    const malo = { ...r, cajaEventual: r.cajaEventual!.map(e => e.colaboradorId === 'ev-M' ? { ...e, slotsCajaPorDia: e.slotsCajaPorDia.map((f, d) => f.map((x, s) => x || (d !== 5 && s < 2))) } : e) }
    const paginas = await inspeccionar(pdf(malo), 'pdf-s47-borrador.pdf')
    expect(paginas.every(p => p.includes('Estado: BORRADOR'))).toBe(true)
    expect(paginas.join(' ')).toContain('OP_APERTURA_COMPOSICION')
  })
})
