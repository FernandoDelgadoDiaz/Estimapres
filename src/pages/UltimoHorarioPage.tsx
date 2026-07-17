import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { JornadaResumida } from '../types'
import { useHistorial } from '../hooks/useHistorial'
import { useColaboradores } from '../hooks/useColaboradores'
import { useAuxiliares } from '../hooks/useAuxiliares'
import { useEventuales } from '../hooks/useEventuales'
import { useCorrecciones } from '../hooks/useCorrecciones'
import { aplicarEdicionJornada } from '../hooks/useAsignacion'
import { resumirTurnos } from '../utils/preferencias'
import TablaHorarios from '../components/semana/TablaHorarios'

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

  const nombrePorId = useMemo(
    () => Object.fromEntries(colaboradoresActivos.map(c => [c.id, c.nombre])),
    [colaboradoresActivos]
  )

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
    actualizarSemana(ultimaSemana.id, {
      horarios,
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
                Semana del lunes {ultimaSemana.fechaLunes} · versión {ultimaSemana.version} · generado el {ultimaSemana.generadoEl.slice(0, 10)}
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
          </div>

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
