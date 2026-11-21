import { validarResultadoSemana, estadoValidacion } from '../utils/validacionSemana'
import { useReglas } from '../hooks/useReglas'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { necesidadDeSemana, rangoSemana, resumirHorarios, semanasParaConsultar } from '../utils/resumenSemana'
import { Boton, Pagina, ResumenCobertura, Tarjeta } from '../components/ui/Basicos'
import { HORAS_FRANJAS, JornadaResumida, ResultadoAsignacion } from '../types'
import { useHistorial } from '../hooks/useHistorial'
import { useColaboradores } from '../hooks/useColaboradores'
import { useAuxiliares } from '../hooks/useAuxiliares'
import { useEventuales } from '../hooks/useEventuales'
import { useCorrecciones } from '../hooks/useCorrecciones'
import { aplicarEdicionConRecalculo } from '../hooks/useAsignacion'
import { resumirTurnos, configOperativaDeReglas, reglasAExcepciones, capFrancosDeReglas, demandaMinimaDeReglas } from '../utils/preferencias'
import { generarPDF } from '../utils/exportPDF'
import { esLunesISO, fechasDeSemana } from '../utils/pomContrato'
import { getSucursalActual } from '../utils/sucursal'
import TablaHorarios from '../components/semana/TablaHorarios'
import CoberturaLive from '../components/semana/CoberturaLive'

/**
 * «Horarios» del supervisor: abre en el último horario generado y permite elegir
 * semanas anteriores (última versión de cada lunes). Se puede corregir con clic en
 * una celda: cada corrección se registra para el aprendizaje de preferencias de la
 * sucursal (Capacidad 3) y actualiza la semana guardada. La validación completa
 * corre por detrás; solo se muestra si hay algo que revisar.
 */
export default function HorariosPage() {
  const { historial, loading, actualizarSemana } = useHistorial()
  const { colaboradoresActivos } = useColaboradores()
  const { auxiliaresActivos } = useAuxiliares()
  const { eventualesActivos } = useEventuales()
  const { agregarCorreccion } = useCorrecciones()
  const { reglas } = useReglas()

  // La semana generada más recientemente (por fecha de generación, no por lunes:
  // regenerar una semana vieja también debe aparecer acá como "último horario").
  const semanas = useMemo(() => semanasParaConsultar(historial), [historial])
  const [seleccionId, setSeleccionId] = useState<string | null>(null)
  const ultimaSemana = useMemo(() => {
    if (historial.length === 0) return null
    const elegida = seleccionId ? historial.find(s => s.id === seleccionId) : undefined
    return elegida ?? [...historial].sort((a, b) => b.generadoEl.localeCompare(a.generadoEl))[0]
  }, [historial, seleccionId])
  const opciones = useMemo(() => ultimaSemana && !semanas.some(s => s.id === ultimaSemana.id) ? [ultimaSemana, ...semanas] : semanas, [semanas, ultimaSemana])

  // Incluye AUX y eventuales: sus filas también se muestran y editan acá.
  const nombrePorId = useMemo(
    () => Object.fromEntries([
      ...colaboradoresActivos.map(c => [c.id, c.nombre] as const),
      ...auxiliaresActivos.map(a => [a.id, a.nombre] as const),
      ...eventualesActivos.map(e => [e.id, e.nombre] as const),
    ]),
    [colaboradoresActivos, auxiliaresActivos, eventualesActivos]
  )

  // Necesidad del PDF para el panel de cobertura en vivo. Semanas guardadas
  // antes de esta versión no tienen necesidadFranjas: se aproxima con
  // cobertura + faltantes del snapshot (subestima la sobrecobertura).
  const necesidadFranjas = useMemo(() => {
    if (!ultimaSemana) return null
    if (ultimaSemana.necesidadFranjas) return ultimaSemana.necesidadFranjas
    const cob = ultimaSemana.coberturaFranjas
    const falt = ultimaSemana.faltantesFranjas
    if (!cob || !falt) return null
    return cob.map((fila, fi) => fila.map((x, dia) => x + (falt[fi]?.[dia] ?? 0)))
  }, [ultimaSemana])

  // #38: configuración operativa con la que se generó la semana (o, si es una
  // semana anterior a #38, la vigente hoy para ese lunes — se indica en pantalla).
  const operativa = useMemo(() => {
    if (!ultimaSemana) return null
    return ultimaSemana.configOperativa ?? configOperativaDeReglas(reglas, ultimaSemana.fechaLunes)
  }, [ultimaSemana, reglas])

  const resultadoActual = useMemo<ResultadoAsignacion | null>(() => ultimaSemana ? {
    horarios: ultimaSemana.horarios,
    coberturaFranjas: ultimaSemana.coberturaFranjas ?? [],
    faltantesFranjas: ultimaSemana.faltantesFranjas ?? [],
    alertas: [],
    porcentajeCobertura: ultimaSemana.porcentajeCobertura ?? 0,
    cajaAux: ultimaSemana.cajaAux,
    cajaEventual: ultimaSemana.cajaEventual,
    eventualesFijos: ultimaSemana.eventualesFijos,
    cumplimientoHoras: ultimaSemana.cumplimientoHoras,
    hibrido: ultimaSemana.hibrido,
    condicionesSupervisor: ultimaSemana.condicionesSupervisor,
  } : null, [ultimaSemana])

  // #38: semanas históricas sin los datos necesarios → nunca VALIDADO; se explica qué falta.
  const limitaciones = useMemo(() => !ultimaSemana ? [] : [
    !ultimaSemana.configOperativa && 'La semana no registró su configuración operativa: se revisó con las reglas vigentes hoy.',
    !ultimaSemana.disponibilidadSemana && 'La semana no registró la disponibilidad resuelta de AUX y eventuales: no se puede verificar que los eventuales estén dentro de su disponibilidad.',
    !ultimaSemana.necesidadFranjas && 'La demanda del POM no se guardó: se reconstruyó en forma aproximada desde la cobertura.',
  ].filter((x): x is string => !!x), [ultimaSemana])

  // #38: validación COMPLETA (no solo horas) tras cada edición y antes de exportar.
  const validacion = useMemo(() => {
    if (!ultimaSemana || !resultadoActual || !necesidadFranjas || !operativa) return null
    const disp = ultimaSemana.disponibilidadSemana
    const conDisp = <T extends { id: string; horarioSemanal: string[] }>(p: T): T => (disp?.[p.id] ? { ...p, horarioSemanal: disp[p.id] } : p)
    return validarResultadoSemana(
      resultadoActual, colaboradoresActivos, auxiliaresActivos.map(conDisp), eventualesActivos.map(conDisp),
      {
        necesidad: HORAS_FRANJAS.map((hora, fi) => ({ hora, necesidad: necesidadFranjas[fi] ?? Array(7).fill(0) })),
        excepciones: reglasAExcepciones(reglas, ultimaSemana.fechaLunes),
        maxFrancosDia: capFrancosDeReglas(reglas, ultimaSemana.fechaLunes),
        minimosCajeros: demandaMinimaDeReglas(reglas, ultimaSemana.fechaLunes),
        operativa,
        omitirDisponibilidadEventual: !disp,
        limitaciones,
        // #7: cada semana se valida con el perfil de horas con que se generó: sin id →
        // histórico (PART ≤ 31 h); id desconocido → limitación, nunca VALIDADO.
        perfilHorasId: ultimaSemana.perfilHorasId,
      },
    )
  }, [ultimaSemana, resultadoActual, necesidadFranjas, operativa, colaboradoresActivos, auxiliaresActivos, eventualesActivos, reglas, limitaciones])
  const avisosHoras = validacion?.advertencias ?? []

  // PDF con el estado ACTUAL de la semana (ediciones incluidas), reusando el
  // snapshot de cobertura/CAJA guardado al generar (si existe).
  const handleExportarPDF = () => {
    if (!ultimaSemana) return
    if (!resultadoActual) return
    const resultado: ResultadoAsignacion = { ...resultadoActual, alertas: avisosHoras }
    const pdf = generarPDF(resultado, colaboradoresActivos, ultimaSemana.descripcion, auxiliaresActivos, eventualesActivos, {
      sucursal: getSucursalActual(),
      fechas: esLunesISO(ultimaSemana.fechaLunes) ? fechasDeSemana(ultimaSemana.fechaLunes) : undefined,
      version: ultimaSemana.version,
      necesidadFranjas: ultimaSemana.necesidadFranjas,
      // Presencia registrada al generar; semanas históricas sin ella → «Presencia no registrada».
      presencia: ultimaSemana.disponibilidadSemana,
      // #38: el PDF lleva el estado real; si hay violaciones sale como BORRADOR.
      validacion: validacion ?? undefined,
      estado: validacion ? estadoValidacion(validacion) : 'SIN VERIFICAR: la semana no tiene datos de demanda para validar',
    })
    pdf.save(`horarios-${ultimaSemana.descripcion.toLowerCase().replace(/ /g, '-')}.pdf`)
  }

  const handleEditarJornada = (colaboradorId: string, dia: number, nueva: JornadaResumida) => {
    if (!ultimaSemana) return
    const jornadaAnterior = ultimaSemana.horarios
      .find(h => h.colaboradorId === colaboradorId)
      ?.jornadas.find(j => j.dia === dia)
    if (!jornadaAnterior) return

    // Registrar la corrección para el aprendizaje (Capacidad 3)
    agregarCorreccion({
      semanaId: ultimaSemana.id,
      colaboradorNombre: nombrePorId[colaboradorId] ?? colaboradorId,
      dia,
      antes: { esFranco: jornadaAnterior.esFranco, turnos: jornadaAnterior.turnos },
      despues: nueva,
    })

    // Aplicar la edición y recalcular la cascada (#38): CAJA de AUX, eventuales no
    // fijados a mano, cobertura y faltantes, con la configuración de la semana.
    // Sin demanda conocida solo se aplica la edición (la validación lo informa).
    if (!resultadoActual) return
    const editado = aplicarEdicionConRecalculo(
      resultadoActual, colaboradorId, dia, nueva, nombrePorId[colaboradorId] ?? colaboradorId,
      necesidadFranjas && operativa
        ? { necesidadFranjas, operativa, nombrePorId, disponibilidad: ultimaSemana.disponibilidadSemana }
        : undefined,
    )

    actualizarSemana(ultimaSemana.id, {
      horarios: editado.horarios,
      cajaAux: editado.cajaAux,
      cajaEventual: editado.cajaEventual,
      eventualesFijos: editado.eventualesFijos,
      cumplimientoHoras: editado.cumplimientoHoras, // #7: nunca se conserva el cumplimiento previo a la edición
      coberturaFranjas: editado.coberturaFranjas,
      faltantesFranjas: editado.faltantesFranjas,
      porcentajeCobertura: editado.porcentajeCobertura,
      resumenPorColaborador: resumirTurnos(editado.horarios, nombrePorId),
      editadoManualmente: true,
    })
  }

  const resumen = useMemo(() => {
    if (!ultimaSemana) return null
    const n = necesidadDeSemana(ultimaSemana)
    return n ? resumirHorarios(ultimaSemana.horarios, n.necesidad, ultimaSemana.cajaAux) : null
  }, [ultimaSemana])
  const problemas = validacion?.violaciones ?? []

  return (
    <Pagina
      titulo="Horarios"
      descripcion="Consultá, corregí y exportá los horarios generados. Tus correcciones se guardan y ayudan a mejorar los próximos."
      acciones={ultimaSemana ? <>
        {opciones.length > 1 && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>
            Semana
            <select
              aria-label="Elegir semana"
              value={ultimaSemana.id}
              onChange={e => setSeleccionId(e.target.value)}
              style={{ padding: '9px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', fontSize: '14px', color: 'var(--text)' }}
            >
              {opciones.map(s => <option key={s.id} value={s.id}>{rangoSemana(s.fechaLunes)}</option>)}
            </select>
          </label>
        )}
        <Boton onClick={handleExportarPDF}>Exportar PDF</Boton>
      </> : undefined}
    >
      {loading ? (
        <Tarjeta><p style={{ margin: 0, color: 'var(--text-muted)' }}>Cargando horarios…</p></Tarjeta>
      ) : !ultimaSemana ? (
        <Tarjeta estilo={{ textAlign: 'center', padding: '48px 24px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 800, fontFamily: "'Syne', sans-serif", margin: '0 0 8px' }}>Todavía no hay horarios generados</h2>
          <p style={{ color: 'var(--text-muted)', margin: '0 0 20px' }}>Cuando generes una semana, va a quedar guardada acá.</p>
          <Link to="/nueva-semana" style={{ display: 'inline-block', background: 'var(--accent)', color: 'var(--accent-dark)', padding: '10px 20px', borderRadius: '100px', textDecoration: 'none', fontWeight: 700 }}>
            Generar horario
          </Link>
        </Tarjeta>
      ) : (
        <>
          <Tarjeta etiqueta="Resumen de la semana">
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 800, fontFamily: "'Syne', sans-serif", margin: 0 }}>{rangoSemana(ultimaSemana.fechaLunes)}</h2>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Generado el {formatearFechaHora(ultimaSemana.generadoEl)}
                {ultimaSemana.editadoManualmente && ultimaSemana.modificadoEl && ` · corregido el ${formatearFechaHora(ultimaSemana.modificadoEl)}`}
              </span>
            </div>
            {resumen
              ? <ResumenCobertura resumen={resumen} />
              : <p style={{ margin: 0, color: 'var(--text-muted)' }}>Esta semana se guardó sin la necesidad de cajas: no se puede calcular la cobertura.</p>}
          </Tarjeta>

          {/* La validación completa corre siempre por detrás; solo se muestra si hay algo para revisar. */}
          {(problemas.length > 0 || avisosHoras.length > 0) && (
            <section data-testid="estado-validacion" aria-label="Para revisar" style={{
              background: 'var(--warning-bg)', borderRadius: '16px', border: '1px solid #fcd34d', padding: '16px 24px', color: '#78350f',
            }}>
              <p style={{ fontWeight: 700, margin: 0 }}>Revisá antes de publicar</p>
              <ul style={{ margin: '8px 0 0', paddingLeft: '18px', fontSize: '14px', display: 'grid', gap: '2px' }}>
                {problemas.slice(0, 20).map((v, i) => <li key={i}>{v.detalle}</li>)}
                {avisosHoras.map(aviso => <li key={aviso}>{aviso}</li>)}
              </ul>
            </section>
          )}

          <TablaHorarios
            horarios={ultimaSemana.horarios}
            colaboradores={colaboradoresActivos}
            auxiliares={auxiliaresActivos}
            eventuales={eventualesActivos}
            editable
            onEditarJornada={handleEditarJornada}
          />

          {necesidadFranjas && (
            <details>
              <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text)', padding: '4px 0 12px' }}>Ver cobertura por franja horaria</summary>
              <CoberturaLive
                necesidadFranjas={necesidadFranjas}
                horarios={ultimaSemana.horarios}
                cajaAux={ultimaSemana.cajaAux}
                aproximado={!ultimaSemana.necesidadFranjas}
              />
            </details>
          )}
        </>
      )}
    </Pagina>
  )
}

function formatearFechaHora(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
