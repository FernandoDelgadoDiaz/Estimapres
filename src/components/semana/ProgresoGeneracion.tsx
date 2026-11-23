/**
 * AH2-059 · Barra de progreso de la generación, para que el supervisor sepa que la app sigue trabajando.
 * El motor no informa un porcentaje: se estima con el tiempo transcurrido contra la duración máxima conocida
 * (motor híbrido: hasta ~2 min) y los pasos que sí informa. Nunca llega a 100 % antes de terminar.
 */
import { useEffect, useState } from 'react'
import type { AvanceGeneracion } from '../../hooks/useAsignacion'

const PASOS = ['Preparando', 'Propuesta de respaldo', 'Buscando la mejor distribución', 'Validando']

export function porcentajeAvance(a: AvanceGeneracion, ahora: number): number {
  if (a.paso >= 3) return 97
  const tiempo = Math.min(0.95, (ahora - a.inicio) / a.esperadoMs)
  const piso = [2, 8, 12][a.paso] ?? 0
  return Math.round(Math.max(piso, tiempo * 95))
}

const reloj = (ms: number) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }

export default function ProgresoGeneracion({ avance, texto }: { avance: AvanceGeneracion; texto: string }) {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setAhora(Date.now()), 1000); return () => clearInterval(t) }, [])
  const pct = porcentajeAvance(avance, ahora)
  const transcurrido = ahora - avance.inicio
  const demorado = transcurrido > avance.esperadoMs
  const estimado = avance.esperadoMs >= 60_000 ? `unos ${Math.round(avance.esperadoMs / 60_000)} minutos` : 'unos segundos'
  return (
    <div role="status" aria-live="polite" data-testid="progreso-generacion" style={{ display: 'grid', gap: '8px', marginTop: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', fontSize: '14px' }}>
        <strong>{texto}</strong>
        <span style={{ color: 'var(--text-muted)' }}>Lleva {reloj(transcurrido)} · {demorado ? 'está tardando más de lo habitual, sigue trabajando' : `suele tardar ${estimado}`}</span>
      </div>
      <div role="progressbar" aria-label="Progreso de la generación" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}
        style={{ height: '12px', borderRadius: '999px', background: 'var(--surface)', border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.9s linear' }} />
      </div>
      {avance.esperadoMs >= 60_000 && <ol style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', margin: 0, padding: 0, listStyle: 'none', fontSize: '12px' }}>
        {PASOS.map((p, i) => (
          <li key={p} style={{ color: i < avance.paso ? 'var(--text)' : i === avance.paso ? 'var(--text)' : 'var(--text-muted)', fontWeight: i === avance.paso ? 700 : 400 }}>
            {i < avance.paso ? '✓ ' : i === avance.paso ? '● ' : '○ '}{p}
          </li>
        ))}
      </ol>}
      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No cierres esta pantalla. Si querés frenar, usá «Cancelar generación».</span>
    </div>
  )
}
