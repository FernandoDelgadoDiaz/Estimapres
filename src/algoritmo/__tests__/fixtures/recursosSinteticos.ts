import type {InputAlgoritmo} from '../../types'
export function entradaRecursos():InputAlgoritmo {
 return {politica_recursos_version:1,supervision_apertura_externa:Array.from({length:7},()=>Array.from({length:30},(_,s)=>s<2)),
  demanda:Array.from({length:7},()=>Array.from({length:30},(_,s)=>s<2?1:s===14||s===15?2:0)),
  colaboradores:[{id:'a',nombre:'a',rol:'AUX'},{id:'b',nombre:'b',rol:'AUX'},{id:'e',nombre:'e',rol:'EVENTUAL'}],
  presencia_aux:{a:Array.from({length:7},()=>Array.from({length:30},(_,s)=>s<16?'PARADO':'NO_PRESENTE')),b:Array.from({length:7},()=>Array.from({length:30},(_,s)=>s>=14&&s<28?'PARADO':'NO_PRESENTE'))},
  disponibilidad_eventual:{e:Array.from({length:7},()=>Array.from({length:30},(_,s)=>s===14||s===15?'NO_USADO':'NO_DISPONIBLE'))},max_caja_eventual_slots:{e:4},max_bloques_caja_eventual_dia:2,eventuales_caja_hora_limite:'22:00'}
}
