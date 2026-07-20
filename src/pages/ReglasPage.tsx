import { useMemo, useState } from 'react'
import { DIAS_SEMANA, ReglaConfigurable, TipoReglaColaborador, TipoReglaLocal } from '../types'
import { useReglas } from '../hooks/useReglas'
import { useColaboradores } from '../hooks/useColaboradores'
import {
  validarConflictosReglas,
  ETIQUETAS_OPERATIVAS,
  DEFAULTS_OPERATIVOS,
  type TipoReglaOperativa,
} from '../utils/preferencias'

const TIPOS_OPERATIVOS: TipoReglaOperativa[] = [
  'apertura_solo_aux',
  'sin_aux_cierre',
  'supervisor_jornada_completa',
  'franco_medio_corridos',
]

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
  borderRadius: '12px',
  padding: '10px 14px',
  background: 'var(--card)',
  color: 'var(--text)',
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: '14px',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--text)',
  marginBottom: '6px',
}

const TIPOS_COLABORADOR: Array<{ valor: TipoReglaColaborador; etiqueta: string }> = [
  { valor: 'franco_fijo', etiqueta: 'Franco fijo (siempre el mismo día)' },
  { valor: 'no_antes_de', etiqueta: 'No puede entrar antes de cierta hora' },
  { valor: 'no_despues_de', etiqueta: 'No puede salir después de cierta hora' },
  { valor: 'siempre_manana', etiqueta: 'Siempre turno de mañana' },
  { valor: 'siempre_cierre', etiqueta: 'Siempre turno de cierre' },
]

const TIPOS_LOCAL: Array<{ valor: TipoReglaLocal; etiqueta: string }> = [
  { valor: 'min_cajeros_franja', etiqueta: 'Mínimo de cajeros en una franja horaria' },
  { valor: 'max_francos_dia', etiqueta: 'Máximo de francos el mismo día' },
]

export default function ReglasPage() {
  const { reglas, agregarRegla, actualizarRegla, eliminarRegla, toggleActiva } = useReglas()
  const { colaboradores } = useColaboradores()

  // ===== Reglas operativas (toggles con default) =====
  const estadoOperativa = (t: TipoReglaOperativa): boolean => {
    const r = reglas.find(x => x.ambito === 'local' && x.tipo === t)
    return r ? r.activa : DEFAULTS_OPERATIVOS[t]
  }
  const descOperativa = (t: TipoReglaOperativa, on: boolean) =>
    `${ETIQUETAS_OPERATIVAS[t].titulo}: ${on ? 'activada' : 'desactivada'}`
  const toggleOperativa = (t: TipoReglaOperativa) => {
    const existente = reglas.find(x => x.ambito === 'local' && x.tipo === t)
    const nuevo = !(existente ? existente.activa : DEFAULTS_OPERATIVOS[t])
    if (existente) actualizarRegla(existente.id, { activa: nuevo, descripcion: descOperativa(t, nuevo) })
    else agregarRegla({ ambito: 'local', tipo: t, activa: nuevo, descripcion: descOperativa(t, nuevo) })
  }

  // Regla 6 (máx francos por día): un único rule max_francos_dia editable
  const reglaMaxFrancos = reglas.find(r => r.ambito === 'local' && r.tipo === 'max_francos_dia')
  const maxFrancosActual = reglaMaxFrancos?.cantidad ?? 2
  const setMaxFrancos = (n: number) => {
    const val = Math.max(1, Math.min(6, Math.round(n)))
    const desc = `Máximo ${val} franco${val === 1 ? '' : 's'} por día`
    if (reglaMaxFrancos) actualizarRegla(reglaMaxFrancos.id, { cantidad: val, activa: true, descripcion: desc })
    else agregarRegla({ ambito: 'local', tipo: 'max_francos_dia', cantidad: val, activa: true, descripcion: desc })
  }

  // Reglas gestionadas arriba (sección operativa): no se listan abajo para no duplicarlas.
  const TIPOS_GESTIONADOS = new Set<string>([...TIPOS_OPERATIVOS, 'max_francos_dia'])
  const reglasListadas = reglas.filter(r => !(r.ambito === 'local' && TIPOS_GESTIONADOS.has(r.tipo)))

  const [ambito, setAmbito] = useState<'colaborador' | 'local'>('colaborador')
  const [tipo, setTipo] = useState<string>('franco_fijo')
  const [colaboradorNombre, setColaboradorNombre] = useState('')
  const [dia, setDia] = useState<number>(-1)
  const [hora, setHora] = useState('')
  const [horaDesde, setHoraDesde] = useState('')
  const [horaHasta, setHoraHasta] = useState('')
  const [cantidad, setCantidad] = useState<number>(2)
  const [conVigencia, setConVigencia] = useState(false)
  const [vigenciaDesde, setVigenciaDesde] = useState('')
  const [vigenciaHasta, setVigenciaHasta] = useState('')
  const [errorForm, setErrorForm] = useState('')

  const cajeros = colaboradores.filter(c => c.activo && (c.tipo === 'FULL' || c.tipo === 'PART'))
  const conflictos = useMemo(() => validarConflictosReglas(reglas, colaboradores), [reglas, colaboradores])

  const cambiarAmbito = (a: 'colaborador' | 'local') => {
    setAmbito(a)
    setTipo(a === 'colaborador' ? 'franco_fijo' : 'min_cajeros_franja')
    setErrorForm('')
  }

  const describir = (): string => {
    const vigencia = conVigencia && (vigenciaDesde || vigenciaHasta)
      ? ` (vigente ${vigenciaDesde || 'siempre'} → ${vigenciaHasta || 'sin límite'})`
      : ''
    switch (tipo) {
      case 'franco_fijo': return `${colaboradorNombre}: franco fijo los ${DIAS_SEMANA[dia] ?? '?'}${vigencia}`
      case 'no_antes_de': return `${colaboradorNombre}: no entra antes de las ${hora}${vigencia}`
      case 'no_despues_de': return `${colaboradorNombre}: no sale después de las ${hora}${vigencia}`
      case 'siempre_manana': return `${colaboradorNombre}: siempre turno de mañana${vigencia}`
      case 'siempre_cierre': return `${colaboradorNombre}: siempre turno de cierre${vigencia}`
      case 'min_cajeros_franja':
        return `Mínimo ${cantidad} cajeros ${dia === -1 ? 'todos los días' : `los ${DIAS_SEMANA[dia]}`} de ${horaDesde} a ${horaHasta}${vigencia}`
      case 'max_francos_dia': return `Máximo ${cantidad} francos por día${vigencia}`
      default: return ''
    }
  }

  const handleAgregar = () => {
    setErrorForm('')
    if (ambito === 'colaborador' && !colaboradorNombre) {
      setErrorForm('Seleccioná un colaborador.')
      return
    }
    if (tipo === 'franco_fijo' && dia < 0) {
      setErrorForm('Seleccioná el día del franco.')
      return
    }
    if ((tipo === 'no_antes_de' || tipo === 'no_despues_de') && !hora) {
      setErrorForm('Ingresá la hora.')
      return
    }
    if (tipo === 'min_cajeros_franja' && (!horaDesde || !horaHasta || horaHasta <= horaDesde)) {
      setErrorForm('Ingresá una franja horaria válida (desde < hasta).')
      return
    }
    if ((tipo === 'min_cajeros_franja' || tipo === 'max_francos_dia') && cantidad < 1) {
      setErrorForm('La cantidad debe ser al menos 1.')
      return
    }

    agregarRegla({
      ambito,
      tipo: tipo as ReglaConfigurable['tipo'],
      colaboradorNombre: ambito === 'colaborador' ? colaboradorNombre : undefined,
      dia: tipo === 'franco_fijo' || tipo === 'min_cajeros_franja' ? dia : undefined,
      hora: tipo === 'no_antes_de' || tipo === 'no_despues_de' ? hora : undefined,
      horaDesde: tipo === 'min_cajeros_franja' ? horaDesde : undefined,
      horaHasta: tipo === 'min_cajeros_franja' ? horaHasta : undefined,
      cantidad: tipo === 'min_cajeros_franja' || tipo === 'max_francos_dia' ? cantidad : undefined,
      vigenciaDesde: conVigencia && vigenciaDesde ? vigenciaDesde : undefined,
      vigenciaHasta: conVigencia && vigenciaHasta ? vigenciaHasta : undefined,
      descripcion: describir(),
    })

    // limpiar campos de valor, mantener ámbito/tipo para cargas en serie
    setColaboradorNombre('')
    setDia(-1)
    setHora('')
    setHoraDesde('')
    setHoraHasta('')
    setConVigencia(false)
    setVigenciaDesde('')
    setVigenciaHasta('')
  }

  const pideValorDia = tipo === 'franco_fijo' || tipo === 'min_cajeros_franja'
  const pideHora = tipo === 'no_antes_de' || tipo === 'no_despues_de'
  const pideFranja = tipo === 'min_cajeros_franja'
  const pideCantidad = tipo === 'min_cajeros_franja' || tipo === 'max_francos_dia'

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '36px', fontWeight: 800, fontFamily: "'Syne', sans-serif", color: 'var(--text)', margin: 0, letterSpacing: '-0.5px' }}>
          Reglas del local
        </h1>
        <p style={{ color: 'var(--text-muted)', fontFamily: "'Space Grotesk', sans-serif", fontSize: '16px', marginTop: '8px' }}>
          Restricciones que el algoritmo aplica en cada generación. Se guardan por sucursal y podés activarlas o pausarlas sin borrarlas.
        </p>
      </div>

      {/* Reglas operativas de la sucursal (toggles con default) */}
      <div style={{ background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', padding: '24px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '20px', fontWeight: 800, fontFamily: "'Syne', sans-serif", color: 'var(--text)', marginBottom: '4px' }}>
          Reglas operativas de la sucursal
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
          Cómo opera esta sucursal. No son leyes laborales (esas nunca se tocan): configuralas según tu operatoria.
        </p>

        {TIPOS_OPERATIVOS.map(t => {
          const on = estadoOperativa(t)
          return (
            <div key={t} style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', padding: '14px 0', borderTop: '1px solid var(--border)' }}>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
                  {ETIQUETAS_OPERATIVAS[t].titulo}
                  <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', marginLeft: '8px' }}>
                    (default: {DEFAULTS_OPERATIVOS[t] ? 'activada' : 'desactivada'})
                  </span>
                </p>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>{ETIQUETAS_OPERATIVAS[t].descripcion}</p>
              </div>
              <button
                onClick={() => toggleOperativa(t)}
                style={{
                  flexShrink: 0, minWidth: '92px', padding: '8px 16px', borderRadius: '100px',
                  border: '1px solid var(--border)',
                  background: on ? 'var(--accent)' : 'var(--surface)',
                  color: on ? 'var(--accent-dark)' : 'var(--text-muted)',
                  fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                }}
              >
                {on ? 'Activada' : 'Desactivada'}
              </button>
            </div>
          )
        })}

        {/* Máximo de francos por día (regla 6) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 0', borderTop: '1px solid var(--border)' }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
              Máximo de francos por día
              <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)', marginLeft: '8px' }}>(default: 2)</span>
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
              No más de N cajeros FULL+PART con franco el mismo día. Subilo o bajalo según tu dotación.
            </p>
          </div>
          <input
            type="number" min={1} max={6} value={maxFrancosActual}
            onChange={e => setMaxFrancos(Number(e.target.value))}
            style={{ ...inputStyle, width: '80px', textAlign: 'center' }}
          />
        </div>
      </div>

      {/* Conflictos con reglas duras */}
      {conflictos.length > 0 && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--accent-strong)', borderRadius: '12px', padding: '16px 20px', marginBottom: '24px' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-strong)', marginBottom: '8px' }}>
            ⚠️ Avisos: conflictos con las reglas laborales duras
          </h4>
          {conflictos.map((c, i) => (
            <p key={i} style={{ fontSize: '13px', color: 'var(--text)', marginTop: '4px' }}>• {c}</p>
          ))}
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
            Las reglas duras (48h FULL, francos, descansos) nunca se violan: en caso de conflicto se aplican recortadas y acá se explica cómo.
          </p>
        </div>
      )}

      {/* Formulario */}
      <div style={{ background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', padding: '24px', marginBottom: '32px' }}>
        <h3 style={{ fontSize: '20px', fontWeight: 800, fontFamily: "'Syne', sans-serif", color: 'var(--text)', marginBottom: '16px' }}>
          Agregar regla
        </h3>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          {(['colaborador', 'local'] as const).map(a => (
            <button
              key={a}
              onClick={() => cambiarAmbito(a)}
              style={{
                padding: '8px 20px',
                borderRadius: '100px',
                border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
                background: ambito === a ? 'var(--accent)' : 'var(--surface)',
                color: ambito === a ? 'var(--accent-dark)' : 'var(--text)',
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
              }}
            >
              {a === 'colaborador' ? 'Por colaborador' : 'General del local'}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          {ambito === 'colaborador' && (
            <div>
              <label style={labelStyle}>Colaborador</label>
              <select value={colaboradorNombre} onChange={e => setColaboradorNombre(e.target.value)} style={inputStyle}>
                <option value="">Seleccionar...</option>
                {cajeros.map(c => (
                  <option key={c.id} value={c.nombre}>{c.nombre} ({c.tipo})</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label style={labelStyle}>Tipo de regla</label>
            <select value={tipo} onChange={e => setTipo(e.target.value)} style={inputStyle}>
              {(ambito === 'colaborador' ? TIPOS_COLABORADOR : TIPOS_LOCAL).map(t => (
                <option key={t.valor} value={t.valor}>{t.etiqueta}</option>
              ))}
            </select>
          </div>

          {pideValorDia && (
            <div>
              <label style={labelStyle}>Día</label>
              <select value={dia} onChange={e => setDia(Number(e.target.value))} style={inputStyle}>
                {tipo === 'min_cajeros_franja' && <option value={-1}>Todos los días</option>}
                {tipo === 'franco_fijo' && <option value={-1}>Seleccionar...</option>}
                {DIAS_SEMANA.map((d, i) => (
                  <option key={d} value={i}>{d}</option>
                ))}
              </select>
            </div>
          )}

          {pideHora && (
            <div>
              <label style={labelStyle}>Hora</label>
              <input type="time" value={hora} onChange={e => setHora(e.target.value)} style={inputStyle} step={1800} />
            </div>
          )}

          {pideFranja && (
            <>
              <div>
                <label style={labelStyle}>Desde</label>
                <input type="time" value={horaDesde} onChange={e => setHoraDesde(e.target.value)} style={inputStyle} step={1800} />
              </div>
              <div>
                <label style={labelStyle}>Hasta</label>
                <input type="time" value={horaHasta} onChange={e => setHoraHasta(e.target.value)} style={inputStyle} step={1800} />
              </div>
            </>
          )}

          {pideCantidad && (
            <div>
              <label style={labelStyle}>{tipo === 'max_francos_dia' ? 'Máximo de francos' : 'Cantidad mínima'}</label>
              <input type="number" min={1} max={10} value={cantidad} onChange={e => setCantidad(Number(e.target.value))} style={inputStyle} />
            </div>
          )}
        </div>

        <div style={{ marginTop: '16px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text)', cursor: 'pointer' }}>
            <input type="checkbox" checked={conVigencia} onChange={e => setConVigencia(e.target.checked)} />
            Restricción temporal (con fecha desde/hasta)
          </label>
          {conVigencia && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginTop: '12px' }}>
              <div>
                <label style={labelStyle}>Vigente desde</label>
                <input type="date" value={vigenciaDesde} onChange={e => setVigenciaDesde(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Vigente hasta</label>
                <input type="date" value={vigenciaHasta} onChange={e => setVigenciaHasta(e.target.value)} style={inputStyle} />
              </div>
            </div>
          )}
        </div>

        {errorForm && (
          <p style={{ color: 'var(--accent-strong)', fontSize: '13px', marginTop: '12px' }}>⚠️ {errorForm}</p>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            {describir() || 'Completá el formulario para ver el resumen de la regla.'}
          </p>
          <button
            onClick={handleAgregar}
            style={{ background: 'var(--accent)', color: 'var(--accent-dark)', padding: '12px 24px', borderRadius: '100px', border: 'none', fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}
          >
            + Agregar regla
          </button>
        </div>
      </div>

      {/* Listado */}
      <div style={{ background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 800, fontFamily: "'Syne', sans-serif", color: 'var(--text)' }}>
            Reglas configuradas ({reglasListadas.length})
          </h3>
        </div>
        {reglasListadas.length === 0 ? (
          <p style={{ padding: '32px', color: 'var(--text-muted)', textAlign: 'center', fontSize: '14px' }}>
            Todavía no hay reglas por colaborador ni mínimos de cajeros. Las que agregues acá se aplican automáticamente en cada generación de horarios.
          </p>
        ) : (
          <div>
            {reglasListadas.map(r => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 24px', borderBottom: '1px solid var(--border)', opacity: r.activa ? 1 : 0.5 }}>
                <span style={{
                  fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '100px',
                  background: r.ambito === 'colaborador' ? 'var(--purple)' : 'var(--accent)',
                  color: r.ambito === 'colaborador' ? 'var(--bg)' : 'var(--accent-dark)',
                  whiteSpace: 'nowrap',
                }}>
                  {r.ambito === 'colaborador' ? 'COLABORADOR' : 'LOCAL'}
                </span>
                <span style={{ flex: 1, fontSize: '14px', color: 'var(--text)' }}>{r.descripcion}</span>
                {(r.vigenciaDesde || r.vigenciaHasta) && (
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>⏳ temporal</span>
                )}
                <button
                  onClick={() => toggleActiva(r.id)}
                  style={{
                    padding: '6px 14px', borderRadius: '100px', border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
                    background: r.activa ? 'var(--accent)' : 'var(--surface)',
                    color: r.activa ? 'var(--accent-dark)' : 'var(--text-muted)',
                    fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {r.activa ? 'Activa' : 'Pausada'}
                </button>
                <button
                  onClick={() => { if (confirm(`¿Eliminar la regla "${r.descripcion}"?`)) eliminarRegla(r.id) }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '18px', cursor: 'pointer' }}
                  title="Eliminar regla"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
