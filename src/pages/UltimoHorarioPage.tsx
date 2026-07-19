import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { JornadaResumida, ResultadoAsignacion } from '../types'
import { useHistorial } from '../hooks/useHistorial'
import { useColaboradores } from '../hooks/useColaboradores'
import { useAuxiliares } from '../hooks/useAuxiliares'
import { useEventuales } from '../hooks/useEventuales'
import { useCorrecciones } from '../hooks/useCorrecciones'
import { aplicarEdicionJornada } from '../hooks/useAsignacion'
import { resumirTurnos } from '../utils/preferencias'
import { generarPDF } from '../utils/exportPDF'
import { recalcularCajaAux } from '../utils/recalculoAux'
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

  // PDF con el estado ACTUAL de la semana (ediciones incluidas), reusando el
  // snapshot de cobertura/CAJA guardado al generar (si existe).
  const handleExportarPDF = () => {
    if (!ultimaSemana) return
    const resultado: ResultadoAsignacion = {
      horarios: ultimaSemana.horarios,
      coberturaFranjas: ultimaSemana.coberturaFranjas ?? [],
      faltantesFranjas: ultimaSemana.faltantesFranjas ?? [],
      alertas: [],
      porcentajeCobertura: ultimaSemana.porcentajeCobertura ?? 0,
      cajaAux: ultimaSemana.cajaAux,
      cajaEventual: ultimaSemana.cajaEventual,
    }
    const pdf = generarPDF(resultado, colaboradoresActivos, ultimaSemana.descripcion, auxiliaresActivos, eventualesActivos)
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

    // Aplicar la edición y persistir la semana actualizada (Supabase + localStorage)
    const horarios = aplicarEdicionJornada(ultimaSemana.horarios, colaboradorId, dia, nueva)

    // Si se editó la PRESENCIA de un AUX, el snapshot de sus bloques en CAJA
    // queda obsoleto: re-ejecutar la lógica de Pasada 2 sobre el horario
    // modificado. Si el recálculo no es posible (sin necesidad del PDF o la
    // presencia editada rompe precondiciones duras), se conserva el previo.
    const filaEditada = ultimaSemana.horarios.find(h => h.colaboradorId === colaboradorId)
    let cajaAux = ultimaSemana.cajaAux
    if (filaEditada?.rolGeneral === 'aux_supervisor' && necesidadFranjas) {
      const recalculada = recalcularCajaAux(horarios, necesidadFranjas, nombrePorId)
      if (recalculada) cajaAux = recalculada
      else console.warn('No se pudo recalcular CAJA de AUX; se conserva el snapshot previo.')
    }

    actualizarSemana(ultimaSemana.id, {
      horarios,
      cajaAux,
      resumenPorColaborador: resumirTurnos(horarios, nombrePorId),
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
