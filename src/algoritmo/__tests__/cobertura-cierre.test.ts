import { writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { ExcepcionSemanal, HorarioColaborador } from '../../types'
import { compararImpactoHoras } from '../orquestador'
import { convertirInputAV2 } from '../adapter'
import { generarConMultiArranque } from '../../utils/generacionMultiArranque'
import { validarResultadoSemana } from '../../utils/validacionSemana'
import { generarPDF } from '../../utils/exportPDF'
import { AUX_S47, CAJEROS_S47, EVENTUALES_S47, OPERATIVA_S47 } from './fixtures/semana47Anonimizada'
import { NECESIDAD_S47 } from './fixtures/aperturaHelpers'

function entrada(hora = '22:00', finPrevio = '20:00') {
  const operativa = { ...OPERATIVA_S47, maxBloquesCajaEventualDia: 2, eventualesCajaHoraLimite: hora || undefined }
  const horasPrevias = 5 + (finPrevio === '22:30' ? 2.5 : 0)
  const semanaAnterior: HorarioColaborador[] = CAJEROS_S47.map(c => ({
    colaboradorId: c.id, rolGeneral: 'cajero', totalHoras: horasPrevias, errores: [],
    jornadas: [{ dia: 6, turnos: [{ inicio: '15:00', fin: finPrevio }], horas: horasPrevias, esFranco: false, rol: 'cajero' }],
  }))
  const necesidad = NECESIDAD_S47
  const cajeros = CAJEROS_S47
  const auxiliares = AUX_S47
  const eventuales = EVENTUALES_S47
  const excepciones: ExcepcionSemanal[] = []
  return {
    input: convertirInputAV2(necesidad, cajeros, auxiliares, eventuales, excepciones, operativa),
    cajeros, auxiliares, eventuales, contexto: { necesidad, excepciones, operativa, semanaAnterior },
  }
}

describe('Anticipación de cierre con demanda sintética de 406 h-caja', () => {
  it('recupera cobertura manteniendo cada franja, los contratos, el descanso y el PDF', () => {
    const e = entrada()
    const a = generarConMultiArranque({ ...e, omitirAnticipacionCierre: true })
    const b = generarConMultiArranque(e)
    const repetida = generarConMultiArranque(e)
    expect(repetida.resultado).toEqual(b.resultado)
    expect(b.seleccion.estrategia).toBe('anticipar-cierre')
    const antes = a.resultadoV2.metricas
    const despues = b.resultadoV2.metricas
    const impacto = compararImpactoHoras(e.input.demanda, despues, antes)
    expect(impacto.franjasPeores).toEqual([])
    expect(impacto.faltantesSinPrioridadHoras).toBe(8)
    expect(impacto.faltantesConPrioridadHoras).toBe(7.5)
    expect(impacto.sobrantesConPrioridadHoras).toBe(impacto.sobrantesSinPrioridadHoras)
    expect(antes.deficit_por_slot.map(f => f[28])).toEqual([0, 1, 0, 0, 1, 2, 1])
    expect(despues.deficit_por_slot.map(f => f[28])).toEqual([0, 1, 0, 0, 0, 2, 1])

    for (const { resultado } of [a, b]) {
      for (const c of e.cajeros) {
        expect(resultado.horarios.find(h => h.colaboradorId === c.id)?.totalHoras).toBe(c.horasSemanales)
      }
      for (const ev of resultado.cajaEventual ?? []) {
        for (const fila of ev.slotsCajaPorDia) {
          expect(fila.filter((x, s) => x && !fila[s - 1]).length).toBeLessThanOrEqual(2)
          expect(fila.slice(28)).not.toContain(true)
        }
      }
      for (const aux of resultado.cajaAux ?? []) {
        for (const fila of aux.slotsCajaPorDia) expect(fila.slice(28)).not.toContain(true)
      }
      const validacion = validarResultadoSemana(resultado, e.cajeros, e.auxiliares, e.eventuales, e.contexto)
      expect(validacion.violaciones).toEqual([])
      expect(validacion.publicable).toBe(true)
      expect(validacion.metricas?.cobertura).toEqual(resultado.coberturaFranjas)
      expect(generarPDF(resultado, e.cajeros, 'Prueba sintética', e.auxiliares, e.eventuales, { validacion }).output()).toContain('VALIDADO')
    }
    if (process.env.AH2_CIERRE_RESULTADOS) {
      const tiemposMs = Array.from({ length: 5 }, (_, i) => {
        const resultados = [i % 2 === 0, i % 2 !== 0].map(omitir => ({
          omitir,
          ...generarConMultiArranque({ ...e, omitirAnticipacionCierre: omitir }).seleccion,
        }))
        return {
          A: resultados.find(r => r.omitir)!.tiempoMs,
          B: resultados.find(r => !r.omitir)!.tiempoMs,
          refinamiento: resultados.find(r => !r.omitir)!.candidatos.find(c => c.estrategia === 'anticipar-cierre')!.ms,
        }
      })
      writeFileSync(process.env.AH2_CIERRE_RESULTADOS, JSON.stringify({
        tiemposMs,
        antes, despues, demanda: e.input.demanda,
      }, null, 2))
    }
  }, 20_000)

  it('conserva el resultado anterior sin corte y con corte posterior a la última demanda', () => {
    for (const hora of ['', '22:30']) {
      const e = entrada(hora)
      const a = generarConMultiArranque({ ...e, omitirAnticipacionCierre: true })
      const b = generarConMultiArranque(e)
      expect(b.resultado).toEqual(a.resultado)
    }
  }, 20_000)

  it('no acepta una reparación que deja infracciones de descanso del domingo al lunes', () => {
    const e = entrada('22:00', '22:30')
    const b = generarConMultiArranque(e)
    expect(b.seleccion.estrategia).not.toBe('anticipar-cierre')
    const v = validarResultadoSemana(b.resultado, e.cajeros, e.auxiliares, e.eventuales, e.contexto)
    expect(v.violaciones).toEqual(expect.arrayContaining([expect.objectContaining({ codigo: 'NORM_DESCANSO', dia: 0 })]))
  }, 20_000)
})
