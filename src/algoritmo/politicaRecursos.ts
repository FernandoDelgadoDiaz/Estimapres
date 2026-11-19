/** Contrato compartido de laboratorio AH2-036/037. IDs, no nombres. Slots de 30 min. */
export interface PoliticaRecursos {
  politica_recursos_version?: 1
  /** Supervisión externa de apertura explícitamente autorizada por franja. No presume doble rol. */
  supervision_apertura_externa?: boolean[][]
  max_caja_eventual_slots?: Record<string, number>
  reservas_sector_eventual?: Record<string, boolean[][]>
}
export const activaRecursos = (p: PoliticaRecursos) => p.politica_recursos_version === 1
export const aperturaExterna = (p: PoliticaRecursos, d: number, s: number) => p.supervision_apertura_externa?.[d]?.[s] === true
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
 for(const [id,m] of Object.entries(p.reservas_sector_eventual??{})) if(!ids.includes(id)||!matrix(m)) errors.push(`Reserva sectorial inválida: ${id}`)
 for(const [id,n] of Object.entries(p.max_caja_eventual_slots??{})) if(!ids.includes(id)||!Number.isInteger(n)||n<0||n>210) errors.push(`Tope semanal inválido: ${id}`)
 return errors
}
