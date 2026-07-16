import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { ResultadoAsignacion, Colaborador, Auxiliar, Eventual, AsignacionCajaColaborador, DIAS_SEMANA, HORAS_FRANJAS } from '../types'
import { formatoTurno } from './timeUtils'

/** Convierte un índice de slot (0 = 08:00, cada slot = 30 min) a "HH:MM". */
function slotAHoraLegible(slot: number): string {
  const horas = 8 + Math.floor(slot / 2)
  const mins = (slot % 2) * 30
  return `${String(horas).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

/**
 * Convierte la fila de slots de CAJA de un día (30 booleanos) en un texto legible.
 * Bloques contiguos de CAJA se muestran como "HH:MM-HH:MM"; bloques discontinuos
 * del mismo día se separan con " | ". Si no hay ningún slot en CAJA, devuelve
 * `textoSinCaja` (p. ej. "PARADO" para AUX o "-" para eventuales).
 * Un bloque de slot 2 a slot 7 inclusive = "09:00-11:30".
 */
function formatearCajaDia(slotsCaja: boolean[], textoSinCaja: string): string {
  const bloques: string[] = []
  let inicio = -1
  for (let s = 0; s < slotsCaja.length; s++) {
    if (slotsCaja[s]) {
      if (inicio === -1) inicio = s
    } else if (inicio !== -1) {
      bloques.push(`${slotAHoraLegible(inicio)}-${slotAHoraLegible(s - 1)}`)
      inicio = -1
    }
  }
  if (inicio !== -1) {
    bloques.push(`${slotAHoraLegible(inicio)}-${slotAHoraLegible(slotsCaja.length - 1)}`)
  }
  return bloques.length > 0 ? bloques.join(' | ') : textoSinCaja
}

/**
 * Dibuja una sección de horarios de CAJA (SUPERVISORES o EVENTUALES) con las
 * mismas columnas que la tabla de cajeros: Colaborador, Tipo, Lun..Dom.
 * Devuelve la coordenada Y final para encadenar la siguiente sección.
 */
function dibujarSeccionCaja(
  doc: jsPDF,
  titulo: string,
  tipoLabel: string,
  asignaciones: AsignacionCajaColaborador[],
  textoSinCaja: string,
  startY: number
): number {
  doc.setFontSize(12)
  doc.setTextColor(0, 0, 0)
  doc.text(titulo, 14, startY)

  const body = asignaciones.map(a => [
    a.nombre,
    tipoLabel,
    ...DIAS_SEMANA.map((_, dia) => formatearCajaDia(a.slotsCajaPorDia[dia] ?? [], textoSinCaja)),
  ])

  autoTable(doc, {
    head: [['Colaborador', 'Tipo', ...DIAS_SEMANA]],
    body,
    startY: startY + 4,
    theme: 'grid',
    headStyles: { fillColor: [124, 58, 237], textColor: [255, 255, 255], fontStyle: 'bold' },
    bodyStyles: { textColor: [0, 0, 0], fontStyle: 'normal' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'center' },
      ...Object.fromEntries(
        Array.from({ length: 7 }, (_, i) => [2 + i, { halign: 'center' }])
      ),
    },
    margin: { left: 14 },
    rowPageBreak: 'avoid',
    styles: { cellPadding: 3, fontSize: 7 },
    showHead: 'everyPage',
  })

  return (doc as any).lastAutoTable?.finalY || startY
}

function sanitizarTexto(texto: string): string {
  // Eliminar caracteres no imprimibles (ASCII < 32 excepto \n, \t, \r)
  let limpio = texto.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  // Eliminar caracteres no ASCII excepto letras latinas con tildes, ñ, ¡, ¿
  // Permitir Latin-1 Supplement (U+00A0-00FF) y Latin Extended (U+0100-024F)
  limpio = limpio.replace(/[^\x00-\x7F\u00A0-\u024F]/g, '')
  // Eliminar markdown básico: **, ##, __, ~~, `, *, _, #
  limpio = limpio.replace(/\*\*|##|__|~~|`|\*|_|#/g, '')
  // Reemplazar múltiples espacios por uno solo
  limpio = limpio.replace(/\s+/g, ' ')
  const resultado = limpio.trim()
  // Si el texto resultante tiene menos de 10 caracteres, reemplazar por mensaje
  if (resultado.length < 10) {
    return 'Sugerencia no disponible'
  }
  return resultado
}

function limpiarValorCelda(valor: string): string {
  // Si contiene salto de línea, tomar la primera línea no vacía
  const lineas = valor.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  if (lineas.length === 0) return ''
  // Si todas las líneas son iguales, devolver solo una
  const primera = lineas[0]
  if (lineas.every(l => l === primera)) {
    return primera
  }
  // Si hay diferencias, unir con espacio (no debería ocurrir)
  return lineas.join(' ')
}

export function generarPDF(
  resultado: ResultadoAsignacion,
  colaboradores: Colaborador[],
  semanaDesc: string,
  auxiliares: Auxiliar[] = [],
  eventuales: Eventual[] = []
): jsPDF {
  const doc = new jsPDF('landscape')
  const fecha = new Date().toLocaleDateString('es-AR')

  // Título
  doc.setFontSize(16)
  doc.text(`Horarios Semanales - ${semanaDesc}`, 14, 15)
  doc.setFontSize(10)
  doc.text(`Generado: ${fecha}`, 14, 22)

  // Página 1: Horarios por colaborador
  // Mapa combinado de todos los colaboradores (cajeros, auxiliares, eventuales)
  const colaboradoresMap = new Map<string, { nombre: string, tipo: string }>()
  colaboradores.forEach(c => colaboradoresMap.set(c.id, { nombre: c.nombre, tipo: c.tipo }))
  auxiliares.forEach(a => colaboradoresMap.set(a.id, { nombre: a.nombre, tipo: 'AUX' }))
  eventuales.forEach(e => colaboradoresMap.set(e.id, { nombre: e.nombre, tipo: 'EVENTUAL' }))

  const tableData = resultado.horarios.map(horario => {
    const col = colaboradoresMap.get(horario.colaboradorId)
    if (!col) {
      console.warn(`Colaborador no encontrado en map: ${horario.colaboradorId}`)
      // Crear fila con datos mínimos para evitar fila vacía
      return [
        horario.colaboradorId,
        'DESCONOCIDO',
        `${horario.totalHoras}h`,
        ...DIAS_SEMANA.map((_, diaIndex) => {
          const jornada = horario.jornadas[diaIndex]
          if (jornada.esFranco) return 'FRANCO'
          return formatoTurno(jornada.turnos)
        }),
      ]
    }

    const row = [
      col.nombre,
      col.tipo,
      `${horario.totalHoras}h`,
      ...DIAS_SEMANA.map((_, diaIndex) => {
        const jornada = horario.jornadas[diaIndex]
        if (jornada.esFranco) return 'FRANCO'
        return formatoTurno(jornada.turnos)
      }),
    ]
    return row
  }).filter(row => row.length > 0) // Filtrar filas vacías por si acaso

  autoTable(doc, {
    head: [['Colaborador', 'Tipo', 'Hs', ...DIAS_SEMANA]],
    body: tableData,
    startY: 30,
    theme: 'grid',
    headStyles: { fillColor: [59, 130, 246], textColor: [255, 255, 255], fontStyle: 'bold' },
    bodyStyles: { textColor: [0, 0, 0], fontStyle: 'normal' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: 'left' },
      1: { halign: 'center' },
      2: { halign: 'center' },
      // Columnas de días (3 a 9)
      ...Object.fromEntries(
        Array.from({ length: 7 }, (_, i) => [3 + i, { halign: 'center' }])
      ),
    },
    margin: { left: 14 },
    rowPageBreak: 'avoid',
    styles: { cellPadding: 3, fontSize: 8 },
    tableWidth: 'auto',
    showHead: 'everyPage', // Repite encabezado en cada página
  })

  // Secciones adicionales: SUPERVISORES (AUX) y EVENTUALES en CAJA.
  // Muestran, por día, los bloques horarios en que cada uno debe estar en CAJA.
  const finalYCajeros = (doc as any).lastAutoTable?.finalY || 100
  let yCaja = finalYCajeros + 12

  const cajaAux = resultado.cajaAux ?? []
  if (cajaAux.length > 0) {
    if (yCaja > 170) {
      doc.addPage()
      yCaja = 20
    }
    yCaja = dibujarSeccionCaja(doc, 'Supervisores (AUX) - Horarios en CAJA', 'AUX', cajaAux, 'PARADO', yCaja) + 12
  }

  const cajaEventual = resultado.cajaEventual ?? []
  if (cajaEventual.length > 0) {
    if (yCaja > 170) {
      doc.addPage()
      yCaja = 20
    }
    yCaja = dibujarSeccionCaja(doc, 'Eventuales - Horarios en CAJA', 'EVENTUAL', cajaEventual, '-', yCaja)
  }

  // Página 2: Cobertura por franja
  doc.addPage()
  doc.setFontSize(16)
  doc.text(`Cobertura por Franja - ${semanaDesc}`, 14, 15)
  doc.setFontSize(10)
  doc.text(`Generado: ${fecha}`, 14, 22)

  const coberturaData = HORAS_FRANJAS.map((hora, idx) => {
    const row = [hora]
    for (let dia = 0; dia < 7; dia++) {
      const asignados = resultado.coberturaFranjas[idx]?.[dia] || 0
      const necesarios = resultado.faltantesFranjas[idx]?.[dia] !== undefined
        ? asignados + resultado.faltantesFranjas[idx][dia]
        : 0
      row.push(`${asignados}/${necesarios}`)
    }
    return row
  })

  // Eliminar posibles filas duplicadas (bug #4)
  const horasVistas = new Set<string>()
  const coberturaDataUnica = coberturaData.filter(row => {
    const hora = row[0]
    if (horasVistas.has(hora)) return false
    horasVistas.add(hora)
    return true
  })

  autoTable(doc, {
    head: [['Horario', ...DIAS_SEMANA]],
    body: coberturaDataUnica,
    startY: 30,
    theme: 'grid',
    headStyles: { fillColor: [34, 197, 94], textColor: [255, 255, 255], fontStyle: 'bold' },
    bodyStyles: { textColor: [0, 0, 0], fontStyle: 'normal' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: 'left' },
      // Columnas de días (1 a 7)
      ...Object.fromEntries(
        Array.from({ length: 7 }, (_, i) => [1 + i, { halign: 'center' }])
      ),
    },
    margin: { left: 14 },
    rowPageBreak: 'avoid',
    styles: { cellPadding: 3, fontSize: 8 },
    didDrawCell: (data) => {
      if (data.row.index === undefined || data.column.index === 0) return
      let cellValue = limpiarValorCelda(data.cell.raw as string)
      if (!cellValue) return
      const [asignados, necesarios] = cellValue.split('/').map(Number)
      if (asignados < necesarios) {
        // Rojo para faltante
        doc.setTextColor(220, 38, 38)
      } else if (asignados > necesarios) {
        // Amarillo para sobrante
        doc.setTextColor(202, 138, 4)
      } else {
        // Verde para exacto
        doc.setTextColor(22, 163, 74)
      }
      doc.text(cellValue, data.cell.x + 2, data.cell.y + 8)
      doc.setTextColor(0, 0, 0)
    },
  })

  // Página 3: Alertas y métricas (si hay)
  if (resultado.alertas.length > 0) {
    doc.addPage()
    doc.setFontSize(16)
    doc.text(`Alertas y Métricas`, 14, 15)

    let y = 30
    doc.setFontSize(12)
    doc.text(`Porcentaje de cobertura: ${resultado.porcentajeCobertura.toFixed(1)}%`, 14, y)
    y += 10

    if (resultado.alertas.length > 0) {
      doc.text('Alertas:', 14, y)
      y += 8
      doc.setFontSize(10)
      resultado.alertas.forEach((alerta, idx) => {
        if (y > 270) {
          doc.addPage()
          y = 20
        }
        const alertaLimpia = sanitizarTexto(alerta)
        // Separar sugerencias numeradas (1. texto 2. texto 3. texto)
        const sugerencias = alertaLimpia.split(/\d+\.\s/).filter(s => s.trim().length > 0)
        // Si no se detectó patrón numérico, tratar como una sola sugerencia
        if (sugerencias.length === 0) {
          sugerencias.push(alertaLimpia)
        }
        // Para cada sugerencia, escribir en línea separada con posible wrap
        const anchoMax = doc.internal.pageSize.width - 40 // margen izquierdo + derecho
        sugerencias.forEach((texto, sugIdx) => {
          const prefijo = sugIdx === 0 ? `${idx + 1}. ` : '   '
          const textoCompleto = prefijo + texto.trim()
          const lineas = doc.splitTextToSize(textoCompleto, anchoMax)
          lineas.forEach((linea: string) => {
            if (y > 270) {
              doc.addPage()
              y = 20
            }
            doc.text(linea, 20, y)
            y += 8
          })
        })
        // Agregar espacio extra entre alertas
        y += 2
      })
    }
  }

  return doc
}