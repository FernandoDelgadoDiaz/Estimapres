import { useRef, useState } from 'react'
import { exportarConfiguracion, validarExporte, type ExporteConfiguracion } from '../../utils/almacen'
import { useReglas } from '../../hooks/useReglas'
import { useHistorial } from '../../hooks/useHistorial'
import { useCorrecciones } from '../../hooks/useCorrecciones'

/**
 * Export/import de la configuración completa (reglas + historial + correcciones)
 * como un único archivo JSON. Resuelve la portabilidad entre dispositivos y
 * sirve de backup manual además de Supabase.
 */
export default function BackupConfig() {
  const { reemplazarTodo: reemplazarReglas } = useReglas()
  const { reemplazarTodo: reemplazarHistorial } = useHistorial()
  const { reemplazarTodo: reemplazarCorrecciones } = useCorrecciones()
  const fileRef = useRef<HTMLInputElement>(null)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const handleExportar = async () => {
    try {
      const datos = await exportarConfiguracion()
      const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `aliada-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setMensaje({ tipo: 'ok', texto: `Exportado: ${datos.reglas.length} reglas, ${datos.historial.length} semanas, ${datos.correcciones.length} correcciones.` })
    } catch (e) {
      setMensaje({ tipo: 'error', texto: `Error al exportar: ${String(e)}` })
    }
  }

  const handleArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const texto = await file.text()
      const datos: unknown = JSON.parse(texto)
      if (!validarExporte(datos)) {
        setMensaje({ tipo: 'error', texto: 'El archivo no tiene el formato de backup de Aliada.' })
        return
      }
      const backup = datos as ExporteConfiguracion
      if (!confirm(`Importar reemplazará TODA la configuración actual por:\n${backup.reglas.length} reglas, ${backup.historial.length} semanas, ${backup.correcciones.length} correcciones.\n¿Continuar?`)) {
        return
      }
      reemplazarReglas(backup.reglas)
      reemplazarHistorial(backup.historial)
      reemplazarCorrecciones(backup.correcciones)
      setMensaje({ tipo: 'ok', texto: 'Configuración importada. Los datos se sincronizan con Supabase.' })
    } catch (err) {
      setMensaje({ tipo: 'error', texto: `Error al importar: ${String(err)}` })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div style={{ background: 'var(--card)', borderRadius: '16px', border: '1px solid var(--border)', padding: '20px 24px' }}>
      <h3 style={{ fontSize: '20px', fontWeight: 800, fontFamily: "'Syne', sans-serif", color: 'white', marginBottom: '8px' }}>
        💾 Backup de configuración
      </h3>
      <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
        Exportá reglas, historial y aprendizajes a un archivo JSON, o importá un backup para migrar a otro dispositivo.
      </p>
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
        <button
          onClick={handleExportar}
          style={{ background: 'var(--accent)', color: 'var(--accent-dark)', padding: '10px 20px', borderRadius: '100px', border: 'none', fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: '14px', cursor: 'pointer' }}
        >
          ⬇ Exportar JSON
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          style={{ background: 'var(--surface)', color: 'var(--text)', padding: '10px 20px', borderRadius: '100px', border: '1px solid var(--border)', fontFamily: "'Space Grotesk', sans-serif", fontWeight: 600, fontSize: '14px', cursor: 'pointer' }}
        >
          ⬆ Importar JSON
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={handleArchivo} style={{ display: 'none' }} />
      </div>
      {mensaje && (
        <p style={{ fontSize: '13px', marginTop: '12px', color: mensaje.tipo === 'ok' ? 'var(--accent)' : '#ff6b6b' }}>
          {mensaje.tipo === 'ok' ? '✅' : '❌'} {mensaje.texto}
        </p>
      )}
    </div>
  )
}
