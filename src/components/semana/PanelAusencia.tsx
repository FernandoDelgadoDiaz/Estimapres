/**
 * AH2-057 · «Cargar ausencia» sobre un horario ya generado.
 * El supervisor (auxiliar de cajas) carga quién falta, desde y hasta cuándo y el motivo; la app propone dos
 * coberturas desde el día siguiente al aviso y muestra SOLO los cambios. Al aprobar se guarda una versión nueva.
 */
import { useMemo, useState } from 'react'
import type { AusenciaCargada, SemanaHistorial } from '../../types'
import { Boton, Tarjeta } from '../ui/Basicos'
import { NOMBRES_DIA, fechaLocal, proponerCobertura, type EntradaReparacion, type Propuesta, type ResultadoReparacion } from '../../contingencias/reparar'

export interface PersonaSemana { id: string; nombre: string; tipo: string }

interface Props {
  semana: SemanaHistorial
  personas: PersonaSemana[]
  supervisores: string[]
  /** Arma la entrada de la búsqueda; devuelve un texto si la semana no tiene los datos necesarios. */
  construirEntrada: (ausencia: AusenciaCargada) => EntradaReparacion | string
  onAprobar: (r: ResultadoReparacion, p: Propuesta, ausencia: AusenciaCargada, aprobadoPor: string) => void
  onCerrar: () => void
  /** Para pruebas: «hoy» en la zona de la sucursal. */
  hoy?: string
}

const MOTIVOS = ['Enfermedad', 'Licencia', 'Ausencia avisada', 'Trámite personal', 'Otro']
const sumarDias = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const horas = (mediasHoras: number) => `${(mediasHoras / 2).toLocaleString('es-AR')} h`
const campo: React.CSSProperties = { padding: '9px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', fontSize: '14px', color: 'var(--text)', width: '100%' }
const etiqueta: React.CSSProperties = { display: 'grid', gap: '4px', fontSize: '13px', color: 'var(--text-muted)', fontWeight: 600 }

export default function PanelAusencia({ semana, personas, supervisores, construirEntrada, onAprobar, onCerrar, hoy: hoyProp }: Props) {
  const hoy = hoyProp ?? fechaLocal(new Date())
  const domingo = sumarDias(semana.fechaLunes, 6)
  const manana = sumarDias(hoy, 1)
  const desdeInicial = manana < semana.fechaLunes ? semana.fechaLunes : manana
  const [persona, setPersona] = useState('')
  const [desde, setDesde] = useState(desdeInicial)
  const [hasta, setHasta] = useState(desdeInicial)
  const [motivo, setMotivo] = useState('')
  const [aviso, setAviso] = useState(hoy)
  const [aprobadoPor, setAprobadoPor] = useState('')
  const [resultado, setResultado] = useState<{ r: ResultadoReparacion; ausencia: AusenciaCargada } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [buscando, setBuscando] = useState(false)

  const semanaTerminada = aviso >= domingo
  const listo = !!persona && !!motivo.trim() && desde <= hasta && hasta >= semana.fechaLunes && desde <= domingo && !semanaTerminada

  const buscar = () => {
    setError(null); setResultado(null)
    const p = personas.find(x => x.id === persona)
    if (!p) return
    const ausencia: AusenciaCargada = { id: crypto.randomUUID(), colaboradorId: p.id, nombre: p.nombre, desde, hasta, motivo: motivo.trim(), aviso }
    const entrada = construirEntrada(ausencia)
    if (typeof entrada === 'string') { setError(entrada); return }
    setBuscando(true)
    // Se cede un instante a la pantalla para mostrar «Buscando…» (la búsqueda tarda ~1 s).
    setTimeout(() => {
      try {
        const r = proponerCobertura(entrada)
        if (!r.diasModificables.length) setError('La ausencia no cae en ningún día posterior al aviso dentro de esta semana: no hay nada para replanificar.')
        else setResultado({ r, ausencia })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo buscar cobertura.')
      } finally { setBuscando(false) }
    }, 30)
  }

  const grupos = useMemo(() => {
    const g: Record<string, PersonaSemana[]> = {}
    for (const p of personas) (g[p.tipo] ??= []).push(p)
    return Object.entries(g)
  }, [personas])

  return (
    <Tarjeta etiqueta="Ausencia o incidencia">
      <div data-testid="panel-ausencia" style={{ display: 'grid', gap: '16px' }}>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-muted)' }}>
          Cargá quién no viene. La app propone cómo cubrirlo <strong>desde el día siguiente al aviso</strong>, sin agregar horas a nadie,
          y con todas las reglas de siempre. Elegí una opción y aprobala: se guarda como una versión nueva del horario.
        </p>
        <div style={{ display: 'grid', gap: '12px', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <label style={etiqueta}>Persona
            <select aria-label="Persona ausente" value={persona} onChange={e => { setPersona(e.target.value); setResultado(null) }} style={campo}>
              <option value="">Elegí…</option>
              {grupos.map(([tipo, ps]) => <optgroup key={tipo} label={tipo}>{ps.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</optgroup>)}
            </select>
          </label>
          <label style={etiqueta}>Desde
            <input aria-label="Desde" type="date" value={desde} min={semana.fechaLunes} max={domingo} onChange={e => { setDesde(e.target.value); if (e.target.value > hasta) setHasta(e.target.value); setResultado(null) }} style={campo} />
          </label>
          <label style={etiqueta}>Hasta
            <input aria-label="Hasta" type="date" value={hasta} min={desde} onChange={e => { setHasta(e.target.value); setResultado(null) }} style={campo} />
          </label>
          <label style={etiqueta}>Motivo
            <input aria-label="Motivo" list="motivos-ausencia" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Enfermedad, licencia…" style={campo} />
            <datalist id="motivos-ausencia">{MOTIVOS.map(m => <option key={m} value={m} />)}</datalist>
          </label>
          <label style={etiqueta}>Día del aviso
            <input aria-label="Día del aviso" type="date" value={aviso} max={hoy} onChange={e => { setAviso(e.target.value); setResultado(null) }} style={campo} />
          </label>
        </div>
        {semanaTerminada && <p role="alert" style={{ margin: 0, color: '#7f1d1d', fontSize: '14px' }}>Esta semana ya no tiene días posteriores al aviso para replanificar.</p>}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Boton onClick={buscar} disabled={!listo || buscando}>{buscando ? 'Buscando cobertura…' : 'Buscar cobertura'}</Boton>
          <Boton variante="secundario" onClick={onCerrar}>Cancelar</Boton>
        </div>
        {error && <p role="alert" style={{ margin: 0, color: '#7f1d1d', fontSize: '14px' }}>{error}</p>}

        {resultado && (
          <section data-testid="propuestas-ausencia" style={{ display: 'grid', gap: '16px' }}>
            <ResumenImpacto r={resultado.r} ausencia={resultado.ausencia} />
            <label style={{ ...etiqueta, maxWidth: '360px' }}>Aprueba (supervisor / auxiliar de cajas)
              <input aria-label="Aprueba" list="supervisores-ausencia" value={aprobadoPor} onChange={e => setAprobadoPor(e.target.value)} placeholder="Nombre de quien aprueba" style={campo} />
              <datalist id="supervisores-ausencia">{supervisores.map(s => <option key={s} value={s} />)}</datalist>
            </label>
            <div style={{ display: 'grid', gap: '16px', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
              {(resultado.r.coinciden ? [resultado.r.menorImpacto] : [resultado.r.menorImpacto, resultado.r.mejorCobertura]).map(p => (
                <TarjetaPropuesta key={p.opcion} p={p} r={resultado.r} unica={resultado.r.coinciden}
                  puedeAprobar={!!aprobadoPor.trim()} onAprobar={() => onAprobar(resultado.r, p, resultado.ausencia, aprobadoPor.trim())} />
              ))}
            </div>
          </section>
        )}
      </div>
    </Tarjeta>
  )
}

function ResumenImpacto({ r, ausencia }: { r: ResultadoReparacion; ausencia: AusenciaCargada }) {
  const dias = r.diasAusente.map(d => NOMBRES_DIA[d].toLowerCase()).join(', ')
  return (
    <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '12px 16px', fontSize: '14px', display: 'grid', gap: '4px' }}>
      <span><strong>{ausencia.nombre}</strong> no viene: {dias}.</span>
      <span>Se replanifica desde el <strong>{NOMBRES_DIA[Math.min(...r.diasModificables)].toLowerCase()}</strong> (el día del aviso y los anteriores no se tocan).</span>
      <span style={{ color: 'var(--text-muted)' }}>De mañana al domingo: sin la ausencia faltaban {horas(r.faltanteOriginal)}; con la ausencia y sin cambios faltarían {horas(r.faltanteSinCambios)}.</span>
      {r.faltanteDiaAviso > 0 && r.diasAusente.some(d => !r.diasModificables.includes(d)) && (
        <span style={{ color: '#92400e' }}>Hoy quedan {horas(r.faltanteDiaAviso)} sin cubrir: hoy no se replanifica, resolvelo en el momento.</span>
      )}
    </div>
  )
}

function TarjetaPropuesta({ p, r, unica, puedeAprobar, onAprobar }: { p: Propuesta; r: ResultadoReparacion; unica: boolean; puedeAprobar: boolean; onAprobar: () => void }) {
  const titulo = unica ? 'Propuesta' : p.opcion === 'menor_impacto' ? 'Menor impacto' : 'Mejor cobertura'
  const bajada = unica ? 'Las dos opciones dan el mismo resultado.'
    : p.opcion === 'menor_impacto' ? 'No mueve francos. Cambia a la menor cantidad de personas.' : 'Puede mover francos o el medio franco para cubrir más.'
  // Mismo período que el total: de mañana (primer día replanificado) al domingo.
  const porDia = Array.from({ length: 7 }, (_, d) => d).filter(d => d >= Math.min(...r.diasModificables))
  const bloqueada = p.violaciones.length > 0
  return (
    <article data-testid={`propuesta-${p.opcion}`} style={{ border: '1px solid var(--border)', borderRadius: '16px', padding: '16px', display: 'grid', gap: '10px', background: 'var(--card)' }}>
      <div>
        <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>{titulo}</h3>
        <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>{bajada}</p>
      </div>
      <p style={{ margin: 0, fontSize: '14px' }}>
        Quedan sin cubrir <strong>{horas(p.faltante)}</strong> (sin cambios: {horas(r.faltanteSinCambios)}).
        {p.franjasDobles > 0 ? ` En ${horas(p.franjasDobles)} faltan 2 cajas o más.` : p.faltante > 0 ? ' Nunca falta más de 1 caja a la vez.' : ''}<br />
        {p.personas} {p.personas === 1 ? 'persona' : 'personas'} con cambios · {p.jornadas} {p.jornadas === 1 ? 'jornada' : 'jornadas'}
        {p.francosMovidos > 0 && ` · ${p.francosMovidos} ${p.francosMovidos === 1 ? 'día cambia' : 'días cambian'} de franco a trabajo o al revés`}
      </p>
      <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
        Sin cubrir por día (de mañana al domingo): {porDia.map(d => `${NOMBRES_DIA[d].slice(0, 3)} ${horas(p.faltantePorDia[d])}`).join(' · ')}
      </p>
      {p.cambios.length === 0
        ? <p style={{ margin: 0, fontSize: '14px' }}>{p.faltante > 0
            ? 'Sin cambios: no hay forma de cubrir más sin agregar horas ni mover francos. Se guarda la ausencia tal cual.'
            : 'No hace falta cambiar a nadie.'}</p>
        : (
          <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
            <thead><tr style={{ textAlign: 'left', color: 'var(--text-muted)' }}><th>Día</th><th>Quién</th><th>Antes</th><th>Después</th></tr></thead>
            <tbody>
              {p.cambios.map((c, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '4px 4px 4px 0' }}>{NOMBRES_DIA[c.dia].slice(0, 3)}</td>
                  <td style={{ padding: '4px' }}>{c.nombre}{c.tipo !== 'cajero' && <span style={{ color: 'var(--text-muted)' }}> ({c.tipo})</span>}</td>
                  <td style={{ padding: '4px', color: 'var(--text-muted)' }}>{c.antes}</td>
                  <td style={{ padding: '4px', fontWeight: 600 }}>{c.despues}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      {bloqueada && (
        <div role="alert" style={{ background: '#fee2e2', borderRadius: '10px', padding: '8px 12px', fontSize: '13px', color: '#7f1d1d' }}>
          No se puede aprobar: {p.violaciones.slice(0, 3).map(v => v.detalle).join(' ')}
          {p.violaciones.some(v => /^(H-A|OP_APERTURA|OP_SUPERVISION)/.test(v.codigo)) && ' Falta un supervisor: cargá en la tabla quién lo reemplaza (su presencia) y volvé a buscar.'}
        </div>
      )}
      <Boton onClick={onAprobar} disabled={!puedeAprobar || bloqueada}>Aprobar {unica ? 'propuesta' : titulo.toLowerCase()}</Boton>
      {!puedeAprobar && !bloqueada && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Completá quién aprueba.</span>}
    </article>
  )
}
