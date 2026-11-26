/**
 * AH2-067 · Una regla nueva reemplaza a la anterior del mismo tema (decisión del propietario, 26/11/2026; todas las
 * sucursales). Antes, cambiar por ejemplo «No atienden caja después de las» de 22:00 a 21:00 dejaba las dos reglas
 * guardadas y se iban acumulando.
 *
 *  - Reglas de la sucursal de un solo valor (francos, eventuales en caja, rotación y los interruptores de apertura y
 *    supervisión): la nueva borra a las anteriores del mismo tipo.
 *  - Reglas por persona del mismo tema (franco fijo; turno pedido / siempre mañana / siempre cierre; no entra antes;
 *    no sale después; prefiere domingos), de la misma persona:
 *      · si la anterior rige desde antes que la nueva, termina el día anterior a que empiece la nueva (las semanas
 *        previas no cambian; p. ej. franco fijo jueves hasta el domingo y viernes desde el lunes siguiente);
 *      · si no, se borra;
 *      · una que ya terminó (o que no se cruza con la nueva y es anterior) se borra para no acumular;
 *      · una que empieza después de que termina la nueva no se toca (es para otro período futuro).
 *  - «Mínimo de cajeros por franja» admite varias (una por franja): no se reemplaza.
 */
import type { ReglaConfigurable } from '../types'

export const TIPOS_SUCURSAL_UNICOS: ReadonlySet<string> = new Set([
  'max_bloques_caja_eventual_dia', 'eventuales_caja_hora_limite', 'max_francos_dia', 'margen_continuidad',
  'apertura_solo_aux', 'sin_aux_cierre', 'supervisor_jornada_completa', 'franco_medio_corridos',
])

/** Tema de una regla por persona: las del mismo tema se reemplazan entre sí. */
const temaPersona = (tipo: string) => (['turno', 'siempre_manana', 'siempre_cierre'].includes(tipo) ? 'turno' : tipo)

const diaAnterior = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10) }

export interface Reemplazo { borrar: ReglaConfigurable[]; recortar: Array<{ regla: ReglaConfigurable; vigenciaHasta: string }> }

/** Qué pasa con las reglas existentes al guardar la nueva. `hoy` en formato YYYY-MM-DD. */
export function reemplazoDeReglas(existentes: ReglaConfigurable[], nueva: Omit<ReglaConfigurable, 'id' | 'activa' | 'creadaEl'>, hoy: string): Reemplazo {
  const out: Reemplazo = { borrar: [], recortar: [] }
  if (nueva.ambito === 'local') {
    if (TIPOS_SUCURSAL_UNICOS.has(nueva.tipo)) out.borrar = existentes.filter(r => r.ambito === 'local' && r.tipo === nueva.tipo)
    return out
  }
  if (!nueva.colaboradorNombre) return out
  const desdeN = nueva.vigenciaDesde ?? '', hastaN = nueva.vigenciaHasta ?? '9999-12-31'
  for (const r of existentes) {
    if (r.ambito !== 'colaborador' || r.colaboradorNombre !== nueva.colaboradorNombre || temaPersona(r.tipo) !== temaPersona(nueva.tipo)) continue
    const desdeR = r.vigenciaDesde ?? '', hastaR = r.vigenciaHasta ?? '9999-12-31'
    if (hastaR < hoy) { out.borrar.push(r); continue }          // ya terminó
    if (desdeR > hastaN) continue                               // es para un período posterior a la nueva
    if (desdeN && desdeR < desdeN) {
      const fin = diaAnterior(desdeN)
      if (fin < hoy) out.borrar.push(r)                         // lo que le quedaba ya pasó
      else if (hastaR > fin) out.recortar.push({ regla: r, vigenciaHasta: fin })
      continue                                                  // termina antes de la nueva: se deja
    }
    out.borrar.push(r)
  }
  return out
}

/** Compatibilidad: solo las que se borran. */
export function reglasReemplazadas(existentes: ReglaConfigurable[], nueva: Omit<ReglaConfigurable, 'id' | 'activa' | 'creadaEl'>, hoy = new Date().toISOString().slice(0, 10)): ReglaConfigurable[] {
  return reemplazoDeReglas(existentes, nueva, hoy).borrar
}
