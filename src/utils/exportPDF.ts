import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { ResultadoAsignacion, Colaborador, DIAS_SEMANA, HORAS_FRANJAS } from '../types'
import { formatoTurno } from './timeUtils'

export function generarPDF(
  resultado: ResultadoAsignacion,
  colaboradores: Colaborador[],
  semanaDesc: string
): jsPDF {
  const doc = new jsPDF('landscape')
  const fecha = new Date().toLocaleDateString('es-AR')

  // Título
  doc.setFontSize(16)
  doc.text(`Horarios Semanales - ${semanaDesc}`, 14, 15)
  doc.setFontSize(10)
  doc.text(`Generado: ${fecha}`, 14, 22)

  // Página 1: Horarios por colaborador
  const colaboradoresMap = new Map(colaboradores.map(c => [c.id, c]))
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
    headStyles: { fillColor: [59, 130, 246] },
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
    headStyles: { fillColor: [34, 197, 94] },
    didDrawCell: (data) => {
      if (data.row.index === undefined || data.column.index === 0) return
      const cellValue = data.cell.raw as string
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
        doc.text(`${idx + 1}. ${alerta}`, 20, y)
        y += 6
      })
    }
  }

  return doc
}