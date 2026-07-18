import { useMemo } from 'react'
import { useHistorial } from '../hooks/useHistorial'
import { useCorrecciones } from '../hooks/useCorrecciones'
import {
  calcularMetricasSemanales,
  calcularIndicadores,
  predecirCorrecciones,
  madurezPorBanda,
} from '../utils/efectividad'
import { derivarCriteriosCobertura } from '../utils/preferencias'
import { exportarEfectividadPDF } from '../utils/exportPDF'

const cardStyle: React.CSSProperties = {
  background: 'var(--card)',
  borderRadius: '16px',
  border: '1px solid var(--border)',
  boxShadow: 'var(--shadow)',
  overflow: 'hidden',
}

const tituloCard: React.CSSProperties = {
  fontSize: '18px', fontWeight: 800, fontFamily: "'Syne', sans-serif", color: 'var(--text)', margin: 0,
}

/** Gráfico de línea SVG minimalista (sin dependencias). */
function MiniChart({ puntos, color, unidad, alto = 120 }: {
  puntos: Array<{ etiqueta: string; valor: number }>
  color: string
  unidad?: string
  alto?: number
}) {
  if (puntos.length === 0) {
    return <p style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '16px 0' }}>Sin datos todavía.</p>
  }
  const ancho = 560
  const padX = 8
  const padY = 14
  const valores = puntos.map(p => p.valor)
  const min = Math.min(...valores, 0)
  const max = Math.max(...valores, 1)
  const rango = max - min || 1
  const x = (i: number) => puntos.length === 1
    ? ancho / 2
    : padX + (i * (ancho - 2 * padX)) / (puntos.length - 1)
  const y = (v: number) => alto - padY - ((v - min) * (alto - 2 * padY)) / rango
  const path = puntos.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.valor).toFixed(1)}`).join(' ')

  return (
    <div style={{ overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${ancho} ${alto}`} style={{ width: '100%', maxWidth: `${ancho}px`, display: 'block' }}>
        {/* línea de referencia superior e inferior */}
        <line x1={padX} y1={y(max)} x2={ancho - padX} y2={y(max)} stroke="var(--border)" strokeDasharray="4 4" />
        <line x1={padX} y1={y(min)} x2={ancho - padX} y2={y(min)} stroke="var(--border)" strokeDasharray="4 4" />
        <text x={ancho - padX} y={y(max) - 3} textAnchor="end" fontSize="10" fill="var(--text-muted)">{max.toFixed(0)}{unidad}</text>
        <text x={ancho - padX} y={y(min) - 3} textAnchor="end" fontSize="10" fill="var(--text-muted)">{min.toFixed(0)}{unidad}</text>
        <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {puntos.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.valor)} r="3.5" fill={color} />
            <title>{p.etiqueta}: {p.valor.toFixed(1)}{unidad}</title>
          </g>
        ))}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', maxWidth: `${ancho}px` }}>
        <span>{puntos[0].etiqueta}</span>
        {puntos.length > 1 && <span>{puntos[puntos.length - 1].etiqueta}</span>}
      </div>
    </div>
  )
}

function Indicador({ valor, etiqueta, color }: { valor: string; etiqueta: string; color?: string }) {
  return (
    <div style={{ ...cardStyle, padding: '20px', flex: 1, minWidth: '200px' }}>
      <div style={{ fontSize: '28px', fontWeight: 800, fontFamily: "'Syne', sans-serif", color: color ?? 'var(--text)', letterSpacing: '-0.5px' }}>
        {valor}
      </div>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>{etiqueta}</div>
    </div>
  )
}

/**
 * Dashboard de evolución: demuestra que el sistema aprende. Todo se deriva
 * de las semanas y correcciones persistidas en Supabase (acumulativo,
 * independiente del dispositivo).
 */
export default function EfectividadPage() {
  const { historial } = useHistorial()
  const { correcciones } = useCorrecciones()

  const metricas = useMemo(() => calcularMetricasSemanales(historial, correcciones), [historial, correcciones])
  const indicadores = useMemo(() => calcularIndicadores(metricas), [metricas])
  const prediccion = useMemo(() => predecirCorrecciones(metricas), [metricas])
  const criterios = useMemo(
    () => derivarCriteriosCobertura(correcciones, { semanas: historial }),
    [correcciones, historial]
  )
  const madurez = useMemo(() => madurezPorBanda(correcciones), [correcciones])

  const criteriosEstables = criterios.filter(c => c.estado === 'activo' && c.tendencia === 'estable')
  const criteriosDeclive = criterios.filter(c => c.estado === 'activo' && c.tendencia === 'declive')
  const hace3Meses = new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const criteriosRecientes = criterios.filter(c => c.estado === 'activo' && c.primeraSenal >= hace3Meses)
  const bandasMaduras = madurez.filter(m => m.estado === 'madura')
  const bandasEnAjuste = madurez.filter(m => m.estado === 'en_ajuste')

  const handleExportar = () => {
    const pdf = exportarEfectividadPDF(metricas, indicadores, prediccion, criterios, madurez)
    pdf.save(`efectividad-${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  const pctMotorColor = (pct: number | null) =>
    pct === null ? undefined : pct >= 95 ? 'var(--success)' : pct >= 85 ? 'var(--warning)' : 'var(--danger)'

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '16px' }}>
        <div style={{ flex: 1, minWidth: '260px' }}>
          <h1 style={{ fontSize: '36px', fontWeight: 800, fontFamily: "'Syne', sans-serif", color: 'var(--text)', margin: 0, letterSpacing: '-0.5px' }}>
            Efectividad del sistema
          </h1>
          <p style={{ color: 'var(--text-muted)', fontFamily: "'Space Grotesk', sans-serif", fontSize: '16px', marginTop: '8px' }}>
            La prueba de que el sistema aprende: las correcciones manuales deben bajar y la cobertura del motor debe subir, semana a semana.
          </p>
        </div>
        <button
          onClick={handleExportar}
          disabled={metricas.length === 0}
          style={{
            background: 'var(--accent)', color: 'var(--accent-dark)',
            padding: '10px 20px', borderRadius: '100px', border: 'none',
            fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '13px',
            letterSpacing: '-0.2px', cursor: metricas.length === 0 ? 'not-allowed' : 'pointer',
            opacity: metricas.length === 0 ? 0.5 : 1,
          }}
        >
          📄 Exportar reporte
        </button>
      </div>

      {metricas.length === 0 ? (
        <div style={{ ...cardStyle, padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>📈</div>
          <p style={{ color: 'var(--text-muted)', fontSize: '15px' }}>
            Todavía no hay semanas guardadas. Cada semana que generes (y cada corrección que hagas) alimenta estas métricas.
          </p>
        </div>
      ) : (
        <>
          {/* Indicadores */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
            <Indicador
              valor={indicadores.correccionesUltimaSemana !== null ? String(indicadores.correccionesUltimaSemana) : '–'}
              etiqueta={`Correcciones esta semana (promedio histórico: ${indicadores.promedioCorrecciones?.toFixed(1) ?? '–'})`}
              color={
                indicadores.correccionesUltimaSemana !== null && indicadores.promedioCorrecciones !== null
                  ? indicadores.correccionesUltimaSemana <= indicadores.promedioCorrecciones ? 'var(--success)' : 'var(--warning)'
                  : undefined
              }
            />
            <Indicador
              valor={indicadores.pctMotorUltimaSemana !== null ? `${indicadores.pctMotorUltimaSemana.toFixed(1)}%` : '–'}
              etiqueta="El motor cubre sin intervención humana (meta: >95%)"
              color={pctMotorColor(indicadores.pctMotorUltimaSemana)}
            />
            <Indicador
              valor={
                indicadores.tendenciaCorrecciones === 'mejorando' ? '↓ Bajando'
                  : indicadores.tendenciaCorrecciones === 'empeorando' ? '↑ Subiendo'
                  : indicadores.tendenciaCorrecciones === 'estable' ? '→ Estable' : '–'
              }
              etiqueta="Tendencia de correcciones (mitad reciente vs. anterior)"
              color={
                indicadores.tendenciaCorrecciones === 'mejorando' ? 'var(--success)'
                  : indicadores.tendenciaCorrecciones === 'empeorando' ? 'var(--danger)' : undefined
              }
            />
            {prediccion && (
              <Indicador
                valor={`~${prediccion.en4Semanas.toFixed(1)}`}
                etiqueta="Correcciones/semana proyectadas en 4 semanas (al ritmo actual)"
                color={prediccion.pendiente <= 0 ? 'var(--success)' : 'var(--warning)'}
              />
            )}
          </div>

          {/* Gráficos */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
            <div style={{ ...cardStyle, padding: '20px 24px' }}>
              <h3 style={tituloCard}>Correcciones manuales por semana</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 12px' }}>Debe tender a bajar si el sistema aprende.</p>
              <MiniChart
                puntos={metricas.map(m => ({ etiqueta: m.fechaLunes, valor: m.correcciones }))}
                color="var(--danger)"
              />
            </div>
            <div style={{ ...cardStyle, padding: '20px 24px' }}>
              <h3 style={tituloCard}>Cobertura propuesta por el motor</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 12px' }}>Antes de cualquier corrección. Debe tender a subir.</p>
              <MiniChart
                puntos={metricas.filter(m => m.pctMotor !== null).map(m => ({ etiqueta: m.fechaLunes, valor: m.pctMotor as number }))}
                color="var(--success)"
                unidad="%"
              />
            </div>
          </div>

          {/* Madurez por franja */}
          <div style={{ ...cardStyle, padding: '20px 24px' }}>
            <h3 style={tituloCard}>🎯 Madurez por franja horaria</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginTop: '12px' }}>
              <div style={{ flex: 1, minWidth: '260px' }}>
                <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--success)', textTransform: 'uppercase', marginBottom: '6px' }}>✅ Franjas maduras</p>
                {bandasMaduras.length === 0
                  ? <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Ninguna todavía.</p>
                  : bandasMaduras.map(m => (
                    <p key={m.banda} style={{ fontSize: '14px', color: 'var(--text)', marginTop: '4px' }}>
                      • {m.etiqueta}: hace {m.semanasSinCorreccion} semana{m.semanasSinCorreccion === 1 ? '' : 's'} sin correcciones
                    </p>
                  ))}
              </div>
              <div style={{ flex: 1, minWidth: '260px' }}>
                <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--warning)', textTransform: 'uppercase', marginBottom: '6px' }}>🔧 Aún necesitan ajuste</p>
                {bandasEnAjuste.length === 0
                  ? <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Ninguna: el motor resuelve todas las franjas corregidas alguna vez.</p>
                  : bandasEnAjuste.map(m => (
                    <p key={m.banda} style={{ fontSize: '14px', color: 'var(--text)', marginTop: '4px' }}>
                      • {m.etiqueta} (correcciones hace {m.semanasSinCorreccion} semana{m.semanasSinCorreccion === 1 ? '' : 's'})
                    </p>
                  ))}
              </div>
            </div>
          </div>

          {/* Criterios: estables / declive / recientes */}
          <div style={{ ...cardStyle, padding: '20px 24px' }}>
            <h3 style={tituloCard}>🧭 Criterios de planificación aprendidos</h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 12px' }}>
              Aprendizaje acumulativo con peso temporal: lo reciente pesa 1.0, hace 8 semanas 0.5. Un criterio sin confirmarse pierde peso gradualmente, nunca de golpe.
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
              <div style={{ flex: 1, minWidth: '240px' }}>
                <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--success)', textTransform: 'uppercase', marginBottom: '6px' }}>Estables</p>
                {criteriosEstables.length === 0
                  ? <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Ninguno.</p>
                  : criteriosEstables.map(c => (
                    <p key={c.banda} style={{ fontSize: '13px', color: 'var(--text)', marginTop: '4px' }}>
                      • {c.banda} (peso {c.score.toFixed(1)}, {c.semanas} sem.)
                    </p>
                  ))}
              </div>
              <div style={{ flex: 1, minWidth: '240px' }}>
                <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--warning)', textTransform: 'uppercase', marginBottom: '6px' }}>En declive</p>
                {criteriosDeclive.length === 0
                  ? <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Ninguno.</p>
                  : criteriosDeclive.map(c => (
                    <p key={c.banda} style={{ fontSize: '13px', color: 'var(--text)', marginTop: '4px' }}>
                      • {c.banda} (peso {c.score.toFixed(1)}, última señal {c.ultimaSenal})
                    </p>
                  ))}
              </div>
              <div style={{ flex: 1, minWidth: '240px' }}>
                <p style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-strong)', textTransform: 'uppercase', marginBottom: '6px' }}>Aprendidos en los últimos 3 meses</p>
                {criteriosRecientes.length === 0
                  ? <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Ninguno.</p>
                  : criteriosRecientes.map(c => (
                    <p key={c.banda} style={{ fontSize: '13px', color: 'var(--text)', marginTop: '4px' }}>
                      • {c.banda} (desde {c.primeraSenal})
                    </p>
                  ))}
              </div>
            </div>
          </div>

          {/* Tabla resumen semana a semana */}
          <div style={cardStyle}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={tituloCard}>Resumen semana a semana</h3>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead style={{ background: 'var(--surface)' }}>
                  <tr>
                    {['Semana', 'Lunes', 'Correcciones', '% Motor', '% Final', 'Criterios al generar', 'Señales nuevas'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...metricas].reverse().map(m => (
                    <tr key={m.semanaId} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px 14px', color: 'var(--text)', fontWeight: 600 }}>{m.descripcion}</td>
                      <td style={{ padding: '8px 14px', color: 'var(--text-muted)' }}>{m.fechaLunes}</td>
                      <td style={{ padding: '8px 14px', color: m.correcciones === 0 ? 'var(--success)' : 'var(--text)', fontWeight: 600 }}>{m.correcciones}</td>
                      <td style={{ padding: '8px 14px', color: pctMotorColor(m.pctMotor) ?? 'var(--text)' }}>
                        {m.pctMotor !== null ? `${m.pctMotor.toFixed(1)}%` : '–'}
                      </td>
                      <td style={{ padding: '8px 14px', color: 'var(--text)' }}>
                        {m.pctFinal !== null ? `${m.pctFinal.toFixed(1)}%` : '–'}
                      </td>
                      <td style={{ padding: '8px 14px', color: 'var(--text-muted)' }}>{m.criteriosActivosAlGenerar.join(', ') || '–'}</td>
                      <td style={{ padding: '8px 14px', color: 'var(--text-muted)' }}>{m.criteriosNuevos.join(', ') || '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
