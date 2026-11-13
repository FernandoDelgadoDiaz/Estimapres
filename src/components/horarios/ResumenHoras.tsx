import { horasLegibles, resumenHoras } from '../../utils/horasSemanales'

export default function ResumenHoras({ minutos, tipo, objetivo, etiqueta = 'Asignadas' }: {
  minutos: number; tipo: string; objetivo?: number; etiqueta?: string
}) {
  const { limite, diferencia, exceso, preventivo } = resumenHoras(minutos, tipo, objetivo)
  return (
    <div className="space-y-1 text-xs tabular-nums leading-snug" aria-live="polite">
      <div><strong>{horasLegibles(minutos)}</strong> · {etiqueta}</div>
      <div>{tipo === 'EVENTUAL' ? 'Máximo' : 'Objetivo'}: {limite === undefined ? 'Sin configurar' : horasLegibles(Math.round(limite * 60))}</div>
      {exceso && <strong className="block text-red-800">+{horasLegibles(diferencia!)} · Exceso</strong>}
      {diferencia !== undefined && diferencia < 0 && tipo !== 'EVENTUAL' && <div>−{horasLegibles(diferencia)} · Faltan</div>}
      {diferencia !== undefined && diferencia < 0 && tipo === 'EVENTUAL' && <div>−{horasLegibles(diferencia)} respecto del máximo</div>}
      {diferencia === 0 && <div>En objetivo</div>}
      {preventivo && <strong className="block text-amber-900">Advertencia: supera 48 h</strong>}
    </div>
  )
}
