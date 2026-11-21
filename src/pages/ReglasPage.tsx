/**
 * Configuración de la sucursal (AH2-044): el supervisor ve campos simples. Por detrás:
 * - reglas de la sucursal (comunes al motor A y a CP-SAT) en `useReglas`;
 * - en sucursales con motor híbrido, la configuración persistente AH2-042 (historial, versiones, conflictos).
 * Lo avanzado (historial de versiones, importación, backup) queda en «Opciones avanzadas».
 */
import { useMemo, useState } from 'react'
import { DIAS_SEMANA, type ReglaConfigurable, type TipoReglaColaborador } from '../types'
import { useReglas } from '../hooks/useReglas'
import { useColaboradores } from '../hooks/useColaboradores'
import { useEventuales } from '../hooks/useEventuales'
import { usaHibrido } from '../hibrido/integracion'
import { getSucursalActual } from '../utils/sucursal'
import { interpretarHorario, opcionesHorarioMotor } from '../utils/timeUtils'
import { validarConflictosReglas, DEFAULTS_OPERATIVOS, type TipoReglaOperativa, reglaCajaEventualVigente } from '../utils/preferencias'
import { ConfiguracionMotorPanel } from '../components/reglas/ConfiguracionMotorPanel'
import BackupConfig from '../components/semana/BackupConfig'
import { Boton, FilaAjuste, Interruptor, Pagina, Seccion, estiloCampo } from '../components/ui/Basicos'
import { DisponibilidadEventuales, FranjasSupervisorSolo, MaximosEventuales, MensajesMotor, useConfiguracionMotor } from '../components/configuracion/MotorSucursal'
import { ddmm, filaArmarAMano, proximoLunesISO, temporalesVigentes } from '../hibrido/configuracionSimple'
import { supabase } from '../lib/supabase'

const TEXTO_OPERATIVA: Record<TipoReglaOperativa, { titulo: string; ayuda: string }> = {
  apertura_solo_aux: { titulo: 'La caja la abre un supervisor (08:00 a 09:00)', ayuda: 'Apagado: la abre un cajero.' },
  sin_aux_cierre: { titulo: 'Supervisores fuera de caja después de las 22:00', ayuda: '' },
  supervisor_jornada_completa: { titulo: 'El supervisor de jornada completa queda siempre de pie', ayuda: 'Cuando hay dos o más supervisores a la vez.' },
  franco_medio_corridos: { titulo: 'Franco y medio franco en días seguidos', ayuda: 'Para cajeros FULL.' },
}

type QuePersona = TipoReglaColaborador | 'armar_a_mano'
const QUE_PERSONA: Array<{ valor: QuePersona; texto: string; hibrido?: boolean }> = [
  { valor: 'franco_fijo', texto: 'Franco fijo' },
  { valor: 'no_antes_de', texto: 'No entra antes de' },
  { valor: 'no_despues_de', texto: 'No sale después de' },
  { valor: 'siempre_manana', texto: 'Siempre de mañana' },
  { valor: 'siempre_cierre', texto: 'Siempre de cierre' },
  { valor: 'armar_a_mano', texto: 'Lo armo yo (el sistema no le asigna turnos)', hibrido: true },
]
const HORAS = Array.from({ length: 31 }, (_, i) => `${String(7 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`)

export default function ReglasPage() {
  const sucursal = getSucursalActual()
  const hibrido = usaHibrido(sucursal) && !!supabase
  const { reglas, agregarRegla, actualizarRegla, eliminarRegla, toggleActiva } = useReglas()
  const { colaboradores } = useColaboradores()
  const { eventuales } = useEventuales()
  const motor = useConfiguracionMotor(sucursal, hibrido)
  const motorListo = hibrido && motor.disponible === true

  // ===== Reglas de la sucursal (interruptores con valor predeterminado) =====
  const estado = (t: TipoReglaOperativa) => reglas.find(x => x.ambito === 'local' && x.tipo === t)?.activa ?? DEFAULTS_OPERATIVOS[t]
  const cambiarOperativa = (t: TipoReglaOperativa, v: boolean) => {
    const existente = reglas.find(x => x.ambito === 'local' && x.tipo === t)
    const descripcion = `${TEXTO_OPERATIVA[t].titulo}: ${v ? 'sí' : 'no'}`
    if (existente) actualizarRegla(existente.id, { activa: v, descripcion })
    else agregarRegla({ ambito: 'local', tipo: t, activa: v, descripcion })
  }
  const reglaMaxFrancos = reglas.find(r => r.ambito === 'local' && r.tipo === 'max_francos_dia')
  const setMaxFrancos = (n: number) => {
    const val = Math.max(1, Math.min(6, Math.round(n || 1)))
    const descripcion = `Máximo ${val} franco${val === 1 ? '' : 's'} por día`
    if (reglaMaxFrancos) actualizarRegla(reglaMaxFrancos.id, { cantidad: val, activa: true, descripcion })
    else agregarRegla({ ambito: 'local', tipo: 'max_francos_dia', cantidad: val, activa: true, descripcion })
  }
  const maxBloques = reglaCajaEventualVigente(reglas, 'max_bloques_caja_eventual_dia')
  const limiteCaja = reglaCajaEventualVigente(reglas, 'eventuales_caja_hora_limite')
  const conflictos = useMemo(() => validarConflictosReglas(reglas, colaboradores), [reglas, colaboradores])

  const cajeros = colaboradores.filter(c => c.activo && (c.tipo === 'FULL' || c.tipo === 'PART'))
  const reglasPersona = reglas.filter(r => r.ambito === 'colaborador')
  const minimos = reglas.filter(r => r.ambito === 'local' && r.tipo === 'min_cajeros_franja')
  const hoy = new Date().toISOString().slice(0, 10)
  const temporales = motorListo ? temporalesVigentes(motor.filas, hoy).filter(f => f.tipo === 'condicion_supervisor') : []
  const nombreDeId = (id: string | null) => colaboradores.find(c => c.id === id)?.nombre ?? eventuales.find(e => e.id === id)?.nombre ?? 'Persona'

  return (
    <Pagina titulo="Configuración" descripcion="Cómo trabaja tu sucursal. El sistema lo tiene en cuenta en cada horario que genera.">
      {conflictos.length > 0 && (
        <section aria-label="Avisos" style={{ background: 'var(--warning-bg)', border: '1px solid #fcd34d', borderRadius: '16px', padding: '14px 20px', color: '#78350f', fontSize: '14px' }}>
          <strong>Algunas reglas no se pueden cumplir del todo</strong>
          <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>{conflictos.map((c, i) => <li key={i}>{c}</li>)}</ul>
        </section>
      )}
      {hibrido && <MensajesMotor motor={motor} />}

      <Seccion titulo="Apertura, cierre y supervisión">
        {(['apertura_solo_aux', 'sin_aux_cierre', 'supervisor_jornada_completa'] as const).map(t => (
          <FilaAjuste key={t} titulo={TEXTO_OPERATIVA[t].titulo} ayuda={TEXTO_OPERATIVA[t].ayuda || undefined}>
            <Interruptor activo={estado(t)} onCambiar={v => cambiarOperativa(t, v)} etiqueta={TEXTO_OPERATIVA[t].titulo} />
          </FilaAjuste>
        ))}
        {motorListo && <FranjasSupervisorSolo motor={motor} sucursal={sucursal} />}
      </Seccion>

      <Seccion titulo="Francos">
        <FilaAjuste titulo="Máximo de cajeros de franco el mismo día" id="max-francos">
          <input id="max-francos" type="number" min={1} max={6} value={reglaMaxFrancos?.cantidad ?? 2} onChange={e => setMaxFrancos(Number(e.target.value))} style={{ ...estiloCampo, width: '80px', textAlign: 'center' }} />
        </FilaAjuste>
        <FilaAjuste titulo={TEXTO_OPERATIVA.franco_medio_corridos.titulo} ayuda={TEXTO_OPERATIVA.franco_medio_corridos.ayuda}>
          <Interruptor activo={estado('franco_medio_corridos')} onCambiar={v => cambiarOperativa('franco_medio_corridos', v)} etiqueta={TEXTO_OPERATIVA.franco_medio_corridos.titulo} />
        </FilaAjuste>
      </Seccion>

      <Seccion titulo="Eventuales en caja">
        {motorListo && <MaximosEventuales motor={motor} sucursal={sucursal} />}
        <FilaAjuste titulo="Tramos de caja por día" ayuda="Cuántas veces por día puede entrar a caja un eventual." id="max-bloques-caja-eventual">
          <select id="max-bloques-caja-eventual" style={estiloCampo} value={maxBloques?.activa ? maxBloques.cantidad ?? '' : ''}
            onChange={ev => {
              const valor = ev.target.value
              agregarRegla({ ambito: 'local', tipo: 'max_bloques_caja_eventual_dia', activa: valor !== '', cantidad: valor ? Number(valor) : undefined,
                descripcion: valor ? `Máximo ${valor} tramos de caja por eventual` : 'Sin límite de tramos de caja por eventual' })
            }}>
            <option value="">Sin límite</option>
            {Array.from({ length: 6 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
          </select>
        </FilaAjuste>
        <FilaAjuste titulo="No atienden caja después de las" id="eventuales-caja-hora-limite">
          <select id="eventuales-caja-hora-limite" style={estiloCampo} value={limiteCaja?.activa ? limiteCaja.hora ?? '' : ''}
            onChange={ev => {
              const hora = ev.target.value
              agregarRegla({ ambito: 'local', tipo: 'eventuales_caja_hora_limite', activa: hora !== '', hora: hora || undefined,
                descripcion: hora ? `Eventuales fuera de caja desde las ${hora}` : 'Sin hora límite de caja para eventuales' })
            }}>
            <option value="">Sin límite</option>
            {HORAS.slice(2).map(h => <option key={h} value={h}>{h}</option>)}
          </select>
        </FilaAjuste>
        {motorListo && <DisponibilidadEventuales motor={motor} sucursal={sucursal} eventuales={eventuales.filter(e => e.activo)} />}
      </Seccion>

      <Seccion titulo="Reglas por persona" descripcion="Francos fijos, horarios y personas que armás a mano.">
        <ListaReglas
          items={[
            ...reglasPersona.map(r => ({ id: r.id, texto: r.descripcion, periodo: periodo(r.vigenciaDesde, r.vigenciaHasta), activa: r.activa,
              onPausar: () => toggleActiva(r.id), onQuitar: () => { if (confirm(`¿Quitar «${r.descripcion}»?`)) eliminarRegla(r.id) } })),
            ...temporales.map(f => ({ id: f.id, texto: `${nombreDeId(f.colaborador_id)}: ${textoCondicion(f.datos)}`, periodo: periodo(f.vigencia_desde, f.vigencia_hasta ?? undefined), activa: true,
              onQuitar: () => { if (confirm('¿Quitar esta regla?')) void motor.aplicar({ tipo: 'desactivar', anterior: f }, 'Regla quitada.') } })),
          ]}
          vacio="No hay reglas por persona."
        />
        <FormPersona cajeros={cajeros.map(c => ({ id: c.id, nombre: c.nombre }))} hibrido={motorListo}
          onRegla={agregarRegla}
          onArmarAMano={async (id, lunes, semanas) => motor.aplicar({ tipo: 'crear', fila: filaArmarAMano(sucursal, id, lunes, semanas) }, 'Guardado: el sistema no le asignará turnos esas semanas.')} />
      </Seccion>

      <Seccion titulo="Mínimo de cajeros" descripcion="Para asegurar una cantidad mínima en un horario, aunque el PDF pida menos.">
        <ListaReglas
          items={minimos.map(r => ({ id: r.id, texto: r.descripcion, periodo: periodo(r.vigenciaDesde, r.vigenciaHasta), activa: r.activa,
            onPausar: () => toggleActiva(r.id), onQuitar: () => { if (confirm(`¿Quitar «${r.descripcion}»?`)) eliminarRegla(r.id) } }))}
          vacio="Sin mínimos: se usa la necesidad del PDF."
        />
        <FormMinimo onRegla={agregarRegla} />
      </Seccion>

      <details>
        <summary style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '14px', padding: '4px 0' }}>Opciones avanzadas (administración)</summary>
        <div style={{ display: 'grid', gap: '16px', marginTop: '12px' }}>
          {usaHibrido(sucursal) && <ConfiguracionMotorPanel sucursal={sucursal} />}
          <BackupConfig />
        </div>
      </details>
    </Pagina>
  )
}

function periodo(desde?: string, hasta?: string) {
  if (!desde && !hasta) return 'Siempre'
  if (desde && hasta) return `Del ${ddmm(desde)} al ${ddmm(hasta)}`
  return desde ? `Desde el ${ddmm(desde)}` : `Hasta el ${ddmm(hasta!)}`
}

function textoCondicion(d: Record<string, unknown>) {
  switch (d.tipo) {
    case 'exclusion_manual': return 'lo armo yo'
    case 'franco': return `franco el ${DIAS_SEMANA[Number(d.dia)] ?? ''}`
    case 'turno': return `turno ${String(d.valor ?? '')}`
    case 'max_francos': return `máximo ${String(d.valor)} francos por día`
    case 'franco_medio_corrido': return 'franco y medio franco seguidos'
    default: return 'regla especial'
  }
}

interface ItemRegla { id: string; texto: string; periodo: string; activa: boolean; onPausar?: () => void; onQuitar: () => void }
function ListaReglas({ items, vacio }: { items: ItemRegla[]; vacio: string }) {
  if (!items.length) return <p style={{ margin: '8px 0', fontSize: '14px', color: 'var(--text-muted)' }}>{vacio}</p>
  return (
    <ul style={{ listStyle: 'none', margin: '8px 0', padding: 0 }}>
      {items.map(r => (
        <li key={r.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', padding: '10px 0', borderTop: '1px solid var(--border)', opacity: r.activa ? 1 : 0.55 }}>
          <span style={{ flex: '1 1 300px', fontSize: '14px' }}>{r.texto}</span>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{r.periodo}</span>
          {r.onPausar && <Interruptor activo={r.activa} onCambiar={() => r.onPausar!()} etiqueta={`${r.activa ? 'Pausar' : 'Activar'} ${r.texto}`} />}
          <button type="button" onClick={r.onQuitar} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '13px', textDecoration: 'underline' }}>Quitar</button>
        </li>
      ))}
    </ul>
  )
}

type NuevaRegla = Omit<ReglaConfigurable, 'id' | 'activa' | 'creadaEl'> & { activa?: boolean }

function FormPersona({ cajeros, hibrido, onRegla, onArmarAMano }: {
  cajeros: Array<{ id: string; nombre: string }>; hibrido: boolean
  onRegla: (r: NuevaRegla) => void; onArmarAMano: (id: string, lunes: string, semanas: number) => Promise<boolean>
}) {
  const [persona, setPersona] = useState(''), [que, setQue] = useState<QuePersona>('franco_fijo'), [dia, setDia] = useState(0), [hora, setHora] = useState('09:00')
  const [temporal, setTemporal] = useState(false), [desde, setDesde] = useState(''), [hasta, setHasta] = useState('')
  const lunesOpc = useMemo(() => Array.from({ length: 8 }, (_, i) => { const l = new Date(`${proximoLunesISO()}T12:00:00Z`); l.setUTCDate(l.getUTCDate() + 7 * i); return l.toISOString().slice(0, 10) }), [])
  const [lunes, setLunes] = useState(lunesOpc[0]), [semanas, setSemanas] = useState(1)
  const [error, setError] = useState('')
  const nombre = cajeros.find(c => c.id === persona)?.nombre ?? ''
  const agregar = async () => {
    setError('')
    if (!persona) { setError('Elegí una persona.'); return }
    if (que === 'armar_a_mano') { if (await onArmarAMano(persona, lunes, semanas)) setPersona(''); return }
    if (temporal && (!desde || !hasta || hasta < desde)) { setError('Indicá desde y hasta (el fin después del inicio).'); return }
    const txt: Record<TipoReglaColaborador, string> = {
      franco_fijo: `${nombre}: franco fijo los ${DIAS_SEMANA[dia]}`, no_antes_de: `${nombre}: no entra antes de las ${hora}`,
      no_despues_de: `${nombre}: no sale después de las ${hora}`, siempre_manana: `${nombre}: siempre de mañana`, siempre_cierre: `${nombre}: siempre de cierre`,
    } as Record<TipoReglaColaborador, string>
    onRegla({ ambito: 'colaborador', tipo: que, colaboradorNombre: nombre, dia: que === 'franco_fijo' ? dia : undefined,
      hora: que === 'no_antes_de' || que === 'no_despues_de' ? hora : undefined,
      vigenciaDesde: temporal ? desde : undefined, vigenciaHasta: temporal ? hasta : undefined, descripcion: txt[que] })
    setPersona('')
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
      <select aria-label="Persona" value={persona} onChange={e => setPersona(e.target.value)} style={estiloCampo}>
        <option value="">Persona…</option>{cajeros.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </select>
      <select aria-label="Regla" value={que} onChange={e => setQue(e.target.value as QuePersona)} style={estiloCampo}>
        {QUE_PERSONA.filter(q => hibrido || !q.hibrido).map(q => <option key={q.valor} value={q.valor}>{q.texto}</option>)}
      </select>
      {que === 'franco_fijo' && <select aria-label="Día" value={dia} onChange={e => setDia(Number(e.target.value))} style={estiloCampo}>{DIAS_SEMANA.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>}
      {(que === 'no_antes_de' || que === 'no_despues_de') && <select aria-label="Hora" value={hora} onChange={e => setHora(e.target.value)} style={estiloCampo}>{HORAS.map(h => <option key={h} value={h}>{h}</option>)}</select>}
      {que === 'armar_a_mano' ? <>
        <select aria-label="Desde la semana" value={lunes} onChange={e => setLunes(e.target.value)} style={estiloCampo}>{lunesOpc.map(l => <option key={l} value={l}>Semana del {ddmm(l)}</option>)}</select>
        <select aria-label="Cantidad de semanas" value={semanas} onChange={e => setSemanas(Number(e.target.value))} style={estiloCampo}>{[1, 2, 3, 4].map(n => <option key={n} value={n}>{n === 1 ? '1 semana' : `${n} semanas`}</option>)}</select>
      </> : <>
        <select aria-label="Período" value={temporal ? 't' : 's'} onChange={e => setTemporal(e.target.value === 't')} style={estiloCampo}><option value="s">Siempre</option><option value="t">Entre fechas</option></select>
        {temporal && <><input aria-label="Desde" type="date" value={desde} onChange={e => setDesde(e.target.value)} style={estiloCampo} /><input aria-label="Hasta" type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={estiloCampo} /></>}
      </>}
      <Boton onClick={() => void agregar()}>Agregar</Boton>
      {error && <p role="alert" style={{ flexBasis: '100%', margin: 0, color: 'var(--danger)', fontSize: '13px' }}>{error}</p>}
    </div>
  )
}

function FormMinimo({ onRegla }: { onRegla: (r: NuevaRegla) => void }) {
  const [dia, setDia] = useState(-1), [franja, setFranja] = useState(''), [cantidad, setCantidad] = useState(2), [error, setError] = useState('')
  const agregar = () => {
    const r = interpretarHorario(franja, { ...opcionesHorarioMotor, maxBloques: 1 })
    const t = r.ok ? r.turnos[0] : undefined
    if (!t) { setError(r.ok ? 'Indicá el horario, por ejemplo 12 a 22.' : r.error); return }
    setError('')
    onRegla({ ambito: 'local', tipo: 'min_cajeros_franja', dia, horaDesde: t.inicio, horaHasta: t.fin, cantidad: Math.max(1, cantidad),
      descripcion: `Mínimo ${cantidad} cajeros ${dia === -1 ? 'todos los días' : `los ${DIAS_SEMANA[dia]}`} de ${t.inicio} a ${t.fin}` })
    setFranja('')
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
      <select aria-label="Día del mínimo" value={dia} onChange={e => setDia(Number(e.target.value))} style={estiloCampo}>
        <option value={-1}>Todos los días</option>{DIAS_SEMANA.map((d, i) => <option key={d} value={i}>{d}</option>)}
      </select>
      <input aria-label="Horario del mínimo" placeholder="12 a 22" value={franja} onChange={e => setFranja(e.target.value)} style={{ ...estiloCampo, width: '120px' }} />
      <label style={{ fontSize: '14px', color: 'var(--text-muted)' }}>al menos <input aria-label="Cantidad mínima" type="number" min={1} max={10} value={cantidad} onChange={e => setCantidad(Number(e.target.value))} style={{ ...estiloCampo, width: '70px' }} /> cajeros</label>
      <Boton onClick={agregar}>Agregar</Boton>
      {error && <p role="alert" style={{ flexBasis: '100%', margin: 0, color: 'var(--danger)', fontSize: '13px' }}>{error}</p>}
    </div>
  )
}

