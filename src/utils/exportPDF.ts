import type { ResultadoValidacion } from '../algoritmo/validadorIndependiente'
import jsPDF from 'jspdf'
import autoTable, { type UserOptions } from 'jspdf-autotable'
import { ResultadoAsignacion, Colaborador, Auxiliar, Eventual, SemanaHistorial, DIAS_SEMANA, HORAS_FRANJAS } from '../types'
import { formatoTurno } from './timeUtils'
import type { MetricaSemana, IndicadoresEfectividad, PrediccionCorrecciones, MadurezBanda } from './efectividad'
import type { CriterioCobertura } from './preferencias'

/** Convierte un índice de slot (0 = 08:00, cada slot = 30 min) a "HH:MM". */
function slotAHoraLegible(slot: number): string {
  const horas = 8 + Math.floor(slot / 2)
  const mins = (slot % 2) * 30
  return `${String(horas).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

/**
 * Convierte la fila de slots de CAJA de un día (30 booleanos) en un texto legible.
 * Bloques contiguos de CAJA se muestran como "HH:MM-HH:MM" con fin EXCLUSIVO
 * (cada slot dura 30 min): un slot individual en 19:00 se muestra "19:00-19:30",
 * nunca "19:00-19:00". Bloques discontinuos del mismo día (separados por al
 * menos un slot PARADO/no-CAJA) se cierran por separado y se unen con " | ".
 * Si no hay ningún slot en CAJA, devuelve `textoSinCaja` (p. ej. "PARADO"
 * para AUX o "-" para eventuales).
 */
function formatearCajaDia(slotsCaja: boolean[], textoSinCaja: string): string {
  // 1. Detectar bloques contiguos como pares [inicio, fin) con fin exclusivo.
  const bloques: Array<[number, number]> = []
  let inicio = -1
  for (let s = 0; s <= slotsCaja.length; s++) {
    const enCaja = s < slotsCaja.length && slotsCaja[s]
    if (enCaja && inicio === -1) {
      inicio = s
    } else if (!enCaja && inicio !== -1) {
      bloques.push([inicio, s]) // el slot s (no-CAJA o fin de día) cierra el bloque
      inicio = -1
    }
  }
  // 2. Filtrar cualquier bloque degenerado (duración 0) y formatear.
  const legibles = bloques
    .filter(([ini, fin]) => fin > ini)
    .map(([ini, fin]) => `${slotAHoraLegible(ini)}-${slotAHoraLegible(fin)}`)
  return legibles.length > 0 ? legibles.join(' | ') : textoSinCaja
}

function sanitizarTexto(texto: string): string {
  return texto
    .replace(/[^\x20-\x7E\u00A0-\u024F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Identificación del documento y resultado de la validación, si está disponible. */
export interface MetaPDF {
  sucursal?: string
  /** 7 fechas yyyy-MM-dd (lunes→domingo). */
  fechas?: string[]
  version?: number
  validacion?: ResultadoValidacion
  estado?: string
  necesidadFranjas?: number[][]
}

const fechaAR = (iso: string) => iso.split('-').reverse().join('/')
const MARGEN = 12
const INICIO_TABLA = 42
const TINTA = [29, 43, 55] as const
const PETROLEO = [21, 74, 78] as const

export function generarPDF(
  resultado: ResultadoAsignacion,
  colaboradores: Colaborador[],
  semanaDesc: string,
  auxiliares: Auxiliar[] = [],
  eventuales: Eventual[] = [],
  meta: MetaPDF = {}
): jsPDF {
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4', unit: 'mm' })
  // Helvetica a 9–10 pt ocupa más alto que el interlineado por defecto.
  // AutoTable usa este factor tanto al medir la fila como al dibujarla.
  doc.setLineHeightFactor(1.48)
  const { width, height } = doc.internal.pageSize
  const ancho = width - MARGEN * 2
  const fechas = meta.fechas?.length === 7 ? meta.fechas : undefined
  const dias = DIAS_SEMANA.map((dia, i) => fechas ? `${dia} ${fechaAR(fechas[i]).slice(0, 5)}` : dia)
  const ident = [
    meta.sucursal ? `Sucursal ${meta.sucursal}` : null,
    fechas ? `Semana ${fechaAR(fechas[0])} al ${fechaAR(fechas[6])}` : null,
    meta.version !== undefined ? `Versión ${meta.version}` : null,
  ].filter(Boolean).join('  ·  ')
  const estado = meta.estado?.split(':')[0] ?? (meta.validacion ? (meta.validacion.publicable ? 'VALIDADO' : 'BORRADOR') : undefined)

  function encabezado(titulo: string, detalle?: string) {
    doc.setFillColor(...PETROLEO)
    doc.rect(MARGEN, 9, 13, 1, 'F')
    doc.setTextColor(...TINTA)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(17)
    const alternativo = `${titulo} - ${semanaDesc}`
    const tituloCorto = !ident && titulo === 'Horarios Semanales' && doc.getTextWidth(alternativo) <= ancho
    doc.text(tituloCorto ? alternativo : titulo, MARGEN, 18, { maxWidth: ancho })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    if (ident) doc.text(ident, MARGEN, 24)
    else if (semanaDesc && !tituloCorto) doc.text(doc.splitTextToSize(semanaDesc, ancho)[0], MARGEN, 24)
    if (estado) {
      doc.setFontSize(8.5)
      doc.text(`Estado: ${estado}`, MARGEN, 29)
    }
    if (detalle) {
      doc.setFontSize(8.5)
      doc.text(detalle, MARGEN, 34)
    }
  }

  function tabla(titulo: string, opciones: UserOptions, detalle?: string) {
    autoTable(doc, {
      theme: 'grid',
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      tableWidth: ancho,
      margin: { top: INICIO_TABLA, bottom: 15, left: MARGEN, right: MARGEN },
      startY: INICIO_TABLA,
      headStyles: { fillColor: [...PETROLEO], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [244, 248, 248] },
      ...opciones,
      styles: { cellPadding: { top: 2, bottom: 2, left: 1.8, right: 1.8 }, fontSize: 10, textColor: [...TINTA], overflow: 'linebreak', valign: 'top', ...opciones.styles },
      willDrawPage: () => encabezado(titulo, detalle),
    })
  }

  const nombres = new Map<string, { nombre: string; tipo: string }>()
  for (const c of colaboradores) nombres.set(c.id, { nombre: c.nombre, tipo: c.tipo })
  for (const a of auxiliares) nombres.set(a.id, { nombre: a.nombre, tipo: 'AUX' })
  for (const e of eventuales) nombres.set(e.id, { nombre: e.nombre, tipo: 'EVENTUAL' })
  const tipoPorRol = { cajero: 'CAJA', aux_supervisor: 'AUX', aux_eventual: 'AUX', eventual_sector: 'EVENTUAL' }

  const nominal = resultado.horarios.map(h => {
    const col = nombres.get(h.colaboradorId)
    const tipo = col?.tipo ?? tipoPorRol[h.rolGeneral]
    const porDia = new Map(h.jornadas.map(j => [j.dia, j]))
    return [
      col?.nombre ?? h.colaboradorId,
      tipo,
      `${String(h.totalHoras).replace('.', ',')} h`,
      ...dias.map((_, d) => {
        const jornada = porDia.get(d)
        if (!jornada) return '-'
        if (jornada.esFranco) return tipo === 'EVENTUAL' ? 'Sin caja' : 'FRANCO'
        const bloques = formatoTurno(jornada.turnos.map(t => ({ inicio: t.inicio.padStart(5, '0'), fin: t.fin.padStart(5, '0') }))).split(' | ').join('\n')
        return jornada.rol === 'franco_medio' ? `${bloques}\nMedio franco` : bloques
      }),
    ]
  })

  const anchoDiaNominal = (ancho - 97) / 7
  tabla('Horarios Semanales', {
    head: [['Colaborador', 'Tipo', 'Horas', ...dias]],
    body: nominal,
    styles: { halign: 'center' },
    columnStyles: {
      0: { cellWidth: 56, halign: 'left' },
      1: { cellWidth: 26 },
      2: { cellWidth: 15 },
      ...Object.fromEntries(dias.map((_, d) => [d + 3, { cellWidth: anchoDiaNominal }])),
    },
    didParseCell: ({ cell, column, section }) => {
      if (section === 'body' && column.index >= 3 && cell.raw === 'FRANCO') {
        cell.styles.fillColor = [232, 238, 240]
        cell.styles.fontStyle = 'bold'
      }
    },
  }, 'AUX: jornada de presencia. Eventuales: turnos y horas asignados en caja.')

  const asignaciones = [
    ...(resultado.cajaAux ?? []).map(a => ({ ...a, tipo: 'AUX' })),
    ...(resultado.cajaEventual ?? []).map(a => ({ ...a, tipo: 'EVENTUAL' })),
  ]
  if (asignaciones.length > 0) {
    doc.addPage()
    tabla('Asignaciones en caja', {
      head: [['Colaborador', 'Tipo', ...dias]],
      body: asignaciones.map(a => [
        a.nombre, a.tipo, ...dias.map((_, d) => formatearCajaDia(a.slotsCajaPorDia[d] ?? [], '-').split(' | ').join('\n')),
      ]),
      styles: { halign: 'center' },
      columnStyles: {
        0: { cellWidth: 58, halign: 'left' },
        1: { cellWidth: 26 },
        ...Object.fromEntries(dias.map((_, d) => [d + 2, { cellWidth: (ancho - 84) / 7 }])),
      },
    }, 'Bloques en caja de AUX y eventuales. Un guion indica que no hay asignación.')
  }

  const metricas = meta.validacion?.metricas
  const cobertura = metricas?.cobertura ?? resultado.coberturaFranjas
  if (cobertura.length > 0) {
    doc.addPage()
    const demandaConocida = !!(metricas || meta.necesidadFranjas)
    tabla('Cobertura por franja', {
      head: [['Horario', ...dias]],
      body: HORAS_FRANJAS.map((hora, f) => [hora, ...dias.map((_, d) => {
        const asignadas = cobertura[f]?.[d] ?? 0
        const requeridas = metricas
          ? asignadas + (metricas.faltantes[f]?.[d] ?? 0) - (metricas.sobrantes[f]?.[d] ?? 0)
          : meta.necesidadFranjas?.[f]?.[d] ?? asignadas + (resultado.faltantesFranjas[f]?.[d] ?? 0)
        return `${asignadas}/${requeridas}`
      })]),
      styles: { cellPadding: 0.7, fontSize: 8, halign: 'center' },
      didParseCell: ({ cell, column, section }) => {
        if (section !== 'body' || column.index === 0) return
        const [asignadas, requeridas] = String(cell.raw).split('/').map(Number)
        if (asignadas < requeridas) {
          cell.styles.textColor = [146, 32, 28]
          cell.styles.fontStyle = 'bold'
        } else if (asignadas > requeridas) {
          cell.styles.textColor = [121, 84, 14]
        }
      },
    }, demandaConocida ? 'Cajas asignadas / necesarias por media hora.' : 'Cajas asignadas / referencia calculada a partir de los faltantes guardados.')
  }

  if (meta.validacion) {
    doc.addPage()
    const { violaciones } = meta.validacion
    const titulo = 'Validación y faltantes'
    const detalle = metricas
      ? `Horas-caja faltantes: ${metricas.horasCajaFaltantes}  ·  sobrantes: ${metricas.horasCajaSobrantes}`
      : undefined
    if (violaciones.length > 0) {
      tabla(titulo, {
        head: [['Nivel', 'Código', 'Día', 'Detalle']],
        body: violaciones.map(x => [x.nivel, x.codigo, x.dia !== undefined ? DIAS_SEMANA[x.dia] : '', x.detalle]),
        columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 59, fontSize: 8 }, 2: { cellWidth: 14 }, 3: { cellWidth: ancho - 103 } },
      }, detalle)
    } else {
      encabezado(titulo, detalle)
      doc.setFontSize(10)
      doc.text('Sin violaciones de reglas normativas ni operativas.', MARGEN, INICIO_TABLA + 6)
    }
  }

  const alertas = [...resultado.alertas, ...(meta.validacion?.advertencias ?? [])]
  if (alertas.length > 0) {
    doc.addPage()
    tabla('Alertas de generación', {
      head: [['N.º', 'Detalle']],
      body: alertas.map((alerta, i) => [i + 1, sanitizarTexto(alerta)]),
      columnStyles: { 0: { cellWidth: 14 }, 1: { cellWidth: ancho - 14 } },
    }, `Cobertura al generar: ${resultado.porcentajeCobertura.toFixed(1)} %`)
  }

  const paginas = doc.getNumberOfPages()
  const generado = new Date().toLocaleDateString('es-AR')
  for (let pagina = 1; pagina <= paginas; pagina++) {
    doc.setPage(pagina)
    doc.setDrawColor(189, 202, 204)
    doc.line(MARGEN, height - 12, width - MARGEN, height - 12)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...TINTA)
    doc.text(`Aliada Horarios  ·  Generado el ${generado}`, MARGEN, height - 7)
    doc.text(`Página ${pagina} de ${paginas}`, width - MARGEN, height - 7, { align: 'right' })
  }

  return doc
}
/**
 * PDF del historial de semanas guardadas: por cada semana (más reciente
 * primero) una tabla con el resumen por colaborador (M/T/C/F) y sus
 * horarios por día. Pensado para imprimir desde la página Historial.
 */
export function exportarHistorialPDF(semanas: SemanaHistorial[]): jsPDF {
  const doc = new jsPDF('landscape')
  const fecha = new Date().toLocaleDateString('es-AR')

  doc.setFontSize(16)
  doc.text('Historial de semanas generadas', 14, 15)
  doc.setFontSize(10)
  doc.text(`Exportado: ${fecha} - ${semanas.length} semana${semanas.length === 1 ? '' : 's'}`, 14, 22)

  const ordenadas = [...semanas].sort((a, b) => {
    if (a.fechaLunes !== b.fechaLunes) return b.fechaLunes.localeCompare(a.fechaLunes)
    return b.version - a.version
  })

  let y = 30
  for (const s of ordenadas) {
    if (y > 160) {
      doc.addPage()
      y = 20
    }
    doc.setFontSize(12)
    doc.setTextColor(0, 0, 0)
    const modif = s.modificadoEl ? ` - modificado ${formatearFechaHora(s.modificadoEl)}` : ''
    const editada = s.editadoManualmente ? ' [editada]' : ''
    doc.text(
      `${s.descripcion} (lunes ${s.fechaLunes}, v${s.version}) - generado ${formatearFechaHora(s.generadoEl)}${modif}${editada}`,
      14, y
    )

    const filas = Object.entries(s.resumenPorColaborador).map(([nombre, r]) => [
      nombre,
      String(r.mananas),
      String(r.tardes),
      String(r.cierres),
      String(r.francos),
    ])

    autoTable(doc, {
      head: [['Colaborador', 'Mananas', 'Tardes', 'Cierres', 'Francos']],
      body: filas.length > 0 ? filas : [['(sin resumen)', '-', '-', '-', '-']],
      startY: y + 4,
      theme: 'grid',
      headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
      bodyStyles: { textColor: [0, 0, 0] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { halign: 'left' },
        ...Object.fromEntries(Array.from({ length: 4 }, (_, i) => [1 + i, { halign: 'center' }])),
      },
      margin: { left: 14 },
      styles: { cellPadding: 2, fontSize: 8 },
      rowPageBreak: 'avoid',
    })
    y = ((doc as any).lastAutoTable?.finalY || y) + 12
  }

  return doc
}

function formatearFechaHora(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ==================== REPORTE DE EFECTIVIDAD ====================

/**
 * Reporte de efectividad para direccion: demuestra con datos que el sistema
 * aprende (correcciones por semana en baja, cobertura del motor en alza).
 */
export function exportarEfectividadPDF(
  metricas: MetricaSemana[],
  indicadores: IndicadoresEfectividad,
  prediccion: PrediccionCorrecciones | null,
  criterios: CriterioCobertura[],
  madurez: MadurezBanda[]
): jsPDF {
  const doc = new jsPDF('landscape')
  const fecha = new Date().toLocaleDateString('es-AR')

  doc.setFontSize(16)
  doc.text('Reporte de efectividad - Aliada Horarios', 14, 15)
  doc.setFontSize(10)
  doc.text(`Exportado: ${fecha} - ${metricas.length} semana${metricas.length === 1 ? '' : 's'} analizada${metricas.length === 1 ? '' : 's'}`, 14, 22)

  // Indicadores clave
  let y = 32
  doc.setFontSize(11)
  const lineas: string[] = []
  if (indicadores.correccionesUltimaSemana !== null && indicadores.promedioCorrecciones !== null) {
    lineas.push(`Correcciones ultima semana: ${indicadores.correccionesUltimaSemana} (promedio historico: ${indicadores.promedioCorrecciones.toFixed(1)})`)
  }
  if (indicadores.pctMotorUltimaSemana !== null) {
    lineas.push(`El motor cubre ${indicadores.pctMotorUltimaSemana.toFixed(1)}% sin intervencion humana (meta: >95%)`)
  }
  if (indicadores.tendenciaCorrecciones) {
    const t = indicadores.tendenciaCorrecciones
    lineas.push(`Tendencia de correcciones: ${t === 'mejorando' ? 'EN BAJA (el sistema aprende)' : t === 'estable' ? 'estable' : 'en alza (revisar)'}`)
  }
  if (prediccion) {
    lineas.push(`Proyeccion: ~${prediccion.en4Semanas.toFixed(1)} correcciones/semana dentro de 4 semanas`)
  }
  for (const linea of lineas) {
    doc.text(`- ${linea}`, 14, y)
    y += 7
  }

  // Tabla semana a semana
  autoTable(doc, {
    head: [['Semana', 'Lunes', 'Correcciones', '% Motor', '% Final', 'Criterios activos al generar', 'Senales nuevas']],
    body: metricas.map(m => [
      m.descripcion,
      m.fechaLunes,
      String(m.correcciones),
      m.pctMotor !== null ? `${m.pctMotor.toFixed(1)}%` : '-',
      m.pctFinal !== null ? `${m.pctFinal.toFixed(1)}%` : '-',
      m.criteriosActivosAlGenerar.join(', ') || '-',
      m.criteriosNuevos.join(', ') || '-',
    ]),
    startY: y + 2,
    theme: 'grid',
    headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
    bodyStyles: { textColor: [0, 0, 0] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14 },
    styles: { cellPadding: 2, fontSize: 8 },
    rowPageBreak: 'avoid',
  })
  y = ((doc as any).lastAutoTable?.finalY || y) + 12

  // Criterios de planificacion
  if (criterios.length > 0) {
    if (y > 160) { doc.addPage(); y = 20 }
    doc.setFontSize(12)
    doc.text('Criterios de planificacion aprendidos', 14, y)
    autoTable(doc, {
      head: [['Franja', 'Estado', 'Tendencia', 'Semanas', 'Peso (score)', 'Primera senal', 'Ultima senal']],
      body: criterios.map(c => [
        c.banda,
        c.estado === 'activo' ? 'ACTIVO' : 'observacion',
        c.tendencia === 'estable' ? 'estable' : 'en declive',
        String(c.semanas),
        c.score.toFixed(2),
        c.primeraSenal,
        c.ultimaSenal,
      ]),
      startY: y + 4,
      theme: 'grid',
      headStyles: { fillColor: [124, 58, 237], textColor: [255, 255, 255], fontStyle: 'bold' },
      bodyStyles: { textColor: [0, 0, 0] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: 14 },
      styles: { cellPadding: 2, fontSize: 8 },
    })
    y = ((doc as any).lastAutoTable?.finalY || y) + 12
  }

  // Madurez por franja
  if (y > 160) { doc.addPage(); y = 20 }
  doc.setFontSize(12)
  doc.text('Madurez por franja horaria', 14, y)
  autoTable(doc, {
    head: [['Franja', 'Estado', 'Semanas sin correcciones']],
    body: madurez.map(m => [
      m.etiqueta,
      m.estado === 'madura' ? 'MADURA (el motor la resuelve solo)' : m.estado === 'en_ajuste' ? 'Aun necesita ajuste' : 'Sin correcciones registradas',
      m.semanasSinCorreccion !== null ? String(m.semanasSinCorreccion) : '-',
    ]),
    startY: y + 4,
    theme: 'grid',
    headStyles: { fillColor: [34, 197, 94], textColor: [255, 255, 255], fontStyle: 'bold' },
    bodyStyles: { textColor: [0, 0, 0] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14 },
    styles: { cellPadding: 2, fontSize: 8 },
  })

  return doc
}
