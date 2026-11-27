import { validarResultadoSemana, estadoValidacion } from '../utils/validacionSemana'
import { useReglas } from '../hooks/useReglas'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { necesidadDeSemana, rangoSemana, resumirHorarios, semanasParaConsultar } from '../utils/resumenSemana'
import { Boton, Pagina, ResumenCobertura, Tarjeta } from '../components/ui/Basicos'
import { HORAS_FRANJAS, JornadaResumida, ResultadoAsignacion } from '../types'
import { useHistorial } from '../hooks/useHistorial'
import { useColaboradores } from '../hooks/useColaboradores'
import { useAuxiliares } from '../hooks/useAuxiliares'
import { useEventuales } from '../hooks/useEventuales'
import { useCorrecciones } from '../hooks/useCorrecciones'
import { aplicarEdicionConRecalculo } from '../hooks/useAsignacion'
import { resumirTurnos, configOperativaDeReglas, reglasAExcepciones, capFrancosDeReglas, demandaMinimaDeReglas, normalizarExcepciones, horasAdicionalesDeReglas } from '../utils/preferencias'
import { FIN_CAJEROS_POR_DEFECTO } from '../algoritmo/adapter'
import { francosFijosPorDia, necesidadPorDia, supervisoresDeFrancoPorDia, topesFrancosPorDia } from '../utils/topesFrancos'
import { generarPDF } from '../utils/exportPDF'
import { esLunesISO, fechasDeSemana } from '../utils/pomContrato'
import { getSucursalActual } from '../utils/sucursal'
import TablaHorarios from '../components/semana/TablaHorarios'
import CoberturaLive from '../components/semana/CoberturaLive'
import PanelAusencia, { type PersonaSemana } from '../components/semana/PanelAusencia'
import { apoyoDeSemana, inicioLunesSiguiente, notaContingencia, versionPorContingencia } from '../contingencias/semana'
import type { EntradaReparacion } from '../contingencias/reparar'
import type { AusenciaCargada, ExcepcionSemanal, SemanaHistorial } from '../types'

/**
 * «Horarios» del supervisor: abre en el último horario generado y permite elegir
 * semanas anteriores (última versión de cada lunes). Se puede corregir con clic en
 * una celda: cada corrección se registra para el aprendizaje de preferencias de la
 * sucursal (Capacidad 3) y actualiza la semana guardada. La validación completa
 * corre por detrás; solo se muestra si hay algo que revisar.
 */
export default function HorariosPage() {
  const { historial, loading, actualizarSemana, agregarSemana } = useHistorial()
  // AH2-057: panel de ausencias y aviso de la última versión aprobada.
  const [panelAusencia, setPanelAusencia] = useState(false)
  const [aprobada, setAprobada] = useState<SemanaHistorial | null>(null)
  const { colaboradoresActivos } = useColaboradores()
  const { auxiliaresActivos } = useAuxiliares()
  const { eventualesActivos } = useEventuales()
  const { agregarCorreccion } = useCorrecciones()
  const { reglas } = useReglas()

  // La semana generada más recientemente (por fecha de generación, no por lunes:
  // regenerar una semana vieja también debe aparecer acá como "último horario").
  const semanas = useMemo(() => semanasParaConsultar(historial), [historial])
  const [seleccionId, setSeleccionId] = useState<string | null>(null)
  const ultimaSemana = useMemo(() => {
    if (historial.length === 0) return null
    const elegida = seleccionId ? historial.find(s => s.id === seleccionId) : undefined
    return elegida ?? [...historial].sort((a, b) => b.generadoEl.localeCompare(a.generadoEl))[0]
  }, [historial, seleccionId])
  const opciones = useMemo(() => ultimaSemana && !semanas.some(s => s.id === ultimaSemana.id) ? [ultimaSemana, ...semanas] : semanas, [semanas, ultimaSemana])

  // Incluye AUX y eventuales: sus filas también se muestran y editan acá.
  const nombrePorId = useMemo(
    () => Object.fromEntries([
      ...colaboradoresActivos.map(c => [c.id, c.nombre] as const),
      ...auxiliaresActivos.map(a => [a.id, a.nombre] as const),
      ...eventualesActivos.map(e => [e.id, e.nombre] as const),
    ]),
    [colaboradoresActivos, auxiliaresActivos, eventualesActivos]
  )

  // Necesidad del PDF para el panel de cobertura en vivo. Semanas guardadas
  // antes de esta versión no tienen necesidadFranjas: se aproxima con
  // cobertura + faltantes del snapshot (subestima la sobrecobertura).
  const necesidadFranjas = useMemo(() => {
    if (!ultimaSemana) return null
    if (ultimaSemana.necesidadFranjas) return ultimaSemana.necesidadFranjas
    const cob = ultimaSemana.coberturaFranjas
    const falt = ultimaSemana.faltantesFranjas
    if (!cob || !falt) return null
    return cob.map((fila, fi) => fila.map((x, dia) => x + (falt[fi]?.[dia] ?? 0)))
  }, [ultimaSemana])

  // #38: configuración operativa con la que se generó la semana (o, si es una
  // semana anterior a #38, la vigente hoy para ese lunes — se indica en pantalla).
  const operativa = useMemo(() => {
    if (!ultimaSemana) return null
    return ultimaSemana.configOperativa ?? configOperativaDeReglas(reglas, ultimaSemana.fechaLunes)
  }, [ultimaSemana, reglas])

  const resultadoActual = useMemo<ResultadoAsignacion | null>(() => ultimaSemana ? {
    horarios: ultimaSemana.horarios,
    coberturaFranjas: ultimaSemana.coberturaFranjas ?? [],
    faltantesFranjas: ultimaSemana.faltantesFranjas ?? [],
    alertas: [],
    porcentajeCobertura: ultimaSemana.porcentajeCobertura ?? 0,
    cajaAux: ultimaSemana.cajaAux,
    cajaEventual: ultimaSemana.cajaEventual,
    eventualesFijos: ultimaSemana.eventualesFijos,
    cumplimientoHoras: ultimaSemana.cumplimientoHoras,
    hibrido: ultimaSemana.hibrido,
    condicionesSupervisor: ultimaSemana.condicionesSupervisor,
  } : null, [ultimaSemana])

  // #38: semanas históricas sin los datos necesarios → nunca VALIDADO; se explica qué falta.
  const limitaciones = useMemo(() => !ultimaSemana ? [] : [
    !ultimaSemana.configOperativa && 'La semana no registró su configuración operativa: se revisó con las reglas vigentes hoy.',
    !ultimaSemana.disponibilidadSemana && 'La semana no registró la disponibilidad resuelta de AUX y eventuales: no se puede verificar que los eventuales estén dentro de su disponibilidad.',
    !ultimaSemana.necesidadFranjas && 'La demanda del POM no se guardó: se reconstruyó en forma aproximada desde la cobertura.',
  ].filter((x): x is string => !!x), [ultimaSemana])

  // #38: validación COMPLETA (no solo horas) tras cada edición y antes de exportar. AH2-057: la misma función
  // revalida cada propuesta de cobertura de una ausencia.
  const validarCon = useCallback((resultado: ResultadoAsignacion) => {
    if (!ultimaSemana || !necesidadFranjas || !operativa) return null
    const disp = ultimaSemana.disponibilidadSemana
    const conDisp = <T extends { id: string; horarioSemanal: string[] }>(p: T): T => (disp?.[p.id] ? { ...p, horarioSemanal: disp[p.id] } : p)
    const excepcionesReglas = reglasAExcepciones(reglas, ultimaSemana.fechaLunes, Object.fromEntries(colaboradoresActivos.map(c => [c.nombre, c.tipo])))
    const cajeros = colaboradoresActivos.filter(c => c.tipo === 'FULL' || c.tipo === 'PART')
    // Salida máxima de cajeros de la sucursal (22:30 por defecto): también se controla en las correcciones.
    const finCajeros = ultimaSemana.hibrido?.entrada?.cajeros_fin_hora_limite ?? FIN_CAJEROS_POR_DEFECTO
    const excepcionesValidacion = finCajeros < '23:00'
      ? [...excepcionesReglas, ...cajeros.map(c => ({ id: `fin-cajeros-${c.id}`, colaboradorNombre: c.nombre, tipo: 'no_despues_de', valor: finCajeros, descripcion: 'salida máxima de cajeros de la sucursal' }) as ExcepcionSemanal)]
      : excepcionesReglas
    // AH2-066: el mismo tope de francos por día que al generar. Lo que ya estaba guardado no se invalida:
    // una corrección solo no puede sumar francos por encima del tope.
    const topes = topesFrancosPorDia({
      necesidadPorDia: necesidadPorDia(necesidadFranjas.map(n => ({ necesidad: n }))), cajeros: cajeros.length,
      supervisores: auxiliaresActivos.length,
      supervisoresDeFranco: supervisoresDeFrancoPorDia(auxiliaresActivos.map(conDisp)),
      francosFijosCajeros: francosFijosPorDia(normalizarExcepciones(excepcionesReglas), cajeros.map(c => c.nombre)),
      maximoConfigurado: capFrancosDeReglas(reglas, ultimaSemana.fechaLunes),
    })
    const idsCajeros = new Set(cajeros.map(c => c.id))
    const maxFrancosPorDia = topes.cajerosPorDia.map((t, d) => Math.max(t, ultimaSemana.horarios
      .filter(h => idsCajeros.has(h.colaboradorId) && h.jornadas.some(j => j.dia === d && j.esFranco)).length))
    return validarResultadoSemana(
      resultado, colaboradoresActivos, auxiliaresActivos.map(conDisp), eventualesActivos.map(conDisp),
      {
        necesidad: HORAS_FRANJAS.map((hora, fi) => ({ hora, necesidad: necesidadFranjas[fi] ?? Array(7).fill(0) })),
        excepciones: excepcionesValidacion,
        maxFrancosDia: Math.max(...maxFrancosPorDia, 1),
        maxFrancosPorDia,
        horasAdicionales: horasAdicionalesDeReglas(reglas, ultimaSemana.fechaLunes),
        minimosCajeros: demandaMinimaDeReglas(reglas, ultimaSemana.fechaLunes),
        operativa,
        omitirDisponibilidadEventual: !disp,
        limitaciones,
        // #7: cada semana se valida con el perfil de horas con que se generó: sin id →
        // histórico (PART ≤ 31 h); id desconocido → limitación, nunca VALIDADO.
        perfilHorasId: ultimaSemana.perfilHorasId,
      },
    )
  }, [ultimaSemana, necesidadFranjas, operativa, colaboradoresActivos, auxiliaresActivos, eventualesActivos, reglas, limitaciones])
  const validacion = useMemo(() => resultadoActual ? validarCon(resultadoActual) : null, [resultadoActual, validarCon])
  const avisosHoras = validacion?.advertencias ?? []

  // PDF con el estado ACTUAL de la semana (ediciones incluidas), reusando el
  // snapshot de cobertura/CAJA guardado al generar (si existe).
  const handleExportarPDF = () => {
    if (!ultimaSemana) return
    if (!resultadoActual) return
    const resultado: ResultadoAsignacion = { ...resultadoActual, alertas: avisosHoras }
    const pdf = generarPDF(resultado, colaboradoresActivos, ultimaSemana.descripcion, auxiliaresActivos, eventualesActivos, {
      sucursal: getSucursalActual(),
      fechas: esLunesISO(ultimaSemana.fechaLunes) ? fechasDeSemana(ultimaSemana.fechaLunes) : undefined,
      version: ultimaSemana.version,
      necesidadFranjas: ultimaSemana.necesidadFranjas,
      // Presencia registrada al generar; semanas históricas sin ella → «Presencia no registrada».
      presencia: ultimaSemana.disponibilidadSemana,
      // #38: el PDF lleva el estado real; si hay violaciones sale como BORRADOR.
      validacion: validacion ?? undefined,
      estado: validacion ? estadoValidacion(validacion) : 'SIN VERIFICAR: la semana no tiene datos de demanda para validar',
      nota: notaContingencia(ultimaSemana),
    })
    pdf.save(`horarios-${ultimaSemana.descripcion.toLowerCase().replace(/ /g, '-')}.pdf`)
  }

  const handleEditarJornada = (colaboradorId: string, dia: number, nueva: JornadaResumida) => {
    if (!ultimaSemana) return
    const jornadaAnterior = ultimaSemana.horarios
      .find(h => h.colaboradorId === colaboradorId)
      ?.jornadas.find(j => j.dia === dia)
    if (!jornadaAnterior) return

    // Registrar la corrección para el aprendizaje (Capacidad 3)
    agregarCorreccion({
      semanaId: ultimaSemana.id,
      colaboradorNombre: nombrePorId[colaboradorId] ?? colaboradorId,
      dia,
      antes: { esFranco: jornadaAnterior.esFranco, turnos: jornadaAnterior.turnos },
      despues: nueva,
    })

    // Aplicar la edición y recalcular la cascada (#38): CAJA de AUX, eventuales no
    // fijados a mano, cobertura y faltantes, con la configuración de la semana.
    // Sin demanda conocida solo se aplica la edición (la validación lo informa).
    if (!resultadoActual) return
    const editado = aplicarEdicionConRecalculo(
      resultadoActual, colaboradorId, dia, nueva, nombrePorId[colaboradorId] ?? colaboradorId,
      necesidadFranjas && operativa
        ? { necesidadFranjas, operativa, nombrePorId, disponibilidad: ultimaSemana.disponibilidadSemana }
        : undefined,
    )

    actualizarSemana(ultimaSemana.id, {
      horarios: editado.horarios,
      cajaAux: editado.cajaAux,
      cajaEventual: editado.cajaEventual,
      eventualesFijos: editado.eventualesFijos,
      cumplimientoHoras: editado.cumplimientoHoras, // #7: nunca se conserva el cumplimiento previo a la edición
      coberturaFranjas: editado.coberturaFranjas,
      faltantesFranjas: editado.faltantesFranjas,
      porcentajeCobertura: editado.porcentajeCobertura,
      resumenPorColaborador: resumirTurnos(editado.horarios, nombrePorId),
      editadoManualmente: true,
    })
  }

  // AH2-057 · Personas de la semana que pueden ausentarse, y entrada de la búsqueda de cobertura.
  const personasSemana = useMemo<PersonaSemana[]>(() => !ultimaSemana ? [] : ultimaSemana.horarios.map(h => ({
    id: h.colaboradorId,
    nombre: nombrePorId[h.colaboradorId] ?? h.colaboradorId,
    tipo: h.rolGeneral === 'cajero' ? (colaboradoresActivos.find(c => c.id === h.colaboradorId)?.tipo ?? 'Cajero')
      : h.rolGeneral === 'aux_supervisor' ? 'Supervisor' : 'Eventual',
  })).sort((a, b) => a.tipo.localeCompare(b.tipo) || a.nombre.localeCompare(b.nombre)), [ultimaSemana, nombrePorId, colaboradoresActivos])

  const construirEntrada = (ausencia: AusenciaCargada): EntradaReparacion | string => {
    if (!ultimaSemana || !resultadoActual || !operativa) return 'No hay un horario cargado.'
    const apoyo = apoyoDeSemana(ultimaSemana, eventualesActivos)
    if (apoyo.faltan.length || !ultimaSemana.necesidadFranjas) {
      return `Esta semana se guardó sin ${apoyo.faltan.join(', ')}: no se puede buscar cobertura automática. Corregila a mano en la tabla o volvé a generarla.`
    }
    return {
      base: resultadoActual, fechaLunes: ultimaSemana.fechaLunes, ausencia,
      necesidadFranjas: ultimaSemana.necesidadFranjas, operativa, nombrePorId,
      disponibilidadEventual: apoyo.disponibilidadEventual, topesEventualSlots: apoyo.topesEventualSlots, reservasEventual: apoyo.reservasEventual,
      finCajeros: apoyo.finCajeros, inicioLunesSiguiente: inicioLunesSiguiente(historial, ultimaSemana),
      validar: r => validarCon(r)?.violaciones ?? [{ codigo: 'SIN_DATOS', detalle: 'No se pudo validar la propuesta.' }],
    }
  }

  const resumen = useMemo(() => {
    if (!ultimaSemana) return null
    const n = necesidadDeSemana(ultimaSemana)
    return n ? resumirHorarios(ultimaSemana.horarios, n.necesidad, ultimaSemana.cajaAux) : null
  }, [ultimaSemana])
  const problemas = validacion?.violaciones ?? []

  return (
    <Pagina
      titulo="Horarios"
      descripcion="Consultá, corregí y exportá los horarios generados. Tus correcciones se guardan y ayudan a mejorar los próximos."
      acciones={ultimaSemana ? <>
        {opciones.length > 1 && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--text-muted)' }}>
            Semana
            <select
              aria-label="Elegir semana"
              value={ultimaSemana.id}
              onChange={e => setSeleccionId(e.target.value)}
              style={{ padding: '9px 12px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', fontSize: '14px', color: 'var(--text)' }}
            >
              {opciones.map(s => <option key={s.id} value={s.id}>{rangoSemana(s.fechaLunes)}</option>)}
            </select>
          </label>
        )}
        <Boton variante="secundario" onClick={() => { setPanelAusencia(true); setAprobada(null) }}>Cargar ausencia</Boton>
        <Boton onClick={handleExportarPDF}>Exportar PDF</Boton>
      </> : undefined}
    >
      {loading ? (
        <Tarjeta><p style={{ margin: 0, color: 'var(--text-muted)' }}>Cargando horarios…</p></Tarjeta>
      ) : !ultimaSemana ? (
        <Tarjeta estilo={{ textAlign: 'center', padding: '48px 24px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 800, fontFamily: "'Syne', sans-serif", margin: '0 0 8px' }}>Todavía no hay horarios generados</h2>
          <p style={{ color: 'var(--text-muted)', margin: '0 0 20px' }}>Cuando generes una semana, va a quedar guardada acá.</p>
          <Link to="/nueva-semana" style={{ display: 'inline-block', background: 'var(--accent)', color: 'var(--accent-dark)', padding: '10px 20px', borderRadius: '100px', textDecoration: 'none', fontWeight: 700 }}>
            Generar horario
          </Link>
        </Tarjeta>
      ) : (
        <>
          {aprobada && aprobada.id === ultimaSemana.id && (
            <section role="status" data-testid="version-aprobada" style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: '16px', padding: '14px 20px', color: '#14532d', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <span>Se guardó la <strong>versión {aprobada.version}</strong>. {notaContingencia(aprobada)}</span>
              <Boton onClick={handleExportarPDF}>Descargar PDF actualizado</Boton>
            </section>
          )}
          {panelAusencia && (
            <PanelAusencia
              semana={ultimaSemana}
              personas={personasSemana}
              supervisores={auxiliaresActivos.map(a => a.nombre)}
              construirEntrada={construirEntrada}
              onCerrar={() => setPanelAusencia(false)}
              onAprobar={(r, p, ausencia, aprobadoPor) => {
                const datos = versionPorContingencia(ultimaSemana, p, ausencia, r.diasAusente, aprobadoPor, h => resumirTurnos(h, nombrePorId))
                const nueva = agregarSemana(datos)
                setSeleccionId(nueva.id)
                setAprobada(nueva)
                setPanelAusencia(false)
              }}
            />
          )}
          <Tarjeta etiqueta="Resumen de la semana">
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 800, fontFamily: "'Syne', sans-serif", margin: 0 }}>{rangoSemana(ultimaSemana.fechaLunes)}</h2>
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Generado el {formatearFechaHora(ultimaSemana.generadoEl)}
                {ultimaSemana.editadoManualmente && ultimaSemana.modificadoEl && ` · corregido el ${formatearFechaHora(ultimaSemana.modificadoEl)}`}
              </span>
            </div>
            {ultimaSemana.contingencia && !(aprobada && aprobada.id === ultimaSemana.id) && (
              <p data-testid="nota-contingencia" style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-muted)' }}>{notaContingencia(ultimaSemana)}</p>
            )}
            {resumen
              ? <ResumenCobertura resumen={resumen} />
              : <p style={{ margin: 0, color: 'var(--text-muted)' }}>Esta semana se guardó sin la necesidad de cajas: no se puede calcular la cobertura.</p>}
          </Tarjeta>

          {/* Cobertura por franja: a simple vista dónde falta, dónde sobra y cuáles son las horas pico. */}
          {necesidadFranjas && (
            <CoberturaLive
              necesidadFranjas={necesidadFranjas}
              horarios={ultimaSemana.horarios}
              cajaAux={ultimaSemana.cajaAux}
              aproximado={!ultimaSemana.necesidadFranjas}
            />
          )}

          {/* La validación completa corre siempre por detrás; solo se muestra si hay algo para revisar. */}
          {(problemas.length > 0 || avisosHoras.length > 0) && (
            <section data-testid="estado-validacion" aria-label="Para revisar" role={problemas.length ? 'alert' : undefined} style={problemas.length ? {
              background: '#fee2e2', borderRadius: '16px', border: '2px solid #f87171', padding: '16px 24px', color: '#7f1d1d',
            } : {
              background: 'var(--warning-bg)', borderRadius: '16px', border: '1px solid #fcd34d', padding: '16px 24px', color: '#78350f',
            }}>
              {/* AH2-047: un incumplimiento de reglas no es un aviso: se dice claro qué hay que corregir. */}
              <p style={{ fontWeight: 800, margin: 0 }}>{problemas.length
                ? `No cumple las reglas: ${problemas.length === 1 ? 'hay 1 punto' : `hay ${problemas.length} puntos`} para corregir antes de publicar. El PDF sale como BORRADOR.`
                : 'Revisá antes de publicar'}</p>
              <ul style={{ margin: '8px 0 0', paddingLeft: '18px', fontSize: '14px', display: 'grid', gap: '2px' }}>
                {problemas.slice(0, 20).map((v, i) => <li key={i}>{v.detalle}</li>)}
                {avisosHoras.map(aviso => <li key={aviso}>{aviso}</li>)}
              </ul>
            </section>
          )}

          <TablaHorarios
            horarios={ultimaSemana.horarios}
            colaboradores={colaboradoresActivos}
            auxiliares={auxiliaresActivos}
            eventuales={eventualesActivos}
            editable
            onEditarJornada={handleEditarJornada}
            cajaAux={ultimaSemana.cajaAux}
          />

        </>
      )}
    </Pagina>
  )
}

function formatearFechaHora(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
