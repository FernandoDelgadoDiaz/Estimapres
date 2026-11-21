// Piezas visuales comunes de las pantallas del supervisor: mismas tarjetas, títulos, indicadores y botones.
import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { ResumenSemana } from '../../utils/resumenSemana'

export function Pagina({ titulo, descripcion, acciones, children }: { titulo: string; descripcion?: string; acciones?: ReactNode; children: ReactNode }) {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: 800, fontFamily: "'Syne', sans-serif", color: 'var(--text)', margin: 0, letterSpacing: '-0.5px' }}>{titulo}</h1>
          {descripcion && <p style={{ color: 'var(--text-muted)', fontSize: '15px', margin: '6px 0 0' }}>{descripcion}</p>}
        </div>
        {acciones && <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>{acciones}</div>}
      </div>
      {children}
    </div>
  )
}

export function Tarjeta({ children, estilo, etiqueta }: { children: ReactNode; estilo?: CSSProperties; etiqueta?: string }) {
  return (
    <section aria-label={etiqueta} style={{ background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', padding: '24px', ...estilo }}>
      {children}
    </section>
  )
}

export function Subtitulo({ children }: { children: ReactNode }) {
  return <h2 style={{ fontSize: '18px', fontWeight: 800, fontFamily: "'Syne', sans-serif", color: 'var(--text)', margin: 0 }}>{children}</h2>
}

type Tono = 'normal' | 'bien' | 'atencion' | 'mal'
const COLOR: Record<Tono, string> = { normal: 'var(--text)', bien: 'var(--success)', atencion: 'var(--warning)', mal: 'var(--danger)' }

export function Indicador({ valor, etiqueta, tono = 'normal' }: { valor: string; etiqueta: string; tono?: Tono }) {
  return (
    <div style={{ minWidth: '150px' }}>
      <div style={{ fontSize: '30px', fontWeight: 800, fontFamily: "'Syne', sans-serif", color: COLOR[tono], letterSpacing: '-0.5px', lineHeight: 1.1 }}>{valor}</div>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>{etiqueta}</div>
    </div>
  )
}

/** Color de la cobertura: verde completa, ámbar ≥ 90 %, rojo por debajo. */
export const tonoCobertura = (pct: number): Tono => pct >= 99.95 ? 'bien' : pct >= 90 ? 'atencion' : 'mal'
export const formatoHoras = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(1).replace('.', ',')} h`
export const formatoPct = (pct: number) => `${pct.toFixed(1).replace('.', ',')} %`

const base: CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '10px 20px', borderRadius: '100px',
  fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: '14px', textDecoration: 'none', cursor: 'pointer', border: 'none',
}
const primario: CSSProperties = { ...base, background: 'var(--accent)', color: 'var(--accent-dark)' }
const secundario: CSSProperties = { ...base, background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)' }

export function BotonLink({ a, children, variante = 'primario' }: { a: string; children: ReactNode; variante?: 'primario' | 'secundario' }) {
  return <Link to={a} style={variante === 'primario' ? primario : secundario}>{children}</Link>
}
export function Boton({ onClick, children, variante = 'primario', disabled }: { onClick: () => void; children: ReactNode; variante?: 'primario' | 'secundario'; disabled?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} style={{ ...(variante === 'primario' ? primario : secundario), opacity: disabled ? 0.5 : 1 }}>{children}</button>
}

/** Indicador en mosaico (para el resumen de la semana). */
function Mosaico({ valor, etiqueta, tono = 'normal' }: { valor: string; etiqueta: string; tono?: Tono }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px', background: 'var(--card)' }}>
      <div style={{ fontSize: '28px', fontWeight: 800, fontFamily: "'Syne', sans-serif", color: COLOR[tono], letterSpacing: '-0.5px', lineHeight: 1.1 }}>{valor}</div>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>{etiqueta}</div>
    </div>
  )
}

/** Resumen de la semana: tres números a la izquierda y dónde faltan cajas a la derecha (usa todo el ancho). */
export function ResumenCobertura({ resumen, maxTramos = 6 }: { resumen: ResumenSemana; maxTramos?: number }) {
  const sinFaltantes = resumen.faltantes.length === 0
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px', alignItems: 'stretch' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px', alignContent: 'start' }}>
        <Mosaico valor={formatoPct(resumen.coberturaPct)} etiqueta="necesidad cubierta" tono={tonoCobertura(resumen.coberturaPct)} />
        <Mosaico valor={formatoHoras(resumen.horasNecesarias)} etiqueta="horas de caja necesarias" />
        <Mosaico valor={formatoHoras(resumen.horasSinCubrir)} etiqueta="horas sin cubrir" tono={resumen.horasSinCubrir > 0 ? 'atencion' : 'bien'} />
      </div>
      <div style={{ background: 'var(--surface)', borderRadius: '12px', padding: '14px 16px' }}>
        <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Dónde faltan cajas</p>
        {sinFaltantes ? (
          <p style={{ margin: 0, fontSize: '14px', color: 'var(--success)' }}>Todas las franjas tienen las cajas necesarias.</p>
        ) : (
          <>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '4px 16px', fontSize: '14px' }}>
              {resumen.faltantes.slice(0, maxTramos).map(t => (
                <li key={`${t.dia}-${t.desde}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                  <span><strong>{t.diaNombre}</strong> {t.desde}–{t.hasta}</span>
                  <span style={{ color: t.cajas > 1 ? 'var(--danger)' : 'var(--warning)', fontWeight: 600, whiteSpace: 'nowrap' }}>{t.cajas === 1 ? '−1 caja' : `−${t.cajas} cajas`}</span>
                </li>
              ))}
            </ul>
            {resumen.faltantes.length > maxTramos && (
              <p style={{ margin: '8px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>y {resumen.faltantes.length - maxTramos} {resumen.faltantes.length - maxTramos === 1 ? 'tramo más' : 'tramos más'} con menos faltante (ver la cobertura por franja).</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** Interruptor accesible (sí/no). */
export function Interruptor({ activo, onCambiar, etiqueta, disabled }: { activo: boolean; onCambiar: (v: boolean) => void; etiqueta: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta} disabled={disabled} onClick={() => onCambiar(!activo)}
      style={{ width: '46px', height: '26px', borderRadius: '100px', border: 'none', padding: '3px', cursor: disabled ? 'default' : 'pointer', flexShrink: 0,
        background: activo ? 'var(--accent-strong)' : 'var(--border-hover)', transition: 'background 0.15s', opacity: disabled ? 0.5 : 1 }}>
      <span style={{ display: 'block', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.2)',
        transform: activo ? 'translateX(20px)' : 'translateX(0)', transition: 'transform 0.15s' }} />
    </button>
  )
}

/** Fila de ajuste: título, una línea de ayuda opcional y el control a la derecha. */
export function FilaAjuste({ titulo, ayuda, children, id }: { titulo: string; ayuda?: string; children: ReactNode; id?: string }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px 24px', padding: '14px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ flex: '1 1 320px' }}>
        <label htmlFor={id} style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>{titulo}</label>
        {ayuda && <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>{ayuda}</p>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>{children}</div>
    </div>
  )
}

export const estiloCampo: CSSProperties = {
  border: '1px solid var(--border)', borderRadius: '10px', padding: '8px 12px', background: 'var(--card)', color: 'var(--text)', fontSize: '14px',
}

/** Sección de la pantalla de configuración: título, descripción corta y filas. */
export function Seccion({ titulo, descripcion, children }: { titulo: string; descripcion?: string; children: ReactNode }) {
  return (
    <Tarjeta etiqueta={titulo}>
      <Subtitulo>{titulo}</Subtitulo>
      {descripcion && <p style={{ margin: '4px 0 8px', fontSize: '14px', color: 'var(--text-muted)' }}>{descripcion}</p>}
      <div style={{ marginTop: descripcion ? 0 : '8px' }}>{children}</div>
    </Tarjeta>
  )
}
