import { useMemo, useState } from 'react'
import { HorarioColaborador, Colaborador, Auxiliar, Eventual, DIAS_SEMANA, JornadaResumida } from '../../types'
import { interpretarHorario, mostrarHorario, opcionesHorarioMotor } from '../../utils/timeUtils'
import { minutosAsignados } from '../../utils/horasSemanales'
import ResumenHoras from '../horarios/ResumenHoras'
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

export default function TablaHorarios({ horarios, colaboradores, auxiliares = [], eventuales = [], editable = false, onEditarJornada }: TablaHorariosProps) {
  const [editando, setEditando] = useState<CeldaEnEdicion | null>(null)
  const [editEsFranco, setEditEsFranco] = useState(false)
  const [textoTurnos, setTextoTurnos] = useState('')
  const entrada = useMemo(() => interpretarHorario(textoTurnos, opcionesHorarioMotor), [textoTurnos])
  const editTurnos = entrada.ok ? entrada.turnos : []
  const errorEntrada = editEsFranco ? '' : entrada.ok ? (editTurnos.length ? '' : 'Ingresá un intervalo o marcá Franco.') : entrada.error
  const objetivoDe = (id: string) => colaboradores.find(c => c.id === id)?.horasSemanales ??
    auxiliares.find(a => a.id === id)?.horasSemanales ?? eventuales.find(e => e.id === id)?.maxHorasSemanales

  const abrirEditor = (colaboradorId: string, nombre: string, dia: number) => {
    const horario = horarios.find(h => h.colaboradorId === colaboradorId)
    const jornada = horario?.jornadas.find(j => j.dia === dia)
    setEditando({ colaboradorId, nombre, dia })
    setEditEsFranco(jornada?.esFranco ?? false)
    setTextoTurnos(jornada?.turnos.length
      ? mostrarHorario(jornada.turnos.map(t => `${t.inicio}-${t.fin}`).join('|'))
      : '09:00 - 17:00')
  }

  // Validación en tiempo real de la edición contra las reglas duras.
  const avisosValidacion = useMemo(() => {
    if (!editando || errorEntrada) return []
    const horario = horarios.find(h => h.colaboradorId === editando.colaboradorId)
    if (!horario) return []
    // Tipo real del colaborador: cajero (FULL/PART), AUX o EVENTUAL. Para
    // AUX/EVENTUAL no aplican los totales de horas de cajeros, solo las
    // validaciones genéricas (franja de operación, cortes, descansos).
    const tipo =
      colaboradores.find(c => c.id === editando.colaboradorId)?.tipo ??
      (auxiliares.some(a => a.id === editando.colaboradorId) ? 'AUX' :
        eventuales.some(e => e.id === editando.colaboradorId) ? 'EVENTUAL' : 'FULL')
    const semana: JornadaResumida[] = Array.from({ length: 7 }, (_, d) => {
      const j = horario.jornadas.find(x => x.dia === d)
      return { esFranco: j?.esFranco ?? false, turnos: j?.turnos ?? [] }
    })
    const jornadaEditada: JornadaResumida = { esFranco: editEsFranco, turnos: editEsFranco ? [] : editTurnos }
    return validarEdicionManual(jornadaEditada, semana, editando.dia, tipo)
  }, [editando, editEsFranco, editTurnos, horarios, colaboradores, auxiliares, eventuales, errorEntrada])

  const hayErrores = avisosValidacion.some(a => a.severidad === 'error')

  const guardarEdicion = () => {
    if (!editando || !onEditarJornada || errorEntrada) return
    onEditarJornada(editando.colaboradorId, editando.dia, {
      esFranco: editEsFranco,
      turnos: editEsFranco ? [] : editTurnos,
    })
    setEditando(null)
  }

  const tiposColor: Record<string, { background: string, color: string }> = {
    FULL: { background: 'var(--accent)', color: 'var(--accent-dark)' },
    PART: { background: '#ede9fe', color: '#6d28d9' },
    AUX: { background: '#e0f2fe', color: '#0369a1' },
    EVENTUAL: { background: '#fef3c7', color: '#92400e' },
    cajero: { background: '#f1f5f9', color: '#475569' },
  }

  // Tinte muy suave por rol para las celdas de cada día (mantiene el texto legible).
  const rolColor: Record<string, string> = {
    cajero: 'var(--card)',
    aux_supervisor: '#f0f9ff',
    aux_eventual: '#fffbeb',
    eventual_sector: '#faf5ff',
    franco: '#f8fafc',
    franco_medio: '#f1f5f9',
  }

  if (horarios.length === 0) {
    return (
      <div style={{
        background: 'var(--card)',
        borderRadius: '16px',
        border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
        padding: '40px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>📋</div>
        <h3 style={{
          fontSize: '24px',
          fontWeight: 800,
          fontFamily: "'Syne', sans-serif",
          color: 'var(--text)',
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
      border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '24px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{
          fontSize: '24px',
          fontWeight: 800,
          fontFamily: "'Syne', sans-serif",
          color: 'var(--text)',
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
        <table style={{ width: '100%', minWidth: '980px', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
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
                width: '140px',
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
                width: '75px',
              }}>
                Tipo
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
                    width: '91px',
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
                width: '135px',
              }}>
                Horas semanales
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
              const filaEditada = editando?.colaboradorId === horario.colaboradorId
              const minutos = minutosAsignados(horario.jornadas.map(j => filaEditada && j.dia === editando?.dia && !errorEntrada
                ? { esFranco: editEsFranco, turnos: editEsFranco ? [] : editTurnos }
                : j))
              const tipoStyle = tiposColor[tipo] || tiposColor.FULL

              return (
                <tr key={horario.colaboradorId} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{
                    padding: '8px',
                    overflowWrap: 'anywhere',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: 'var(--text)',
                    position: 'sticky',
                    left: 0,
                    background: 'var(--card)',
                  }}>
                    {nombre}
                  </td>
                  <td style={{ padding: '8px', whiteSpace: 'nowrap', width: '75px' }}>
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
                  {DIAS_SEMANA.map((_, diaIndex) => {
                    const jornada = horario.jornadas.find(j => j.dia === diaIndex)
                    const rol = jornada?.rol || (jornada?.esFranco ? 'franco' : 'cajero')
                    const bgColor = rolColor[rol] || 'var(--card)'
                    const isFrancoReal = jornada?.esFranco || rol === 'franco'
                    const enEdicion = editando?.colaboradorId === horario.colaboradorId && editando?.dia === diaIndex
                    return (
                      <td
                        key={diaIndex}
                        title={editable ? 'Clic para editar esta jornada' : undefined}
                        style={{
                          padding: '8px',
                          fontSize: '11px',
                          verticalAlign: 'top',
                          width: '91px',
                          textAlign: 'center',
                          color: isFrancoReal ? 'var(--text-muted)' : 'var(--text)',
                          fontStyle: isFrancoReal ? 'italic' : 'normal',
                          backgroundColor: bgColor,
                          cursor: editable ? 'pointer' : 'default',
                          outline: enEdicion ? '2px solid var(--accent-strong)' : 'none',
                          outlineOffset: '-2px',
                        }}
                      >
                        {(() => {
                          const contenido = !jornada ? '—' : isFrancoReal
                            ? (tipo === 'EVENTUAL' ? 'Sin caja' : 'FRANCO')
                            : <>{jornada.turnos.map((t, i) => <span key={i} className="block tabular-nums">{t.inicio} - {t.fin}</span>)}
                                {rol === 'franco_medio' && <span className="block">Medio franco</span>}</>
                          return editable && jornada
                            ? <button type="button" className="w-full leading-5 focus-visible:outline focus-visible:outline-2"
                                aria-label={`Editar ${nombre}, ${DIAS_SEMANA[diaIndex]}`} onClick={() => abrirEditor(horario.colaboradorId, nombre, diaIndex)}>{contenido}</button>
                            : contenido
                        })()}
                      </td>
                    )
                  })}
                  <td className="align-top p-2 break-words">
                    <ResumenHoras minutos={minutos} tipo={tipo} objetivo={objetivoDe(horario.colaboradorId)} />
                    {horario.errores.length > 0 && (
                      <div style={{ fontSize: '10px', color: 'var(--danger)' }}>
                        {horario.errores.map((err, idx) => (
                          <div key={idx}>• {err}</div>
                        ))}
                      </div>
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
          borderTop: '1px solid var(--border)',
          background: 'var(--surface)',
        }}>
          <h4 style={{
            fontSize: '14px',
            fontWeight: 800,
            fontFamily: "'Syne', sans-serif",
            color: 'var(--text)',
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
            {!editEsFranco && (
              <label className="min-w-64 text-sm">Intervalos de la jornada
                <textarea autoFocus rows={Math.max(2, textoTurnos.split('\n').length)}
                  value={textoTurnos} onChange={e => setTextoTurnos(e.target.value)}
                  aria-invalid={!!errorEntrada} className="mt-1 block w-full rounded border bg-white p-2 text-gray-900"
                  placeholder="12 a 16 y 20 a 22" />
              </label>
            )}
            {errorEntrada && <p role="alert" className="text-sm text-red-800">{errorEntrada}</p>}
            <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
              <button
                onClick={() => setEditando(null)}
                style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', borderRadius: '100px', padding: '8px 16px', color: 'var(--text)', fontSize: '13px', cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button
                disabled={!!errorEntrada}
                onClick={guardarEdicion}
                style={{
                  background: hayErrores ? 'var(--warning-bg)' : 'var(--accent)',
                  border: hayErrores ? '1px solid var(--warning)' : 'none',
                  borderRadius: '100px', padding: '8px 16px',
                  color: hayErrores ? 'var(--warning)' : 'var(--accent-dark)',
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
              border: `1px solid ${hayErrores ? 'var(--warning)' : 'var(--border)'}`,
              background: hayErrores ? 'var(--warning-bg)' : 'var(--card)',
            }}>
              {avisosValidacion.map((a, i) => (
                <p key={i} style={{ fontSize: '12px', color: a.severidad === 'error' ? 'var(--danger)' : 'var(--text-muted)', marginTop: i === 0 ? 0 : '4px' }}>
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
                border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
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