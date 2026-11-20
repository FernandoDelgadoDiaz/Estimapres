import type {DisponibilidadCajaEventual,InfoDisponibilidadCaja,TopesCajaEventualContrato} from './disponibilidadCajaEventual'
/** Contrato compartido de laboratorio AH2-036/037. IDs, no nombres. Slots de 30 min. */
export interface PoliticaRecursos {
  /** Laboratorio AH2-037/040: perfiles versionados de disponibilidad efectiva de caja EVENTUAL. */
  disponibilidad_caja_eventual?: DisponibilidadCajaEventual
  /** Resultado de compilar `disponibilidad_caja_eventual` (lo agrega el compilador; no se carga a mano). */
  disponibilidad_caja_compilada?: InfoDisponibilidadCaja
  /** Topes semanales de caja EVENTUAL por sucursal/vigencia y contrato de origen FULL/PART (editables, desactivables). */
  topes_caja_eventual_contrato?: TopesCajaEventualContrato
  politica_recursos_version?: 1
  /** Supervisión externa de apertura explícitamente autorizada por franja. No presume doble rol. */
  supervision_apertura_externa?: boolean[][]
  /** AH2-037/042 (aprobado 20/11/2026; franjas libres por sucursal desde la corrección del propietario): excepción local
   *  opt-in por sucursal, día y franja. En las franjas autorizadas, si hay UN SOLO AUX presente, puede atender caja
   *  sentado sin otro supervisor de pie ni supervisión externa; cuenta como hora-caja AUX. Fuera de las franjas
   *  autorizadas, o con dos o más AUX presentes, rigen las reglas ordinarias (H-A1/H-A2/H-A3, R3). */
  excepcion_apertura_aux_unico?: boolean[][]
  max_caja_eventual_slots?: Record<string, number>
  reservas_sector_eventual?: Record<string, boolean[][]>
}
export const activaRecursos = (p: PoliticaRecursos) => p.politica_recursos_version === 1
export const aperturaExterna = (p: PoliticaRecursos, d: number, s: number) => p.supervision_apertura_externa?.[d]?.[s] === true
/** Excepción AH2-037/042 autorizada por la sucursal para el día y la franja (sin franjas fijas en el código). */
export const excepcionAperturaAuxUnico = (p: PoliticaRecursos, d: number, s: number) => p.excepcion_apertura_aux_unico?.[d]?.[s] === true
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
 if(p.excepcion_apertura_aux_unico!==undefined&&!matrix(p.excepcion_apertura_aux_unico)) errors.push('Excepción de AUX único inválida (matriz 7×30 de booleanos)')
 for(const [id,m] of Object.entries(p.reservas_sector_eventual??{})) if(!ids.includes(id)||!matrix(m)) errors.push(`Reserva sectorial inválida: ${id}`)
 for(const [id,n] of Object.entries(p.max_caja_eventual_slots??{})) if(!ids.includes(id)||!Number.isInteger(n)||n<0||n>210) errors.push(`Tope semanal inválido: ${id}`)
 return errors
}
