import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export default function Header() {
  const hoy = new Date()
  const semanaActual = `Semana ${format(hoy, 'w', { locale: es })} - ${format(hoy, 'yyyy', { locale: es })}`

  return (
    <header style={{
      background: 'var(--card)',
      borderBottom: '1px solid var(--border)',
      padding: '16px 24px',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div>
          <h2 style={{
            fontSize: '20px',
            fontWeight: 800,
            fontFamily: "'Syne', sans-serif",
            color: 'white',
            margin: 0,
            letterSpacing: '-0.5px',
          }}>
            Aliada Horarios
          </h2>
          <p style={{
            fontSize: '14px',
            color: 'var(--text-muted)',
            marginTop: '4px',
          }}>
            {semanaActual}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ textAlign: 'right' }}>
            <p style={{
              fontSize: '14px',
              fontWeight: 600,
              fontFamily: "'Space Grotesk', sans-serif",
              color: 'white',
              margin: 0,
            }}>
              Aliada Tech
            </p>
            <p style={{
              fontSize: '12px',
              color: 'var(--text-muted)',
              marginTop: '2px',
            }}>
              Sucursal Central
            </p>
          </div>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'var(--accent)',
            color: 'var(--accent-dark)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: '16px',
          }}>
            SC
          </div>
        </div>
      </div>
    </header>
  )
}