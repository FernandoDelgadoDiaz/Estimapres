import { useEffect, useMemo, useState } from 'react'
import { ExcepcionSemanal, DIAS_SEMANA, JornadaResumida } from '../types'
import { usePDFParser } from '../hooks/usePDFParser'
import { useColaboradores } from '../hooks/useColaboradores'
import { useAuxiliares } from '../hooks/useAuxiliares'
import { useEventuales } from '../hooks/useEventuales'
import { useAsignacion } from '../hooks/useAsignacion'
import { useReglas } from '../hooks/useReglas'
import { useHistorial } from '../hooks/useHistorial'
import { useCorrecciones } from '../hooks/useCorrecciones'
import PDFUploader from '../components/semana/PDFUploader'
import PreviewNecesidad from '../components/semana/PreviewNecesidad'
import TablaCobertura from '../components/semana/TablaCobertura'
import TablaHorarios from '../components/semana/TablaHorarios'
import PanelAlertas from '../components/semana/PanelAlertas'
import { generarPDF } from '../utils/exportPDF'
import {
  reglasAExcepciones,
  demandaMinimaDeReglas,
  capFrancosDeReglas,
  validarConflictosReglas,
  calcularSesgoRotacion,
  calcularSesgoAprendizaje,
  derivarAprendizajes,
  derivarCriteriosCobertura,
  pesosFranjaDeCriterios,
  combinarSesgos,
  explicarSesgos,
  resumirTurnos,
} from '../utils/preferencias'
import { format, startOfWeek, addDays } from 'date-fns'
import { es } from 'date-fns/locale'

type Paso = 'upload' | 'revisar' | 'resultado'

export default function NuevaSemanaPage() {
  const [paso, setPaso] = useState<Paso>('upload')
  const { necesidad, loading: loadingPDF, error: errorPDF, parsearPDF, reset: resetPDF } = usePDFParser()
  const { colaboradores, colaboradoresActivos } = useColaboradores()
  const { auxiliaresActivos } = useAuxiliares()
  const { eventualesActivos } = useEventuales()
  const { resultado, loading: loadingAsignacion, error: errorAsignacion, generarHorarios, editarJornada, reset: resetAsignacion } = useAsignacion()
  const { reglas, reglasActivas } = useReglas()
  const { historial, agregarSemana, actualizarSemana } = useHistorial()
  const { correcciones, agregarCorreccion } = useCorrecciones()
  const [semanaGuardadaId, setSemanaGuardadaId] = useState<string | null>(null)
  const [semanaDesc, setSemanaDesc] = useState('')
  const [excepciones, setExcepciones] = useState<ExcepcionSemanal[]>([])
  const [mostrarExcepciones, setMostrarExcepciones] = useState(false)
  const [colaboradorSeleccionado, setColaboradorSeleccionado] = useState('')
  const [tipoSeleccionado, setTipoSeleccionado] = useState<ExcepcionSemanal['tipo']>('franco_dia')
  const [valorInput, setValorInput] = useState('')

  const handlePDFSelect = async (file: File) => {
    await parsearPDF(file)
    // Generar descripción de la semana basada en fecha actual
    const hoy = new Date()
    setSemanaDesc(`Semana ${format(hoy, 'w', { locale: es })} - ${format(hoy, 'MMMM yyyy', { locale: es })}`)
    setPaso('revisar')
  }

  const agregarExcepcion = () => {
    if (excepciones.length >= 10) {
      alert('Máximo 10 excepciones por semana')
      return
    }
    if (!colaboradorSeleccionado) {
      alert('Selecciona un colaborador')
      return
    }
    const colaborador = colaboradoresActivos.find(c => c.id === colaboradorSeleccionado)
    if (!colaborador) return
    let descripcion = ''
    switch (tipoSeleccionado) {
      case 'franco_dia':
        descripcion = `Franco el ${valorInput}`
        break
      case 'no_antes_de':
        descripcion = `No disponible antes de ${valorInput}`
        break
      case 'no_despues_de':
        descripcion = `No disponible después de ${valorInput}`
        break
      case 'siempre_cierre':
        descripcion = 'Siempre hacer cierre (turno hasta 22:30)'
        break
      case 'solo_matutino':
        descripcion = 'Solo turno matutino (terminar antes de las 15:00)'
        break
      case 'solo_nocturno':
        descripcion = 'Solo turno nocturno (empezar después de las 17:00)'
        break
    }
    const nuevaExcepcion: ExcepcionSemanal = {
      id: Date.now().toString(),
      colaboradorNombre: colaborador.nombre,
      tipo: tipoSeleccionado,
      valor: valorInput || undefined,
      descripcion,
    }
    setExcepciones([...excepciones, nuevaExcepcion])
    setColaboradorSeleccionado('')
    setTipoSeleccionado('franco_dia')
    setValorInput('')
  }

  const eliminarExcepcion = (id: string) => {
    setExcepciones(excepciones.filter(e => e.id !== id))
  }

  // Mapeo id UI → nombre (para historial y correcciones), incluyendo AUX y
  // eventuales: sus filas también aparecen en el resultado y son editables.
  const nombrePorId = useMemo(
    () => Object.fromEntries([
      ...colaboradoresActivos.map(c => [c.id, c.nombre] as const),
      ...auxiliaresActivos.map(a => [a.id, a.nombre] as const),
      ...eventualesActivos.map(e => [e.id, e.nombre] as const),
    ]),
    [colaboradoresActivos, auxiliaresActivos, eventualesActivos]
  )

  // Preferencias blandas: rotación (historial) + aprendizaje (correcciones)
  const sesgosBlandos = useMemo(
    () => combinarSesgos(
      calcularSesgoRotacion(historial),
      calcularSesgoAprendizaje(derivarAprendizajes(correcciones))
    ),
    [historial, correcciones]
  )
  const frasesPreferencias = useMemo(() => explicarSesgos(sesgosBlandos), [sesgosBlandos])
  const conflictosReglas = useMemo(
    () => validarConflictosReglas(reglas, colaboradores),
    [reglas, colaboradores]
  )
  // Criterios de cobertura del supervisor: los activos ponderan el score
  const criteriosCobertura = useMemo(() => derivarCriteriosCobertura(correcciones), [correcciones])
  const criteriosActivos = useMemo(
    () => criteriosCobertura.filter(c => c.estado === 'activo'),
    [criteriosCobertura]
  )

  const handleGenerarHorarios = async () => {
    // Calcular fechas de la semana actual (lunes a domingo)
    const hoy = new Date()
    const lunes = startOfWeek(hoy, { weekStartsOn: 1 }) // 1 = lunes
    const fechas = Array.from({ length: 7 }, (_, i) => {
      const fecha = addDays(lunes, i)
      return format(fecha, 'yyyy-MM-dd')
    })
    const fechaLunes = fechas[0]
    const cajerosActivos = colaboradoresActivos.filter(c => c.tipo === 'FULL' || c.tipo === 'PART')

    // Capacidad 1: reglas configuradas → excepciones + demanda mínima + tope de francos
    const excepcionesTotales = [...excepciones, ...reglasAExcepciones(reglas, fechaLunes)]
    const opciones = {
      preferenciasPorNombre: sesgosBlandos, // Capacidades 2 y 3 (preferencia blanda)
      demandaMinima: demandaMinimaDeReglas(reglas, fechaLunes),
      maxFrancosDia: capFrancosDeReglas(reglas, fechaLunes),
      // Criterios de cobertura activos (2+ semanas): la propuesta prioriza esas franjas
      pesosFranja: pesosFranjaDeCriterios(criteriosCobertura),
    }

    const res = await generarHorarios(necesidad, cajerosActivos, auxiliaresActivos, eventualesActivos, fechas, excepcionesTotales, opciones)

    // Capacidad 2: guardar la semana en el historial para la rotación futura
    if (res) {
      const semana = agregarSemana({
        fechaLunes,
        descripcion: semanaDesc || `Semana del ${fechaLunes}`,
        horarios: res.horarios,
        resumenPorColaborador: resumirTurnos(res.horarios, nombrePorId),
        // Snapshot para re-exportar el PDF completo desde "Último horario"
        cajaAux: res.cajaAux,
        cajaEventual: res.cajaEventual,
        coberturaFranjas: res.coberturaFranjas,
        faltantesFranjas: res.faltantesFranjas,
        porcentajeCobertura: res.porcentajeCobertura,
        // Necesidad del PDF: para el panel de cobertura en vivo del editor
        necesidadFranjas: necesidad.map(f => [...f.necesidad]),
      })
      setSemanaGuardadaId(semana.id)
    }
    setPaso('resultado')
  }

  // Capacidad 3: edición manual del resultado + registro de la corrección
  const handleEditarJornada = (colaboradorId: string, dia: number, nueva: JornadaResumida) => {
    if (!resultado) return
    const horario = resultado.horarios.find(h => h.colaboradorId === colaboradorId)
    const jornadaAnterior = horario?.jornadas.find(j => j.dia === dia)
    if (!jornadaAnterior) return

    agregarCorreccion({
      semanaId: semanaGuardadaId ?? '',
      colaboradorNombre: nombrePorId[colaboradorId] ?? colaboradorId,
      dia,
      antes: { esFranco: jornadaAnterior.esFranco, turnos: jornadaAnterior.turnos },
      despues: nueva,
    })
    editarJornada(colaboradorId, dia, nueva)
    if (semanaGuardadaId) actualizarSemana(semanaGuardadaId, { editadoManualmente: true })
  }

  // Mantener el historial sincronizado con las ediciones (la rotación debe
  // basarse en lo que realmente quedó, no en lo que generó el algoritmo)
  useEffect(() => {
    if (resultado && semanaGuardadaId) {
      actualizarSemana(semanaGuardadaId, {
        horarios: resultado.horarios,
        resumenPorColaborador: resumirTurnos(resultado.horarios, nombrePorId),
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultado])

  const handleExportarPDF = () => {
    if (!resultado) return
    const pdf = generarPDF(resultado, colaboradoresActivos, semanaDesc, auxiliaresActivos, eventualesActivos)
    pdf.save(`horarios-${semanaDesc.toLowerCase().replace(/ /g, '-')}.pdf`)
  }

  const handleNuevaSemana = () => {
    resetPDF()
    resetAsignacion()
    setExcepciones([])
    setMostrarExcepciones(false)
    setSemanaGuardadaId(null)
    setPaso('upload')
  }

  // Calcular horas totales necesarias estimadas
  const horasNecesariasEstimadas = necesidad.reduce(
    (sum, franja) => sum + franja.necesidad.reduce((s, n) => s + n, 0),
    0
  ) * 0.5 // Cada franja son 0.5h

  const horasDisponibles = colaboradoresActivos.reduce((sum, col) => {
    if (col.tipo === 'PART') return sum + 32 // Máximo para PART
    return sum + col.horasSemanales
  }, 0)

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{
          fontSize: '36px',
          fontWeight: 800,
          fontFamily: "'Syne', sans-serif",
          color: 'var(--text)',
          margin: 0,
          letterSpacing: '-0.5px',
        }}>
          Nueva Semana
        </h1>
        <p style={{
          color: 'var(--text-muted)',
          fontFamily: "'Space Grotesk', sans-serif",
          fontSize: '16px',
          marginTop: '8px',
        }}>
          Sube el PDF con la necesidad de cajas y genera los horarios automáticamente.
        </p>
      </div>

      {/* Pasos */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '32px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', color: paso === 'upload' ? 'var(--accent-strong)' : 'var(--text-muted)' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: paso === 'upload' ? 'var(--accent)' : 'var(--surface)',
              color: paso === 'upload' ? 'var(--accent-dark)' : 'var(--text-muted)',
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 600,
            }}>
              1
            </div>
            <span style={{
              marginLeft: '8px',
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 500,
            }}>
              Subir PDF
            </span>
          </div>
          <div style={{ width: '48px', height: '2px', background: 'var(--border)' }}></div>
          <div style={{ display: 'flex', alignItems: 'center', color: paso === 'revisar' ? 'var(--accent-strong)' : 'var(--text-muted)' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: paso === 'revisar' ? 'var(--accent)' : 'var(--surface)',
              color: paso === 'revisar' ? 'var(--accent-dark)' : 'var(--text-muted)',
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 600,
            }}>
              2
            </div>
            <span style={{
              marginLeft: '8px',
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 500,
            }}>
              Revisar
            </span>
          </div>
          <div style={{ width: '48px', height: '2px', background: 'var(--border)' }}></div>
          <div style={{ display: 'flex', alignItems: 'center', color: paso === 'resultado' ? 'var(--accent-strong)' : 'var(--text-muted)' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: paso === 'resultado' ? 'var(--accent)' : 'var(--surface)',
              color: paso === 'resultado' ? 'var(--accent-dark)' : 'var(--text-muted)',
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 600,
            }}>
              3
            </div>
            <span style={{
              marginLeft: '8px',
              fontFamily: "'Space Grotesk', sans-serif",
              fontWeight: 500,
            }}>
              Resultado
            </span>
          </div>
        </div>

        {paso !== 'upload' && (
          <button
            onClick={handleNuevaSemana}
            style={{
              color: 'var(--text-muted)',
              background: 'none',
              border: 'none',
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            ← Nueva semana
          </button>
        )}
      </div>

      {/* Paso 1: Upload */}
      {paso === 'upload' && (
        <div style={{
          background: 'var(--card)',
          borderRadius: '16px',
          border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
          padding: '40px',
        }}>
          <PDFUploader
            onFileSelect={handlePDFSelect}
            loading={loadingPDF}
            error={errorPDF}
          />
        </div>
      )}

      {/* Paso 2: Revisar */}
      {paso === 'revisar' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          <div style={{
            background: 'var(--card)',
            borderRadius: '16px',
            border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
            padding: '32px',
          }}>
            <h3 style={{
              fontSize: '24px',
              fontWeight: 800,
              fontFamily: "'Syne', sans-serif",
              color: 'var(--text)',
              marginBottom: '16px',
              letterSpacing: '-0.5px',
            }}>
              Resumen de necesidad
            </h3>
            <PreviewNecesidad necesidad={necesidad} />
          </div>

          <div style={{
            background: 'var(--card)',
            borderRadius: '16px',
            border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
            padding: '32px',
          }}>
            <h3 style={{
              fontSize: '24px',
              fontWeight: 800,
              fontFamily: "'Syne', sans-serif",
              color: 'var(--text)',
              marginBottom: '16px',
              letterSpacing: '-0.5px',
            }}>
              Colaboradores activos esta semana
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ minWidth: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'var(--surface)' }}>
                  <tr>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Nombre
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Tipo
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Horas Sem.
                    </th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {colaboradoresActivos.map((col) => (
                    <tr key={col.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--text)' }}>{col.nombre}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          display: 'inline-flex',
                          padding: '4px 12px',
                          fontSize: '12px',
                          fontWeight: 600,
                          borderRadius: '100px',
                          background: col.tipo === 'FULL' ? 'var(--accent)' :
                                    col.tipo === 'PART' ? 'var(--purple)' : 'var(--surface)',
                          color: col.tipo === 'FULL' ? 'var(--accent-dark)' :
                                 col.tipo === 'PART' ? 'var(--bg)' : 'var(--text)',
                        }}>
                          {col.tipo}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: 'var(--text)' }}>{col.horasSemanales}h</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{
                          display: 'inline-flex',
                          padding: '4px 12px',
                          fontSize: '12px',
                          fontWeight: 600,
                          borderRadius: '100px',
                          background: 'var(--accent)',
                          color: 'var(--accent-dark)',
                        }}>
                          Activo
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{
              marginTop: '24px',
              padding: '20px',
              background: 'var(--surface)',
              borderRadius: '12px',
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '16px',
                marginBottom: '16px',
              }}>
                <div>
                  <h4 style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 600,
                    fontSize: '14px',
                    color: 'var(--text)',
                    marginBottom: '4px',
                  }}>
                    Horas necesarias estimadas
                  </h4>
                  <p style={{
                    fontSize: '32px',
                    fontWeight: 800,
                    fontFamily: "'Syne', sans-serif",
                    color: 'var(--text)',
                    letterSpacing: '-0.5px',
                  }}>
                    {horasNecesariasEstimadas.toFixed(1)}h
                  </p>
                  <p style={{
                    fontSize: '14px',
                    color: 'var(--text-muted)',
                  }}>
                    Basado en la tabla de necesidad
                  </p>
                </div>
                <div>
                  <h4 style={{
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 600,
                    fontSize: '14px',
                    color: 'var(--text)',
                    marginBottom: '4px',
                  }}>
                    Horas disponibles máximas
                  </h4>
                  <p style={{
                    fontSize: '32px',
                    fontWeight: 800,
                    fontFamily: "'Syne', sans-serif",
                    color: 'var(--text)',
                    letterSpacing: '-0.5px',
                  }}>
                    {horasDisponibles}h
                  </p>
                  <p style={{
                    fontSize: '14px',
                    color: 'var(--text-muted)',
                  }}>
                    Sumatoria de todos los colaboradores activos
                  </p>
                </div>
              </div>
              <div style={{ marginTop: '16px' }}>
                <div style={{
                  height: '8px',
                  background: 'var(--surface)',
                  borderRadius: '4px',
                  overflow: 'hidden',
                }}>
                  <div
                    style={{
                      height: '100%',
                      background: 'var(--accent)',
                      width: `${Math.min(100, (horasDisponibles / horasNecesariasEstimadas) * 100)}%`,
                    }}
                  ></div>
                </div>
                <p style={{
                  fontSize: '14px',
                  color: 'var(--text-muted)',
                  marginTop: '8px',
                }}>
                  {horasDisponibles >= horasNecesariasEstimadas
                    ? '✅ Horas suficientes para cubrir la necesidad'
                    : '⚠️ Puede haber faltantes de cobertura'}
                </p>
              </div>
            </div>

            {/* Reglas y preferencias que se aplicarán en esta generación */}
            <div style={{
              marginTop: '32px',
              padding: '24px',
              border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
              borderRadius: '16px',
              background: 'var(--card)',
            }}>
              <h3 style={{
                fontSize: '20px',
                fontWeight: 800,
                fontFamily: "'Syne', sans-serif",
                color: 'var(--text)',
                letterSpacing: '-0.5px',
                marginBottom: '12px',
              }}>
                Reglas y preferencias que se aplicarán
              </h3>
              <p style={{ fontSize: '14px', color: 'var(--text)' }}>
                ⚙️ {reglasActivas.length === 0
                  ? 'No hay reglas configuradas (podés crearlas en la pestaña "Reglas").'
                  : `${reglasActivas.length} regla${reglasActivas.length === 1 ? '' : 's'} activa${reglasActivas.length === 1 ? '' : 's'} del local se aplicarán automáticamente.`}
              </p>
              {frasesPreferencias.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  <p style={{ fontSize: '14px', color: 'var(--text)' }}>🔄 Rotación y preferencias aprendidas:</p>
                  {frasesPreferencias.map((f, i) => (
                    <p key={i} style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: '20px', marginTop: '2px' }}>• {f}</p>
                  ))}
                </div>
              )}
              {criteriosActivos.length > 0 && (
                <div style={{ marginTop: '8px' }}>
                  <p style={{ fontSize: '14px', color: 'var(--text)' }}>🎯 Criterios de cobertura que esta propuesta ya incorpora:</p>
                  {criteriosActivos.map((c, i) => (
                    <p key={i} style={{ fontSize: '13px', color: 'var(--text-muted)', marginLeft: '20px', marginTop: '2px' }}>• {c.descripcion}</p>
                  ))}
                </div>
              )}
              {conflictosReglas.length > 0 && (
                <div style={{
                  marginTop: '12px',
                  padding: '12px 16px',
                  border: '1px solid var(--accent-strong)',
                  borderRadius: '12px',
                  background: 'var(--surface)',
                }}>
                  <p style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-strong)' }}>
                    ⚠️ Conflictos con reglas laborales duras (se informan, nunca se violan):
                  </p>
                  {conflictosReglas.map((c, i) => (
                    <p key={i} style={{ fontSize: '13px', color: 'var(--text)', marginTop: '4px' }}>• {c}</p>
                  ))}
                </div>
              )}
            </div>

            {/* Sección de excepciones semanales */}
            <div style={{
              marginTop: '32px',
              padding: '24px',
              border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
              borderRadius: '16px',
              background: 'var(--card)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{
                  fontSize: '20px',
                  fontWeight: 800,
                  fontFamily: "'Syne', sans-serif",
                  color: 'var(--text)',
                  letterSpacing: '-0.5px',
                }}>
                  Excepciones semanales (opcional)
                </h3>
                <button
                  onClick={() => setMostrarExcepciones(!mostrarExcepciones)}
                  style={{
                    color: 'var(--accent-strong)',
                    background: 'none',
                    border: 'none',
                    fontFamily: "'Space Grotesk', sans-serif",
                    fontWeight: 500,
                    fontSize: '14px',
                    cursor: 'pointer',
                  }}
                >
                  {mostrarExcepciones ? 'Ocultar' : 'Agregar excepción'}
                </button>
              </div>

              {mostrarExcepciones && (
                <div style={{
                  marginBottom: '24px',
                  padding: '20px',
                  border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
                  borderRadius: '12px',
                  background: 'var(--surface)',
                }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '16px',
                    marginBottom: '16px',
                  }}>
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: 'var(--text)',
                        marginBottom: '8px',
                      }}>
                        Colaborador
                      </label>
                      <select
                        value={colaboradorSeleccionado}
                        onChange={(e) => setColaboradorSeleccionado(e.target.value)}
                        style={{
                          width: '100%',
                          border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
                          borderRadius: '12px',
                          padding: '12px 16px',
                          background: 'var(--card)',
                          color: 'var(--text)',
                          fontFamily: "'Space Grotesk', sans-serif",
                          fontSize: '14px',
                        }}
                      >
                        <option value="">Seleccionar...</option>
                        {colaboradoresActivos.map(col => (
                          <option key={col.id} value={col.id}>{col.nombre}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{
                        display: 'block',
                        fontSize: '14px',
                        fontWeight: 600,
                        color: 'var(--text)',
                        marginBottom: '8px',
                      }}>
                        Tipo de excepción
                      </label>
                      <select
                        value={tipoSeleccionado}
                        onChange={(e) => {
                          setTipoSeleccionado(e.target.value as ExcepcionSemanal['tipo'])
                          setValorInput('')
                        }}
                        style={{
                          width: '100%',
                          border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
                          borderRadius: '12px',
                          padding: '12px 16px',
                          background: 'var(--card)',
                          color: 'var(--text)',
                          fontFamily: "'Space Grotesk', sans-serif",
                          fontSize: '14px',
                        }}
                      >
                        <option value="franco_dia">Franco en día específico</option>
                        <option value="no_antes_de">No disponible antes de cierta hora</option>
                        <option value="no_despues_de">No disponible después de cierta hora</option>
                        <option value="siempre_cierre">Siempre hacer cierre (turno hasta 22:30)</option>
                        <option value="solo_matutino">Solo turno matutino (terminar antes de las 15:00)</option>
                        <option value="solo_nocturno">Solo turno nocturno (empezar después de las 17:00)</option>
                      </select>
                    </div>
                    <div>
                      {(tipoSeleccionado === 'franco_dia' || tipoSeleccionado === 'no_antes_de' || tipoSeleccionado === 'no_despues_de') && (
                        <>
                          <label style={{
                            display: 'block',
                            fontSize: '14px',
                            fontWeight: 600,
                            color: 'var(--text)',
                            marginBottom: '8px',
                          }}>
                            {tipoSeleccionado === 'franco_dia' ? 'Día de la semana' : 'Hora (HH:MM)'}
                          </label>
                          {tipoSeleccionado === 'franco_dia' ? (
                            <select
                              value={valorInput}
                              onChange={(e) => setValorInput(e.target.value)}
                              style={{
                                width: '100%',
                                border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
                                borderRadius: '12px',
                                padding: '12px 16px',
                                background: 'var(--card)',
                                color: 'var(--text)',
                                fontFamily: "'Space Grotesk', sans-serif",
                                fontSize: '14px',
                              }}
                            >
                              <option value="">Seleccionar...</option>
                              {DIAS_SEMANA.map(dia => (
                                <option key={dia} value={dia}>{dia}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="time"
                              value={valorInput}
                              onChange={(e) => setValorInput(e.target.value)}
                              style={{
                                width: '100%',
                                border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
                                borderRadius: '12px',
                                padding: '12px 16px',
                                background: 'var(--card)',
                                color: 'var(--text)',
                                fontFamily: "'Space Grotesk', sans-serif",
                                fontSize: '14px',
                              }}
                              step="300"
                            />
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={agregarExcepcion}
                      style={{
                        background: 'var(--accent)',
                        color: 'var(--accent-dark)',
                        padding: '12px 24px',
                        borderRadius: '100px',
                        border: 'none',
                        fontFamily: "'Syne', sans-serif",
                        fontWeight: 800,
                        fontSize: '14px',
                        letterSpacing: '-0.2px',
                        display: 'flex',
                        alignItems: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ marginRight: '8px' }}>+</span>
                      Agregar
                    </button>
                  </div>
                </div>
              )}

              {/* Lista de excepciones agregadas */}
              {excepciones.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {excepciones.map(exc => (
                      <div
                        key={exc.id}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          background: 'var(--surface)',
                          color: 'var(--accent-strong)',
                          borderRadius: '100px',
                          padding: '8px 16px',
                          fontSize: '14px',
                        }}
                      >
                        <span>{exc.descripcion}</span>
                        <button
                          onClick={() => eliminarExcepcion(exc.id)}
                          style={{
                            marginLeft: '8px',
                            color: 'var(--accent-strong)',
                            background: 'none',
                            border: 'none',
                            fontSize: '18px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <p style={{
                    fontSize: '14px',
                    color: 'var(--text-muted)',
                    marginTop: '8px',
                  }}>
                    {excepciones.length} / 10 excepciones agregadas
                  </p>
                </div>
              )}
            </div>

            <div style={{ marginTop: '32px', display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleGenerarHorarios}
                disabled={loadingAsignacion}
                style={{
                  background: 'var(--accent)',
                  color: 'var(--accent-dark)',
                  padding: '16px 32px',
                  borderRadius: '100px',
                  border: 'none',
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: 800,
                  fontSize: '16px',
                  letterSpacing: '-0.2px',
                  display: 'flex',
                  alignItems: 'center',
                  cursor: loadingAsignacion ? 'not-allowed' : 'pointer',
                  opacity: loadingAsignacion ? 0.5 : 1,
                }}
              >
                {loadingAsignacion ? (
                  <>
                    <span style={{ marginRight: '8px', animation: 'spin 1s linear infinite' }}>⟳</span>
                    Aliada IA está generando el horario óptimo...
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: '20px', marginRight: '8px' }}>🚀</span>
                    Generar horarios automáticamente
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paso 3: Resultado */}
      {paso === 'resultado' && resultado && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{
                fontSize: '32px',
                fontWeight: 800,
                fontFamily: "'Syne', sans-serif",
                color: 'var(--text)',
                margin: 0,
                letterSpacing: '-0.5px',
              }}>
                Horarios generados
              </h2>
              <p style={{
                color: 'var(--text-muted)',
                fontFamily: "'Space Grotesk', sans-serif",
                fontSize: '16px',
                marginTop: '4px',
              }}>
                {semanaDesc}
              </p>
            </div>
            <div style={{ display: 'flex', gap: '16px' }}>
              <button
                onClick={handleNuevaSemana}
                style={{
                  padding: '12px 24px',
                  border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
                  borderRadius: '12px',
                  background: 'var(--card)',
                  color: 'var(--text)',
                  fontFamily: "'Space Grotesk', sans-serif",
                  fontSize: '14px',
                  cursor: 'pointer',
                }}
              >
                Nueva semana
              </button>
              <button
                onClick={handleExportarPDF}
                style={{
                  background: 'var(--accent)',
                  color: 'var(--accent-dark)',
                  padding: '12px 24px',
                  borderRadius: '100px',
                  border: 'none',
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: 800,
                  fontSize: '14px',
                  letterSpacing: '-0.2px',
                  display: 'flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                }}
              >
                <span style={{ marginRight: '8px' }}>📄</span>
                Exportar a PDF
              </button>
            </div>
          </div>

          {errorAsignacion && (
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)', boxShadow: 'var(--shadow)',
              borderRadius: '12px',
              padding: '20px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <span style={{ color: 'var(--accent-strong)', marginRight: '8px' }}>❌</span>
                <p style={{ color: 'var(--text)' }}>{errorAsignacion}</p>
              </div>
            </div>
          )}

          <PanelAlertas
            alertas={resultado.alertas}
            porcentajeCobertura={resultado.porcentajeCobertura}
          />

          <TablaCobertura
            coberturaFranjas={resultado.coberturaFranjas}
            faltantesFranjas={resultado.faltantesFranjas}
            necesidadFranjas={necesidad.map(f => f.necesidad)}
          />

          <TablaHorarios
            horarios={resultado.horarios}
            colaboradores={colaboradoresActivos}
            auxiliares={auxiliaresActivos}
            eventuales={eventualesActivos}
            editable
            onEditarJornada={handleEditarJornada}
          />
        </div>
      )}
    </div>
  )
}