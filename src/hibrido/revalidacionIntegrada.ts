/** Relee el horario visible, no confía en un sello de validación previo ni en las métricas almacenadas. */
import type {ResultadoAsignacion} from '../types'
import type {ContextoValidacionSemana} from '../utils/validacionSemana'
import {auditarEscenario} from '../algoritmo/auditoriaV2'
import {compilarCondiciones} from '../algoritmo/condicionesSupervisor'
import {compilarDisponibilidadCaja,verificarDisponibilidadCaja} from '../algoritmo/disponibilidadCajaEventual'
import type {ResultadoSemanal,AsignacionAux,AsignacionEv,Jornada} from '../algoritmo/types'
import type {ResultadoValidacion,Violacion} from '../algoritmo/validadorIndependiente'

export function revalidarIntegrado(r:ResultadoAsignacion,ctx:ContextoValidacionSemana):ResultadoValidacion {
 const snap=r.hibrido!
 try {
  if(snap.version!==1||snap.algoritmo!=='ah2-hibrido-091-v1'||snap.entrada.sucursal_id!=='091')throw new Error('Snapshot híbrido no reconocido.')
  if(Object.keys(snap.entrada.disponibilidad_eventual).length&&!snap.entrada.disponibilidad_caja_eventual)throw new Error('Falta la acreditación de caja EVENTUAL.')
  const {input}=compilarDisponibilidadCaja(compilarCondiciones(snap.entrada).input)
  const known=new Set(Object.values(snap.uiPorMotor))
  const adicionales:Violacion[]=r.horarios.filter(h=>!known.has(h.colaboradorId)).map(h=>({codigo:'DATOS_IDENTIDAD_HIBRIDA',nivel:'DATOS',colaboradorId:h.colaboradorId,detalle:'La persona no forma parte de esta generación.'}))
  const plan:ResultadoSemanal={semana:{desde:new Date(0),hasta:new Date(0)},jornadas_full:{},jornadas_part:{},asignacion_aux:{},asignacion_eventual:{},auditoria_condiciones:input.auditoria_condiciones,
   metricas:{cobertura_total_pct:0,deficit_por_slot:[],exceso_por_slot:[],horas_caja_por_eventual:{}},reporte_reglas:{duras_cumplidas:true,violaciones:[],advertencias:[]}}
  const cob=Array.from({length:7},()=>Array<number>(30).fill(0))
  const aSlot=(v:string)=>{const[h,m]=v.split(':').map(Number);return(h-8)*2+m/30}
  for(const p of snap.entrada.colaboradores) {
   const id=snap.uiPorMotor[p.id],h=r.horarios.find(x=>x.colaboradorId===id)
   if(p.rol==='FULL'||p.rol==='PART'){
    if(!h)continue
    const jornadas:Jornada[]=h.jornadas.map(j=>({colab_id:p.id,dia:j.dia as Jornada['dia'],bloques:j.esFranco?[]:j.turnos.map(t=>({slot_inicio:aSlot(t.inicio),slot_fin:aSlot(t.fin)}))}))
    ;(p.rol==='FULL'?plan.jornadas_full:plan.jornadas_part)[p.id]=jornadas
    for(const j of jornadas)for(const b of j.bloques)for(let s=b.slot_inicio;s<b.slot_fin;s++)if(cob[j.dia]?.[s]!==undefined)cob[j.dia][s]++
   }else {
    const caja=(p.rol==='AUX'?r.cajaAux:r.cajaEventual)?.find(x=>x.colaboradorId===id)?.slotsCajaPorDia
    const presente=(d:number,s:number)=>!!h?.jornadas.find(j=>j.dia===d&&!j.esFranco)?.turnos.some(t=>aSlot(t.inicio)<=s&&s<aSlot(t.fin))
    if(caja?.some((row,d)=>row.some((b,s)=>b&&!presente(d,s))))adicionales.push({codigo:'OP_CAJA_FUERA_JORNADA',nivel:'OPERATIVA',colaboradorId:id,detalle:'Hay caja asignada fuera de la jornada visible.'})
    if(p.rol==='AUX')plan.asignacion_aux[p.id]=Array.from({length:7},(_,d)=>Array.from({length:30},(_,s):AsignacionAux=>caja?.[d]?.[s]?'CAJA':presente(d,s)?'PARADO':'NO_PRESENTE'))
    else plan.asignacion_eventual[p.id]=Array.from({length:7},(_,d)=>Array.from({length:30},(_,s):AsignacionEv=>caja?.[d]?.[s]?'CAJA':input.disponibilidad_eventual[p.id]?.[d]?.[s]==='NO_DISPONIBLE'?'NO_DISPONIBLE':'NO_USADO'))
    caja?.forEach((row,d)=>row.forEach((b,s)=>{if(b&&cob[d]?.[s]!==undefined)cob[d][s]++}))
   }
  }
  plan.metricas.deficit_por_slot=input.demanda.map((row,d)=>row.map((n,s)=>Math.max(0,n-cob[d][s])))
  plan.metricas.exceso_por_slot=input.demanda.map((row,d)=>row.map((n,s)=>Math.max(0,cob[d][s]-n)))
  const audit=auditarEscenario(input,plan)
  const disp=verificarDisponibilidadCaja(snap.entrada,plan).map(v=>({codigo:String(v.codigo),nivel:'OPERATIVA' as const,detalle:'Disponibilidad o tope de caja EVENTUAL incumplido.',colaboradorId:v.colaboradorId as string|undefined}))
  const limitaciones=[...(ctx.limitaciones??[])]
  if(input.colaboradores.some(p=>['FULL','PART'].includes(p.rol))&&!input.inicio_minimo_lunes_por_colaborador)limitaciones.push('El snapshot no contiene el descanso previo confirmado.')
  // Auditar recompila las condiciones, domingo, perfiles y comparación DIAS desde el snapshot.
  // Sus marcas «laboratorio» no son una infracción: la habilitación acotada la gobierna AH2-041.
  const violaciones=[...audit.violaciones,...adicionales,...disp]
  for(const m of snap.minimosCajeros??ctx.minimosCajeros??[])for(let d=0;d<7;d++)if(m.dia===-1||m.dia===d)for(let s=m.slotDesde;s<m.slotHasta;s++)if((cob[d]?.[s]??0)<m.cantidad)violaciones.push({codigo:'OP_MIN_CAJEROS',nivel:'OPERATIVA',dia:d,detalle:'No se alcanza el mínimo de cajas configurado.'})
  const faltanDatos=compilarDisponibilidadCaja(snap.entrada).info?.diagnosticos.filter(d=>d.bloqueaPublicacion)??[]
  for(const d of faltanDatos)violaciones.push({codigo:d.codigo,nivel:'DATOS',detalle:d.detalle,colaboradorId:d.colaboradorId})
  const publicable=violaciones.length===0&&limitaciones.length===0
  return {...audit,ok:publicable,publicable,violaciones:violaciones.map(v=>({...v,colaboradorId:v.colaboradorId?(snap.uiPorMotor[v.colaboradorId]??v.colaboradorId):undefined})),limitaciones,advertencias:audit.advertencias,
   metricas:audit.metricas??{cobertura:[],faltantes:[],sobrantes:[],horasCajaFaltantes:0,horasCajaSobrantes:0}}
 }catch(e){return {ok:false,publicable:false,violaciones:[{codigo:'DATOS_SNAPSHOT_HIBRIDO',nivel:'DATOS',detalle:e instanceof Error?e.message:'No se pudo revalidar la generación híbrida.'}],metricas:{cobertura:[],faltantes:[],sobrantes:[],horasCajaFaltantes:0,horasCajaSobrantes:0}}}
}
