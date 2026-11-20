/** AH2-039: condiciones versionadas por semana/sucursal. No persistencia implícita. */
export interface CondicionSupervisor {
 id:string; modo:'DEBE'|'PREFERIRIA'; tipo:'franco'|'turno'|'exclusion_manual'|'max_francos'|'franco_medio_corrido'
 colaboradorId?:string; desde:string; hasta:string; dia?:number; valor?:string|number
}
export interface SolicitudCondiciones {
 version:1; sucursal_id:string; semana:string; condiciones:CondicionSupervisor[]
 turnos?:Record<string,{inicioMin:string;inicioMax:string;finMax?:string}>
}
export interface EntradaCondiciones {condiciones_supervisor?:SolicitudCondiciones; sucursal_id?:string; semana?:string; max_francos_por_dia?:number[]}
export interface CondicionActiva extends CondicionSupervisor {dias:number[];ventana?:{min:number;max:number;fin:number}}
export interface AuditoriaCondiciones {version:1;sucursal_id:string;semana:string;aplicadas:CondicionActiva[];ignoradas:string[];excluidos:string[];publicable:false}
