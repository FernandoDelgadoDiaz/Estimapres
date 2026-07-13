import { useMemo, useState } from 'react'
import { HorarioColaborador, Colaborador, Auxiliar, Eventual, DIAS_SEMANA, JornadaResumida, Turno } from '../../types'
import { formatoTurno } from '../../utils/timeUtils'
import { validarEdicionManual } from '../../utils/preferencias'

interface TablaHorariosProps {
  horarios: HorarioColaborador[]
  colaboradores: Colaborador[]
  auxiliares?: Auxiliar[]
  eventuales?: Eventual[]
  /** Habilita la edición manual de celdas (Capacidad 3: aprendizaje de correcciones). */
  editable?: boolean
  onEditarJornada?: (colaboradorId: string, dia: number, nueva: JornadaResumida) => void
}

interface CeldaEnEdicion {
  colaboradorId: string
  nombre: string
  dia: number
}

function padHora(hora: string): string {
  const [h, m] = hora.split(':')
  return `${h.padStart(2, '0')}:${(m || '00').padStart(2, '0')}`
}

export default function TablaHorarios({ horarios, colaboradores, auxiliares = [], eventuales = [], editable = false, onEditarJornada }: TablaHorariosProps) {
  const [editando, setEditando] = useState<CeldaEnEdicion | null>(null)
  const [editEsFranco, setEditEsFranco] = useState(false)
  const [editTurnos, setEditTurnos] = useState<Turno[]>([{ inicio: '09:00', fin: '17:00' }])

  const abrirEditor = (colaboradorId: string, nombre: string, dia: number) => {
    const horario = horarios.find(h => h.colaboradorId === colaboradorId)
    const jornada = horario?.jornadas[dia]
    setEditando({ colaboradorId, nombre, dia })
    setEditEsFranco(jornada?.esFranco ?? false)
    setEditTurnos(
      jornada && jornada.turnos.length > 0
        ? jornada.turnos.map(t => ({ inicio: padHora(t.inicio), fin: padHora(t.fin) }))
        : [{ inicio: '09:00', fin: '17:00' }]
    )
  }

  // Validación en tiempo real de la edición contra las reglas duras.
  const avisosValidacion = useMemo(() => {
    if (!editando) return []
    const horario = horarios.find(h => h.colaboradorId === editando.colaboradorId)
    if (!horario) return []
    const tipo = colaboradores.find(c => c.id === editando.colaboradorId)?.tipo ?? 'FULL'
    const semana: JornadaResumida[] = Array.from({ length: 7 }, (_, d) => {
      const j = horario.jornadas.find(x => x.dia === d)
      return { esFranco: j?.esFranco ?? false, turnos: j?.turnos ?? [] }
    })
    const jornadaEditada: JornadaResumida = { esFranco: editEsFranco, turnos: editEsFranco ? [] : editTurnos }
    return validarEdicionManual(jornadaEditada, semana, editando.dia, tipo)
  }, [editando, editEsFranco, editTurnos, horarios, colaboradores])

  const hayErrores = avisosValidacion.some(a => a.severidad === 'error')

  const guardarEdicion = () => {
    if (!editando || !onEditarJornada) return
    onEditarJornada(editando.colaboradorId, editando.dia, {
      esFranco: editEsFranco,
      turnos: editEsFranco ? [] : editTurnos,
    })
    setEditando(null)
  }

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
                    const enEdicion = editando?.colaboradorId === horario.colaboradorId && editando?.dia === diaIndex
                    return (
                      <td
                        key={diaIndex}
                        onClick={editable ? () => abrirEditor(horario.colaboradorId, nombre, diaIndex) : undefined}
                        title={editable ? 'Clic para editar esta jornada' : undefined}
                        style={{
                          padding: '8px',
                          whiteSpace: 'nowrap',
                          fontSize: '10px',
                          width: '80px',
                          textAlign: 'center',
                          color: isFrancoReal ? 'var(--text-muted)' : 'white',
                          fontStyle: isFrancoReal ? 'italic' : 'normal',
                          backgroundColor: bgColor,
                          cursor: editable ? 'pointer' : 'default',
                          outline: enEdicion ? '2px solid var(--accent)' : 'none',
                          outlineOffset: '-2px',
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

      {/* Editor de jornada (Capacidad 3: correcciones manuales) */}
      {editable && editando && (
        <div style={{
          padding: '20px 24px',
          borderTop: '1px solid var(--accent)',
          background: 'var(--surface)',
        }}>
          <h4 style={{
            fontSize: '14px',
            fontWeight: 800,
            fontFamily: "'Syne', sans-serif",
            color: 'white',
            marginBottom: '12px',
          }}>
            ✏️ Editando: {editando.nombre} — {DIAS_SEMANA[editando.dia]}
          </h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={editEsFranco}
                onChange={(e) => setEditEsFranco(e.target.checked)}
              />
              Franco
            </label>
            {!editEsFranco && editTurnos.map((turno, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {editTurnos.length > 1 ? `Turno ${idx + 1}:` : 'Turno:'}
                </span>
                <input
                  type="time"
                  value={turno.inicio}
                  onChange={(e) => setEditTurnos(prev => prev.map((t, i) => i === idx ? { ...t, inicio: e.target.value } : t))}
                  style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 8px', background: 'var(--card)', color: 'var(--text)', fontSize: '13px' }}
                />
                <span style={{ color: 'var(--text-muted)' }}>→</span>
                <input
                  type="time"
                  value={turno.fin}
                  onChange={(e) => setEditTurnos(prev => prev.map((t, i) => i === idx ? { ...t, fin: e.target.value } : t))}
                  style={{ border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 8px', background: 'var(--card)', color: 'var(--text)', fontSize: '13px' }}
                />
              </div>
            ))}
            {!editEsFranco && editTurnos.length < 2 && (
              <button
                onClick={() => setEditTurnos(prev => [...prev, { inicio: '17:00', fin: '22:30' }])}
                style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: '8px', padding: '6px 12px', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer' }}
              >
                + 2º turno (cortado)
              </button>
            )}
            {!editEsFranco && editTurnos.length === 2 && (
              <button
                onClick={() => setEditTurnos(prev => prev.slice(0, 1))}
                style={{ background: 'none', border: '1px dashed var(--border)', borderRadius: '8px', padding: '6px 12px', color: 'var(--text-muted)', fontSize: '12px', cursor: 'pointer' }}
              >
                Quitar 2º turno
              </button>
            )}
            <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
              <button
                onClick={() => setEditando(null)}
                style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '100px', padding: '8px 16px', color: 'var(--text)', fontSize: '13px', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                onClick={guardarEdicion}
                style={{
                  background: hayErrores ? 'var(--surface)' : 'var(--accent)',
                  border: hayErrores ? '1px solid var(--accent)' : 'none',
                  borderRadius: '100px', padding: '8px 16px',
                  color: hayErrores ? 'var(--accent)' : 'var(--accent-dark)',
                  fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                }}
                title={hayErrores ? 'El cambio rompe una regla dura; se guardará igual si confirmás' : undefined}
              >
                {hayErrores ? 'Guardar de todos modos' : 'Guardar cambio'}
              </button>
            </div>
          </div>

          {/* Validación en tiempo real contra reglas duras */}
          {avisosValidacion.length > 0 && (
            <div style={{
              marginTop: '12px',
              padding: '12px 16px',
              borderRadius: '10px',
              border: `1px solid ${hayErrores ? 'var(--accent)' : 'var(--border)'}`,
              background: 'var(--card)',
            }}>
              {avisosValidacion.map((a, i) => (
                <p key={i} style={{ fontSize: '12px', color: a.severidad === 'error' ? 'var(--accent)' : 'var(--text-muted)', marginTop: i === 0 ? 0 : '4px' }}>
                  {a.severidad === 'error' ? '⛔' : '⚠️'} {a.mensaje}
                </p>
              ))}
            </div>
          )}

          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px' }}>
            El sistema registra tus correcciones y las usa como preferencia en las próximas generaciones.
            Las reglas duras se validan al instante: podés guardar igual, pero quedás avisado.
          </p>
        </div>
      )}

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