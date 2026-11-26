/**
 * Configuración de la sucursal (AH2-044): el supervisor ve campos simples. Por detrás:
 * - reglas de la sucursal (comunes al motor A y a CP-SAT) en `useReglas`;
 * - en sucursales con motor híbrido, la configuración persistente AH2-042 (historial, versiones, conflictos).
 * Lo avanzado (historial de versiones, importación, backup) no se muestra al supervisor.
 */
import { useMemo, useState } from 'react'
import { DIAS_SEMANA, type ReglaConfigurable, type TipoReglaColaborador } from '../types'
import { useReglas } from '../hooks/useReglas'
import { useColaboradores } from '../hooks/useColaboradores'
import { usaHibrido } from '../hibrido/integracion'
import { getSucursalActual } from '../utils/sucursal'
import { interpretarHorario, opcionesHorarioMotor } from '../utils/timeUtils'
import { validarConflictosReglas, DEFAULTS_OPERATIVOS, type TipoReglaOperativa, reglaCajaEventualVigente, MARGEN_CONTINUIDAD_HORAS } from '../utils/preferencias'
import { Boton, FilaAjuste, Interruptor, Pagina, Seccion, estiloCampo } from '../components/ui/Basicos'
import { FranjasSupervisorSolo, MaximosEventuales, MensajesMotor, useConfiguracionMotor } from '../components/configuracion/MotorSucursal'
import { ddmm, proximoLunesISO } from '../hibrido/configuracionSimple'
import { TURNOS, turnosDeContrato, type TurnoPedido } from '../algoritmo/turnos'
import { supabase } from '../lib/supabase'

const TEXTO_OPERATIVA: Record<TipoReglaOperativa, { titulo: string; ayuda: string }> = {
  apertura_solo_aux: { titulo: 'La caja la abre un supervisor (08:00 a 09:00)', ayuda: 'Apagado: la abre un cajero.' },
  sin_aux_cierre: { titulo: 'Supervisores fuera de caja después de las 22:00', ayuda: '' },
  supervisor_jornada_completa: { titulo: 'El supervisor de jornada completa queda siempre de pie', ayuda: 'Cuando hay dos o más supervisores a la vez.' },
  franco_medio_corridos: { titulo: 'Franco y medio franco en días seguidos', ayuda: 'Para cajeros FULL.' },
}

type QuePersona = TipoReglaColaborador
const QUE_PERSONA: Array<{ valor: QuePersona; texto: string }> = [
  { valor: 'turno', texto: 'Turno (pedido)' },
  { valor: 'franco_fijo', texto: 'Franco fijo' },
  { valor: 'no_antes_de', texto: 'No entra antes de' },
  { valor: 'no_despues_de', texto: 'No sale después de' },
  // AH2-063: los domingos se reparten parejo; quien lo pide tiene prioridad (preferencia fuerte, no obligación).
  { valor: 'prefiere_domingos', texto: 'Prefiere trabajar los domingos' },
  // AH2-058: «Siempre de mañana» y «Siempre de cierre» ya no se ofrecen: son turnos («Solo mañana», «Solo cierre»).
  // Las reglas que ya existen con esos tipos se siguen mostrando y aplicando igual.
]
const HORAS = Array.from({ length: 31 }, (_, i) => `${String(7 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`)

export default function ReglasPage() {
  const sucursal = getSucursalActual()
  const hibrido = usaHibrido(sucursal) && !!supabase
  const { reglas, agregarRegla, actualizarRegla, eliminarRegla, toggleActiva } = useReglas()
  const { colaboradores } = useColaboradores()
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
  // AH2-066: el máximo cuenta a todas las personas de caja (supervisores incluidos). Vacío = automático.
  const maxFrancosActivo = reglaMaxFrancos?.activa ? reglaMaxFrancos.cantidad : undefined
  const setMaxFrancos = (texto: string) => {
    if (!texto.trim()) { if (reglaMaxFrancos) actualizarRegla(reglaMaxFrancos.id, { activa: false, descripcion: 'Máximo de francos por día: automático' }); return }
    const val = Math.max(1, Math.min(6, Math.round(Number(texto) || 1)))
    const descripcion = `Máximo ${val} persona${val === 1 ? '' : 's'} de franco por día (supervisores incluidos)`
    if (reglaMaxFrancos) actualizarRegla(reglaMaxFrancos.id, { cantidad: val, activa: true, descripcion })
    else agregarRegla({ ambito: 'local', tipo: 'max_francos_dia', cantidad: val, activa: true, descripcion })
  }
  // AH2-063: margen de cobertura por semana a cambio de no cambiar los horarios dentro del mes (0 = cobertura siempre primero).
  const reglaMargen = reglas.find(r => r.ambito === 'local' && r.tipo === 'margen_continuidad')
  const setMargen = (n: number) => {
    const val = Math.max(0, Math.min(10, Math.round((Number.isFinite(n) ? n : 2) * 2) / 2))
    const descripcion = val === 0 ? 'Continuidad dentro del mes: la cobertura va siempre primero' : `Continuidad dentro del mes: hasta ${String(val).replace('.', ',')} h menos de cobertura por semana`
    if (reglaMargen) actualizarRegla(reglaMargen.id, { cantidad: val, activa: true, descripcion })
    else agregarRegla({ ambito: 'local', tipo: 'margen_continuidad', cantidad: val, activa: true, descripcion })
  }
  const maxBloques = reglaCajaEventualVigente(reglas, 'max_bloques_caja_eventual_dia')
  const limiteCaja = reglaCajaEventualVigente(reglas, 'eventuales_caja_hora_limite')
  const conflictos = useMemo(() => validarConflictosReglas(reglas, colaboradores), [reglas, colaboradores])

  const cajeros = colaboradores.filter(c => c.activo && (c.tipo === 'FULL' || c.tipo === 'PART'))
  const reglasPersona = reglas.filter(r => r.ambito === 'colaborador')
  // AH2-056: un pedido de turno que no corresponde al contrato actual no se aplica al generar.
  const turnoAplica = (r: ReglaConfigurable) => {
    const tipo = colaboradores.find(c => c.nombre === r.colaboradorNombre)?.tipo
    return !!r.turno && !!TURNOS[tipo as 'FULL' | 'PART']?.[r.turno]
  }
  const minimos = reglas.filter(r => r.ambito === 'local' && r.tipo === 'min_cajeros_franja')

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

      <Seccion titulo="Rotación de horarios">
        <FilaAjuste titulo="Dentro del mismo mes, mantener los horarios aunque se cubra un poco menos" id="margen-continuidad"
          ayuda="Horas de cobertura por semana que se aceptan perder para no cambiarle el horario a los cajeros. Al empezar un mes nuevo los turnos rotan y la cobertura va primero. 0 = la cobertura siempre primero.">
          <input id="margen-continuidad" aria-label="Horas de margen por semana" type="number" min={0} max={10} step={0.5} value={reglaMargen?.cantidad ?? MARGEN_CONTINUIDAD_HORAS} onChange={e => setMargen(Number(e.target.value))} style={{ ...estiloCampo, width: '80px', textAlign: 'center' }} />
        </FilaAjuste>
      </Seccion>

      <Seccion titulo="Francos">
        <FilaAjuste titulo="Máximo de personas de franco el mismo día (supervisores incluidos)" id="max-francos"
          ayuda="Vacío = automático: el personal de caja se reparte en los 7 días y los días de menos necesidad de cajas llevan un franco más. Los francos fijos siempre se respetan.">
          <input id="max-francos" type="number" min={1} max={6} placeholder="Auto" value={maxFrancosActivo ?? ''} onChange={e => setMaxFrancos(e.target.value)} style={{ ...estiloCampo, width: '80px', textAlign: 'center' }} />
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
      </Seccion>

      <Seccion titulo="Reglas por persona" descripcion="Pedidos de turno, francos fijos y horarios de cada cajero. Rigen en las fechas que elijas y se aplican solas en cada horario.">
        <ListaReglas
          items={[
            ...reglasPersona.map(r => ({ id: r.id, texto: r.tipo === 'turno' && !turnoAplica(r) ? `${r.descripcion} · no aplica a su contrato actual: corregila` : r.descripcion, periodo: periodo(r.vigenciaDesde, r.vigenciaHasta), activa: r.activa,
              onPausar: () => toggleActiva(r.id), onQuitar: () => { if (confirm(`¿Quitar «${r.descripcion}»?`)) eliminarRegla(r.id) } })),
          ]}
          vacio="No hay reglas por persona."
        />
        <FormPersona cajeros={cajeros.map(c => ({ id: c.id, nombre: c.nombre, tipo: c.tipo }))} onRegla={agregarRegla} />
      </Seccion>

      <Seccion titulo="Mínimo de cajeros" descripcion="Para asegurar una cantidad mínima en un horario, aunque el PDF pida menos.">
        <ListaReglas
          items={minimos.map(r => ({ id: r.id, texto: r.descripcion, periodo: periodo(r.vigenciaDesde, r.vigenciaHasta), activa: r.activa,
            onPausar: () => toggleActiva(r.id), onQuitar: () => { if (confirm(`¿Quitar «${r.descripcion}»?`)) eliminarRegla(r.id) } }))}
          vacio="Sin mínimos: se usa la necesidad del PDF."
        />
        <FormMinimo onRegla={agregarRegla} />
      </Seccion>

    </Pagina>
  )
}

function periodo(desde?: string, hasta?: string) {
  if (!desde && !hasta) return 'Siempre'
  if (desde && hasta) return `Del ${ddmm(desde)} al ${ddmm(hasta)}`
  return desde ? `Desde el ${ddmm(desde)}` : `Hasta el ${ddmm(hasta!)}`
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

function FormPersona({ cajeros, onRegla }: { cajeros: Array<{ id: string; nombre: string; tipo: string }>; onRegla: (r: NuevaRegla) => void }) {
  const [persona, setPersona] = useState(''), [que, setQue] = useState<QuePersona>('turno'), [dia, setDia] = useState(0), [hora, setHora] = useState('09:00')
  const [periodoSel, setPeriodoSel] = useState<'siempre' | 'semana' | 'anio' | 'fechas'>('semana'), [desde, setDesde] = useState(''), [hasta, setHasta] = useState('')
  const temporal = periodoSel === 'fechas'
  const [turno, setTurno] = useState<TurnoPedido>('manana')
  const contrato = cajeros.find(c => c.id === persona)?.tipo ?? ''
  // AH2-056: solo los turnos del contrato de la persona (un PART no ve «Solo cortado»).
  const opcionesTurno = turnosDeContrato(contrato)
  const [error, setError] = useState('')
  const nombre = cajeros.find(c => c.id === persona)?.nombre ?? ''
  const agregar = () => {
    setError('')
    if (!persona) { setError('Elegí una persona.'); return }
    if (temporal && (!desde || !hasta || hasta < desde)) { setError('Indicá desde y hasta (el fin después del inicio).'); return }
    if (que === 'turno' && !opcionesTurno.some(([k]) => k === turno)) { setError('Elegí un turno de su contrato.'); return }
    // Vigencia: la semana que viene (lunes a domingo), hasta fin de año (desde el próximo lunes), entre fechas o siempre.
    const lunes = proximoLunesISO()
    const sumar = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
    const vig = periodoSel === 'semana' ? { d: lunes, h: sumar(lunes, 6) } : periodoSel === 'anio' ? { d: lunes, h: `${lunes.slice(0, 4)}-12-31` }
      : periodoSel === 'fechas' ? { d: desde, h: hasta } : { d: undefined, h: undefined }
    const txt: Record<TipoReglaColaborador, string> = {
      franco_fijo: `${nombre}: franco fijo los ${DIAS_SEMANA[dia]}`, no_antes_de: `${nombre}: no entra antes de las ${hora}`,
      no_despues_de: `${nombre}: no sale después de las ${hora}`, siempre_manana: `${nombre}: siempre de mañana`, siempre_cierre: `${nombre}: siempre de cierre`,
      prefiere_domingos: `${nombre}: prefiere trabajar los domingos`,
      turno: `${nombre}: ${(TURNOS[contrato as 'FULL' | 'PART']?.[turno]?.etiqueta ?? '').toLowerCase()}`,
    } as Record<TipoReglaColaborador, string>
    onRegla({ ambito: 'colaborador', tipo: que, colaboradorNombre: nombre, dia: que === 'franco_fijo' ? dia : undefined,
      hora: que === 'no_antes_de' || que === 'no_despues_de' ? hora : undefined,
      turno: que === 'turno' ? turno : undefined,
      vigenciaDesde: vig.d, vigenciaHasta: vig.h, descripcion: txt[que] })
    setPersona('')
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
      <select aria-label="Persona" value={persona} onChange={e => { setPersona(e.target.value); setTurno('manana') }} style={estiloCampo}>
        <option value="">Persona…</option>{cajeros.map(c => <option key={c.id} value={c.id}>{c.nombre} ({c.tipo})</option>)}
      </select>
      <select aria-label="Regla" value={que} onChange={e => setQue(e.target.value as QuePersona)} style={estiloCampo}>
        {QUE_PERSONA.map(q => <option key={q.valor} value={q.valor}>{q.texto}</option>)}
      </select>
      {que === 'turno' && <select aria-label="Turno" value={turno} onChange={e => setTurno(e.target.value as TurnoPedido)} style={estiloCampo} disabled={!persona}>
        {!persona && <option value="manana">Elegí la persona primero</option>}
        {opcionesTurno.map(([k, d]) => <option key={k} value={k}>{d.etiqueta}{d.ingreso ? ` (ingreso ${d.ingreso[0]}–${d.ingreso[1]})` : ''}</option>)}
      </select>}
      {que === 'franco_fijo' && <select aria-label="Día" value={dia} onChange={e => setDia(Number(e.target.value))} style={estiloCampo}>{DIAS_SEMANA.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>}
      {(que === 'no_antes_de' || que === 'no_despues_de') && <select aria-label="Hora" value={hora} onChange={e => setHora(e.target.value)} style={estiloCampo}>{HORAS.map(h => <option key={h} value={h}>{h}</option>)}</select>}
      <select aria-label="Período" value={periodoSel} onChange={e => setPeriodoSel(e.target.value as typeof periodoSel)} style={estiloCampo}>
        <option value="semana">La semana que viene</option><option value="anio">Hasta fin de año</option><option value="siempre">Sin fecha de fin</option><option value="fechas">Elegir fechas</option>
      </select>
      {temporal && <><input aria-label="Desde" type="date" value={desde} onChange={e => setDesde(e.target.value)} style={estiloCampo} /><input aria-label="Hasta" type="date" value={hasta} onChange={e => setHasta(e.target.value)} style={estiloCampo} /></>}
      <Boton onClick={agregar}>Agregar</Boton>
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

