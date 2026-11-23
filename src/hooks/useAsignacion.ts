import type { Continuidad } from '../utils/continuidad'
import { diagnosticoPrevio } from '../utils/diagnosticoGeneracion'
import { minutosDesdeMedianoche } from '../utils/timeUtils'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { Colaborador, Franja, ResultadoAsignacion, ExcepcionSemanal, Auxiliar, Eventual, JornadaResumida, HorarioColaborador } from '../types'
import { minutosAsignados } from '../utils/horasSemanales'
import {configuracionAutenticada,opcionesIntegradas,usaHibrido,verificarDatosActuales,type DotacionBase} from '../hibrido/integracion'
import {getSucursalActual} from '../utils/sucursal'
import type {EdicionTopes} from '../hibrido/topesContrato'
import {ejecutarHibridoEnWorker} from '../workers/hibridoCliente'
import { asignarHorariosConIA, prepararEntradaAsignacion } from '../utils/iaAsignacion'
import type { OpcionesGeneracion } from '../algoritmo/adapter'
import type { ContextoValidacionSemana } from '../utils/validacionSemana'
import { recalcularSemanaTrasEdicion, type ContextoRecalculo } from '../utils/recalculoSemana'
import { recalcularCumplimiento, avisosCumplimiento, esAvisoDeHoras } from '../algoritmo/contratos'
import { PREFIJO_AVISO_MULTI_ARRANQUE } from '../utils/generacionMultiArranque'

/**
 * Aplica una edición manual de jornada sobre una lista de horarios y devuelve
 * la lista nueva con las horas recalculadas. Función pura: la usan tanto la
 * pantalla de generación (useAsignacion) como "Último horario" (edición sobre
 * la semana guardada en el historial).
 */
export function aplicarEdicionJornada(
  horarios: HorarioColaborador[],
  colaboradorId: string,
  dia: number,
  nueva: JornadaResumida
): HorarioColaborador[] {
  return horarios.map(h => {
    if (h.colaboradorId !== colaboradorId) return h
    const jornadas = h.jornadas.map(j => {
      if (j.dia !== dia) return j
      const horas = minutosAsignados([nueva]) / 60
      return {
        ...j,
        esFranco: nueva.esFranco,
        turnos: nueva.esFranco ? [] : nueva.turnos,
        horas,
        rol: nueva.esFranco ? 'franco' as const : j.esFranco ? h.rolGeneral : j.rol,
      }
    })
    return {
      ...h,
      jornadas,
      totalHoras: jornadas.reduce((s, j) => s + j.horas, 0),
    }
  })
}

/**
 * #38 — Aplica una edición manual y mantiene coherentes las tres pasadas:
 *  - la edición de un eventual queda FIJADA ("id|día") como decisión confirmada;
 *  - con contexto, se recalculan CAJA de AUX (pasada 2), el resto de los
 *    eventuales (pasada 3), cobertura, faltantes y %; sin contexto (no hay
 *    demanda conocida) solo se aplica la edición y la validación lo informa.
 */
export function aplicarEdicionConRecalculo(
  prev: ResultadoAsignacion, colaboradorId: string, dia: number, nueva: JornadaResumida, nombre: string,
  recalculo?: Omit<ContextoRecalculo, 'eventualesFijos'>,
): ResultadoAsignacion {
  const esEventual = prev.horarios.some(h => h.colaboradorId === colaboradorId && h.rolGeneral === 'eventual_sector')
  const horarios = aplicarEdicionJornada(prev.horarios, colaboradorId, dia, nueva)
  const cajaEventual = esEventual ? actualizarCajaEventual(prev.cajaEventual, colaboradorId, dia, nueva, nombre) : prev.cajaEventual
  const eventualesFijos = esEventual
    ? [...new Set([...(prev.eventualesFijos ?? []), `${colaboradorId}|${dia}`])]
    : prev.eventualesFijos
  // #7: el cumplimiento de horas y sus avisos se recalculan desde las jornadas
  // editadas; el impacto de la prioridad de horas describe la solución original
  // del motor, así que se descarta (no se conservan resultados anteriores).
  const horasDe = (id: string) => {
    const h = horarios.find(x => x.colaboradorId === id)
    return h ? minutosAsignados(h.jornadas) / 60 : undefined
  }
  const cumplimientoHoras = recalcularCumplimiento(prev.cumplimientoHoras, horasDe)
  const alertas = [
    // El aviso del multi-arranque describe la generación; tras editar, la validez la informa el validador.
    ...prev.alertas.filter(a => !esAvisoDeHoras(a) && !a.startsWith(PREFIJO_AVISO_MULTI_ARRANQUE)),
    ...avisosCumplimiento(cumplimientoHoras),
  ]
  const editado: ResultadoAsignacion = { ...prev, horarios, cajaEventual, eventualesFijos, cumplimientoHoras, impactoHoras: undefined, alertas }
  if (!recalculo) return editado
  const { avisos, ...rec } = recalcularSemanaTrasEdicion(editado, { ...recalculo, eventualesFijos })
  return { ...editado, ...rec, alertas: [...new Set([...alertas, ...avisos])] }
}

/** Refleja las ediciones de caja de eventuales en el anexo y la cobertura. */
export function actualizarCajaEventual(
  caja: ResultadoAsignacion['cajaEventual'], id: string, dia: number, jornada: JornadaResumida, nombre: string,
): NonNullable<ResultadoAsignacion['cajaEventual']> {
  const existentes = caja ?? []
  const anterior = existentes.find(a => a.colaboradorId === id)
  const slotsCajaPorDia = Array.from({ length: 7 }, (_, d) => {
    if (d !== dia) return anterior?.slotsCajaPorDia[d] ?? Array<boolean>(30).fill(false)
    return Array.from({ length: 30 }, (_, slot) => {
      const inicio = 8 * 60 + slot * 30
      return !jornada.esFranco && jornada.turnos.some(turno =>
        minutosDesdeMedianoche(turno.inicio) <= inicio && minutosDesdeMedianoche(turno.fin) > inicio)
    })
  })
  return [...existentes.filter(a => a.colaboradorId !== id), { colaboradorId: id, nombre, slotsCajaPorDia }]
}

/** AH2-059 · Paso de la generación (0 preparando, 1 respaldo, 2 optimizando, 3 validando) y tiempos. */
export interface AvanceGeneracion { paso: number; inicio: number; esperadoMs: number }

export function useAsignacion() {
  const [resultado, setResultado] = useState<ResultadoAsignacion | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [progreso, setProgreso] = useState('')
  // AH2-059: avance para la barra de progreso (paso actual, inicio y duración esperada).
  const [avance, setAvance] = useState<AvanceGeneracion | null>(null)
  const [modoCompatible, setModoCompatible] = useState(false)
  const activa = useRef<AbortController | null>(null)

  const cancelarGeneracion = useCallback(() => {
    if (!activa.current) return
    const ejecucion = activa.current
    activa.current = null
    ejecucion.abort()
    setLoading(false)
    setAvance(null)
    setModoCompatible(false)
  }, [])

  useLayoutEffect(() => () => {
    const ejecucion = activa.current
    activa.current = null
    ejecucion?.abort()
  }, [])

  const generarHorarios = async (
    necesidad: Franja[], cajeros: Colaborador[], auxiliares: Auxiliar[], eventuales: Eventual[],
    fechas: string[], excepciones: ExcepcionSemanal[], opciones: OpcionesGeneracion,
    contextoValidacion: ContextoValidacionSemana, alCompletar: (resultado: ResultadoAsignacion) => void,
    motor?: {anterior:boolean;topes?:EdicionTopes;base?:DotacionBase},
    /** AH2-063: semana anterior del mismo mes y margen de cobertura por semana. */
    continuidad?: Continuidad,
  ) => {
    if (activa.current) return
    // AH2-062: si los cambios de la semana hacen imposible el horario, se dice por qué antes de llamar a los motores.
    const imposibles = diagnosticoPrevio(cajeros, excepciones, { maxFrancosDia: opciones.maxFrancosDia, maxFrancosPorDia: contextoValidacion.maxFrancosPorDia })
    if (imposibles.length) {
      setResultado(null)
      setError(`No se puede generar el horario con estos cambios:\n${imposibles.map(m => `• ${m}`).join('\n')}`)
      return
    }
    const ejecucion = new AbortController()
    activa.current = ejecucion
    setLoading(true)
    setProgreso('Preparando el horario…')
    const inicio = Date.now()
    const sucursalAvance = getSucursalActual()
    // Motor híbrido: CP-SAT tiene hasta 120 s, más preparación y validación. Motor de la app: segundos.
    const esperadoMs = usaHibrido(sucursalAvance, motor?.anterior) ? 140_000 : 20_000
    setAvance({ paso: 0, inicio, esperadoMs })
    setError(null)
    try {
      let generado: ResultadoAsignacion
      const sucursal=getSucursalActual()
      if(usaHibrido(sucursal,motor?.anterior)) {
        setProgreso('Verificando el acceso al motor híbrido…')
        const cfg=await configuracionAutenticada(sucursal,ejecucion.signal,undefined,fechas[0])
        if(!motor?.base)throw new Error('Falta el contexto de dotación y reglas del motor híbrido.')
        await verificarDatosActuales(cfg.usuario,sucursal,motor.base)
        const entrada=prepararEntradaAsignacion(necesidad,cajeros,auxiliares,eventuales,excepciones,
          opcionesIntegradas(opciones,cfg.opciones,sucursal,fechas[0],motor?.topes),contextoValidacion,continuidad)
        generado=await ejecutarHibridoEnWorker({entrada,token:cfg.token,servicio:cfg.servicio},ejecucion.signal,p=>{
          if(activa.current!==ejecucion)return
          setAvance(a => a && { ...a, paso: Math.max(a.paso, p.etapa === 'A_INICIO' || p.etapa === 'A_FIN' ? 1 : p.etapa === 'B_ENVIO' || p.etapa === 'B_FASE' ? 2 : p.etapa === 'PREPARACION' ? 0 : 3) })
          setProgreso(p.etapa==='A_INICIO'?'Preparando propuesta de respaldo…':p.etapa==='B_ENVIO'?'Buscando una mejor distribución semanal…':p.etapa==='B_FASE'?'Optimizando cobertura y equilibrio semanal…':'Validando la propuesta…')
        },()=>setModoCompatible(true))
      } else generado = await asignarHorariosConIA(
        necesidad, cajeros, auxiliares, eventuales, fechas, excepciones, opciones, contextoValidacion,
        {
          signal: ejecucion.signal,
          avisarModoCompatible: () => {
            if (activa.current === ejecucion) setModoCompatible(true)
          },
        },
        continuidad,
      )
      if (activa.current !== ejecucion) return
      // Guardar y mostrar el mismo resultado dentro de la comprobación de vigencia.
      alCompletar(generado)
      setResultado(generado)
    } catch (err) {
      if (activa.current === ejecucion) {
        setError(err instanceof Error ? err.message : 'No se pudo generar el horario. Volvé a intentarlo.')
      }
    } finally {
      if (activa.current === ejecucion) {
        activa.current = null
        setLoading(false)
        setAvance(null)
        setModoCompatible(false)
      }
    }
  }

  const reset = () => {
    cancelarGeneracion()
    setResultado(null)
    setError(null)
  }

  /**
   * Edición manual del horario generado (Capacidad 3). Reemplaza la jornada
   * de un colaborador en un día y recalcula las horas totales.
   */
  const editarJornada = (
    colaboradorId: string, dia: number, nueva: JornadaResumida, nombre?: string,
    // #38: contexto para recalcular la cascada (AUX y eventuales) con la misma
    // configuración operativa con la que se generó la semana.
    recalculo?: Omit<ContextoRecalculo, 'eventualesFijos'>,
  ) => {
    setResultado(prev => (prev ? aplicarEdicionConRecalculo(prev, colaboradorId, dia, nueva, nombre ?? colaboradorId, recalculo) : prev))
  }

  return {
    resultado,
    loading,
    error,
    generarHorarios,
    cancelarGeneracion,
    modoCompatible,
    progreso,
    avance,
    editarJornada,
    reset,
  }
}