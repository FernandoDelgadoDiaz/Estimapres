import type {InputAlgoritmo} from '../algoritmo/types'
/** Sintético, nunca dotación de una sucursal real. Sin persistencia. */
export function entradaDemo():InputAlgoritmo{return {sucursal_id:'demo',semana:'2026-11-23',apertura_solo_aux:false,
 colaboradores:[{id:'p',nombre:'Cajero de prueba',rol:'PART',horasSemanales:32},{id:'a',nombre:'Auxiliar A',rol:'AUX'},{id:'b',nombre:'Auxiliar B',rol:'AUX'}],
 contratos:{p:{objetivoSlots:64,maximoSlots:64,estadoFicha:'valida'}},omitir_impacto_horas:true,
 demanda:Array.from({length:7},()=>Array.from({length:30},(_,s)=>s>=2&&s<28?1:0)),
 presencia_aux:{a:Array.from({length:7},()=>Array.from({length:30},(_,s)=>s<16?'PARADO':'NO_PRESENTE')),b:Array.from({length:7},()=>Array.from({length:30},(_,s)=>s>=14&&s<28?'PARADO':'NO_PRESENTE'))},disponibilidad_eventual:{}}}
