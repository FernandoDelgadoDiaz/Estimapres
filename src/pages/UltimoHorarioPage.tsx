import { validarResultadoSemana, estadoValidacion } from '../utils/validacionSemana'
import { useReglas } from '../hooks/useReglas'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
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
 * Muestra el último horario generado (la semana más reciente del historial,
 * persistida en Supabase + localStorage) y permite seguir editándolo aunque
 * se haya cerrado la pantalla de generación. Las ediciones se registran como
 * correcciones (Capacidad 3) y actualizan la semana guardada.
 */
export default function UltimoHorarioPage() {
  const { historial, loading, actualizarSemana } = useHistorial()
  const { colaboradoresActivos } = useColaboradores()
  const { auxiliaresActivos } = useAuxiliares()
  const { eventualesActivos } = useEventuales()
  const { agregarCorreccion } = useCorrecciones()
  const { reglas } = useReglas()

  // La semana generada más recientemente (por fecha de generación, no por lunes:
  // regenerar una semana vieja también debe aparecer acá como "último horario").
  const ultimaSemana = useMemo(() => {
    if (historial.length === 0) return null
    return [...historial].sort((a, b) => b.generadoEl.localeCompare(a.generadoEl))[0]
  }, [historial])

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
      coberturaFranjas: editado.coberturaFranjas,
      faltantesFranjas: editado.faltantesFranjas,
      porcentajeCobertura: editado.porcentajeCobertura,
      resumenPorColaborador: resumirTurnos(editado.horarios, nombrePorId),
      editadoManualmente: true,
    })
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div>
        <h1 style={{ fontSize: '36px', fontWeight: 800, fontFamily: "'Syne', sans-serif", color: 'var(--text)', margin: 0, letterSpacing: '-0.5px' }}>
          Último horario
        </h1>
        <p style={{ color: 'var(--text-muted)', fontFamily: "'Space Grotesk', sans-serif", fontSize: '16px', marginTop: '8px' }}>
          El horario generado más reciente, guardado automáticamente. Podés seguir editándolo con clic en una celda.
        </p>
      </div>

      {loading ? (
        <div style={{
          background: 'var(--card)', borderRadius: '16px',
          border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
          padding: '40px', textAlign: 'center',
        }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '16px' }}>⏳ Cargando el último horario…</p>
        </div>
      ) : !ultimaSemana ? (
        <div style={{
          background: 'var(--card)', borderRadius: '16px',
          border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
          padding: '40px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🕒</div>
          <h3 style={{ fontSize: '24px', fontWeight: 800, fontFamily: "'Syne', sans-serif", color: 'var(--text)', marginBottom: '8px', letterSpacing: '-0.5px' }}>
            Todavía no hay horarios generados
          </h3>
          <p style={{ color: 'var(--text-muted)', fontFamily: "'Space Grotesk', sans-serif", fontSize: '16px', marginBottom: '24px' }}>
            Cuando generes un horario en "Nueva Semana" va a quedar guardado acá automáticamente.
          </p>
          <Link
            to="/nueva-semana"
            style={{
              display: 'inline-block', background: 'var(--accent)', color: 'var(--accent-dark)',
              padding: '12px 24px', borderRadius: '100px', textDecoration: 'none',
              fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '14px', letterSpacing: '-0.2px',
            }}
          >
            Generar nueva semana
          </Link>
        </div>
      ) : (
        <>
          <div style={{
            background: 'var(--card)', borderRadius: '16px',
            border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
            padding: '20px 24px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px',
          }}>
            <div style={{ flex: 1, minWidth: '220px' }}>
              <h3 style={{ fontSize: '20px', fontWeight: 800, fontFamily: "'Syne', sans-serif", color: 'var(--text)', margin: 0 }}>
                {ultimaSemana.descripcion}
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Semana del lunes {ultimaSemana.fechaLunes} · versión {ultimaSemana.version} · generado {formatearFechaHora(ultimaSemana.generadoEl)}
                {ultimaSemana.modificadoEl && ` · última modificación ${formatearFechaHora(ultimaSemana.modificadoEl)}`}
              </p>
            </div>
            {ultimaSemana.editadoManualmente && (
              <span style={{
                fontSize: '12px', fontWeight: 600, padding: '6px 14px', borderRadius: '100px',
                background: 'var(--warning-bg)', color: 'var(--warning)',
              }}>
                ✏️ Con ediciones manuales
              </span>
            )}
            <Link
              to="/historial"
              style={{
                padding: '10px 20px', border: '1px solid var(--border)', borderRadius: '100px',
                background: 'var(--card)', color: 'var(--text)', textDecoration: 'none',
                fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: '13px',
              }}
            >
              Ver historial completo
            </Link>
            <button
              onClick={handleExportarPDF}
              style={{
                background: 'var(--accent)', color: 'var(--accent-dark)',
                padding: '10px 20px', borderRadius: '100px', border: 'none',
                fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '13px',
                letterSpacing: '-0.2px', cursor: 'pointer',
              }}
            >
              📄 Exportar PDF
            </button>
          </div>

          {/* Cobertura en tiempo real: el supervisor ve al instante si su
              edición mejora o empeora la cobertura vs. el PDF */}
          {necesidadFranjas && (
            <CoberturaLive
              necesidadFranjas={necesidadFranjas}
              horarios={ultimaSemana.horarios}
              cajaAux={ultimaSemana.cajaAux}
              aproximado={!ultimaSemana.necesidadFranjas}
            />
          )}

          <section data-testid="estado-validacion" aria-label="Estado de validación" style={{
            background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)', padding: '16px 24px',
            color: validacion?.publicable ? 'var(--text)' : 'var(--danger, #b91c1c)',
          }}>
            <p style={{ fontWeight: 700 }}>
              {validacion ? `${validacion.publicable ? '✅' : '⛔'} ${estadoValidacion(validacion)}` : '⛔ SIN VERIFICAR: la semana no tiene datos de demanda para validar'}
            </p>
            {operativa && (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Apertura solo AUX: {operativa.aperturaSoloAux ? 'activada' : 'desactivada'} · Sin AUX en caja al cierre: {operativa.sinAuxCierre ? 'activada' : 'desactivada'} · Supervisor de jornada completa: {operativa.supervisorJornadaCompleta ? 'activada' : 'desactivada'}
                {!ultimaSemana.configOperativa && ' (semana generada antes de registrar su configuración: se usan las reglas vigentes)'}
              </p>
            )}
            {!!validacion?.violaciones.length && (
              <ul style={{ marginTop: '8px', fontSize: '13px' }}>
                {validacion.violaciones.slice(0, 30).map((v, i) => <li key={i}>[{v.nivel}] {v.detalle}</li>)}
              </ul>
            )}
          </section>

          {!!avisosHoras.length && (
            <section aria-label="Avisos de horas semanales" className="mb-4 rounded border border-amber-300 bg-amber-50 p-4 text-amber-950">
              <strong>Revisá las horas semanales</strong>
              <ul className="list-disc pl-5">{avisosHoras.map(aviso => <li key={aviso}>{aviso}</li>)}</ul>
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
        </>
      )}
    </div>
  )
}

function formatearFechaHora(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
