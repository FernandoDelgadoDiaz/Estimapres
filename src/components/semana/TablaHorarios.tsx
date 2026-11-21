import { useMemo, useState } from 'react'
import { HorarioColaborador, Colaborador, Auxiliar, Eventual, DIAS_SEMANA, JornadaResumida, type AsignacionCajaColaborador } from '../../types'
import { interpretarHorario, mostrarHorario, opcionesHorarioMotor } from '../../utils/timeUtils'
import { horasLegibles, minutosAsignados } from '../../utils/horasSemanales'
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
  /**
   * AH2-048: franjas en CAJA de cada supervisor (AUX). Si se pasan, la fila del AUX muestra
   * solo las horas que está sentado en caja (como los eventuales y el PDF); su jornada
   * completa queda en el detalle de la celda y se sigue corrigiendo desde el editor.
   */
  cajaAux?: AsignacionCajaColaborador[]
}

/** Intervalos «HH:MM» a partir de las franjas de media hora (08:00 = franja 0). */
export function intervalosCaja(slots: boolean[] = []): { inicio: string; fin: string }[] {
  const hora = (s: number) => { const m = 8 * 60 + s * 30; return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` }
  const out: { inicio: string; fin: string }[] = []
  for (let s = 0; s < slots.length; s++) {
    if (!slots[s]) continue
    const ini = s
    while (s + 1 < slots.length && slots[s + 1]) s++
    out.push({ inicio: hora(ini), fin: hora(s + 1) })
  }
  return out
}

interface CeldaEnEdicion {
  colaboradorId: string
  nombre: string
  dia: number
}

export default function TablaHorarios({ horarios, colaboradores, auxiliares = [], eventuales = [], editable = false, onEditarJornada, cajaAux }: TablaHorariosProps) {
  const cajaPorAux = useMemo(() => new Map((cajaAux ?? []).map(a => [a.colaboradorId, a.slotsCajaPorDia])), [cajaAux])
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
    // AH2-048: franco y medio franco en amarillo (igual que el PDF).
    franco: '#fef08a',
    franco_medio: '#fef08a',
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
          Horario por persona
        </h3>
        <p style={{
          color: 'var(--text-muted)',
          fontSize: '12px',
          marginTop: '4px',
        }}>
          Hacé clic en un día para corregirlo.
        </p>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="tabla-grilla" style={{ minWidth: '1060px', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '170px' }} /><col style={{ width: '96px' }} />
            {DIAS_SEMANA.map(d => <col key={d} />)}
            <col style={{ width: '120px' }} />
          </colgroup>
          <thead>
            <tr>
              <th className="fijo">Persona</th>
              <th className="centro">Tipo</th>
              {DIAS_SEMANA.map(dia => <th key={dia} className="centro">{dia}</th>)}
              <th className="centro">Horas</th>
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
              // AH2-048: el supervisor se muestra por sus horas en caja (como los eventuales).
              const cajaFila = tipo === 'AUX' && cajaAux ? (cajaPorAux.get(horario.colaboradorId) ?? []) : null
              const minutosCaja = cajaFila ? cajaFila.reduce((n, f) => n + (f ?? []).filter(Boolean).length, 0) * 30 : 0

              return (
                <tr key={horario.colaboradorId}>
                  <td className="fijo" style={{ overflowWrap: 'anywhere', fontWeight: 600, background: 'var(--card)' }}>
                    {nombre}
                  </td>
                  <td className="centro" style={{ whiteSpace: 'nowrap' }}>
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
                    const isFrancoReal = jornada?.esFranco || rol === 'franco'
                    // Un EVENTUAL sin caja no está de franco: solo se pinta el franco de cajeros y supervisores.
                    const diaFranco = tipo !== 'EVENTUAL' && (isFrancoReal || rol === 'franco_medio')
                    const bgColor = diaFranco ? '#fef08a' : tipo === 'EVENTUAL' && isFrancoReal ? 'var(--card)' : rolColor[rol] || 'var(--card)'
                    const enEdicion = editando?.colaboradorId === horario.colaboradorId && editando?.dia === diaIndex
                    return (
                      <td
                        key={diaIndex}
                        title={editable ? 'Clic para editar esta jornada' : undefined}
                        style={{
                          padding: '8px 6px',
                          fontSize: '12px',
                          textAlign: 'center',
                          color: diaFranco ? '#713f12' : isFrancoReal ? 'var(--text-muted)' : 'var(--text)',
                          fontStyle: isFrancoReal && !diaFranco ? 'italic' : 'normal',
                          fontWeight: diaFranco ? 700 : undefined,
                          backgroundColor: bgColor,
                          cursor: editable ? 'pointer' : 'default',
                          outline: enEdicion ? '2px solid var(--accent-strong)' : 'none',
                          outlineOffset: '-2px',
                        }}
                      >
                        {(() => {
                          const enCaja = cajaFila && jornada && !isFrancoReal ? intervalosCaja(cajaFila[diaIndex]) : null
                          const contenido = !jornada ? '—' : isFrancoReal
                            ? (tipo === 'EVENTUAL' ? 'Sin caja' : 'FRANCO')
                            : enCaja
                            ? <span title={`Jornada completa: ${jornada.turnos.map(t => `${t.inicio} - ${t.fin}`).join(' / ')}`}>
                                {enCaja.length ? enCaja.map((t, i) => <span key={i} className="block tabular-nums">{t.inicio} - {t.fin}</span>)
                                  : <span className="block" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Sin caja</span>}
                              </span>
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
                  <td className="centro" style={{ overflowWrap: 'anywhere' }}>
                    {cajaFila
                      ? <div className="space-y-1 tabular-nums leading-snug" style={{ fontSize: '12px' }}>
                          <div><strong>{horasLegibles(minutosCaja)}</strong> en caja</div>
                          <div style={{ color: 'var(--text-muted)' }}>Jornada: {horasLegibles(minutos)}</div>
                        </div>
                      : <ResumenHoras minutos={minutos} tipo={tipo} objetivo={objetivoDe(horario.colaboradorId)} />}
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
              <label className="min-w-64 text-sm">{cajaAux && horarios.some(h => h.colaboradorId === editando.colaboradorId && h.rolGeneral === 'aux_supervisor')
                ? 'Jornada completa del supervisor (las horas en caja se recalculan solas)'
                : 'Intervalos de la jornada'}
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

      {/* Leyenda de colores, en lenguaje del supervisor */}
      <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
        {([['aux_supervisor', 'Supervisor'], ['eventual_sector', 'Eventual en caja'], ['franco', 'Franco']] as const).map(([rol, texto]) => (
          <span key={rol} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
            <span style={{ width: '14px', height: '14px', borderRadius: '4px', border: '1px solid var(--border)', backgroundColor: rolColor[rol] }} />
            {texto}
          </span>
        ))}
      </div>
    </div>
  )
}