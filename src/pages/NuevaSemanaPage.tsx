import {configuracionAutenticada,usaHibrido} from '../hibrido/integracion'
import {topesVigentes,type EdicionTopes} from '../hibrido/topesContrato'
import type {OpcionesGeneracion} from '../algoritmo/adapter'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ExcepcionSemanal, DIAS_SEMANA, JornadaResumida } from '../types'
import { usePDFParser } from '../hooks/usePDFParser'
import { useColaboradores } from '../hooks/useColaboradores'
import { useAuxiliares } from '../hooks/useAuxiliares'
import { useEventuales } from '../hooks/useEventuales'
import { useAsignacion } from '../hooks/useAsignacion'
import { useReglas } from '../hooks/useReglas'
import { useHistorial } from '../hooks/useHistorial'
import { useCorrecciones } from '../hooks/useCorrecciones'
import DisponibilidadSemana from '../components/semana/DisponibilidadSemana'
import { prepararDisponibilidadSemana, type ExcepcionDisponibilidad } from '../utils/disponibilidadHabitual'
import PDFUploader from '../components/semana/PDFUploader'
import PreviewNecesidad from '../components/semana/PreviewNecesidad'
import CoberturaLive from '../components/semana/CoberturaLive'
import { Indicador, ResumenCobertura, Tarjeta, formatoHoras } from '../components/ui/Basicos'
import { rangoSemana, resumirHorarios } from '../utils/resumenSemana'
import { ddmm } from '../hibrido/configuracionSimple'
import TablaHorarios from '../components/semana/TablaHorarios'
import { generarPDF } from '../utils/exportPDF'
import { validarResultadoSemana, estadoValidacion, estadoSupervisor, type ContextoValidacionSemana } from '../utils/validacionSemana'
import { getSucursalActual } from '../utils/sucursal'
import { PERFIL_HORAS_VIGENTE, resolverContratoHoras } from '../algoritmo/contratos'
import { registroGeneracion } from '../utils/generacionMultiArranque'
import {
  reglasAExcepciones,
  demandaMinimaDeReglas,
  capFrancosDeReglas,
  configOperativaDeReglas,
  resolucionOperativaDeReglas,
  ETIQUETAS_OPERATIVAS,
  validarConflictosReglas,
  calcularSesgoRotacion,
  calcularSesgoAprendizaje,
  derivarAprendizajes,
  derivarCriteriosCobertura,
  pesosFranjaDeCriterios,
  combinarSesgos,
  explicarSesgos,
  resumirTurnos,
} from '../utils/preferencias'
import { format, startOfWeek } from 'date-fns'
import { esLunesISO, fechasDeSemana } from '../utils/pomContrato'
import { leerAntecedenteDomingo, domingoAnteriorISO, type AntecedenteDomingo } from '../utils/antecedenteDomingo'
import { es } from 'date-fns/locale'

type Paso = 'upload' | 'revisar' | 'resultado'
const VistaDemanda = memo(PreviewNecesidad)

export default function NuevaSemanaPage({ autorSesion }: { autorSesion?: string }) {
  const [paso, setPaso] = useState<Paso>('upload')
  const [tablasVisibles, setTablasVisibles] = useState(0)

  useEffect(() => {
    if (paso !== 'resultado') return
    // Repartir el armado de las dos tablas en cuadros distintos del resumen.
    let cuadro = requestAnimationFrame(() => {
      setTablasVisibles(1)
      cuadro = requestAnimationFrame(() => setTablasVisibles(2))
    })
    return () => cancelAnimationFrame(cuadro)
  }, [paso])
  const { necesidad, loading: loadingPDF, error: errorPDF, parsearPDF, reset: resetPDF } = usePDFParser()
  const { colaboradores, loading: cargandoColaboradores, errorCarga: errorColaboradores } = useColaboradores()
  const { auxiliares, loading: cargandoAuxiliares, errorCarga: errorAuxiliares } = useAuxiliares()
  const { eventuales, loading: cargandoEventuales, errorCarga: errorEventuales } = useEventuales()
  const colaboradoresActivos = useMemo(() => colaboradores.filter(c => c.activo), [colaboradores])
  const auxiliaresActivos = useMemo(() => auxiliares.filter(a => a.activo), [auxiliares])
  const eventualesActivos = useMemo(() => eventuales.filter(e => e.activo), [eventuales])
  const { resultado, loading: loadingAsignacion, error: errorAsignacion, generarHorarios, cancelarGeneracion, modoCompatible, progreso, editarJornada, reset: resetAsignacion } = useAsignacion()
  const { reglas, reglasActivas } = useReglas()
  const { historial, agregarSemana, actualizarSemana } = useHistorial()
  const { correcciones, agregarCorreccion } = useCorrecciones()
  const [semanaGuardadaId, setSemanaGuardadaId] = useState<string | null>(null)
  const [semanaDesc, setSemanaDesc] = useState('')
  // POM-01 (#8): semana tomada del PDF (encabezado/nombre); manual solo si no se detectó.
  const [lunesSemana, setLunesSemana] = useState('')
  const [origenSemana, setOrigenSemana] = useState<'pdf' | 'manual'>('manual')
  const [avisoSemana, setAvisoSemana] = useState<string | null>(null)
  const [domingoCargado, setAntecedenteDomingo] = useState<AntecedenteDomingo | null>(null)
  const [errorAntecedente, setErrorAntecedente] = useState<string | null>(null)
  const revisionImportacion = useRef(0)
  const [salidasDomingo, setSalidasDomingo] = useState<Record<string, string>>({})
  const [modoPrueba, setModoPrueba] = useState(() => usaHibrido(getSucursalActual()))
  const [avisosPOM, setAvisosPOM] = useState<string[]>([])
  // PUB-01 (#12): contexto con el que se generó la semana, para validarla (y revalidarla tras ediciones).
  const [ctxValidacion, setCtxValidacion] = useState<(ContextoValidacionSemana & { fechas: string[]; auxiliares: typeof auxiliaresActivos; eventuales: typeof eventualesActivos }) | null>(null)
  const [excepcionesDisponibilidad, setExcepcionesDisponibilidad] = useState<ExcepcionDisponibilidad[]>([])
  const [excepciones, setExcepciones] = useState<ExcepcionSemanal[]>([])
  const [mostrarExcepciones, setMostrarExcepciones] = useState(false)
  const [colaboradorSeleccionado, setColaboradorSeleccionado] = useState('')
  const [tipoSeleccionado, setTipoSeleccionado] = useState<ExcepcionSemanal['tipo']>('franco_dia')
  const [valorInput, setValorInput] = useState('')

  const aplicarSemana = (lunes: string, origen: 'pdf' | 'manual') => {
    setLunesSemana(lunes)
    setOrigenSemana(origen)
    setAntecedenteDomingo(null)
    setErrorAntecedente(null)
    revisionImportacion.current++
    setSalidasDomingo({})
    const f = new Date(lunes + 'T12:00:00')
    setSemanaDesc(`Semana ${format(f, 'w', { locale: es })} - ${format(f, 'MMMM yyyy', { locale: es })}`)
  }

  const handlePDFSelect = async (file: File) => {
    let resultado
    try {
      resultado = await parsearPDF(file)
    } catch {
      // El error ya quedó en usePDFParser.error y lo muestra PDFUploader.
      // NO avanzar al paso de revisión/generación con demanda inválida.
      return
    }
    setAvisosPOM(resultado.avisos)
    if (resultado.semana.ok) {
      aplicarSemana(resultado.semana.semana.lunes, 'pdf')
      setAvisoSemana(null)
    } else {
      // Sin semana detectable: se propone la semana actual pero el supervisor debe confirmarla.
      aplicarSemana(format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'), 'manual')
      setAvisoSemana(resultado.semana.motivo === 'ambigua'
        ? `El PDF menciona más de una semana (${resultado.semana.candidatas.join(', ')}). Elegí el lunes correcto.`
        : 'No se encontró la semana en el PDF. Confirmá el lunes de la semana a planificar.')
    }
    setPaso('revisar')
  }

  const agregarExcepcion = () => {
    if (excepciones.length >= 10) {
      alert('Máximo 10 excepciones por semana')
      return
    }
    if (!colaboradorSeleccionado) {
      alert('Selecciona un colaborador')
      return
    }
    const colaborador = colaboradoresActivos.find(c => c.id === colaboradorSeleccionado)
    if (!colaborador) return
    let descripcion = ''
    switch (tipoSeleccionado) {
      case 'franco_dia':
        descripcion = `Franco el ${valorInput}`
        break
      case 'no_antes_de':
        descripcion = `No disponible antes de ${valorInput}`
        break
      case 'no_despues_de':
        descripcion = `No disponible después de ${valorInput}`
        break
      case 'siempre_cierre':
        descripcion = 'Siempre hacer cierre (turno hasta 22:30)'
        break
      case 'solo_matutino':
        descripcion = 'Solo turno matutino (terminar antes de las 15:00)'
        break
      case 'solo_nocturno':
        descripcion = 'Solo turno nocturno (empezar después de las 17:00)'
        break
    }
    const nuevaExcepcion: ExcepcionSemanal = {
      id: Date.now().toString(),
      colaboradorNombre: colaborador.nombre,
      tipo: tipoSeleccionado,
      valor: valorInput || undefined,
      descripcion,
    }
    setExcepciones([...excepciones, nuevaExcepcion])
    setColaboradorSeleccionado('')
    setTipoSeleccionado('franco_dia')
    setValorInput('')
  }

  const eliminarExcepcion = (id: string) => {
    setExcepciones(excepciones.filter(e => e.id !== id))
  }

  // Mapeo id UI → nombre (para historial y correcciones), incluyendo AUX y
  // eventuales: sus filas también aparecen en el resultado y son editables.
  const nombrePorId = useMemo(
    () => Object.fromEntries([
      ...colaboradoresActivos.map(c => [c.id, c.nombre] as const),
      ...auxiliaresActivos.map(a => [a.id, a.nombre] as const),
      ...eventualesActivos.map(e => [e.id, e.nombre] as const),
    ]),
    [colaboradoresActivos, auxiliaresActivos, eventualesActivos]
  )

  const sucursal = getSucursalActual()
  const hibridoDisponible=usaHibrido(sucursal)
  const cajerosDomingo = colaboradoresActivos.filter(c => c.tipo === 'FULL' || c.tipo === 'PART')
  const antecedenteDomingo = domingoCargado?.lunes === lunesSemana && domingoCargado.sucursal === sucursal &&
    cajerosDomingo.length === Object.keys(domingoCargado.finPorId).length &&
    cajerosDomingo.every(c => Object.prototype.hasOwnProperty.call(domingoCargado.finPorId, c.id))
    ? domingoCargado : null
  // Solo las generaciones elegidas para el historial tienen procedencia operativa.
  const semanasOperativas = useMemo(() => hibridoDisponible?historial.filter(h => h.antecedenteDomingo?.sucursal === sucursal):historial, [historial, sucursal, hibridoDisponible])
  const correccionesOperativas = useMemo(() => {
    if(!hibridoDisponible)return correcciones
    const ids = new Set(semanasOperativas.map(h => h.id))
    return correcciones.filter(c => ids.has(c.semanaId))
  }, [correcciones, semanasOperativas, hibridoDisponible])
  const sesgosGeneracion = useMemo(() => combinarSesgos(
    calcularSesgoRotacion(semanasOperativas), calcularSesgoAprendizaje(derivarAprendizajes(correccionesOperativas)),
  ), [semanasOperativas, correccionesOperativas])
  const frasesPreferencias = useMemo(() => explicarSesgos(sesgosGeneracion), [sesgosGeneracion])
  const conflictosReglas = useMemo(
    () => validarConflictosReglas(reglas, colaboradores),
    [reglas, colaboradores]
  )
  // Criterios de cobertura del supervisor: los activos ponderan el score.
  // Se pasan las semanas para fechar cada señal por su lunes real (decay temporal).
  const criteriosCobertura = useMemo(
    () => derivarCriteriosCobertura(correccionesOperativas, { semanas: semanasOperativas }),
    [correccionesOperativas, semanasOperativas]
  )
  const criteriosActivos = useMemo(
    () => criteriosCobertura.filter(c => c.estado === 'activo'),
    [criteriosCobertura]
  )

  const cargandoDotacion = cargandoColaboradores || cargandoAuxiliares || cargandoEventuales
  const errorDotacion = errorColaboradores || errorAuxiliares || errorEventuales
  const fechasSemana = useMemo(() => esLunesISO(lunesSemana) ? fechasDeSemana(lunesSemana) : [], [lunesSemana])
  // #38: estado efectivo de las reglas operativas de la semana elegida; el
  // diagnóstico previo, la generación, la validación y el PDF usan el mismo.
  const operativaSemana = useMemo(
    () => fechasSemana.length ? configOperativaDeReglas(reglas, fechasSemana[0]) : null,
    [reglas, fechasSemana]
  )
  const disponibilidad = useMemo(
    () => !cargandoDotacion && !errorDotacion && fechasSemana.length && operativaSemana
      ? prepararDisponibilidadSemana(auxiliaresActivos, eventualesActivos, excepcionesDisponibilidad, fechasSemana[0], { aperturaSoloAux: operativaSemana.aperturaSoloAux })
      : null,
    [auxiliaresActivos, eventualesActivos, excepcionesDisponibilidad, fechasSemana, cargandoDotacion, errorDotacion, operativaSemana]
  )
  const excepcionesDeLaSemana = excepcionesDisponibilidad.filter(x => fechasSemana.includes(x.fecha))
  const generacionDeshabilitada = loadingAsignacion || !disponibilidad || disponibilidad.errores.length > 0

  // Si cambian entradas mientras hay cálculo, se invalida el snapshot.
  useLayoutEffect(() => {
    cancelarGeneracion()
  }, [cancelarGeneracion, necesidad, lunesSemana, excepciones, excepcionesDisponibilidad,
    colaboradores, auxiliares, eventuales, reglas, historial, correcciones, antecedenteDomingo, sucursal, modoPrueba, autorSesion])

  const [motorAnterior,setMotorAnterior]=useState(false)
  const [configHibrida,setConfigHibrida]=useState<OpcionesGeneracion>()
  const [topesHibridos,setTopesHibridos]=useState<EdicionTopes>()
  const [errorConfigHibrida,setErrorConfigHibrida]=useState('')
  const [fuenteConfigHibrida,setFuenteConfigHibrida]=useState<'persistida'|'servicio'>()
  useEffect(()=>{
    if(!hibridoDisponible)return
    const ctrl=new AbortController()
    setErrorConfigHibrida('')
    void configuracionAutenticada(sucursal,ctrl.signal,undefined,esLunesISO(lunesSemana)?lunesSemana:undefined).then(c=>{if(!ctrl.signal.aborted){setConfigHibrida(c.opciones);setFuenteConfigHibrida(c.fuente)}}).catch((e:unknown)=>{if(!ctrl.signal.aborted)setErrorConfigHibrida(e instanceof Error&&/conflictos/.test(e.message)?e.message:'No se pudo cargar la configuración del motor híbrido. Podés usar el motor anterior.')})
    return()=>ctrl.abort()
  },[hibridoDisponible,sucursal,autorSesion,lunesSemana])
  useLayoutEffect(()=>{cancelarGeneracion()},[cancelarGeneracion,motorAnterior,topesHibridos])
  let topesMostrados=topesHibridos
  try {topesMostrados??=configHibrida&&lunesSemana?topesVigentes(configHibrida.topes_caja_eventual_contrato,sucursal,lunesSemana):undefined}catch{/* La generación rechaza una configuración inválida. */}

  const handleGenerarHorarios = () => {
    // POM-01 (#8): fechas de la semana del PDF (o la confirmada por el supervisor), nunca del reloj.
    if (!esLunesISO(lunesSemana)) {
      setAvisoSemana('La fecha elegida no es un lunes. Corregila antes de generar.')
      return
    }
    if (!disponibilidad || disponibilidad.errores.length || loadingAsignacion) return
    const fechas = fechasSemana
    const fechaLunes = fechas[0]
    const cajerosActivos = colaboradoresActivos.filter(c => c.tipo === 'FULL' || c.tipo === 'PART')

    // Capacidad 1: reglas configuradas → excepciones + demanda mínima + tope de francos
    const excepcionesTotales = [...excepciones, ...reglasAExcepciones(reglas, fechaLunes)]
    const operativa = operativaSemana ?? configOperativaDeReglas(reglas, fechaLunes)
    const opciones = {
      preferenciasPorNombre: sesgosGeneracion, // No aprender de simulaciones si se importó el domingo operativo
      demandaMinima: demandaMinimaDeReglas(reglas, fechaLunes),
      maxFrancosDia: capFrancosDeReglas(reglas, fechaLunes),
      // Criterios de cobertura activos (2+ semanas): la propuesta prioriza esas franjas
      pesosFranja: pesosFranjaDeCriterios(criteriosCobertura),
      // Reglas operativas de la sucursal (con defaults del negocio)
      ...operativa,
    }

    // PUB-01: semana anterior guardada (para 12 h domingo → lunes) y contexto de validación.
    // #7 · AH2-020: se arma ANTES de generar para que el multi-arranque valide cada candidato
    // con exactamente el mismo contexto que luego usa esta pantalla.
    if (hibridoDisponible && !modoPrueba && !antecedenteDomingo) {
      setErrorAntecedente('Para guardar una semana, confirmá las salidas programadas del domingo anterior.')
      return
    }
    const lunesPrevio = new Date(new Date(fechaLunes + 'T12:00:00').getTime() - 7 * 86_400_000).toISOString().slice(0, 10)
    const previas = historial.filter(h => h.fechaLunes === lunesPrevio)
    const previa = previas[previas.length - 1]
    const ctx = {
      fechas,
      necesidad,
      excepciones: excepcionesTotales,
      maxFrancosDia: opciones.maxFrancosDia,
      minimosCajeros: opciones.demandaMinima,
      semanaAnterior: hibridoDisponible?undefined:previa?.horarios,
      finDomingoAnteriorPorId: antecedenteDomingo?.finPorId,
      ...(hibridoDisponible&&!antecedenteDomingo ? { limitaciones: ['Sin antecedente dominical confirmado: no se puede comprobar el descanso de domingo a lunes.'] } : {}),
      auxiliares: disponibilidad.auxiliares,
      eventuales: disponibilidad.eventuales,
      huecosSupervision: disponibilidad.huecosSupervision,
      operativa, // #38: estado efectivo de las reglas → el validador lo exige
    }

    void generarHorarios(necesidad, cajerosActivos, disponibilidad.auxiliares, disponibilidad.eventuales, fechas, excepcionesTotales, opciones, ctx, res => {
      setCtxValidacion(ctx)
      if (hibridoDisponible && !modoPrueba && !validarResultadoSemana(res, cajerosActivos, disponibilidad.auxiliares, disponibilidad.eventuales, ctx).publicable) {
        // Mostrar resultado y motivos, pero impedir su incorporación al historial.
        setSemanaGuardadaId(null)
        setPaso('resultado')
        return
      }
      if (modoPrueba) {
        setSemanaGuardadaId(null)
        setPaso('resultado')
        return
      }
      // Guardar solamente una generación operativa elegida por el supervisor.
      const semana = agregarSemana({
        fechaLunes,
        antecedenteDomingo: antecedenteDomingo ?? undefined,
        descripcion: semanaDesc || `Semana del ${fechaLunes}`,
        horarios: res.horarios,
        resumenPorColaborador: resumirTurnos(res.horarios, nombrePorId),
        // Snapshot para re-exportar el PDF completo desde "Último horario"
        cajaAux: res.cajaAux,
        cajaEventual: res.cajaEventual,
        coberturaFranjas: res.coberturaFranjas,
        faltantesFranjas: res.faltantesFranjas,
        porcentajeCobertura: res.porcentajeCobertura,
        // Necesidad del PDF: para el panel de cobertura en vivo del editor
        necesidadFranjas: necesidad.map(f => [...f.necesidad]),
        configOperativa: operativa,
        perfilHorasId: PERFIL_HORAS_VIGENTE.id,
        cumplimientoHoras: res.cumplimientoHoras,
        hibrido: res.hibrido,
        condicionesSupervisor: res.condicionesSupervisor,
        // #7 · AH2-020: versión del algoritmo, estrategia elegida y mejora frente al respaldo
        generacion: res.multiArranque ? registroGeneracion(res.multiArranque) : undefined,
        disponibilidadSemana: Object.fromEntries(
          [...disponibilidad.auxiliares, ...disponibilidad.eventuales].map(p => [p.id, [...p.horarioSemanal]])),
      })
      setSemanaGuardadaId(semana.id)
      setPaso('resultado')
    }, {anterior:motorAnterior,topes:topesHibridos,base:{cajeros:cajerosActivos,auxiliares:auxiliaresActivos,eventuales:eventualesActivos,reglas}})
  }

  // Capacidad 3: edición manual del resultado + registro de la corrección
  const handleEditarJornada = (colaboradorId: string, dia: number, nueva: JornadaResumida) => {
    if (!resultado) return
    const horario = resultado.horarios.find(h => h.colaboradorId === colaboradorId)
    const jornadaAnterior = horario?.jornadas.find(j => j.dia === dia)
    if (!jornadaAnterior) return

    if (semanaGuardadaId) agregarCorreccion({
      semanaId: semanaGuardadaId,
      colaboradorNombre: nombrePorId[colaboradorId] ?? colaboradorId,
      dia,
      antes: { esFranco: jornadaAnterior.esFranco, turnos: jornadaAnterior.turnos },
      despues: nueva,
    })
    // #38: recalcular la cascada (AUX + eventuales + cobertura) con la configuración
    // y la disponibilidad resuelta con que se generó la semana.
    editarJornada(colaboradorId, dia, nueva, nombrePorId[colaboradorId], ctxValidacion?.operativa ? {
      necesidadFranjas: necesidad.map(f => [...f.necesidad]), nombrePorId, operativa: ctxValidacion.operativa,
      disponibilidad: Object.fromEntries([...ctxValidacion.auxiliares, ...ctxValidacion.eventuales].map(p => [p.id, [...p.horarioSemanal]])),
    } : undefined)
    if (semanaGuardadaId) actualizarSemana(semanaGuardadaId, { editadoManualmente: true })
  }

  // Mantener el historial sincronizado con las ediciones (la rotación debe
  // basarse en lo que realmente quedó, no en lo que generó el algoritmo)
  useEffect(() => {
    if (resultado && semanaGuardadaId) {
      actualizarSemana(semanaGuardadaId, {
        horarios: resultado.horarios,
        cajaAux: resultado.cajaAux,
        cajaEventual: resultado.cajaEventual,
        eventualesFijos: resultado.eventualesFijos,
        cumplimientoHoras: resultado.cumplimientoHoras, // #7: recalculado tras cada edición
        coberturaFranjas: resultado.coberturaFranjas,
        faltantesFranjas: resultado.faltantesFranjas,
        porcentajeCobertura: resultado.porcentajeCobertura,
        resumenPorColaborador: resumirTurnos(resultado.horarios, nombrePorId),
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultado])

  // PUB-01: validación independiente del horario vigente (se recalcula tras cada edición manual)
  const validacion = useMemo(
    () => (resultado && ctxValidacion
      ? validarResultadoSemana(resultado, colaboradoresActivos, ctxValidacion.auxiliares, ctxValidacion.eventuales, ctxValidacion)
      : null),
    [resultado, ctxValidacion, colaboradoresActivos]
  )
  // AH2-044: resumen en lenguaje del supervisor (se actualiza con cada corrección).
  const resumenResultado = useMemo(
    () => (resultado && necesidad.length ? resumirHorarios(resultado.horarios, necesidad.map(f => f.necesidad), resultado.cajaAux) : null),
    [resultado, necesidad]
  )

  const handleExportarPDF = () => {
    if (!resultado) return
    const pdf = generarPDF(resultado, colaboradoresActivos, semanaDesc, ctxValidacion?.auxiliares ?? auxiliaresActivos, ctxValidacion?.eventuales ?? eventualesActivos, {
      sucursal: getSucursalActual(),
      marcaNoGuardado: semanaGuardadaId ? undefined : modoPrueba ? 'PRUEBA NO GUARDADA' : 'BORRADOR NO GUARDADO',
      fechas: ctxValidacion?.fechas,
      version: historial.find(s => s.id === semanaGuardadaId)?.version,
      validacion: validacion ?? undefined,
      estado: validacion ? estadoValidacion(validacion) : undefined,
      // Presencia registrada de la semana (patrón + excepciones por fecha), la misma que se guarda.
      presencia: ctxValidacion
        ? Object.fromEntries([...ctxValidacion.auxiliares, ...ctxValidacion.eventuales].map(p => [p.id, [...p.horarioSemanal]]))
        : undefined,
    })
    pdf.save(`${modoPrueba ? 'prueba-' : ''}horarios-${semanaDesc.toLowerCase().replace(/ /g, '-')}.pdf`)
  }

  const handleNuevaSemana = () => {
    resetPDF()
    resetAsignacion()
    setExcepciones([])
    setExcepcionesDisponibilidad([])
    setCtxValidacion(null)
    setAntecedenteDomingo(null)
    setErrorAntecedente(null)
    revisionImportacion.current++
    setSalidasDomingo({})
    setModoPrueba(hibridoDisponible)
    setMostrarExcepciones(false)
    setSemanaGuardadaId(null)
    setTablasVisibles(0)
    setPaso('upload')
  }

  // Calcular horas totales necesarias estimadas
  const horasNecesariasEstimadas = necesidad.reduce(
    (sum, franja) => sum + franja.necesidad.reduce((s, n) => s + n, 0),
    0
  ) * 0.5 // Cada franja son 0.5h

  // #7: capacidad con la MISMA definición de contrato que usa el motor (ficha acotada al máximo del perfil).
  const horasDisponibles = colaboradoresActivos.reduce((sum, col) => {
    if (col.tipo === 'PART') return sum + resolverContratoHoras('PART', col.horasSemanales, PERFIL_HORAS_VIGENTE).topeHoras
    return sum + (col.horasSemanales ?? 0)
  }, 0)

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{
          fontSize: '36px',
          fontWeight: 800,
          fontFamily: "'Syne', sans-serif",
          color: 'var(--text)',
          margin: 0,
          letterSpacing: '-0.5px',
        }}>
          Nueva Semana
        </h1>
        <p style={{
          color: 'var(--text-muted)',
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: '16px',
          marginTop: '8px',
        }}>
          Sube el PDF con la necesidad de cajas y genera los horarios automáticamente.
        </p>
      </div>

      {/* Pasos */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '32px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', color: paso === 'upload' ? 'var(--accent-strong)' : 'var(--text-muted)' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: paso === 'upload' ? 'var(--accent)' : 'var(--surface)',
              color: paso === 'upload' ? 'var(--accent-dark)' : 'var(--text-muted)',
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 600,
            }}>
              1
            </div>
            <span style={{
              marginLeft: '8px',
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 500,
            }}>
              Subir PDF
            </span>
          </div>
          <div style={{ width: '48px', height: '2px', background: 'var(--border)' }}></div>
          <div style={{ display: 'flex', alignItems: 'center', color: paso === 'revisar' ? 'var(--accent-strong)' : 'var(--text-muted)' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: paso === 'revisar' ? 'var(--accent)' : 'var(--surface)',
              color: paso === 'revisar' ? 'var(--accent-dark)' : 'var(--text-muted)',
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 600,
            }}>
              2
            </div>
            <span style={{
              marginLeft: '8px',
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 500,
            }}>
              Revisar
            </span>
          </div>
          <div style={{ width: '48px', height: '2px', background: 'var(--border)' }}></div>
          <div style={{ display: 'flex', alignItems: 'center', color: paso === 'resultado' ? 'var(--accent-strong)' : 'var(--text-muted)' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: paso === 'resultado' ? 'var(--accent)' : 'var(--surface)',
              color: paso === 'resultado' ? 'var(--accent-dark)' : 'var(--text-muted)',
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 600,
            }}>
              3
            </div>
            <span style={{
              marginLeft: '8px',
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 500,
            }}>
              Resultado
            </span>
          </div>
        </div>

        {paso !== 'upload' && (
          <button
            onClick={handleNuevaSemana}
            style={{
              color: 'var(--text-muted)',
              background: 'none',
              border: 'none',
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            ← Nueva semana
          </button>
        )}
      </div>

      {/* Paso 1: Upload */}
      {paso === 'upload' && (
        <div style={{
          background: 'var(--card)',
          borderRadius: '16px',
          border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
          padding: '40px',
        }}>
          <PDFUploader
            onFileSelect={handlePDFSelect}
            loading={loadingPDF}
            error={errorPDF}
          />
        </div>
      )}

      {/* Paso 2: Revisar */}
      {paso === 'revisar' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          <div style={{
            background: 'var(--card)',
            borderRadius: '16px',
            border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
            padding: '32px',
          }}>
            <h3 style={{
              fontSize: '24px',
              fontWeight: 800,
              fontFamily: "'Syne', sans-serif",
              color: 'var(--text)',
              marginBottom: '16px',
              letterSpacing: '-0.5px',
            }}>
              {fechasSemana.length > 0 ? rangoSemana(fechasSemana[0]) : 'Semana'}
            </h3>
            <div data-testid="semana-pom" style={{ marginBottom: '16px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', color: 'var(--text)' }}>
              <span style={{ fontWeight: 700 }}>
                {fechasSemana.length > 0 ? `Semana: ${fechasSemana[0]} al ${fechasSemana[6]}` : 'Elegí un lunes válido'}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {origenSemana === 'pdf' ? '(detectada en el PDF)' : '(elegida manualmente)'}
              </span>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Lunes:{' '}
                <input
                  type="date"
                  value={lunesSemana}
                  onChange={e => {
                    const v = e.target.value
                    if (esLunesISO(v)) { aplicarSemana(v, 'manual'); setAvisoSemana(null) }
                    else { setLunesSemana(v); setAvisoSemana('La fecha elegida no es un lunes.') }
                  }}
                />
              </label>
            </div>
            {avisoSemana && (
              <p role="alert" style={{ color: 'var(--danger, #b91c1c)', marginBottom: '12px' }}>{avisoSemana}</p>
            )}
            {avisosPOM.length > 0 && (
              <ul style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
                {avisosPOM.map(a => <li key={a}>{a}</li>)}
              </ul>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '32px', margin: '8px 0 16px' }}>
              <Indicador valor={`${formatoHoras(horasNecesariasEstimadas)}`} etiqueta="horas de caja necesarias (según el PDF)" />
              <Indicador valor={`${formatoHoras(horasDisponibles)}`} etiqueta="horas disponibles del personal activo" tono={horasDisponibles >= horasNecesariasEstimadas ? 'normal' : 'atencion'} />
            </div>
            {horasDisponibles < horasNecesariasEstimadas && <p style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--warning)' }}>Con el personal activo no alcanza para cubrir toda la necesidad: van a quedar horas sin cubrir.</p>}
            <details>
              <summary style={{ cursor: 'pointer', fontWeight: 600, padding: '4px 0' }}>Ver necesidad de cajas por franja</summary>
              <div style={{ marginTop: '12px' }}><VistaDemanda necesidad={necesidad} /></div>
            </details>
          </div>

          {hibridoDisponible && fechasSemana.length > 0 && (
            <div data-testid="antecedente-domingo" style={{
              background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '16px',
              padding: '20px 24px', color: 'var(--text)',
            }}>
              <h3 style={{ fontWeight: 800, fontSize: '18px', fontFamily: "'Syne', sans-serif", margin: '0 0 6px' }}>Domingo anterior ({ddmm(domingoAnteriorISO(fechasSemana[0]))})</h3>
              <p style={{ fontSize: '14px', color: 'var(--text-muted)', margin: '0 0 12px' }}>
                Indicá a qué hora salió cada cajero (o si tuvo franco) para respetar su descanso del lunes.
              </p>
              <details style={{ marginBottom: '8px' }}><summary style={{ cursor: 'pointer', fontSize: '13px', color: 'var(--text-muted)' }}>Importar desde un archivo</summary>
              <input data-testid="archivo-domingo" type="file" accept=".json,application/json" disabled={cargandoDotacion}
                onChange={async e => {
                  const input = e.currentTarget
                  const archivo = input.files?.[0]
                  if (!archivo) return
                  const revision = ++revisionImportacion.current
                  try {
                    const contenido: unknown = JSON.parse(await archivo.text())
                    if (revision !== revisionImportacion.current) return
                    const domingo = leerAntecedenteDomingo(contenido, fechasSemana[0], cajerosDomingo, sucursal)
                    setAntecedenteDomingo(domingo)
                    setSalidasDomingo(Object.fromEntries(Object.entries(domingo.finPorId).map(([id, fin]) => [id, fin ?? 'franco'])))
                    setErrorAntecedente(null)
                  } catch (err) {
                    if (revision !== revisionImportacion.current) return
                    setAntecedenteDomingo(null)
                    setErrorAntecedente(err instanceof Error ? err.message : 'No se pudo importar el antecedente.')
                  } finally {
                    input.value = ''
                  }
                }}
              />
              </details>
              {antecedenteDomingo && (
                <div data-testid="domingo-confirmado" style={{ marginTop: '8px', fontWeight: 600 }}>
                  <p>Domingo {antecedenteDomingo.domingo}: {Object.keys(antecedenteDomingo.finPorId).length} cajeros cargados. Revisá las salidas:</p>
                  <ul style={{ fontSize: '12px', fontWeight: 400, columns: 2 }}>
                    {colaboradoresActivos.filter(c => c.tipo === 'FULL' || c.tipo === 'PART').map(c => (
                      <li key={c.id}>{c.nombre}: {antecedenteDomingo.finPorId[c.id] ?? 'FRANCO'}</li>
                    ))}
                  </ul>
                </div>
              )}
              {errorAntecedente && <p role="alert" style={{ color: 'var(--danger)' }}>{errorAntecedente}</p>}
              <div aria-label="Salidas del domingo" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBlock: 12 }}>
                {cajerosDomingo.map(c => (
                  <label key={c.id}>{c.nombre}
                    <select aria-label={`Última salida de ${c.nombre}`} value={salidasDomingo[c.id] ?? ''} onChange={e => {
                      revisionImportacion.current++
                      const valor = e.target.value
                      setSalidasDomingo(prev => ({ ...prev, [c.id]: valor }))
                      setAntecedenteDomingo(null)
                      setErrorAntecedente(null)
                    }}>
                      <option value="">Sin confirmar</option>
                      <option value="franco">Franco</option>
                      {Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`)
                        .map(hora => <option key={hora} value={hora}>{hora}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <button type="button" onClick={() => {
                try {
                  setAntecedenteDomingo(leerAntecedenteDomingo({
                    sucursal, lunes: lunesSemana, domingo: domingoAnteriorISO(lunesSemana),
                    finPorId: Object.fromEntries(cajerosDomingo.map(c => [c.id, salidasDomingo[c.id] === 'franco' ? null : salidasDomingo[c.id]])),
                  }, lunesSemana, cajerosDomingo, sucursal))
                  setErrorAntecedente(null)
                } catch (err) {
                  setErrorAntecedente(err instanceof Error ? err.message : 'No se pudo confirmar el domingo.')
                }
              }} style={{ padding: '8px 16px', borderRadius: '100px', border: '1px solid var(--border)', background: 'var(--card)', fontWeight: 600, cursor: 'pointer' }}>Confirmar horarios del domingo</button>
              {!antecedenteDomingo && (
                <p style={{ fontSize: '13px', color: 'var(--warning)', marginTop: '8px' }}>
                  Si no lo confirmás, el horario queda sin verificar el descanso del lunes.
                </p>
              )}
            </div>
          )}

          {cargandoDotacion && <p role="status">Cargando dotación…</p>}
          {errorDotacion && <p role="alert">No se pudo cargar la dotación. Recargá la página antes de generar.</p>}
          {disponibilidad && (
            <DisponibilidadSemana
              key={fechasSemana[0]}
              fechas={fechasSemana}
              personas={[
                ...disponibilidad.auxiliares.map(a => ({ ...a, tipo: 'AUX' as const })),
                ...disponibilidad.eventuales.map(e => ({ ...e, tipo: 'EVENTUAL' as const })),
              ]}
              origen={disponibilidad.origen}
              excepciones={excepcionesDeLaSemana}
              huecos={disponibilidad.huecosSupervision}
              errores={disponibilidad.errores}
              autorSesion={autorSesion}
              onAgregar={x => setExcepcionesDisponibilidad(prev => [...prev, x])}
              onQuitar={(id, fecha) => setExcepcionesDisponibilidad(prev => prev.filter(x => x.colaboradorId !== id || x.fecha !== fecha))}
            />
          )}

          <div style={{
            background: 'var(--card)',
            borderRadius: '16px',
            border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
            padding: '32px',
          }}>
            {conflictosReglas.length > 0 && (
              <div role="alert" style={{ marginBottom: '16px', padding: '12px 16px', borderRadius: '12px', background: 'var(--warning-bg)', color: '#78350f', fontSize: '14px' }}>
                <strong>Algunas reglas no se pueden cumplir del todo:</strong>
                <ul style={{ margin: '4px 0 0', paddingLeft: '18px' }}>{conflictosReglas.map((c, k) => <li key={k}>{c}</li>)}</ul>
              </div>
            )}
            {/* Sección de excepciones semanales */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{
                  fontSize: '20px',
                  fontWeight: 800,
                  fontFamily: "'Syne', sans-serif",
                  color: 'var(--text)',
                  letterSpacing: '-0.5px',
                }}>
                  Cambios de cajeros esta semana (opcional)
                </h3>
                <button
                  onClick={() => setMostrarExcepciones(!mostrarExcepciones)}
                  style={{
                    color: 'var(--accent-strong)',
                    background: 'none',
                    border: 'none',
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 500,
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  {mostrarExcepciones ? 'Ocultar' : 'Agregar excepción'}
                </button>
              </div>

              {mostrarExcepciones && (
                <div style={{
                  marginBottom: '24px',
                  padding: '20px',
                  border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
                  borderRadius: '12px',
                  background: 'var(--surface)',
                }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '16px',
                    marginBottom: '16px',
                  }}>
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: 'var(--text)',
                        marginBottom: '8px',
                      }}>
                        Colaborador
                      </label>
                      <select
                        value={colaboradorSeleccionado}
                        onChange={(e) => setColaboradorSeleccionado(e.target.value)}
                        style={{
                          width: '100%',
                          border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
                          borderRadius: '12px',
                          padding: '12px 16px',
                          background: 'var(--card)',
                          color: 'var(--text)',
                          fontFamily: "'Space Grotesk', sans-serif",
                          fontSize: '14px',
                        }}
                      >
                        <option value="">Seleccionar...</option>
                        {colaboradoresActivos.map(col => (
                          <option key={col.id} value={col.id}>{col.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: 'var(--text)',
                        marginBottom: '8px',
                      }}>
                        Tipo de excepción
                      </label>
                      <select
                        value={tipoSeleccionado}
                        onChange={(e) => {
                          setTipoSeleccionado(e.target.value as ExcepcionSemanal['tipo'])
                          setValorInput('')
                        }}
                        style={{
                          width: '100%',
                          border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
                          borderRadius: '12px',
                          padding: '12px 16px',
                          background: 'var(--card)',
                          color: 'var(--text)',
                          fontFamily: "'Space Grotesk', sans-serif",
                          fontSize: '14px',
                        }}
                      >
                        <option value="franco_dia">Franco en día específico</option>
                        <option value="no_antes_de">No disponible antes de cierta hora</option>
                        <option value="no_despues_de">No disponible después de cierta hora</option>
                        <option value="siempre_cierre">Siempre hacer cierre (turno hasta 22:30)</option>
                        <option value="solo_matutino">Solo turno matutino (terminar antes de las 15:00)</option>
                        <option value="solo_nocturno">Solo turno nocturno (empezar después de las 17:00)</option>
                      </select>
                    </div>
                    <div>
                      {(tipoSeleccionado === 'franco_dia' || tipoSeleccionado === 'no_antes_de' || tipoSeleccionado === 'no_despues_de') && (
                        <>
                          <label style={{
                            display: 'block',
                            fontSize: '14px',
                            fontWeight: 600,
                            color: 'var(--text)',
                            marginBottom: '8px',
                          }}>
                            {tipoSeleccionado === 'franco_dia' ? 'Día de la semana' : 'Hora (HH:MM)'}
                          </label>
                          {tipoSeleccionado === 'franco_dia' ? (
                            <select
                              value={valorInput}
                              onChange={(e) => setValorInput(e.target.value)}
                              style={{
                                width: '100%',
                                border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
                                borderRadius: '12px',
                                padding: '12px 16px',
                                background: 'var(--card)',
                                color: 'var(--text)',
                                fontFamily: "'Space Grotesk', sans-serif",
                                fontSize: '14px',
                              }}
                            >
                              <option value="">Seleccionar...</option>
                              {DIAS_SEMANA.map(dia => (
                                <option key={dia} value={dia}>{dia}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="time"
                              value={valorInput}
                              onChange={(e) => setValorInput(e.target.value)}
                              style={{
                                width: '100%',
                                border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
                                borderRadius: '12px',
                                padding: '12px 16px',
                                background: 'var(--card)',
                                color: 'var(--text)',
                                fontFamily: "'Space Grotesk', sans-serif",
                                fontSize: '14px',
                              }}
                              step="300"
                            />
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={agregarExcepcion}
                      style={{
                        background: 'var(--accent)',
                        color: 'var(--accent-dark)',
                        padding: '12px 24px',
                        borderRadius: '100px',
                        border: 'none',
                        fontFamily: "'Syne', sans-serif",
                        fontWeight: 800,
                        fontSize: '14px',
                        letterSpacing: '-0.2px',
                        display: 'flex',
                        alignItems: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ marginRight: '8px' }}>+</span>
                      Agregar
                    </button>
                  </div>
                </div>
              )}

              {/* Lista de excepciones agregadas */}
              {excepciones.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {excepciones.map(exc => (
                      <div
                        key={exc.id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          background: 'var(--surface)',
                          color: 'var(--accent-strong)',
                          borderRadius: '100px',
                          padding: '8px 16px',
                          fontSize: '14px',
                        }}
                      >
                        <span>{exc.descripcion}</span>
                        <button
                          onClick={() => eliminarExcepcion(exc.id)}
                          style={{
                            marginLeft: '8px',
                            color: 'var(--accent-strong)',
                            background: 'none',
                            border: 'none',
                            fontSize: '18px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <p style={{
                    fontSize: '14px',
                    color: 'var(--text-muted)',
                    marginTop: '8px',
                  }}>
                    {excepciones.length} / 10 excepciones agregadas
                  </p>
                </div>
              )}
            </div>

            {/* Defensa en profundidad: nunca generar contra demanda vacía
                (el parser ya lo bloquea, pero por si llega estado inválido) */}
            {horasNecesariasEstimadas === 0 && (
              <p style={{
                marginTop: '24px', padding: '12px 16px', borderRadius: '12px',
                background: 'var(--danger-bg)', color: 'var(--danger)',
                fontSize: '14px', fontWeight: 600,
              }}>
                ⚠ No se encontró la tabla de necesidad de cajas en el PDF. Verificá que el archivo sea correcto.
              </p>
            )}
            <details style={{ marginTop: '24px' }}>
              <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px' }}>Opciones de esta generación</summary>
              <div style={{ display: 'grid', gap: '16px', marginTop: '12px' }}>
                <div style={{ fontSize: '14px' }}>
                  <p style={{ margin: 0 }}>Se aplican {reglasActivas.length === 1 ? '1 regla' : `${reglasActivas.length} reglas`} de tu Configuración{frasesPreferencias.length + criteriosActivos.length > 0 ? ' y lo que la app aprendió de tus correcciones:' : '.'}</p>
                  {frasesPreferencias.length + criteriosActivos.length > 0 && (
                    <ul style={{ margin: '4px 0 0', paddingLeft: '18px', color: 'var(--text-muted)' }}>
                      {frasesPreferencias.map((f, k) => <li key={`p${k}`}>{f}</li>)}
                      {criteriosActivos.map((c, k) => <li key={`c${k}`}>{c.descripcion}</li>)}
                    </ul>
                  )}
                </div>
                {fechasSemana.length > 0 && (
            <div data-testid="reglas-efectivas" style={{ color: 'var(--text)', fontSize: '14px' }}>
              <p style={{ fontWeight: 600, margin: '0 0 6px' }}>Configuración que se aplica esta semana</p>
              <ul style={{ fontSize: '13px' }}>
                {Object.entries(resolucionOperativaDeReglas(reglas, fechasSemana[0])).map(([tipo, r]) => (
                  <li key={tipo} data-testid={`regla-efectiva-${tipo}`}>
                    <strong>{ETIQUETAS_OPERATIVAS[tipo as keyof typeof ETIQUETAS_OPERATIVAS].titulo}:</strong>{' '}
                    {r.valor ? 'sí' : 'no'}{' '}
                    <span style={{ color: 'var(--text-muted)' }}>({r.origen === 'regla' ? 'según tu Configuración' : 'predeterminado'})</span>
                    {r.conflicto && <span role="alert" style={{ display: 'block', color: 'var(--danger, #b91c1c)' }}>{r.conflicto}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

              <label style={{ display: 'block', marginTop: '12px', fontSize: '14px', fontWeight: 600 }}>
                <input data-testid="modo-prueba" type="checkbox" checked={modoPrueba} onChange={e => setModoPrueba(e.target.checked)} />
                {' '}Modo prueba: no guardar horario ni correcciones en el historial
              </label>
            {hibridoDisponible&&<section aria-label="Motor de horarios" style={{marginTop:24}}>
              <label><input type="checkbox" checked={motorAnterior} disabled={loadingAsignacion} onChange={e=>setMotorAnterior(e.target.checked)}/> Usar motor anterior para esta generación</label>
              {!motorAnterior&&errorConfigHibrida&&<p role="alert">{errorConfigHibrida}</p>}
              {!motorAnterior&&fuenteConfigHibrida&&<p className="nota">Configuración del motor: {fuenteConfigHibrida==='persistida'?'reglas guardadas de la sucursal (permanentes y excepciones vigentes esta semana).':'configuración del servicio (transición: esta sucursal todavía no importó ni guardó su configuración).'}</p>}
              {!motorAnterior&&topesMostrados&&<details><summary>Máximos semanales de caja EVENTUAL</summary><p>Se cargan desde la configuración de la sucursal. Los cambios de abajo se aplican solo a esta generación; para cambiarlos de forma permanente o por un período, usá Reglas → Configuración del motor.</p>
                {(['FULL','PART'] as const).map(k=><fieldset key={k}><legend>EVENTUAL {k}</legend>
                  <label><input type="checkbox" checked={topesMostrados[k].activo} disabled={loadingAsignacion} onChange={e=>setTopesHibridos({...topesMostrados,[k]:{...topesMostrados[k],activo:e.target.checked}})}/> Aplicar máximo</label>
                  <label>Horas semanales<input type="number" min="0" max="84" step="0.5" value={topesMostrados[k].horas??''} disabled={loadingAsignacion||!topesMostrados[k].activo} onChange={e=>setTopesHibridos({...topesMostrados,[k]:{...topesMostrados[k],horas:e.target.value===''?null:Number(e.target.value)}})}/></label>
                </fieldset>)}
              </details>}
            </section>}
              </div>
            </details>
            {errorAsignacion && <p role="alert" style={{ color: 'var(--danger)' }}>{errorAsignacion}</p>}
            {loadingAsignacion && (
              <p role="status" style={{ color: 'var(--text-muted)' }}>
                {progreso || (modoCompatible
                  ? 'Modo compatible: la pantalla puede pausarse mientras se calcula el horario.'
                  : 'Aliada está generando el horario…')}
              </p>
            )}
            <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
              {loadingAsignacion && (
                <button type="button" className="btn-secondary" onClick={cancelarGeneracion}>
                  Cancelar generación
                </button>
              )}
              <button
                onClick={handleGenerarHorarios}
                disabled={generacionDeshabilitada || horasNecesariasEstimadas === 0}
                style={{
                  background: 'var(--accent)',
                  color: 'var(--accent-dark)',
                  padding: '16px 32px',
                  borderRadius: '100px',
                  border: 'none',
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: 800,
                  fontSize: '16px',
                  letterSpacing: '-0.2px',
                  display: 'flex',
                  alignItems: 'center',
                  cursor: (generacionDeshabilitada || horasNecesariasEstimadas === 0) ? 'not-allowed' : 'pointer',
                  opacity: (generacionDeshabilitada || horasNecesariasEstimadas === 0) ? 0.5 : 1,
                }}
              >
                {loadingAsignacion ? (
                  <>
                    <span style={{ marginRight: '8px', animation: 'spin 1s linear infinite' }}>⟳</span>
                    Generando…
                  </>
                ) : (
                  <>
                    Generar horarios automáticamente
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paso 3: Resultado */}
      {paso === 'resultado' && resultado && (
        <div data-testid="resultado-generacion" style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{
                fontSize: '32px',
                fontWeight: 800,
                fontFamily: "'Syne', sans-serif",
                color: 'var(--text)',
                margin: 0,
                letterSpacing: '-0.5px',
              }}>
                Horarios generados
              </h2>
              <p style={{
                color: 'var(--text-muted)',
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '16px',
                marginTop: '4px',
              }}>
                {semanaDesc}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '16px' }}>
              <button
                onClick={handleNuevaSemana}
                style={{
                  padding: '12px 24px',
                  border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
                  borderRadius: '12px',
                  background: 'var(--card)',
                  color: 'var(--text)',
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Nueva semana
              </button>
              <button
                onClick={handleExportarPDF}
                style={{
                  background: 'var(--accent)',
                  color: 'var(--accent-dark)',
                  padding: '12px 24px',
                  borderRadius: '100px',
                  border: 'none',
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: 800,
                  fontSize: '14px',
                  letterSpacing: '-0.2px',
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
              >
                Exportar a PDF
              </button>
            </div>
          </div>

          {!semanaGuardadaId && (
            <p data-testid="resultado-prueba" role="status" style={{ fontWeight: 700, color: 'var(--text)' }}>
              {modoPrueba ? 'PRUEBA NO GUARDADA' : 'BORRADOR NO GUARDADO'}: este horario no se guardó en Horarios.
            </p>
          )}
          {errorAsignacion && (
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
              borderRadius: '12px',
              padding: '20px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ color: 'var(--accent-strong)', marginRight: '8px' }}>❌</span>
                <p style={{ color: 'var(--text)' }}>{errorAsignacion}</p>
              </div>
            </div>
          )}

          {resumenResultado && (
            <Tarjeta etiqueta="Resumen de la semana"><ResumenCobertura resumen={resumenResultado} /></Tarjeta>
          )}

          {validacion && (() => {
            const e = estadoSupervisor(validacion)
            return (
              <section data-testid="estado-validacion" aria-label="Estado del horario" style={{
                borderRadius: '16px', padding: '14px 20px', fontSize: '14px',
                background: e.listo ? 'var(--success-bg)' : 'var(--warning-bg)', color: e.listo ? '#14532d' : '#78350f',
                border: `1px solid ${e.listo ? '#86efac' : '#fcd34d'}`,
              }}>
                <p style={{ margin: 0, fontWeight: 700 }}>{e.titulo}</p>
                {e.items.length > 0 && (
                  <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                    {e.items.slice(0, 20).map((t, i) => <li key={i}>{t}</li>)}
                    {e.items.length > 20 && <li>… y {e.items.length - 20} más (ver PDF).</li>}
                  </ul>
                )}
              </section>
            )
          })()}

          {tablasVisibles >= 1 && necesidad.length > 0 && (
            <CoberturaLive
              necesidadFranjas={necesidad.map(f => f.necesidad)}
              horarios={resultado.horarios}
              cajaAux={resultado.cajaAux}
            />
          )}

          {tablasVisibles >= 2 && (
            <div data-testid="horarios-completos" style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 450px' }}>
              <TablaHorarios
                horarios={resultado.horarios}
                colaboradores={colaboradoresActivos}
                auxiliares={auxiliaresActivos}
                eventuales={eventualesActivos}
                editable
                onEditarJornada={handleEditarJornada}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}