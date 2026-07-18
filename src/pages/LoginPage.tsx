import { useState } from 'react'
import { iniciarSesion, registrarse } from '../lib/supabase'
import { resumenDatosLocales, migrarDatosLocalesACuenta } from '../utils/almacen'

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--border)',
  borderRadius: '12px',
  padding: '12px 16px',
  background: 'var(--card)',
  color: 'var(--text)',
  fontFamily: "'Space Grotesk', sans-serif",
  fontSize: '15px',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 600,
  color: 'var(--text)',
  marginBottom: '6px',
}

/**
 * Pantalla de acceso: login o registro con email y contraseña (Supabase Auth).
 * Tras iniciar sesión, si el dispositivo tiene datos locales de una sesión
 * anterior (anónima u offline) se ofrece migrarlos a la cuenta.
 */
export default function LoginPage() {
  const [modo, setModo] = useState<'login' | 'registro'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const [cargando, setCargando] = useState(false)

  const ofrecerMigracion = async () => {
    const local = resumenDatosLocales()
    const total = local.reglas + local.semanas + local.correcciones
    if (total === 0) return
    const ok = confirm(
      'Este dispositivo tiene datos guardados de una sesión anterior:\n' +
      `· ${local.semanas} semana${local.semanas === 1 ? '' : 's'} de historial\n` +
      `· ${local.reglas} regla${local.reglas === 1 ? '' : 's'}\n` +
      `· ${local.correcciones} correccion${local.correcciones === 1 ? '' : 'es'}\n\n` +
      '¿Querés migrarlos a tu cuenta? (Solo se migran si tu cuenta todavía no tiene datos.)'
    )
    if (!ok) return
    const resultado = await migrarDatosLocalesACuenta()
    if (resultado === 'migrado') alert('✅ Datos migrados a tu cuenta.')
    else if (resultado === 'cuenta_con_datos') alert('Tu cuenta ya tiene datos: no se migró nada para no pisarlos. Podés usar el backup JSON (Historial → Backup) si querés combinarlos.')
    else if (resultado === 'sin_conexion') alert('No se pudo conectar para migrar. Los datos locales siguen en este dispositivo.')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setAviso('')
    if (!email.trim() || !password) {
      setError('Completá email y contraseña.')
      return
    }
    setCargando(true)
    try {
      if (modo === 'login') {
        const res = await iniciarSesion(email.trim(), password)
        if (!res.ok) {
          setError(res.error ?? 'No se pudo iniciar sesión.')
          return
        }
        await ofrecerMigracion()
        // El gate de App reacciona al cambio de sesión y muestra la app.
      } else {
        const res = await registrarse(email.trim(), password)
        if (!res.ok) {
          setError(res.error ?? 'No se pudo crear la cuenta.')
          return
        }
        if (res.necesitaConfirmacionEmail) {
          setAviso('Cuenta creada. Revisá tu email y confirmá la cuenta para poder iniciar sesión.')
          setModo('login')
          return
        }
        await ofrecerMigracion()
      }
    } finally {
      setCargando(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: '24px',
    }}>
      <div style={{
        width: '100%', maxWidth: '400px',
        background: 'var(--card)', borderRadius: '16px',
        border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)',
        padding: '32px',
      }}>
        <h1 style={{
          fontSize: '28px', fontWeight: 800, fontFamily: "'Syne', sans-serif",
          color: 'var(--text)', margin: 0, letterSpacing: '-0.5px', textAlign: 'center',
        }}>
          Aliada Horarios
        </h1>
        <p style={{
          fontSize: '14px', color: 'var(--text-muted)', textAlign: 'center',
          fontFamily: "'Space Grotesk', sans-serif", marginTop: '8px', marginBottom: '28px',
        }}>
          {modo === 'login'
            ? 'Iniciá sesión para ver tus horarios, reglas y aprendizajes.'
            : 'Creá tu cuenta de supervisor.'}
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="supervisor@ejemplo.com"
              autoComplete="email"
              autoFocus
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={modo === 'registro' ? 'Mínimo 6 caracteres' : '••••••••'}
              autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
              style={inputStyle}
            />
          </div>

          {error && (
            <p style={{ fontSize: '13px', color: 'var(--danger)', marginBottom: '16px' }}>⚠️ {error}</p>
          )}
          {aviso && (
            <p style={{ fontSize: '13px', color: 'var(--accent-strong)', marginBottom: '16px' }}>✉️ {aviso}</p>
          )}

          <button
            type="submit"
            disabled={cargando}
            style={{
              width: '100%',
              background: 'var(--accent)', color: 'var(--accent-dark)',
              padding: '14px', borderRadius: '100px', border: 'none',
              fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '15px',
              letterSpacing: '-0.2px',
              cursor: cargando ? 'not-allowed' : 'pointer',
              opacity: cargando ? 0.6 : 1,
            }}
          >
            {cargando
              ? 'Un momento…'
              : modo === 'login' ? 'Iniciar sesión' : 'Crear cuenta'}
          </button>
        </form>

        <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '20px' }}>
          {modo === 'login' ? '¿No tenés cuenta?' : '¿Ya tenés cuenta?'}{' '}
          <button
            onClick={() => { setModo(modo === 'login' ? 'registro' : 'login'); setError(''); setAviso('') }}
            style={{
              background: 'none', border: 'none', padding: 0,
              color: 'var(--accent-strong)', fontWeight: 600, fontSize: '13px',
              cursor: 'pointer', fontFamily: "'Space Grotesk', sans-serif",
            }}
          >
            {modo === 'login' ? 'Registrate' : 'Iniciá sesión'}
          </button>
        </p>
      </div>
    </div>
  )
}
