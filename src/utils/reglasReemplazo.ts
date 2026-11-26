/**
 * AH2-067 · Una regla nueva reemplaza a la anterior del mismo tema (decisión del propietario, 26/11/2026; todas las
 * sucursales). Antes, cambiar por ejemplo «No atienden caja después de las» de 22:00 a 21:00 dejaba las dos reglas
 * guardadas y se iban acumulando.
 *
 *  - Reglas de la sucursal de un solo valor (francos, eventuales en caja, rotación y los interruptores de apertura y
 *    supervisión): la nueva borra a las anteriores del mismo tipo.
 *  - Reglas por persona: la nueva borra a la anterior de la MISMA persona y el mismo tipo con la misma vigencia. Una
 *    regla con otras fechas no se toca (puede ser para otro período).
 *  - «Mínimo de cajeros por franja» admite varias (una por franja): no se reemplaza.
 */
import type { ReglaConfigurable } from '../types'

export const TIPOS_SUCURSAL_UNICOS: ReadonlySet<string> = new Set([
  'max_bloques_caja_eventual_dia', 'eventuales_caja_hora_limite', 'max_francos_dia', 'margen_continuidad',
  'apertura_solo_aux', 'sin_aux_cierre', 'supervisor_jornada_completa', 'franco_medio_corridos',
])

const mismaVigencia = (a: ReglaConfigurable, b: Pick<ReglaConfigurable, 'vigenciaDesde' | 'vigenciaHasta'>) =>
  (a.vigenciaDesde ?? '') === (b.vigenciaDesde ?? '') && (a.vigenciaHasta ?? '') === (b.vigenciaHasta ?? '')

/** Reglas existentes que la nueva reemplaza (se borran al guardarla). */
export function reglasReemplazadas(existentes: ReglaConfigurable[], nueva: Omit<ReglaConfigurable, 'id' | 'activa' | 'creadaEl'>): ReglaConfigurable[] {
  return existentes.filter(r => {
    if (r.ambito !== nueva.ambito || r.tipo !== nueva.tipo) return false
    if (nueva.ambito === 'local') return TIPOS_SUCURSAL_UNICOS.has(nueva.tipo)
    return !!nueva.colaboradorNombre && r.colaboradorNombre === nueva.colaboradorNombre && mismaVigencia(r, nueva)
  })
}
