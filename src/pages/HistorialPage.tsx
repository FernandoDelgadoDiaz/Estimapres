import { useMemo, useState } from 'react'
import { DIAS_SEMANA } from '../types'
import { useHistorial } from '../hooks/useHistorial'
import { useCorrecciones } from '../hooks/useCorrecciones'
import { useReglas } from '../hooks/useReglas'
import { derivarAprendizajes, calcularSesgoRotacion, explicarSesgos, clasificarJornadaUI } from '../utils/preferencias'
import BackupConfig from '../components/semana/BackupConfig'

const cardStyle: React.CSSProperties = {
  background: 'var(--card)',
  borderRadius: '16px',
  border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
  overflow: 'hidden',
}

function formatearJornada(j: { esFranco: boolean; turnos: Array<{ inicio: string; fin: string }> }): string {
  if (j.esFranco) return 'Franco'
  return j.turnos.map(t => `${t.inicio}-${t.fin}`).join(' y ')
}

export default function HistorialPage() {
  const { historial, eliminarSemana } = useHistorial()
  const { correcciones, eliminarCorreccion, eliminarCorrecciones } = useCorrecciones()
  const { backend } = useReglas()
  const [semanaAbierta, setSemanaAbierta] = useState<string | null>(null)

  const aprendizajes = useMemo(() => derivarAprendizajes(correcciones), [correcciones])
  const rotacionActiva = useMemo(() => explicarSesgos(calcularSesgoRotacion(historial)), [historial])
  const semanasOrdenadas = useMemo(
    () => [...historial].sort((a, b) => b.fechaLunes.localeCompare(a.fechaLunes)),
    [historial]
  )

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      <div>
        <h1 style={{ fontSize: '36px', fontWeight: 800, fontFamily: "'Syne', sans-serif", color: 'var(--text)', margin: 0, letterSpacing: '-0.5px' }}>
          Historial y aprendizaje
        </h1>
        <p style={{ color: 'var(--text-muted)', fontFamily: "'Space Grotesk', sans-serif", fontSize: '16px', marginTop: '8px' }}>
          Semanas generadas, rotación de turnos y lo que el sistema aprendió de tus correcciones.
        </p>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
          {backend === 'supabase'
            ? '☁️ Datos sincronizados en Supabase (backend real).'
            : backend === 'local'
              ? '📴 Sin conexión a Supabase: usando almacenamiento local de este dispositivo.'
              : '⏳ Conectando…'}
        </p>
      </div>

      <BackupConfig />

      {/* Rotación activa */}
      <div style={{ ...cardStyle, padding: '20px 24px' }}>
        <h3 style={{ fontSize: '20px', fontWeight: 800, fontFamily: "'Syne', sans-serif", color: 'var(--text)', marginBottom: '8px' }}>
          🔄 Rotación para la próxima semana
        </h3>
        {rotacionActiva.length === 0 ? (
          <p style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
            Sin ajustes de rotación pendientes: los turnos vienen balanceados en las últimas semanas
            {historial.length === 0 ? ' (todavía no hay semanas guardadas)' : ''}.
          </p>
        ) : (
          rotacionActiva.map((frase, i) => (
            <p key={i} style={{ fontSize: '14px', color: 'var(--text)', marginTop: '4px' }}>• {frase}</p>
          ))
        )}
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>
          La rotación es una preferencia blanda: si la demanda del PDF necesita otra cosa, la demanda gana.
        </p>
      </div>

      {/* Aprendizajes */}
      <div style={cardStyle}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 800, fontFamily: "'Syne', sans-serif", color: 'var(--text)' }}>
            🧠 Qué aprendió el sistema ({aprendizajes.length})
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Patrones detectados en tus correcciones manuales (mínimo 2 correcciones en la misma dirección).
          </p>
        </div>
        {aprendizajes.length === 0 ? (
          <p style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center' }}>
            Todavía no hay patrones. Editá horarios generados (clic en una celda del resultado) y el sistema va a empezar a aprender.
          </p>
        ) : (
          aprendizajes.map(a => (
            <div key={`${a.colaboradorNombre}-${a.direccion}`} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 24px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ flex: 1, fontSize: '14px', color: 'var(--text)' }}>{a.descripcion}</span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                fuerza: {'●'.repeat(Math.min(a.evidencias, 4))}{'○'.repeat(Math.max(0, 4 - a.evidencias))}
              </span>
              <button
                onClick={() => { if (confirm(`¿Olvidar "${a.descripcion}"? Se borran las ${a.evidencias} correcciones que lo sustentan.`)) eliminarCorrecciones(a.correccionIds) }}
                style={{ padding: '6px 14px', borderRadius: '100px', border: '1px solid var(--border)', boxShadow: 'var(--shadow)', background: 'var(--surface)', color: 'var(--text)', fontSize: '12px', cursor: 'pointer' }}
              >
                Olvidar
              </button>
            </div>
          ))
        )}
      </div>

      {/* Correcciones registradas */}
      <div style={cardStyle}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 800, fontFamily: "'Syne', sans-serif", color: 'var(--text)' }}>
            ✏️ Correcciones registradas ({correcciones.length})
          </h3>
        </div>
        {correcciones.length === 0 ? (
          <p style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center' }}>
            Sin correcciones registradas.
          </p>
        ) : (
          [...correcciones].reverse().slice(0, 50).map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 24px', borderBottom: '1px solid var(--border)', fontSize: '13px' }}>
              <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{c.fecha.slice(0, 10)}</span>
              <span style={{ color: 'var(--text)', fontWeight: 600, whiteSpace: 'nowrap' }}>{c.colaboradorNombre}</span>
              <span style={{ color: 'var(--text-muted)' }}>{DIAS_SEMANA[c.dia]}</span>
              <span style={{ flex: 1, color: 'var(--text)' }}>
                {formatearJornada(c.antes)} → {formatearJornada(c.despues)}
                <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>
                  ({clasificarJornadaUI(c.antes)} → {clasificarJornadaUI(c.despues)})
                </span>
              </span>
              <button
                onClick={() => eliminarCorreccion(c.id)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '16px', cursor: 'pointer' }}
                title="Borrar esta corrección"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      {/* Historial de semanas */}
      <div style={cardStyle}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 800, fontFamily: "'Syne', sans-serif", color: 'var(--text)' }}>
            📅 Semanas guardadas ({historial.length})
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            M = mañanas, T = tardes, C = cierres, F = francos por colaborador.
          </p>
        </div>
        {semanasOrdenadas.length === 0 ? (
          <p style={{ padding: '24px', color: 'var(--text-muted)', fontSize: '14px', textAlign: 'center' }}>
            Las semanas que generes en "Nueva Semana" se guardan acá automáticamente.
          </p>
        ) : (
          semanasOrdenadas.map(s => (
            <div key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <div
                onClick={() => setSemanaAbierta(prev => (prev === s.id ? null : s.id))}
                style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 24px', cursor: 'pointer' }}
              >
                <span style={{ fontSize: '14px', color: 'var(--text)', fontWeight: 600 }}>{s.descripcion}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>lunes {s.fechaLunes}</span>
                {s.editadoManualmente && (
                  <span style={{ fontSize: '11px', color: 'var(--accent-strong)' }}>✏️ editada</span>
                )}
                <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
                  {semanaAbierta === s.id ? '▲' : '▼'}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); if (confirm('¿Eliminar esta semana del historial?')) eliminarSemana(s.id) }}
                  style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '16px', cursor: 'pointer' }}
                >
                  🗑
                </button>
              </div>
              {semanaAbierta === s.id && (
                <div style={{ padding: '0 24px 16px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                      <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
                        <th style={{ padding: '6px 8px' }}>Colaborador</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center' }}>M</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center' }}>T</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center' }}>C</th>
                        <th style={{ padding: '6px 8px', textAlign: 'center' }}>F</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(s.resumenPorColaborador).map(([nombre, r]) => (
                        <tr key={nombre} style={{ color: 'var(--text)', borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '6px 8px', color: 'var(--text)' }}>{nombre}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>{r.mananas}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>{r.tardes}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center', color: r.cierres >= 4 ? 'var(--accent-strong)' : undefined }}>{r.cierres}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>{r.francos}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
