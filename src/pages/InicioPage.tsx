import { useMemo } from 'react'
import { useHistorial } from '../hooks/useHistorial'
import { useColaboradores } from '../hooks/useColaboradores'
import { useAuxiliares } from '../hooks/useAuxiliares'
import { useEventuales } from '../hooks/useEventuales'
import { necesidadDeSemana, proximoLunes, rangoSemana, resumirHorarios, semanasParaConsultar } from '../utils/resumenSemana'
import { BotonLink, Pagina, ResumenCobertura, Subtitulo, Tarjeta } from '../components/ui/Basicos'

/**
 * Inicio del supervisor: en qué estado está la semana y cuál es el próximo paso.
 * Sin explicaciones del sistema: solo lo que necesita para decidir.
 */
export default function InicioPage() {
  const { historial, loading } = useHistorial()
  const { colaboradoresActivos } = useColaboradores()
  const { auxiliaresActivos } = useAuxiliares()
  const { eventualesActivos } = useEventuales()

  const semanas = useMemo(() => semanasParaConsultar(historial), [historial])
  const proximo = proximoLunes()
  const proxima = semanas.find(s => s.fechaLunes === proximo)
  const ultima = proxima ?? semanas[0]
  const resumen = useMemo(() => {
    if (!ultima) return null
    const n = necesidadDeSemana(ultima)
    return n ? resumirHorarios(ultima.horarios, n.necesidad, ultima.cajaAux) : null
  }, [ultima])

  // Los cajeros son FULL/PART; los AUX cargados como colaborador se cuentan como supervisores (sin duplicar).
  const cajeros = colaboradoresActivos.filter(c => c.tipo !== 'AUX').length
  const supervisores = new Set([...auxiliaresActivos.map(a => a.nombre), ...colaboradoresActivos.filter(c => c.tipo === 'AUX').map(c => c.nombre)]).size
  const sinPersonal = cajeros === 0

  return (
    <Pagina titulo="Inicio">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '20px' }}>
        {/* Próximo paso: una sola acción principal */}
        <Tarjeta etiqueta="Próxima semana" estilo={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Próxima semana</p>
            <Subtitulo>{rangoSemana(proximo)}</Subtitulo>
            <p style={{ margin: '6px 0 0', color: 'var(--text-muted)', fontSize: '14px' }}>
              {loading ? 'Cargando…'
                : sinPersonal ? 'Primero cargá el personal de la sucursal.'
                : proxima ? 'El horario ya está generado. Podés revisarlo, corregirlo o exportarlo.'
                : 'Todavía no está generado. Subí el PDF de necesidad de cajas para armarlo.'}
            </p>
          </div>
          {!loading && <div>{sinPersonal
            ? <BotonLink a="/colaboradores">Cargar personal</BotonLink>
            : proxima ? <BotonLink a="/horarios">Ver horario</BotonLink>
            : <BotonLink a="/nueva-semana">Generar horario</BotonLink>}</div>}
        </Tarjeta>

        {/* Personal disponible */}
        <Tarjeta etiqueta="Personal" estilo={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <p style={{ margin: '0 0 12px', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Personal activo</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '12px' }}>
              {([[cajeros, 'cajeros'], [supervisores, 'supervisores'], [eventualesActivos.length, 'eventuales']] as const).map(([n, t]) => (
                <div key={t}>
                  <div style={{ fontSize: '28px', fontWeight: 800, fontFamily: "'Syne', sans-serif", lineHeight: 1.1 }}>{n}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{t}</div>
                </div>
              ))}
            </div>
          </div>
          <div><BotonLink a="/colaboradores" variante="secundario">Ver personal</BotonLink></div>
        </Tarjeta>
      </div>

      {/* Último horario generado */}
      {ultima && (
        <Tarjeta etiqueta="Último horario">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
            <div>
              <p style={{ margin: '0 0 4px', fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Último horario generado</p>
              <Subtitulo>{rangoSemana(ultima.fechaLunes)}</Subtitulo>
              {ultima.editadoManualmente && <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>Con correcciones tuyas</p>}
            </div>
            <BotonLink a="/horarios" variante="secundario">Ver horario</BotonLink>
          </div>
          {resumen
            ? <ResumenCobertura resumen={resumen} />
            : <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '14px' }}>Esta semana se guardó sin la necesidad de cajas: no se puede calcular la cobertura.</p>}
        </Tarjeta>
      )}
    </Pagina>
  )
}
