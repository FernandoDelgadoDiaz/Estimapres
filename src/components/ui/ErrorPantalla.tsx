/**
 * AH2-065 · Si una pantalla falla, se muestra el motivo y cómo seguir, en lugar de quedar en blanco.
 * El texto técnico queda visible para mandarlo en una foto; los datos guardados no se tocan.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode; pantalla: string }
interface Estado { error: Error | null }

export class ErrorPantalla extends Component<Props, Estado> {
  state: Estado = { error: null }
  static getDerivedStateFromError(error: Error): Estado { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('[Aliada] Error en la pantalla', this.props.pantalla, error, info.componentStack) }
  componentDidUpdate(prev: Props) { if (prev.pantalla !== this.props.pantalla && this.state.error) this.setState({ error: null }) }
  render() {
    const { error } = this.state
    if (!error) return this.props.children
    const pila = (error.stack ?? '').split('\n').slice(0, 4).join('\n')
    return (
      <section role="alert" data-testid="error-pantalla" style={{ background: '#fee2e2', border: '2px solid #f87171', borderRadius: '16px', padding: '20px 24px', color: '#7f1d1d', display: 'grid', gap: '12px', margin: '24px 0' }}>
        <strong style={{ fontSize: '18px' }}>Esta pantalla tuvo un error y no se pudo mostrar.</strong>
        <span>No se perdió nada de lo guardado. Probá «Volver a cargar». Si se repite, sacale una foto a este recuadro y mandala para revisarlo.</span>
        <code style={{ whiteSpace: 'pre-wrap', fontSize: '12px', background: '#fff', borderRadius: '8px', padding: '8px 12px', color: '#450a0a' }}>
          {`Pantalla: ${this.props.pantalla}\n${error.name}: ${error.message}\n${pila}`}
        </code>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => window.location.reload()} style={{ padding: '10px 20px', borderRadius: '100px', border: 'none', background: '#7f1d1d', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Volver a cargar</button>
          <button type="button" onClick={() => { window.location.href = '/' }} style={{ padding: '10px 20px', borderRadius: '100px', border: '1px solid #7f1d1d', background: 'transparent', color: '#7f1d1d', fontWeight: 700, cursor: 'pointer' }}>Ir a Inicio</button>
        </div>
      </section>
    )
  }
}
