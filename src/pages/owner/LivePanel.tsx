import React from 'react';

const LivePanel: React.FC = () => {
  const totalDay = 1245;
  const ownerCut = 996;

  const barbers = [
    { id: 1, name: 'Juan Díaz', initials: 'JD', services: 8, earnings: 420, active: true },
    { id: 2, name: 'Carlos Méndez', initials: 'CM', services: 6, earnings: 315, active: true },
    { id: 3, name: 'Luis Torres', initials: 'LT', services: 5, earnings: 260, active: false },
    { id: 4, name: 'Ana Silva', initials: 'AS', services: 7, earnings: 380, active: true },
    { id: 5, name: 'Miguel Rojas', initials: 'MR', services: 4, earnings: 200, active: false },
  ];

  const getBarberColor = (index: number) => {
    return index === 0 ? 'var(--accent)' : 'var(--purple)';
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{
        fontFamily: "'Syne', sans-serif",
        fontWeight: 800,
        fontSize: '36px',
        letterSpacing: '-1px',
        marginBottom: '32px',
      }}>
        Panel en vivo
      </h1>

      {/* Total card */}
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '40px',
        marginBottom: '40px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Scissors background */}
        <div style={{
          position: 'absolute',
          right: '40px',
          top: '50%',
          transform: 'translateY(-50%)',
          opacity: 0.04,
        }}>
          <svg width="120" height="120" viewBox="0 0 24 24" fill="none">
            <circle cx="5" cy="19" r="2.5" stroke="white" strokeWidth="2" />
            <circle cx="19" cy="19" r="2.5" stroke="white" strokeWidth="2" />
            <line x1="5" y1="19" x2="19" y2="5" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <line x1="19" y1="19" x2="5" y2="5" stroke="#666" strokeWidth="2" strokeLinecap="round" />
            <circle cx="5" cy="5" r="2.5" stroke="#666" strokeWidth="2" />
            <circle cx="19" cy="5" r="2.5" stroke="#666" strokeWidth="2" />
            <line x1="10" y1="12" x2="14" y2="12" stroke="white" strokeWidth="1.5" />
          </svg>
        </div>

        <div style={{ maxWidth: '500px' }}>
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '8px',
          }}>
            Total del día
          </div>
          <div style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: '72px',
            letterSpacing: '-2px',
            lineHeight: 1,
            color: 'var(--accent)',
            marginBottom: '8px',
          }}>
            ${totalDay}
          </div>
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '20px',
            fontWeight: 600,
          }}>
            Tu parte: <span style={{ color: 'white' }}>${ownerCut}</span>
          </div>
          <p style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '16px',
            color: 'var(--text-muted)',
            marginTop: '16px',
          }}>
            {barbers.filter(b => b.active).length} barberos activos ahora.
          </p>
        </div>
      </div>

      {/* Barbers list */}
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '32px',
      }}>
        <h2 style={{
          fontFamily: "'Syne', sans-serif",
          fontWeight: 800,
          fontSize: '24px',
          letterSpacing: '-0.5px',
          marginBottom: '24px',
        }}>
          Barberos
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {barbers.map((barber, index) => (
            <div
              key={barber.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '20px',
                border: '1px solid var(--border)',
                borderRadius: '14px',
                transition: 'border-color 0.2s',
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--border-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '12px',
                  background: getBarberColor(index),
                  color: 'var(--bg)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: 800,
                  fontSize: '20px',
                  position: 'relative',
                }}>
                  {barber.initials}
                  {barber.active && (
                    <div style={{
                      position: 'absolute',
                      top: '-4px',
                      right: '-4px',
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      border: '2px solid var(--card)',
                    }} />
                  )}
                </div>
                <div>
                  <div style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 700,
                    fontSize: '18px',
                    marginBottom: '4px',
                  }}>
                    {barber.name}
                  </div>
                  <div style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: '14px',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}>
                    <span>
                      {barber.services} servicios
                    </span>
                    <span style={{ color: 'var(--border)' }}>•</span>
                    <span>
                      Generado: <span style={{ color: 'white', fontWeight: 600 }}>${barber.earnings}</span>
                    </span>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: 800,
                  fontSize: '24px',
                  letterSpacing: '-0.5px',
                }}>
                  ${barber.earnings}
                </div>
                <div style={{
                  padding: '8px 16px',
                  borderRadius: '100px',
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: '14px',
                  fontWeight: 600,
                  background: barber.active ? 'var(--accent)' : 'var(--surface)',
                  color: barber.active ? 'var(--accent-dark)' : 'var(--text-muted)',
                }}>
                  {barber.active ? 'Activo' : 'Inactivo'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LivePanel;