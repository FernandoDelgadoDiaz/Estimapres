import { horasLegibles, resumenHoras } from '../../utils/horasSemanales'

export default function ResumenHoras({ minutos, tipo, objetivo, etiqueta = 'Asignadas' }: {
  minutos: number; tipo: string; objetivo?: number; etiqueta?: string
}) {
  const { limite, diferencia, exceso, preventivo } = resumenHoras(minutos, tipo, objetivo)
  return (
    <div className="space-y-1 tabular-nums leading-snug" style={{ fontSize: '12px' }} aria-live="polite">
      <div><strong>{horasLegibles(minutos)}</strong>{etiqueta !== 'Asignadas' && <> · {etiqueta}</>}</div>
      {/* Solo se muestra la referencia si existe; sin referencia no hay nada que comparar. */}
      {limite !== undefined && diferencia !== 0 && <div>{tipo === 'EVENTUAL' ? 'Máximo' : 'Contrato'}: {horasLegibles(Math.round(limite * 60))}</div>}
      {exceso && <strong className="block text-red-800">+{horasLegibles(diferencia!)} · Exceso</strong>}
      {diferencia !== undefined && diferencia < 0 && tipo !== 'EVENTUAL' && <div>−{horasLegibles(diferencia)} · Faltan</div>}
      {diferencia !== undefined && diferencia < 0 && tipo === 'EVENTUAL' && <div>−{horasLegibles(diferencia)} respecto del máximo</div>}
      {preventivo && <strong className="block text-amber-900">Advertencia: supera 48 h</strong>}
    </div>
  )
}
