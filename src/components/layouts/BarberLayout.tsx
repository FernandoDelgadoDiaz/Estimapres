import React, { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';

interface BarberLayoutProps {
  children: ReactNode;
}

const BarberLayout: React.FC<BarberLayoutProps> = ({ children }) => {
  const barberName = 'Juan Díaz';
  const initials = 'JD';

  const navItems = [
    { path: '/barber/dashboard', label: 'Dashboard' },
    { path: '/barber/services', label: 'Servicios' },
    { path: '/barber/clients', label: 'Clientes' },
    { path: '/barber/schedule', label: 'Agenda' },
  ];

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      {/* Header */}
      <header
        style={{
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          padding: '16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Logo + Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="5" cy="19" r="2.5" stroke="#B8FF47" strokeWidth="1.5" />
            <circle cx="19" cy="19" r="2.5" stroke="#B8FF47" strokeWidth="1.5" />
            <line x1="5" y1="19" x2="19" y2="5" stroke="#B8FF47" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="19" y1="19" x2="5" y2="5" stroke="#666" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="5" cy="5" r="2.5" stroke="#666" strokeWidth="1.5" />
            <circle cx="19" cy="5" r="2.5" stroke="#666" strokeWidth="1.5" />
            <line x1="10" y1="12" x2="14" y2="12" stroke="#B8FF47" strokeWidth="1" />
          </svg>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span style={{
              fontFamily: "'Syne', sans-serif",
              fontWeight: 800,
              fontSize: '20px',
              letterSpacing: '-0.5px',
              color: 'white',
            }}>
              BARBER
            </span>
            <span style={{
              fontFamily: "'Syne', sans-serif",
              fontWeight: 800,
              fontSize: '20px',
              letterSpacing: '-0.5px',
              color: 'var(--accent)',
            }}>
              OS
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '32px' }}>
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              style={({ isActive }) => ({
                fontFamily: "'Space Grotesk', sans-serif",
                fontWeight: 500,
                fontSize: '14px',
                color: isActive ? 'var(--accent)' : 'var(--text)',
                textDecoration: 'none',
                position: 'relative',
                paddingBottom: '8px',
              })}
            >
              {item.label}
              {({ isActive }) => isActive && (
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: '2px',
                  background: 'var(--accent)',
                }} />
              )}
            </NavLink>
          ))}
        </nav>

        {/* Role chip + Avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: '100px',
            padding: '6px 12px',
            fontFamily: "'Space Grotesk', sans-serif",
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--accent)',
          }}>
            barber
          </div>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '8px',
            background: 'var(--accent)',
            color: 'var(--accent-dark)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: '14px',
          }}>
            {initials}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main style={{ padding: '24px' }}>
        {children}
      </main>
    </div>
  );
};

export default BarberLayout;