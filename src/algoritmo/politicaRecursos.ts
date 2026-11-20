import type {DisponibilidadCajaEventual,InfoDisponibilidadCaja} from './disponibilidadCajaEventual'
/** Contrato compartido de laboratorio AH2-036/037. IDs, no nombres. Slots de 30 min. */
export interface PoliticaRecursos {
  /** Laboratorio AH2-037/040: perfiles versionados de disponibilidad efectiva de caja EVENTUAL. */
  disponibilidad_caja_eventual?: DisponibilidadCajaEventual
  /** Resultado de compilar `disponibilidad_caja_eventual` (lo agrega el compilador; no se carga a mano). */
  disponibilidad_caja_compilada?: InfoDisponibilidadCaja
  politica_recursos_version?: 1
  /** Supervisión externa de apertura explícitamente autorizada por franja. No presume doble rol. */
  supervision_apertura_externa?: boolean[][]
  /** AH2-037 (aprobado 20/11/2026): excepción local opt-in por sucursal y franja. En las franjas marcadas de la
   *  apertura (08:00–09:00, slots 0–1) el AUX único puede atender caja sentado toda la franja sin otro supervisor
   *  ni supervisión externa; cuenta como hora-caja AUX. Fuera de esas franjas rigen las reglas ordinarias. */
  excepcion_apertura_aux_unico?: boolean[][]
  max_caja_eventual_slots?: Record<string, number>
  reservas_sector_eventual?: Record<string, boolean[][]>
}
export const activaRecursos = (p: PoliticaRecursos) => p.politica_recursos_version === 1
export const aperturaExterna = (p: PoliticaRecursos, d: number, s: number) => p.supervision_apertura_externa?.[d]?.[s] === true
/** Excepción AH2-037 vigente en la franja (solo slots de apertura 0–1). */
export const excepcionAperturaAuxUnico = (p: PoliticaRecursos, d: number, s: number) => s < 2 && p.excepcion_apertura_aux_unico?.[d]?.[s] === true
/** La apertura con un único AUX está autorizada: supervisión externa declarada o excepción local AH2-037. */
export const aperturaAuxUnicoAutorizada = (p: PoliticaRecursos, d: number, s: number) => aperturaExterna(p, d, s) || excepcionAperturaAuxUnico(p, d, s)
export function topeEventual(p: PoliticaRecursos, id: string): number {
  const n=p.max_caja_eventual_slots?.[id]
  return Number.isInteger(n) && n! >= 0 && n! <= 210 ? n! : activaRecursos(p) || n !== undefined ? 0 : 210
}
export const reservadoSector = (p: PoliticaRecursos,id: string,d: number,s: number) => p.reservas_sector_eventual?.[id]?.[d]?.[s] === true
export function erroresDatosRecursos(p: PoliticaRecursos, ids: string[]): string[] {
 const errors:string[]=[]
 if(p.politica_recursos_version!==undefined && p.politica_recursos_version!==1) errors.push('Versión de recursos desconocida')
 const matrix=(m:unknown)=>Array.isArray(m)&&m.length===7&&m.every(row=>Array.isArray(row)&&row.length===30&&row.every(v=>typeof v==='boolean'))
 if(p.supervision_apertura_externa!==undefined&&!matrix(p.supervision_apertura_externa)) errors.push('Matriz de supervisión inválida')
 if(p.excepcion_apertura_aux_unico!==undefined&&(!matrix(p.excepcion_apertura_aux_unico)||p.excepcion_apertura_aux_unico.some(row=>row.some((v,s)=>v&&s>=2)))) errors.push('Excepción de apertura AUX único inválida o fuera de la franja 08:00–09:00')
 for(const [id,m] of Object.entries(p.reservas_sector_eventual??{})) if(!ids.includes(id)||!matrix(m)) errors.push(`Reserva sectorial inválida: ${id}`)
 for(const [id,n] of Object.entries(p.max_caja_eventual_slots??{})) if(!ids.includes(id)||!Number.isInteger(n)||n<0||n>210) errors.push(`Tope semanal inválido: ${id}`)
 return errors
}
