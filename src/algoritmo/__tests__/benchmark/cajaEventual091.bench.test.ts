import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { HORAS_FRANJAS } from '../../../types'
import { convertirInputAV2, type OpcionesGeneracion } from '../../adapter'
import { generarConMultiArranque, type EntradaMultiArranque } from '../../../utils/generacionMultiArranque'
import { validarResultadoSemana } from '../../../utils/validacionSemana'

type Snapshot = Pick<EntradaMultiArranque, 'cajeros' | 'auxiliares' | 'eventuales' | 'contexto'> & {
  sucursal: '091'
  version: 8
  fechaLunes: '2026-11-16'
  opciones: OpcionesGeneracion
}

const origen = process.env.AH2_091_SNAPSHOT
const destino = process.env.AH2_091_RESULTADOS

it.skipIf(!origen || !destino)('benchmark privado 091 v8 con el motor completo', () => {
  const bytes = readFileSync(origen!)
  const snapshot = JSON.parse(bytes.toString('utf8')) as Snapshot
  const { sucursal, version, fechaLunes, cajeros, auxiliares, eventuales, contexto, opciones } = snapshot
  expect({ sucursal, version, fechaLunes }).toEqual({ sucursal: '091', version: 8, fechaLunes: '2026-11-16' })
  const { necesidad, excepciones, operativa } = contexto
  expect(necesidad.map(f => f.hora)).toEqual(HORAS_FRANJAS)
  expect(necesidad.every(f => f.necesidad.length === 7 && f.necesidad.every(x => Number.isInteger(x) && x >= 0))).toBe(true)
  expect(operativa).toBeDefined()
  expect(opciones).toBeDefined()
  expect(cajeros.length).toBeGreaterThan(0)
  expect(auxiliares.length).toBeGreaterThan(0)
  expect(eventuales.length).toBeGreaterThan(0)
  const demandaTotal = necesidad.flatMap(f => f.necesidad).reduce((a, b) => a + b, 0) / 2
  expect(demandaTotal).toBe(406)

  const picos = Array.from({ length: 7 }, (_, d) => Math.max(...necesidad.map(f => f.necesidad[d])))
  const variantes = [
    { variante: 'A' },
    { variante: 'B', maxBloquesCajaEventualDia: 2 },
    { variante: 'C', eventualesCajaHoraLimite: '22:00' },
    { variante: 'D', maxBloquesCajaEventualDia: 2, eventualesCajaHoraLimite: '22:00' },
  ] as const
  const filas = variantes.map(({ variante, ...reglas }) => {
    const op = { maxBloquesCajaEventualDia: undefined, eventualesCajaHoraLimite: undefined, ...reglas }
    const ctx = {
      ...contexto,
      operativa: { ...operativa, ...op },
      limitaciones: [
        ...(contexto.limitaciones ?? []),
        ...(!contexto.semanaAnterior?.length ? ['Falta el horario anterior para validar domingo–lunes.'] : []),
      ],
    }
    const input = convertirInputAV2(necesidad, cajeros, auxiliares, eventuales, excepciones, { ...opciones, ...operativa, ...op })
    const inicio = performance.now()
    const { resultado, seleccion } = generarConMultiArranque({ input, cajeros, auxiliares, eventuales, contexto: ctx })
    const generacionMs = performance.now() - inicio
    const v = validarResultadoSemana(resultado, cajeros, auxiliares, eventuales, ctx)
    const metricas = v.metricas!
    const franjas = necesidad.flatMap((f, s) => f.necesidad.map((demanda, dia) => ({
      dia, hora: f.hora, demanda, pico: demanda > 0 && demanda === picos[dia],
      faltantesHorasCaja: metricas.faltantes[s][dia] / 2,
    })))
    const demandaPico = franjas.filter(f => f.pico).reduce((n, f) => n + f.demanda / 2, 0)
    const faltantesPico = franjas.filter(f => f.pico).reduce((n, f) => n + f.faltantesHorasCaja, 0)
    return {
      variante,
      coberturaPct: (1 - metricas.horasCajaFaltantes / demandaTotal) * 100,
      faltantesHorasCaja: metricas.horasCajaFaltantes,
      sobrantesHorasCaja: metricas.horasCajaSobrantes,
      coberturaPicosPct: (1 - faltantesPico / demandaPico) * 100,
      faltantesPorDiaYFranja: franjas.filter(f => f.faltantesHorasCaja > 0),
      eventuales: (resultado.cajaEventual ?? []).map((a, i) => ({
        eventual: i + 1,
        bloquesPorDia: a.slotsCajaPorDia.map(f => f.filter((enCaja, s) => enCaja && !f[s - 1]).length),
        slotsCajaDesde22PorDia: a.slotsCajaPorDia.map(f => f.slice(28).filter(Boolean).length),
      })),
      cumplimientoHoras: resultado.cumplimientoHoras?.map((h, i) => ({
        persona: i + 1, tipo: h.tipo, objetivoHoras: h.objetivoHoras,
        maximoHoras: h.maximoHoras, asignadasHoras: h.asignadasHoras, diferenciaHoras: h.diferenciaHoras,
      })),
      infracciones: v.violaciones.map(({ codigo, nivel, dia, franja }) => ({ codigo, nivel, dia, franja })),
      limitaciones: v.limitaciones,
      validado: v.publicable,
      generacionMs,
      estrategia: seleccion.estrategia,
      omitidas: seleccion.omitidas,
    }
  })
  const referencia = filas[0]
  const coincideConReferencia = referencia.coberturaPct.toFixed(2) === '97.54' &&
    referencia.faltantesHorasCaja === 10 && referencia.sobrantesHorasCaja === 0
  writeFileSync(destino!, JSON.stringify({
    sucursal, version, fechaLunes, sha256Entrada: createHash('sha256').update(bytes).digest('hex'),
    demandaTotal, picos: 'máxima demanda de cada día', coincideConReferencia, variantes: filas,
  }, null, 2), { mode: 0o600 })
  expect(coincideConReferencia, 'A no reproduce los totales informados para la v8').toBe(true)
}, 180_000)
