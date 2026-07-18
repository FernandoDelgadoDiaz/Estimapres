import { useMemo } from 'react'
import { HorarioColaborador, AsignacionCajaColaborador, DIAS_SEMANA, HORAS_FRANJAS } from '../../types'
import { calcularCoberturaHorarios } from '../../utils/efectividad'

interface CoberturaLiveProps {
  /** Necesidad de cajas del PDF [franja HORAS_FRANJAS][dia] */
  necesidadFranjas: number[][]
  /** Horarios actuales (con ediciones aplicadas): cajeros + AUX + eventuales */
  horarios: HorarioColaborador[]
  /** Bloques en CAJA de los AUX (snapshot de la generación) */
  cajaAux?: AsignacionCajaColaborador[]
}

/**
 * Panel de cobertura EN TIEMPO REAL para el editor de "Último horario":
 * compara la necesidad del PDF con la cobertura actual (incluyendo las
 * ediciones del supervisor al instante). Cuentan como caja abierta los
 * cajeros FULL/PART y los bloques de eventuales; los AUX aportan sus bloques
 * en CAJA del snapshot de la generación. El cálculo vive en
 * utils/efectividad.ts (compartido con las métricas de efectividad).
 */
export default function CoberturaLive({ necesidadFranjas, horarios, cajaAux = [] }: CoberturaLiveProps) {
  const { cobertura, pctCumplimiento } = useMemo(() => {
    const r = calcularCoberturaHorarios(horarios, necesidadFranjas, cajaAux)
    return { cobertura: r.cobertura, pctCumplimiento: r.pct }
  }, [necesidadFranjas, horarios, cajaAux])

  const estiloCelda = (x: number, y: number): React.CSSProperties => {
    if (y <= 0) return { background: 'var(--surface)', color: 'var(--text-dim)' }
    if (x >= y) return { background: '#dcfce7', color: '#166534', fontWeight: 600 }
    if (x === y - 1) return { background: '#fef3c7', color: '#92400e', fontWeight: 600 }
    return { background: '#fee2e2', color: '#991b1b', fontWeight: 700 }
  }

  const colorPct = pctCumplimiento >= 99.95 ? 'var(--success)' : pctCumplimiento >= 90 ? 'var(--warning)' : 'var(--danger)'

  return (
    <div style={{
      background: 'var(--card)', borderRadius: '16px',
      border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '20px 24px', borderBottom: '1px solid var(--border)',
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '16px',
      }}>
        <div style={{ flex: 1, minWidth: '240px' }}>
          <h3 style={{ fontSize: '20px', fontWeight: 800, fontFamily: "'Syne', sans-serif", color: 'var(--text)', margin: 0 }}>
            Cobertura vs. necesidad del PDF
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Asignados / necesarios por franja. Se actualiza al instante con cada edición.
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '32px', fontWeight: 800, fontFamily: "'Syne', sans-serif", color: colorPct, letterSpacing: '-0.5px' }}>
            {pctCumplimiento.toFixed(1)}%
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>cumplimiento</div>
        </div>
      </div>

      <div style={{ overflowX: 'auto', maxHeight: '340px', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
            <tr style={{ background: 'var(--surface)' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase', position: 'sticky', left: 0, background: 'var(--surface)' }}>
                Horario
              </th>
              {DIAS_SEMANA.map(dia => (
                <th key={dia} style={{ padding: '8px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '11px', textTransform: 'uppercase' }}>
                  {dia}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {HORAS_FRANJAS.map((hora, fi) => {
              const hayNecesidad = (necesidadFranjas[fi] ?? []).some(v => v > 0)
              if (!hayNecesidad) return null
              return (
                <tr key={hora} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 12px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', position: 'sticky', left: 0, background: 'var(--card)' }}>
                    {hora}
                  </td>
                  {DIAS_SEMANA.map((_, dia) => {
                    const y = necesidadFranjas[fi]?.[dia] ?? 0
                    const x = cobertura[fi][dia]
                    return (
                      <td key={dia} style={{ padding: '6px 12px', textAlign: 'center', ...estiloCelda(x, y) }}>
                        {y > 0 ? `${x}/${y}` : '–'}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ padding: '12px 24px', borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '12px', color: 'var(--text-muted)' }}>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#dcfce7', border: '1px solid #86efac', borderRadius: 3, marginRight: 6, verticalAlign: 'middle' }} />Cubierto (X ≥ Y)</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: 3, marginRight: 6, verticalAlign: 'middle' }} />Falta 1 (X = Y−1)</span>
        <span><span style={{ display: 'inline-block', width: 12, height: 12, background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 3, marginRight: 6, verticalAlign: 'middle' }} />Falta más (X &lt; Y−1)</span>
        <span style={{ marginLeft: 'auto' }}>Los bloques en CAJA de los AUX provienen de la generación.</span>
      </div>
    </div>
  )
}
