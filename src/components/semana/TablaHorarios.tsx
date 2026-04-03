import { HorarioColaborador, Colaborador, Auxiliar, Eventual, DIAS_SEMANA } from '../../types'
import { formatoTurno } from '../../utils/timeUtils'

interface TablaHorariosProps {
  horarios: HorarioColaborador[]
  colaboradores: Colaborador[]
  auxiliares?: Auxiliar[]
  eventuales?: Eventual[]
}

export default function TablaHorarios({ horarios, colaboradores, auxiliares = [], eventuales = [] }: TablaHorariosProps) {

  const tiposColor: Record<string, { background: string, color: string }> = {
    FULL: { background: 'var(--accent)', color: 'var(--accent-dark)' },
    PART: { background: 'var(--purple)', color: 'var(--bg)' },
    AUX: { background: 'var(--surface)', color: 'var(--accent)' },
    EVENTUAL: { background: 'var(--card)', color: 'var(--text)' },
    cajero: { background: 'var(--surface)', color: 'var(--text)' },
  }

  const rolColor: Record<string, string> = {
    cajero: 'var(--card)',
    aux_supervisor: 'var(--surface)',
    aux_eventual: 'var(--card)',
    eventual_sector: 'var(--surface)',
    franco: 'var(--bg)',
    franco_medio: 'var(--card)',
  }

  if (horarios.length === 0) {
    return (
      <div style={{
        background: 'var(--card)',
        borderRadius: '16px',
        border: '1px solid var(--border)',
        padding: '40px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
        <h3 style={{
          fontSize: '24px',
          fontWeight: 800,
          fontFamily: "'Syne', sans-serif",
          color: 'white',
          marginBottom: '8px',
          letterSpacing: '-0.5px',
        }}>
          No hay horarios generados
        </h3>
        <p style={{
          color: 'var(--text-muted)',
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: '16px',
        }}>
          Genera los horarios primero para ver la asignación por colaborador.
        </p>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--card)',
      borderRadius: '16px',
      border: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '24px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{
          fontSize: '24px',
          fontWeight: 800,
          fontFamily: "'Syne', sans-serif",
          color: 'white',
          letterSpacing: '-0.5px',
        }}>
          Horarios asignados por colaborador
        </h3>
        <p style={{
          color: 'var(--text-muted)',
          fontSize: '12px',
          marginTop: '4px',
        }}>
          {horarios.length} colaboradores con horarios generados
        </p>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--surface)' }}>
            <tr>
              <th style={{
                padding: '8px',
                textAlign: 'left',
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                position: 'sticky',
                left: 0,
                background: 'var(--surface)',
                width: '112px',
              }}>
                Colaborador
              </th>
              <th style={{
                padding: '8px',
                textAlign: 'left',
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                width: '48px',
              }}>
                Tipo
              </th>
              <th style={{
                padding: '8px',
                textAlign: 'center',
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                width: '48px',
              }}>
                Hs
              </th>
              {DIAS_SEMANA.map((dia) => (
                <th
                  key={dia}
                  style={{
                    padding: '8px',
                    textAlign: 'center',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    width: '80px',
                  }}
                >
                  {dia}
                </th>
              ))}
              <th style={{
                padding: '8px',
                textAlign: 'left',
                fontSize: '10px',
                fontWeight: 600,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                width: '96px',
              }}>
                Errores
              </th>
            </tr>
          </thead>
          <tbody>
            {horarios.map((horario) => {
              // Buscar colaborador en este orden: colaboradores -> auxiliares -> eventuales
              const col = colaboradores.find(c => c.id === horario.colaboradorId)
              const aux = auxiliares?.find(a => a.id === horario.colaboradorId)
              const event = eventuales?.find(e => e.id === horario.colaboradorId)

              let nombre = horario.colaboradorId
              let tipo = 'cajero'

              if (col) {
                nombre = col.nombre
                tipo = col.tipo
              } else if (aux) {
                nombre = aux.nombre
                tipo = 'AUX'
              } else if (event) {
                nombre = event.nombre
                tipo = 'EVENTUAL'
              } else {
                // Inferir tipo del rolGeneral si no se encuentra
                if (horario.rolGeneral.includes('aux')) {
                  tipo = 'AUX'
                } else if (horario.rolGeneral.includes('eventual')) {
                  tipo = 'EVENTUAL'
                }
              }
              const tipoStyle = tiposColor[tipo] || tiposColor.FULL

              return (
                <tr key={horario.colaboradorId} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{
                    padding: '8px',
                    whiteSpace: 'nowrap',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: 'white',
                    position: 'sticky',
                    left: 0,
                    background: 'var(--card)',
                  }}>
                    {nombre}
                  </td>
                  <td style={{ padding: '8px', whiteSpace: 'nowrap', width: '48px' }}>
                    <span
                      style={{
                        display: 'inline-flex',
                        padding: '4px 8px',
                        fontSize: '10px',
                        fontWeight: 600,
                        borderRadius: '100px',
                        background: tipoStyle.background,
                        color: tipoStyle.color,
                      }}
                    >
                      {tipo}
                    </span>
                  </td>
                  <td style={{
                    padding: '8px',
                    whiteSpace: 'nowrap',
                    fontSize: '10px',
                    color: 'white',
                    width: '48px',
                    textAlign: 'center',
                  }}>
                    {horario.totalHoras}h
                  </td>
                  {DIAS_SEMANA.map((_, diaIndex) => {
                    const jornada = horario.jornadas[diaIndex]
                    const rol = jornada.rol || (jornada.esFranco ? 'franco' : 'cajero')
                    const bgColor = rolColor[rol] || 'var(--card)'
                    const isFrancoReal = jornada.esFranco || rol === 'franco'
                    return (
                      <td
                        key={diaIndex}
                        style={{
                          padding: '8px',
                          whiteSpace: 'nowrap',
                          fontSize: '10px',
                          width: '80px',
                          textAlign: 'center',
                          color: isFrancoReal ? 'var(--text-muted)' : 'white',
                          fontStyle: isFrancoReal ? 'italic' : 'normal',
                          backgroundColor: bgColor,
                        }}
                      >
                        {isFrancoReal ? 'FRANCO' : formatoTurno(jornada.turnos)}
                      </td>
                    )
                  })}
                  <td style={{ padding: '8px', whiteSpace: 'nowrap', width: '96px' }}>
                    {horario.errores.length > 0 ? (
                      <div style={{ fontSize: '10px', color: 'var(--accent)' }}>
                        {horario.errores.map((err, idx) => (
                          <div key={idx}>• {err}</div>
                        ))}
                      </div>
                    ) : (
                      <span style={{ fontSize: '10px', color: 'var(--accent)' }}>✅ OK</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Leyenda de colores */}
      <div style={{
        padding: '16px 24px',
        borderTop: '1px solid var(--border)',
        background: 'var(--surface)',
      }}>
        <h4 style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text)', marginBottom: '8px' }}>
          Leyenda de roles
        </h4>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
          {Object.entries(rolColor).map(([rol, color]) => (
            <div key={rol} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{
                width: '16px',
                height: '16px',
                borderRadius: '4px',
                marginRight: '8px',
                border: '1px solid var(--border)',
                backgroundColor: color,
              }}></div>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{rol}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}