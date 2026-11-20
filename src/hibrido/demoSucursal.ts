/**
 * Sucursal SINTÉTICA para el laboratorio híbrido (nunca dotación real). Política de recursos v1 (DIAS en laboratorio):
 * dos PART de 32 h, dos AUX supervisores en días alternos (aux-sA, aux-sB), un AUX con capacidad de caja de lunes a
 * sábado (aux-t), un EVENTUAL con reservas de su función habitual (ev-a) y otro de tarde (ev-b), con demanda POM
 * de 3 cajas y pico de 4 entre 13 y 17.
 */
import type {AsignacionAux,AsignacionEv,InputAlgoritmo} from '../algoritmo/types'

const sl=(h:string)=>(Number(h.slice(0,2))-8)*2+Number(h.slice(3))/30
const matriz=<T extends string>(desde:string,hasta:string,dias:number[],si:T,no:T):T[][]=>Array.from({length:7},(_,d)=>Array.from({length:30},(_,s)=>dias.includes(d)&&s>=sl(desde)&&s<sl(hasta)?si:no))
const aux=(d:string,h:string,dias:number[])=>matriz<AsignacionAux>(d,h,dias,'PARADO','NO_PRESENTE')
const ev=(d:string,h:string,dias:number[])=>matriz<AsignacionEv>(d,h,dias,'NO_USADO','NO_DISPONIBLE')
const LS=[0,1,2,3,4,5]

export function demoSucursalLab():InputAlgoritmo{
 return {sucursal_id:'lab-sintetica',semana:'2026-11-23',politica_recursos_version:1,apertura_solo_aux:false,sin_aux_cierre:true,supervisor_jornada_completa:true,
  eventuales_caja_hora_limite:'22:00',max_bloques_caja_eventual_dia:2,omitir_impacto_horas:true,
  colaboradores:[{id:'p1',nombre:'Cajero PART 1',rol:'PART',horasSemanales:32},{id:'p2',nombre:'Cajero PART 2',rol:'PART',horasSemanales:32},
   {id:'aux-sA',nombre:'Auxiliar supervisor A',rol:'AUX'},{id:'aux-sB',nombre:'Auxiliar supervisor B',rol:'AUX'},{id:'aux-t',nombre:'Auxiliar de caja',rol:'AUX'},
   {id:'ev-a',nombre:'Eventual con función habitual',rol:'EVENTUAL'},{id:'ev-b',nombre:'Eventual de tarde',rol:'EVENTUAL'}],
  contratos:{p1:{objetivoSlots:64,maximoSlots:64},p2:{objetivoSlots:64,maximoSlots:64}},
  demanda:Array.from({length:7},(_,d)=>Array.from({length:30},(_,s)=>d<6&&s>=2&&s<28?(s>=10&&s<18?4:3):0)),
  presencia_aux:{'aux-sA':aux('09:00','22:00',[0,2,4,6]),'aux-sB':aux('09:00','22:00',[1,3,5]),'aux-t':aux('09:00','17:00',LS)},
  disponibilidad_eventual:{'ev-a':ev('09:00','17:00',LS),'ev-b':ev('17:00','22:00',LS)},
  disponibilidad_caja_eventual:{version:1,perfiles:[
   {colaboradorId:'ev-a',sucursalId:'lab-sintetica',vigenciaDesde:'2026-11-01',acreditacion:'PRESENCIA_MENOS_RESERVAS',fuente:'declaración sintética',horasContractuales:48,reservas:[{dias:LS,desde:'09:00',hasta:'11:00'}]},
   {colaboradorId:'ev-b',sucursalId:'lab-sintetica',vigenciaDesde:'2026-11-01',acreditacion:'TODA_LA_PRESENCIA',fuente:'declaración sintética',horasContractuales:30}]},
 } as InputAlgoritmo
}
