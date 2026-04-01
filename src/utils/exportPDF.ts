import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { ResultadoAsignacion, Colaborador, Auxiliar, Eventual, DIAS_SEMANA, HORAS_FRANJAS } from '../types'
import { formatoTurno } from './timeUtils'

function sanitizarTexto(texto: string): string {
  // Eliminar caracteres no imprimibles (ASCII < 32 excepto \n, \t, \r)
  let limpio = texto.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  // Eliminar markdown básico: **, ##, -, *, `, etc.
  limpio = limpio.replace(/\*\*|##|__|~~|`/g, '')
  // Reemplazar múltiples espacios por uno solo
  limpio = limpio.replace(/\s+/g, ' ')
  return limpio.trim()
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
    if (!col) return []

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
  })

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
    styles: { cellPadding: 3, fontSize: 9 },
  })

  // Si la tabla ocupa mucho, agregar nueva página
  const finalY = (doc as any).lastAutoTable?.finalY || 100
  if (finalY > 180) {
    doc.addPage()
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
    styles: { cellPadding: 3, fontSize: 9 },
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
        doc.text(`${idx + 1}. ${alertaLimpia}`, 20, y)
        y += 6
      })
    }
  }

  return doc
}