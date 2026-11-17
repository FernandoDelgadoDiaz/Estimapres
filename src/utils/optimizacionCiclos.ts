import { asignarIdentidadesV2 } from '../algoritmo/adapter'
import type { Bloque, Jornada, SesgoTurno } from '../algoritmo/types'
import { cicloDe, validarCalendario, type CicloPlanificacion } from '../planificacion/ciclos'
import { esLunes, sumarDias, type Fecha } from '../planificacion/fechas'
import { historialEfectivo, type ConsultaHistorial, type DiaEfectivo } from '../planificacion/historial'
import { generarConMultiArranque, type EntradaMultiArranque } from './generacionMultiArranque'
import { validarResultadoSemana } from './validacionSemana'

const clases = ['manana', 'tarde', 'cierre', 'franco'] as const
type Clase = typeof clases[number]
type Conteo = Record<Clase | 'finSemana', number>
const minutos = (hora: string) => { const [h, m] = hora.split(':').map(Number); return h * 60 + m }
const slots = (bloques: Bloque[]) => bloques.flatMap(b => Array.from(
  { length: b.slot_fin - b.slot_inicio }, (_, i) => b.slot_inicio + i,
))
const clase = (bloques: Bloque[]): Clase => {
  if (!bloques.length) return 'franco'
  if (bloques[bloques.length - 1].slot_fin >= 28) return 'cierre'
  return bloques.length === 1 && bloques[0].slot_inicio <= 6 ? 'manana' : 'tarde'
}
const conteoVacio = (): Conteo => ({ manana: 0, tarde: 0, cierre: 0, franco: 0, finSemana: 0 })

export interface ContextoCiclos {
  lunes: Fecha
  sucursalId: string
  calendario: readonly CicloPlanificacion[]
  historial: Omit<ConsultaHistorial, 'sucursalId' | 'legadoPresunto'>
}

export function prepararCiclo(ctx: ContextoCiclos) {
  if (!esLunes(ctx.lunes) || ctx.calendario.some(c => c.sucursalId !== ctx.sucursalId)) throw Error('Ciclo o sucursal inválidos')
  const c = validarCalendario(ctx.calendario)
  if (!c.ok) throw Error('Calendario de ciclos inválido')
  const ciclo = cicloDe(c.valor, ctx.lunes)
  if (!ciclo) throw Error('La semana no pertenece a un ciclo explícito')
  const h = historialEfectivo({ ...ctx.historial, sucursalId: ctx.sucursalId })
  if (!h.ok) throw Error('Historial efectivo inválido')
  const historia = h.valor.filter(d => d.fuente === 'oficial' && d.fecha < ctx.lunes)
  const referencia = ctx.lunes === ciclo.inicio ? cicloDe(c.valor, sumarDias(ciclo.inicio, -1)) : ciclo
  return {
    rotacion: ctx.lunes === ciclo.inicio,
    cicloId: ciclo.id,
    historia: referencia ? historia.filter(d => ctx.lunes === ciclo.inicio
      ? cicloDe(c.valor, d.fecha) !== null && d.fecha < ciclo.inicio
      : d.fecha >= referencia.inicio && d.fecha <= referencia.fin) : [],
  }
}

function observaciones(dias: DiaEfectivo[], lunes: Fecha, rotacion: boolean) {
  const patrones = new Map<string, Bloque[]>()
  const conteos = new Map<string, Conteo>()
  for (const d of dias) {
    const dia = new Date(d.fecha + 'T12:00:00Z').getUTCDay()
    const indice = (dia + 6) % 7
    for (const { colaboradorId: id, jornada } of d.jornadas) {
      const bloques = jornada.turnos.map(t => ({ slot_inicio: (minutos(t.inicio) - 480) / 30, slot_fin: (minutos(t.fin) - 480) / 30 }))
      const c = conteos.get(id) ?? conteoVacio()
      c[clase(bloques)]++
      if (indice >= 5 && bloques.length) c.finSemana++
      conteos.set(id, c)
      if (rotacion || d.fecha >= sumarDias(lunes, -7)) patrones.set(`${id}|${indice}`, bloques)
    }
  }
  return { patrones, conteos }
}

export function medirCiclo(jornadas: Record<string, Jornada[]>, historia: DiaEfectivo[], lunes: Fecha, rotacion: boolean) {
  const { patrones, conteos } = observaciones(historia, lunes, rotacion)
  let mediasHorasCambiadas = 0
  let cambiosClase = 0
  let cambiosFranco = 0
  let repeticion = 0
  for (const [id, semana] of Object.entries(jornadas)) {
    for (const j of semana) {
      const previa = patrones.get(`${id}|${j.dia}`)
      const actual = clase(j.bloques)
      if (previa) {
        const a = slots(previa), b = slots(j.bloques)
        mediasHorasCambiadas += a.filter(s => !b.includes(s)).length + b.filter(s => !a.includes(s)).length
        cambiosClase += Number(clase(previa) !== actual)
        cambiosFranco += Number((clase(previa) === 'franco') !== (actual === 'franco'))
      }
      const c = conteos.get(id)
      if (c) repeticion += c[actual] + (j.dia >= 5 && j.bloques.length ? c.finSemana : 0)
    }
  }
  return { mediasHorasCambiadas, cambiosClase, cambiosFranco, repeticion }
}

export function generarConCiclo(e: EntradaMultiArranque, ctx: ContextoCiclos) {
  const ciclo = prepararCiclo(ctx)
  const referencia = generarConMultiArranque(e)
  const { patrones, conteos } = observaciones(ciclo.historia, ctx.lunes, ciclo.rotacion)
  const cajeros = e.cajeros.filter(c => c.tipo === 'FULL' || c.tipo === 'PART')
  const ids = asignarIdentidadesV2([...cajeros, ...e.auxiliares.filter(a => a.activo), ...e.eventuales.filter(v => v.activo)]).v2PorUi
  const preferencias = Object.fromEntries(cajeros.map(({ id }) => {
    const porDia: NonNullable<SesgoTurno['porDia']> = {}
    for (let dia = 0; dia < 7; dia++) {
      const previa = patrones.get(`${id}|${dia}`)
      const c = conteos.get(id)
      if (!ciclo.rotacion && previa) porDia[dia] = { [clase(previa)]: 8, patron: previa }
      else if (ciclo.rotacion && c) {
        const maximo = Math.max(1, ...clases.map(k => c[k]))
        porDia[dia] = { ...Object.fromEntries(clases.map(k => [k, -(12 * c[k]) / maximo])),
          trabajo: dia >= 5 ? -(12 * c.finSemana) / Math.max(maximo, c.finSemana) : 0 }
      }
    }
    const motorId = ids.get(id)!
    return [motorId, { ...e.input.preferencias_turno?.[motorId], porDia }]
  }))
  const medir = (r: typeof referencia) => medirCiclo(Object.fromEntries(r.resultado.horarios
    .filter(h => h.rolGeneral === 'cajero')
    .map(h => [h.colaboradorId, h.jornadas.map(j => ({
      colab_id: h.colaboradorId, dia: j.dia as Jornada['dia'],
      bloques: j.turnos.map(t => ({ slot_inicio: (minutos(t.inicio) - 480) / 30, slot_fin: (minutos(t.fin) - 480) / 30 })),
    }))])), ciclo.historia, ctx.lunes, ciclo.rotacion)
  const antes = medir(referencia)
  const referenciaElegible = referenciaValidada(e, referencia)
  if (!patrones.size) return { ...referencia, elegibleHibrido: referenciaElegible, ciclo: { id: ciclo.cicloId, aplicada: false, antes, despues: antes } }
  const alternativa = generarConMultiArranque({ ...e, input: { ...e.input, preferencias_turno: preferencias } })
  const a = referencia.resultadoV2.metricas, b = alternativa.resultadoV2.metricas
  const total = (m: number[][]) => m.flat().reduce((x, y) => x + y, 0)
  const valido = referenciaValidada(e, alternativa)
  const protegida = b.deficit_por_slot.every((fila, d) => fila.every((n, s) => n <= a.deficit_por_slot[d][s])) &&
    total(b.exceso_por_slot) <= total(a.exceso_por_slot)
  const despues = medir(alternativa)
  const mejorCiclo = ciclo.rotacion ? despues.repeticion < antes.repeticion
    : despues.mediasHorasCambiadas < antes.mediasHorasCambiadas
  // Una referencia inválida no fija cotas de calidad para un horario válido.
  const aplicada = valido && (!referenciaElegible || (protegida &&
    (total(b.deficit_por_slot) < total(a.deficit_por_slot) ||
    total(b.exceso_por_slot) < total(a.exceso_por_slot) || mejorCiclo)))
  return { ...(aplicada ? alternativa : referencia), elegibleHibrido: aplicada || referenciaElegible, ciclo: { id: ciclo.cicloId, aplicada, antes, despues: aplicada ? despues : antes } }
}

/** Un borrador puede seguir visible en A, pero jamás pasa como respaldo válido a B. */
export function referenciaValidada(e: EntradaMultiArranque, r: ReturnType<typeof generarConMultiArranque>): boolean {
  if (!validarResultadoSemana(r.resultado, e.cajeros, e.auxiliares, e.eventuales, e.contexto).publicable) return false
  const horas = new Map(r.resultado.horarios.map(h => [h.colaboradorId, h.totalHoras]))
  return e.cajeros.filter(c => c.tipo === 'FULL' || c.tipo === 'PART').every(c =>
    c.tipo === 'FULL' ? horas.get(c.id) === 48 : c.horasSemanales != null && horas.get(c.id) === c.horasSemanales)
}
