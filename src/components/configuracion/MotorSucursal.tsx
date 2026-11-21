/**
 * Ajustes del motor de la sucursal en lenguaje del supervisor (AH2-044). Por detrás usa la configuración
 * persistente AH2-042: simulación de conflictos, funciones atómicas con control de versión e historial.
 * Los cambios permanentes rigen desde el próximo lunes.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { aplicarCambio, cargarConfiguracionMotor, HORAS_GRILLA, type Cambio, type FilaConfigMotor, type FranjaApertura } from '../../hibrido/configuracionPersistente'
import { cambioPermanente, datosTopes, ddmm, leerTopes, normalizarFranjas, permanenteVigente, proximoLunesISO } from '../../hibrido/configuracionSimple'
import { Boton, FilaAjuste, estiloCampo } from '../ui/Basicos'
import { DIAS_SEMANA } from '../../types'

export interface EstadoMotor {
  disponible: boolean | undefined
  filas: FilaConfigMotor[]
  ocupado: boolean
  error: string
  aviso: string
  aplicar: (cambio: Cambio, mensaje: string) => Promise<boolean>
}

export function useConfiguracionMotor(sucursal: string, activo: boolean): EstadoMotor {
  const [filas, setFilas] = useState<FilaConfigMotor[]>([])
  const [disponible, setDisponible] = useState<boolean>()
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')
  const recargar = useCallback(async () => {
    if (!activo || !supabase) return
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || user.is_anonymous) return
      const r = await cargarConfiguracionMotor(supabase, user.id, sucursal)
      setDisponible(r.disponible); setFilas(r.filas)
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo leer la configuración.') }
  }, [sucursal, activo])
  useEffect(() => { void recargar() }, [recargar])
  const aplicar = async (cambio: Cambio, mensaje: string) => {
    setOcupado(true); setError(''); setAviso('')
    try { await aplicarCambio(supabase as never, filas, cambio, sucursal); setAviso(mensaje); return true }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar. No se aplicó ningún cambio.'); return false }
    finally { setOcupado(false); await recargar() }
  }
  return { disponible, filas, ocupado, error, aviso, aplicar }
}

const desdeTexto = (lunes: string) => `Rige desde el lunes ${ddmm(lunes)}.`

/** Franjas en que un supervisor solo puede atender caja (sin otro supervisor de pie). */
export function FranjasSupervisorSolo({ motor, sucursal }: { motor: EstadoMotor; sucursal: string }) {
  const lunes = proximoLunesISO()
  const vigente = permanenteVigente(motor.filas, 'excepcion_apertura_aux_unico', lunes)
  const actuales = useMemo(() => ((vigente?.datos as { franjas?: FranjaApertura[] } | undefined)?.franjas ?? []), [vigente])
  const [edicion, setEdicion] = useState<FranjaApertura[] | null>(null)
  const [error, setError] = useState('')
  const resumen = actuales.length
    ? agruparFranjas(actuales)
    : 'Ninguna: siempre queda un supervisor de pie.'
  const guardar = async () => {
    const n = normalizarFranjas(edicion ?? [])
    if (!n.ok) { setError(n.error); return }
    setError('')
    if (await motor.aplicar(cambioPermanente(motor.filas, 'excepcion_apertura_aux_unico', { franjas: n.franjas }, sucursal, lunes), `Franjas guardadas. ${desdeTexto(lunes)}`)) setEdicion(null)
  }
  const sel = (valor: string, cambiar: (v: string) => void, etiqueta: string) => (
    <select aria-label={etiqueta} value={valor} onChange={e => cambiar(e.target.value)} style={estiloCampo}>{HORAS_GRILLA.map(h => <option key={h} value={h}>{h}</option>)}</select>
  )
  return (
    <div style={{ padding: '14px 0', borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ flex: '1 1 320px' }}>
          <p style={{ margin: 0, fontSize: '15px', fontWeight: 600 }}>Horarios en que un supervisor solo puede atender caja</p>
          <p style={{ margin: '2px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>Si es el único supervisor presente, atiende caja sin otro de pie. {resumen}</p>
        </div>
        {!edicion && <Boton variante="secundario" onClick={() => setEdicion(actuales.length ? actuales : [{ dia: 0, desde: '08:00', hasta: '09:00' }])}>Cambiar</Boton>}
      </div>
      {edicion && (
        <div style={{ marginTop: '12px', display: 'grid', gap: '8px' }}>
          {edicion.map((f, i) => (
            <div key={i} role="group" aria-label={`Horario ${i + 1}`} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
              <select aria-label={`Horario ${i + 1} día`} value={f.dia} onChange={e => setEdicion(edicion.map((x, j) => j === i ? { ...x, dia: Number(e.target.value) } : x))} style={estiloCampo}>
                {DIAS_SEMANA.map((d, di) => <option key={d} value={di}>{d}</option>)}
              </select>
              de {sel(f.desde, v => setEdicion(edicion.map((x, j) => j === i ? { ...x, desde: v } : x)), `Horario ${i + 1} desde`)}
              a {sel(f.hasta, v => setEdicion(edicion.map((x, j) => j === i ? { ...x, hasta: v } : x)), `Horario ${i + 1} hasta`)}
              <button type="button" onClick={() => setEdicion(edicion.filter((_, j) => j !== i))} style={{ ...estiloCampo, cursor: 'pointer' }}>Quitar</button>
            </div>
          ))}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <button type="button" onClick={() => setEdicion([...edicion, { dia: 0, desde: '08:00', hasta: '09:00' }])} style={{ ...estiloCampo, cursor: 'pointer' }}>Agregar horario</button>
            <button type="button" onClick={() => setEdicion([0, 1, 2, 3, 4, 5, 6].map(dia => ({ dia, desde: '08:00', hasta: '09:00' })))} style={{ ...estiloCampo, cursor: 'pointer' }}>Todos los días 08:00–09:00</button>
          </div>
          {error && <p role="alert" style={{ margin: 0, color: 'var(--danger)', fontSize: '13px' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <Boton onClick={() => void guardar()} disabled={motor.ocupado}>Guardar</Boton>
            <Boton variante="secundario" onClick={() => { setEdicion(null); setError('') }}>Cancelar</Boton>
          </div>
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-muted)' }}>{desdeTexto(lunes)}</p>
        </div>
      )}
    </div>
  )
}

/** «Lun a Dom 08:00–09:00» o detalle por día. */
export function agruparFranjas(franjas: FranjaApertura[]): string {
  const porHorario = new Map<string, number[]>()
  for (const f of franjas) porHorario.set(`${f.desde}–${f.hasta}`, [...(porHorario.get(`${f.desde}–${f.hasta}`) ?? []), f.dia])
  return [...porHorario].map(([h, dias]) => {
    const u = [...new Set(dias)].sort()
    const txt = u.length === 7 ? 'Todos los días' : u.map(d => DIAS_SEMANA[d]).join(', ')
    return `${txt} ${h}`
  }).join(' · ') + '.'
}

/** Máximo de horas de caja por semana para eventuales, según su contrato de origen. */
export function MaximosEventuales({ motor, sucursal }: { motor: EstadoMotor; sucursal: string }) {
  const lunes = proximoLunesISO()
  const t = leerTopes(permanenteVigente(motor.filas, 'topes_caja_eventual_contrato', lunes))
  const [full, setFull] = useState(''), [part, setPart] = useState('')
  useEffect(() => { setFull(t?.FULL.activo && t.FULL.horas != null ? String(t.FULL.horas) : ''); setPart(t?.PART.activo && t.PART.horas != null ? String(t.PART.horas) : '') }, [t?.FULL.activo, t?.FULL.horas, t?.PART.activo, t?.PART.horas])
  const original = [t?.FULL.activo && t.FULL.horas != null ? String(t.FULL.horas) : '', t?.PART.activo && t.PART.horas != null ? String(t.PART.horas) : '']
  const cambiado = full !== original[0] || part !== original[1]
  const valido = [full, part].every(v => v === '' || (Number(v) >= 0 && Number(v) <= 84))
  const guardar = () => void motor.aplicar(
    cambioPermanente(motor.filas, 'topes_caja_eventual_contrato', datosTopes({ activo: full !== '', horas: full === '' ? null : Number(full) }, { activo: part !== '', horas: part === '' ? null : Number(part) }), sucursal, lunes),
    `Máximos guardados. ${desdeTexto(lunes)}`)
  const campo = (id: string, v: string, set: (x: string) => void) => (
    <input id={id} type="number" min={0} max={84} step={0.5} inputMode="decimal" placeholder="Sin máximo" value={v} onChange={e => set(e.target.value)} style={{ ...estiloCampo, width: '120px' }} />
  )
  return (
    <FilaAjuste titulo="Máximo de horas de caja por semana" ayuda="Para eventuales con contrato FULL y PART. Vacío = sin máximo." id="max-ev-full">
      <label style={{ fontSize: '13px', color: 'var(--text-muted)' }}>FULL {campo('max-ev-full', full, setFull)} h</label>
      <label style={{ fontSize: '13px', color: 'var(--text-muted)' }}>PART {campo('max-ev-part', part, setPart)} h</label>
      {cambiado && <Boton onClick={guardar} disabled={motor.ocupado || !valido}>Guardar</Boton>}
    </FilaAjuste>
  )
}

export function MensajesMotor({ motor }: { motor: EstadoMotor }) {
  if (!motor.error && !motor.aviso) return null
  return (
    <p role={motor.error ? 'alert' : 'status'} style={{ margin: 0, padding: '10px 14px', borderRadius: '10px', fontSize: '14px',
      background: motor.error ? 'var(--danger-bg)' : 'var(--success-bg)', color: motor.error ? 'var(--danger)' : 'var(--success)' }}>
      {motor.error || motor.aviso}
    </p>
  )
}

