import React from 'react';

const BarberDashboard: React.FC = () => {
  const barberName = 'Juan';
  const servicesToday = 8;
  const earningsToday = 420;
  const myCut = 336;

  const services = [
    { id: 1, name: 'Corte clásico', estimatedTime: '30min', price: 25, myCut: 20 },
    { id: 2, name: 'Corte degradado', estimatedTime: '45min', price: 35, myCut: 28 },
    { id: 3, name: 'Afeitado tradicional', estimatedTime: '20min', price: 20, myCut: 16 },
    { id: 4, name: 'Corte + Barba', estimatedTime: '60min', price: 45, myCut: 36 },
    { id: 5, name: 'Tinte y estilo', estimatedTime: '90min', price: 70, myCut: 56 },
  ];

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* Hero card */}
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '32px',
        marginBottom: '32px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ maxWidth: '600px' }}>
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--accent)',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            marginBottom: '8px',
          }}>
            Buenos días
          </div>
          <div style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: '48px',
            letterSpacing: '-1px',
            lineHeight: 1,
            marginBottom: '16px',
          }}>
            {barberName}
          </div>
          <p style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '16px',
            color: 'var(--text-muted)',
            maxWidth: '500px',
          }}>
            Hoy tienes {servicesToday} servicios programados. Tu meta diaria está al 85%.
          </p>
        </div>

        {/* Barber pole SVG decorative */}
        <div style={{
          position: 'absolute',
          right: '32px',
          top: '50%',
          transform: 'translateY(-50%)',
          opacity: 0.1,
        }}>
          <svg width="40" height="70" viewBox="0 0 48 80">
            <rect x="20" y="0" width="8" height="80" rx="4" fill="#fff" />
            <path d="M20 8 Q24 16 28 24 Q24 32 20 40 Q24 48 28 56 Q24 64 20 72" stroke="#e94560" strokeWidth="3" fill="none" />
            <path d="M28 8 Q24 16 20 24 Q24 32 28 40 Q24 48 20 56 Q24 64 28 72" stroke="#4488ff" strokeWidth="3" fill="none" />
            <rect x="16" y="0" width="16" height="6" rx="3" fill="#ccc" />
            <rect x="16" y="74" width="16" height="6" rx="3" fill="#ccc" />
          </svg>
        </div>
      </div>

      {/* Stats grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '24px',
        marginBottom: '32px',
      }}>
        {/* Card 1: Servicios hoy */}
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: '16px',
          padding: '24px',
        }}>
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text-muted)',
            marginBottom: '12px',
          }}>
            Servicios hoy
          </div>
          <div style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: '56px',
            letterSpacing: '-1.5px',
            lineHeight: 1,
          }}>
            {servicesToday}
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginTop: '8px',
          }}>
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: 'var(--accent)',
            }} />
            <span style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '14px',
              color: 'var(--text-muted)',
            }}>
              +2 respecto a ayer
            </span>
          </div>
        </div>

        {/* Card 2: Mi ganancia */}
        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--accent)',
          borderRadius: '16px',
          padding: '24px',
        }}>
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--text-muted)',
            marginBottom: '12px',
          }}>
            Mi ganancia
          </div>
          <div style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: '56px',
            letterSpacing: '-1.5px',
            lineHeight: 1,
            color: 'var(--accent)',
          }}>
            ${myCut}
          </div>
          <div style={{
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '14px',
            color: 'var(--text-muted)',
            marginTop: '8px',
          }}>
            de ${earningsToday} total
          </div>
        </div>
      </div>

      {/* Services list */}
      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        padding: '24px',
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
        }}>
          <h2 style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: '24px',
            letterSpacing: '-0.5px',
            margin: 0,
          }}>
            Servicios frecuentes
          </h2>
          <button style={{
            background: 'var(--accent)',
            color: 'var(--accent-dark)',
            border: 'none',
            borderRadius: '100px',
            padding: '12px 24px',
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: '14px',
            letterSpacing: '-0.2px',
            cursor: 'pointer',
          }}>
            Registrar servicio
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {services.map((service) => (
            <div
              key={service.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                transition: 'border-color 0.2s',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--border-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <circle cx="5" cy="19" r="2" stroke="var(--accent)" strokeWidth="1.5" />
                  <circle cx="19" cy="19" r="2" stroke="var(--accent)" strokeWidth="1.5" />
                  <line x1="5" y1="19" x2="19" y2="5" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="19" y1="19" x2="5" y2="5" stroke="#666" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="5" cy="5" r="2" stroke="#666" strokeWidth="1.5" />
                  <circle cx="19" cy="5" r="2" stroke="#666" strokeWidth="1.5" />
                  <line x1="10" y1="12" x2="14" y2="12" stroke="var(--accent)" strokeWidth="1" />
                </svg>
                <div>
                  <div style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 600,
                    fontSize: '16px',
                    marginBottom: '4px',
                  }}>
                    {service.name}
                  </div>
                  <div style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontSize: '14px',
                    color: 'var(--text-muted)',
                  }}>
                    {service.estimatedTime} · Ganancia: <span style={{ color: 'var(--accent)' }}>${service.myCut}</span>
                  </div>
                </div>
              </div>
              <div style={{
                fontFamily: "'Syne', sans-serif",
                fontWeight: 800,
                fontSize: '20px',
                letterSpacing: '-0.5px',
              }}>
                ${service.price}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BarberDashboard;