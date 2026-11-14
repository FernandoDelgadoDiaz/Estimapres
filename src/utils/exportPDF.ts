import type { ResultadoValidacion } from '../algoritmo/validadorIndependiente'
import jsPDF from 'jspdf'
import autoTable, { type UserOptions } from 'jspdf-autotable'
import { ResultadoAsignacion, Colaborador, Auxiliar, Eventual, SemanaHistorial, DIAS_SEMANA, HORAS_FRANJAS } from '../types'
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
  /**
   * Presencia/disponibilidad REGISTRADA de la semana por id (formato horarioSemanal:
   * "08:00-14:00|20:00-23:00" o "" por día), tal como se guardó con la semana
   * (SemanaHistorial.disponibilidadSemana). Fuente de la presencia de EVENTUALES en
   * el cuadro de presencia; sin ella se informa «Presencia no registrada».
   */
  presencia?: Record<string, string[]>
}

const fechaAR = (iso: string) => iso.split('-').reverse().join('/')
const MARGEN = 12
const INICIO_TABLA = 42
const TINTA = [29, 43, 55] as const
const PETROLEO = [21, 74, 78] as const

export const TITULO_CAJA = 'HORARIOS DE CAJA'
export const TITULO_PRESENCIA = 'HORARIOS DE PRESENCIA — PERSONAL DE APOYO'
export const SIN_CAJA = 'Sin caja'
export const NO_DISPONIBLE = 'No disponible'
export const PRESENCIA_NO_REGISTRADA = 'Presencia no registrada'
const ANCHO_NOMBRE = 54
const ANCHO_TIPO = 22
const ANCHO_HORAS = 19
// Altura estimada de una fila de los cuadros semanales (8,5 pt × factor 1,48 + relleno).
const INTERLINEADO_CUADROS = 1.3
const ALTO_LINEA = 8.5 * 0.3528 * INTERLINEADO_CUADROS
const altoFila = (celdas: string[]) => 2.8 + ALTO_LINEA * Math.max(1, ...celdas.map(c => c.split('\n').length))
const ORDEN_TIPO: Record<string, number> = { FULL: 0, PART: 1, CAJA: 2, AUX: 3, EVENTUAL: 4 }

export interface FilaPDF {
  colaboradorId: string
  nombre: string
  tipo: string
  /** Horas (de caja en el cuadro 1; de presencia en el cuadro 2). */
  horas: number
  /** 7 celdas (lunes→domingo); franjas separadas por salto de línea. */
  celdas: string[]
  /** Cuadro 2: false si la semana no guardó la presencia de este eventual. */
  registrada?: boolean
}

const aMin = (h: string) => { const [a, b] = h.split(':').map(Number); return a * 60 + (b || 0) }
const hhmm = (h: string) => h.padStart(5, '0')
const horasLegibles = (h: number) => `${String(Math.round(h * 100) / 100).replace('.', ',')} h`

/** Bloques contiguos de CAJA de un día como "HH:MM-HH:MM" (fin exclusivo). */
function bloquesCaja(slots: boolean[] = []): string[] {
  return formatearCajaDia(slots, '').split(' | ').filter(Boolean)
}
const ordenar = (filas: FilaPDF[]) => filas
  .map((f, i) => ({ f, i }))
  .sort((a, b) => (ORDEN_TIPO[a.f.tipo] ?? 9) - (ORDEN_TIPO[b.f.tipo] ?? 9) || a.i - b.i)
  .map(x => x.f)

/**
 * Cuadro 1: FULL/PART con sus jornadas efectivas; AUX y EVENTUAL solo con sus
 * franjas en CAJA (cajaAux / cajaEventual). Las horas salen de las franjas.
 */
export function filasHorariosCaja(resultado: ResultadoAsignacion, nombres: Map<string, { nombre: string; tipo: string }>): FilaPDF[] {
  const filas: FilaPDF[] = []
  for (const h of resultado.horarios.filter(x => x.rolGeneral === 'cajero')) {
    const porDia = new Map(h.jornadas.map(j => [j.dia, j]))
    let minutos = 0
    const celdas = Array.from({ length: 7 }, (_, d) => {
      const j = porDia.get(d)
      if (!j) return '-'
      if (j.esFranco) return 'FRANCO'
      for (const t of j.turnos) minutos += aMin(t.fin) - aMin(t.inicio)
      const bloques = j.turnos.map(t => `${hhmm(t.inicio)}-${hhmm(t.fin)}`).join('\n')
      return j.rol === 'franco_medio' ? `${bloques}\nMedio franco` : bloques
    })
    const col = nombres.get(h.colaboradorId)
    filas.push({ colaboradorId: h.colaboradorId, nombre: col?.nombre ?? h.colaboradorId, tipo: col?.tipo ?? 'CAJA', horas: minutos / 60, celdas })
  }
  const presenciaAux = new Map(resultado.horarios.filter(x => x.rolGeneral === 'aux_supervisor').map(h => [h.colaboradorId, h]))
  const cajaAux = new Map((resultado.cajaAux ?? []).map(a => [a.colaboradorId, a]))
  for (const id of [...new Set([...presenciaAux.keys(), ...cajaAux.keys()])]) {
    const caja = cajaAux.get(id)
    const pres = presenciaAux.get(id)
    const celdas = Array.from({ length: 7 }, (_, d) => {
      const b = bloquesCaja(caja?.slotsCajaPorDia[d])
      if (b.length) return b.join('\n')
      const j = pres?.jornadas.find(x => x.dia === d)
      return j?.esFranco ? 'FRANCO' : SIN_CAJA
    })
    const slots = (caja?.slotsCajaPorDia ?? []).reduce((n, f) => n + f.filter(Boolean).length, 0)
    filas.push({ colaboradorId: id, nombre: nombres.get(id)?.nombre ?? caja?.nombre ?? id, tipo: 'AUX', horas: slots / 2, celdas })
  }
  const cajaEv = new Map((resultado.cajaEventual ?? []).map(e => [e.colaboradorId, e]))
  const idsEv = [...new Set([...resultado.horarios.filter(x => x.rolGeneral === 'eventual_sector').map(h => h.colaboradorId), ...cajaEv.keys()])]
  for (const id of idsEv) {
    const caja = cajaEv.get(id)
    const celdas = Array.from({ length: 7 }, (_, d) => bloquesCaja(caja?.slotsCajaPorDia[d]).join('\n') || SIN_CAJA)
    const slots = (caja?.slotsCajaPorDia ?? []).reduce((n, f) => n + f.filter(Boolean).length, 0)
    filas.push({ colaboradorId: id, nombre: nombres.get(id)?.nombre ?? caja?.nombre ?? id, tipo: 'EVENTUAL', horas: slots / 2, celdas })
  }
  return ordenar(filas)
}

/**
 * Cuadro 2: AUX con su jornada de presencia (fila AUX de horarios, con ediciones);
 * EVENTUAL con la disponibilidad registrada de la semana. Nunca se reconstruye la
 * presencia de un eventual desde su caja ni desde la disponibilidad actual.
 */
export function filasPresenciaApoyo(
  resultado: ResultadoAsignacion, nombres: Map<string, { nombre: string; tipo: string }>, presencia?: Record<string, string[]>,
): FilaPDF[] {
  const filas: FilaPDF[] = []
  for (const h of resultado.horarios.filter(x => x.rolGeneral === 'aux_supervisor')) {
    const porDia = new Map(h.jornadas.map(j => [j.dia, j]))
    let minutos = 0
    const celdas = Array.from({ length: 7 }, (_, d) => {
      const j = porDia.get(d)
      if (!j || j.esFranco || !j.turnos.length) return 'FRANCO'
      for (const t of j.turnos) minutos += aMin(t.fin) - aMin(t.inicio)
      return j.turnos.map(t => `${hhmm(t.inicio)}-${hhmm(t.fin)}`).join('\n')
    })
    filas.push({ colaboradorId: h.colaboradorId, nombre: nombres.get(h.colaboradorId)?.nombre ?? h.colaboradorId, tipo: 'AUX', horas: minutos / 60, celdas, registrada: true })
  }
  const idsEv = [...new Set([
    ...resultado.horarios.filter(x => x.rolGeneral === 'eventual_sector').map(h => h.colaboradorId),
    ...(resultado.cajaEventual ?? []).map(e => e.colaboradorId),
  ])]
  for (const id of idsEv) {
    const nombre = nombres.get(id)?.nombre ?? resultado.cajaEventual?.find(e => e.colaboradorId === id)?.nombre ?? id
    const dias = presencia?.[id]
    if (!dias) {
      filas.push({ colaboradorId: id, nombre, tipo: 'EVENTUAL', horas: 0, celdas: Array(7).fill(PRESENCIA_NO_REGISTRADA), registrada: false })
      continue
    }
    let minutos = 0
    const celdas = Array.from({ length: 7 }, (_, d) => {
      const bloques = (dias[d] ?? '').split('|').map(x => x.trim()).filter(Boolean)
      if (!bloques.length) return NO_DISPONIBLE
      return bloques.map(b => {
        const [ini, fin] = b.split('-')
        minutos += aMin(fin) - aMin(ini)
        return `${hhmm(ini)}-${hhmm(fin)}`
      }).join('\n')
    })
    filas.push({ colaboradorId: id, nombre, tipo: 'EVENTUAL', horas: minutos / 60, celdas, registrada: true })
  }
  return filas
}

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

  // Páginas que ya tienen encabezado: un cuadro que empieza a mitad de página no
  // vuelve a dibujarlo encima (evita textos superpuestos).
  const paginasConEncabezado = new Set<number>()
  function encabezado(titulo: string, detalle?: string) {
    paginasConEncabezado.add(doc.getCurrentPageInfo().pageNumber)
    doc.setFillColor(...PETROLEO)
    doc.rect(MARGEN, 9, 13, 1, 'F')
    doc.setTextColor(...TINTA)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(17)
    const alternativo = `${titulo} - ${semanaDesc}`
    const tituloCorto = !ident && titulo === TITULO_CAJA && doc.getTextWidth(alternativo) <= ancho
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

  function tabla(titulo: string, opciones: UserOptions, detalle?: string, startY = INICIO_TABLA) {
    autoTable(doc, {
      theme: 'grid',
      showHead: 'everyPage',
      rowPageBreak: 'avoid',
      tableWidth: ancho,
      margin: { top: INICIO_TABLA, bottom: 15, left: MARGEN, right: MARGEN },
      startY,
      headStyles: { fillColor: [...PETROLEO], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [244, 248, 248] },
      ...opciones,
      styles: { cellPadding: { top: 2, bottom: 2, left: 1.8, right: 1.8 }, fontSize: 10, textColor: [...TINTA], overflow: 'linebreak', valign: 'top', ...opciones.styles },
      willDrawPage: () => {
        if (!paginasConEncabezado.has(doc.getCurrentPageInfo().pageNumber)) encabezado(titulo, detalle)
      },
    })
  }

  const nombres = new Map<string, { nombre: string; tipo: string }>()
  for (const c of colaboradores) nombres.set(c.id, { nombre: c.nombre, tipo: c.tipo })
  for (const a of auxiliares) nombres.set(a.id, { nombre: a.nombre, tipo: 'AUX' })
  for (const e of eventuales) nombres.set(e.id, { nombre: e.nombre, tipo: 'EVENTUAL' })

  // ===== CUADRO 1 — HORARIOS DE CAJA (FULL + PART + AUX + EVENTUAL) =====
  // Solo franjas EFECTIVAS en caja: FULL/PART = sus jornadas; AUX = cajaAux;
  // EVENTUAL = cajaEventual. La presencia de AUX/eventuales NO se muestra acá.
  const filasCaja = filasHorariosCaja(resultado, nombres)
  // Los cuadros semanales (8,5 pt) usan un interlineado más compacto; AutoTable
  // mide y dibuja con el mismo factor, así que no hay superposición. Se restaura
  // el factor general para cobertura, validación y alertas.
  doc.setLineHeightFactor(INTERLINEADO_CUADROS)
  const columnasDias = (desde: number, anchoDia: number) => Object.fromEntries(dias.map((_, d) => [d + desde, { cellWidth: anchoDia }]))
  const anchoDia = (ancho - ANCHO_NOMBRE - ANCHO_TIPO - ANCHO_HORAS) / 7
  const estiloCelda: UserOptions['didParseCell'] = ({ cell, column, section }) => {
    if (section !== 'body' || column.index < 3) return
    if (cell.raw === 'FRANCO') { cell.styles.fillColor = [232, 238, 240]; cell.styles.fontStyle = 'bold' }
    else if (cell.raw === SIN_CAJA || cell.raw === NO_DISPONIBLE) cell.styles.textColor = [120, 132, 138]
    else if (cell.raw === PRESENCIA_NO_REGISTRADA) { cell.styles.textColor = [146, 32, 28]; cell.styles.fontStyle = 'italic' }
  }
  const estilosCuadro = (encabezadoHoras: string) => ({
    head: [['Colaborador', 'Tipo', encabezadoHoras, ...dias]],
    styles: { halign: 'center' as const, fontSize: 8.5, cellPadding: { top: 1.4, bottom: 1.4, left: 1.5, right: 1.5 } },
    headStyles: { fillColor: [...PETROLEO] as [number, number, number], textColor: 255, fontStyle: 'bold' as const, valign: 'middle' as const, fontSize: 8.5 },
    columnStyles: {
      0: { cellWidth: ANCHO_NOMBRE, halign: 'left' as const },
      1: { cellWidth: ANCHO_TIPO },
      2: { cellWidth: ANCHO_HORAS },
      ...columnasDias(3, anchoDia),
    },
    didParseCell: estiloCelda,
  })
  tabla(TITULO_CAJA, {
    ...estilosCuadro('Horas\ncaja'),
    body: filasCaja.map(f => [f.nombre, f.tipo, horasLegibles(f.horas), ...f.celdas]),
  }, 'Quién trabaja en caja y en qué franjas. AUX y eventuales: solo sus franjas asignadas a caja (no su presencia).')

  // ===== CUADRO 2 — HORARIOS DE PRESENCIA (AUX + EVENTUAL) =====
  // Presencia o disponibilidad REGISTRADA (no asignaciones del motor): AUX = sus
  // jornadas de presencia; EVENTUAL = disponibilidad resuelta guardada con la semana.
  const filasPresencia = filasPresenciaApoyo(resultado, nombres, meta.presencia)
  if (filasPresencia.length > 0) {
    const detallePresencia = 'Presencia o disponibilidad registrada para la semana. Estar presente no implica estar en caja.'
    const finCaja = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? INICIO_TABLA
    let inicio = INICIO_TABLA
    // El cuadro 2 sigue en la misma página solo si entra COMPLETO (título + tabla);
    // si no, empieza en página nueva: nunca una fila suelta al pie de página.
    const altoCuadro2 = 15 + 2.8 + 2 * ALTO_LINEA + filasPresencia.reduce((h, f) => h + altoFila(f.registrada ? f.celdas : ['']), 0)
    if (height - 15 - finCaja >= altoCuadro2) {
      // Continúa en la misma página, con una separación y título de sección propios.
      const y = finCaja + 8
      doc.setDrawColor(...PETROLEO)
      doc.setLineWidth(0.6)
      doc.line(MARGEN, y - 4, MARGEN + 13, y - 4)
      doc.setLineWidth(0.2)
      doc.setTextColor(...TINTA)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.text(TITULO_PRESENCIA, MARGEN, y + 1)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.text(detallePresencia, MARGEN, y + 6)
      inicio = y + 9
    } else {
      doc.addPage()
    }
    tabla(TITULO_PRESENCIA, {
      ...estilosCuadro('Horas\npresencia'),
      body: filasPresencia.map(f => f.registrada
        ? [f.nombre, f.tipo, horasLegibles(f.horas), ...f.celdas]
        : [f.nombre, f.tipo, '-', { content: PRESENCIA_NO_REGISTRADA + ': la semana no guardó su disponibilidad original; no se reconstruye desde la caja.', colSpan: 7, styles: { halign: 'left', textColor: [146, 32, 28], fontStyle: 'italic' } }]),
    }, detallePresencia, inicio)
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
      styles: { cellPadding: { top: 0.55, bottom: 0.55, left: 0.7, right: 0.7 }, fontSize: 8, halign: 'center' },
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

  // Desde acá (validación y alertas, textos largos) vuelve el interlineado general.
  doc.setLineHeightFactor(1.48)
  if (meta.validacion) {
    doc.addPage()
    const { violaciones, limitaciones = [] } = meta.validacion
    const titulo = 'Validación y faltantes'
    const detalle = metricas
      ? `Horas-caja faltantes: ${metricas.horasCajaFaltantes}  ·  sobrantes: ${metricas.horasCajaSobrantes}`
      : undefined
    if (violaciones.length > 0 || limitaciones.length > 0) {
      tabla(titulo, {
        head: [['Nivel', 'Código', 'Día', 'Detalle']],
        body: [
          ...violaciones.map(x => [x.nivel, x.codigo, x.dia !== undefined ? DIAS_SEMANA[x.dia] : '', x.detalle]),
          // #38: limitaciones de datos (semana histórica): no se declara VALIDADO.
          ...limitaciones.map(l => ['DATOS', 'SIN_VERIFICAR', '', l]),
        ],
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
