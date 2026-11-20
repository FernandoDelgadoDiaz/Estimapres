/**
 * Disponibilidad efectiva de caja de EVENTUALES (AH2-037 / AH2-040) — LABORATORIO, motor A.
 * Espejo exacto de aliada-optimizer `optimizer/ev_caja.py`.
 *
 * EVENTUAL identifica una modalidad de apoyo a cajas, no un puesto ni un sector: puede venir de cualquier
 * función de la sucursal. Su presencia laboral (`disponibilidad_eventual`) NO equivale a disponibilidad
 * para caja. El perfil vigente por semana/sucursal (versionado por vigencia, reutilizable sin recarga) se
 * compila sobre los mecanismos YA existentes, sin duplicarlos:
 *   reservas de función habitual            → `reservas_sector_eventual` (unión)
 *   máximo semanal / función mínima / sin acreditar → `max_caja_eventual_slots` (mínimo)
 * Sin acreditación, la presencia nunca se interpreta como horas de caja. Sin defaults inventados.
 * Nada vuelve publicable un plan.
 */
import type {InputAlgoritmo,ResultadoSemanal} from './types'
import {capacidadDeterminada,mascarasAH2040} from './ah2040'

export const ACREDITACIONES=['NO_ACREDITADA','PRESENCIA_MENOS_RESERVAS','TODA_LA_PRESENCIA'] as const
export type Acreditacion=typeof ACREDITACIONES[number]
export interface ReservaFuncionHabitual {dias:number[];desde:string;hasta:string}
export interface PerfilCajaEventual {
 colaboradorId:string;sucursalId:string;vigenciaDesde:string;vigenciaHasta?:string|null
 acreditacion:Acreditacion;fuente?:string
 horasContractuales?:number|null;reservas?:ReservaFuncionHabitual[]
 horasFuncionHabitualMinimas?:number|null;maxCajaHoras?:number|null
}
export interface DisponibilidadCajaEventual {version:1;perfiles:PerfilCajaEventual[]}
export interface DiagnosticoCaja {codigo:string;nivel:'DATOS'|'ADVERTENCIA';colaboradorId:string;detalle:string;bloqueaPublicacion:boolean}
export interface FilaCompilada {perfil:PerfilCajaEventual|null;presenciaSlots:number;reservaFijaSlots:number;funcionMinimaSlots:number|null;topeSlots:number|null;acreditada:boolean;origenTope:string[]}
export interface InfoDisponibilidadCaja {diagnosticos:DiagnosticoCaja[];eventuales:Record<string,FilaCompilada>;bloqueaPublicacion:boolean}

const CAMPOS=new Set(['colaboradorId','sucursalId','vigenciaDesde','vigenciaHasta','acreditacion','fuente','horasContractuales','reservas','horasFuncionHabitualMinimas','maxCajaHoras'])
const BLOQUEANTES=new Set(['EV_CAJA_SIN_PERFIL','EV_CAJA_PERFIL_AMBIGUO','EV_CAJA_NO_ACREDITADA','EV_CAJA_SIN_DETALLE','EV_CAJA_DECLARACION_CONTRADICTORIA','EV_FUNCION_HABITUAL_EXCEDE_PRESENCIA'])
const slot=(h:string)=>(Number(h.slice(0,2))-8)*2+Math.floor(Number(h.slice(3))/30)
const horaValida=(h:unknown)=>typeof h==='string'&&/^\d\d:(00|30)$/.test(h)&&Number(h.slice(0,2))>=8&&Number(h.slice(0,2))<=23&&slot(h)>=0&&slot(h)<=30
const medias=(x:unknown)=>x===undefined||x===null||(typeof x==='number'&&x>=0&&x<=84&&Number.isInteger(x*2))
const fecha=(s:unknown)=>{if(typeof s!=='string'||!/^\d{4}-\d\d-\d\d$/.test(s)||Number.isNaN(Date.parse(s)))throw new Error('fecha inválida');return s}
const k=(d:number,s:number)=>`${d}/${s}`

export function validarDisponibilidadCaja(cfg:unknown):DisponibilidadCajaEventual{
 const c=cfg as DisponibilidadCajaEventual
 if(!c||typeof c!=='object'||c.version!==1||!Array.isArray(c.perfiles))throw new Error('disponibilidad_caja_eventual inválida')
 for(const p of c.perfiles){
  if(!p||typeof p!=='object'||Object.keys(p).some(x=>!CAMPOS.has(x))||['colaboradorId','sucursalId','vigenciaDesde','acreditacion'].some(x=>!(x in p)))throw new Error('perfil de caja eventual inválido')
  if(!ACREDITACIONES.includes(p.acreditacion)||typeof p.colaboradorId!=='string'||typeof p.sucursalId!=='string')throw new Error('perfil de caja eventual inválido')
  fecha(p.vigenciaDesde)
  if(p.vigenciaHasta!=null&&fecha(p.vigenciaHasta)<p.vigenciaDesde)throw new Error('vigencia invertida')
  if(![p.horasContractuales,p.horasFuncionHabitualMinimas,p.maxCajaHoras].every(medias))throw new Error('horas inválidas (0–84, múltiplo de 0,5)')
  for(const r of p.reservas??[])
   if(!r||typeof r!=='object'||Object.keys(r).sort().join()!=='desde,dias,hasta'||!Array.isArray(r.dias)||!r.dias.length||r.dias.some(d=>!Number.isInteger(d)||d<0||d>6)
     ||!horaValida(r.desde)||!horaValida(r.hasta)||slot(r.desde)>=slot(r.hasta))throw new Error('reserva de función habitual inválida')
 }
 return c
}

/** Perfiles vigentes por colaborador para la semana (lunes ISO) y sucursal. */
export function resolverPerfilesCaja(cfg:DisponibilidadCajaEventual,semana:string,sucursal:string){
 const out:Record<string,PerfilCajaEventual[]>={}
 for(const p of cfg.perfiles){
  if(p.sucursalId!==sucursal||p.vigenciaDesde>semana)continue
  if(p.vigenciaHasta!=null&&p.vigenciaHasta<semana)continue
  ;(out[p.colaboradorId]??=[]).push(p)
 }
 return out
}

const diag=(codigo:string,id:string,detalle:string,nivel:'DATOS'|'ADVERTENCIA'='DATOS'):DiagnosticoCaja=>({codigo,nivel,colaboradorId:id,detalle,bloqueaPublicacion:BLOQUEANTES.has(codigo)})
const h=(n:number)=>String(n).replace('.',',')

/** Compila el perfil vigente sobre reservas y topes existentes. No muta la entrada. Idempotente. */
export function compilarDisponibilidadCaja(input:InputAlgoritmo):{input:InputAlgoritmo;info:InfoDisponibilidadCaja|null}{
 if(input.disponibilidad_caja_compilada)return {input,info:input.disponibilidad_caja_compilada}
 const cfg=input.disponibilidad_caja_eventual
 if(cfg==null)return {input,info:null}
 validarDisponibilidadCaja(cfg)
 if(typeof input.semana!=='string'||typeof input.sucursal_id!=='string')throw new Error('la disponibilidad de caja requiere semana y sucursal_id')
 const vigentes=resolverPerfilesCaja(cfg,input.semana,input.sucursal_id)
 const topes:Record<string,number>={...(input.max_caja_eventual_slots??{})}
 const reservas:Record<string,boolean[][]>=Object.fromEntries(Object.entries(input.reservas_sector_eventual??{}).map(([id,m])=>[id,m.map(r=>[...r])]))
 const diagnosticos:DiagnosticoCaja[]=[],eventuales:Record<string,FilaCompilada>={}
 const ev=input.disponibilidad_eventual
 const conocidos=new Set(cfg.perfiles.filter(p=>p.sucursalId===input.sucursal_id).map(p=>p.colaboradorId))
 for(const id of [...conocidos].filter(x=>!(x in ev)).sort())diagnosticos.push(diag('EV_CAJA_PERFIL_DESCONOCIDO',id,'Perfil para una persona que no es EVENTUAL esta semana: se ignora.','ADVERTENCIA'))
 for(const id of Object.keys(ev).sort()){
  const pres=new Set<string>();ev[id].forEach((row,d)=>row.forEach((v,s)=>{if(v!=='NO_DISPONIBLE')pres.add(k(d,s))}))
  const cands=vigentes[id]??[]
  const perfil=cands.length===1?cands[0]:null
  const fila:FilaCompilada={perfil,presenciaSlots:pres.size,reservaFijaSlots:0,funcionMinimaSlots:null,topeSlots:topes[id]??null,acreditada:false,origenTope:[]}
  if(!cands.length)diagnosticos.push(diag('EV_CAJA_SIN_PERFIL',id,'Sin disponibilidad de caja acreditada vigente: su presencia no se interpreta como horas de caja.'))
  else if(cands.length>1)diagnosticos.push(diag('EV_CAJA_PERFIL_AMBIGUO',id,`${cands.length} perfiles vigentes superpuestos para la semana.`))
  else if(perfil!.acreditacion==='NO_ACREDITADA')diagnosticos.push(diag('EV_CAJA_NO_ACREDITADA',id,'Disponibilidad de caja declarada como no acreditada.'))
  else{
   const p=perfil!
   const res=new Set<string>()
   for(const r of p.reservas??[])for(const d of r.dias)for(let s=slot(r.desde);s<slot(r.hasta);s++)if(s<30)res.add(k(d,s))
   const fuera=[...res].filter(x=>!pres.has(x)).length
   for(const x of [...res])if(!pres.has(x))res.delete(x)
   const f=p.horasFuncionHabitualMinimas??null
   const f2=f===null?null:Math.round(f*2)
   if(!(p.fuente??'').trim())diagnosticos.push(diag('EV_CAJA_SIN_DETALLE',id,'Acreditación sin fuente declarada.'))
   else if(p.acreditacion==='TODA_LA_PRESENCIA'&&((p.reservas??[]).length||f))diagnosticos.push(diag('EV_CAJA_DECLARACION_CONTRADICTORIA',id,'«Toda la presencia» con reservas o tiempo de función habitual declarados.'))
   else if(p.acreditacion==='PRESENCIA_MENOS_RESERVAS'&&!res.size&&!f2)diagnosticos.push(diag('EV_CAJA_SIN_DETALLE',id,'«Presencia menos reservas» sin reservas efectivas ni horas de función habitual: no se asume que toda la presencia es caja.'))
   else if(f2!==null&&f2>pres.size)diagnosticos.push(diag('EV_FUNCION_HABITUAL_EXCEDE_PRESENCIA',id,`Función habitual mínima ${h(f!)} h supera la presencia semanal ${h(pres.size/2)} h.`))
   else fila.acreditada=true
   if(fuera)diagnosticos.push(diag('EV_RESERVA_FUERA_DE_PRESENCIA',id,`${h(fuera/2)} h de reserva fuera de la presencia: no cuentan.`,'ADVERTENCIA'))
   const hc=p.horasContractuales
   if(hc!=null&&pres.size>hc*2)diagnosticos.push(diag('EV_PRESENCIA_SUPERA_CONTRATO',id,`Presencia ${h(pres.size/2)} h > horas contractuales ${h(hc)} h.`,'ADVERTENCIA'))
   if(fila.acreditada){
    if(res.size){const m=(reservas[id]??=Array.from({length:7},()=>Array(30).fill(false)));for(const x of res){const [d,s]=x.split('/').map(Number);m[d][s]=true}}
    fila.reservaFijaSlots=res.size
    fila.funcionMinimaSlots=f2
    const c:[number,string][]=id in topes?[[topes[id],'tope previo']]:[]
    if(p.maxCajaHoras!=null)c.push([Math.round(p.maxCajaHoras*2),'máximo semanal declarado'])
    if(f2!==null)c.push([pres.size-f2,'presencia − función habitual mínima'])
    if(c.length){const v=Math.min(...c.map(x=>x[0]));topes[id]=v;fila.topeSlots=v;fila.origenTope=c.filter(x=>x[0]===v).map(x=>x[1])}
   }
  }
  if(!fila.acreditada){topes[id]=0;fila.topeSlots=0;fila.origenTope=['sin disponibilidad de caja acreditada']}
  eventuales[id]=fila
 }
 const info={diagnosticos,eventuales,bloqueaPublicacion:diagnosticos.some(x=>x.bloqueaPublicacion)}
 return {input:{...input,max_caja_eventual_slots:topes,reservas_sector_eventual:reservas,disponibilidad_caja_compilada:info},info}
}

type Plan=Pick<ResultadoSemanal,'asignacion_aux'|'asignacion_eventual'>&Partial<Pick<ResultadoSemanal,'jornadas_full'|'jornadas_part'>>
const caja=(m:string[][]|undefined)=>new Set((m??[]).flatMap((row,d)=>row.flatMap((v,s)=>v==='CAJA'?[k(d,s)]:[])))

/** Verificador independiente: recompila desde la entrada cruda y revisa el plan. */
export function verificarDisponibilidadCaja(raw:InputAlgoritmo,r:Plan){
 const {input,info}=compilarDisponibilidadCaja(raw)
 if(!info)return []
 const out:Record<string,unknown>[]=[]
 for(const [id,f] of Object.entries(info.eventuales)){
  const c=caja(r.asignacion_eventual[id])
  if(!f.acreditada&&c.size)out.push({codigo:'EV_CAJA_SIN_ACREDITAR_ASIGNADA',colaboradorId:id,horas:c.size/2})
  const res=input.reservas_sector_eventual?.[id]
  const enRes=[...c].filter(x=>{const [d,s]=x.split('/').map(Number);return res?.[d]?.[s]===true}).length
  if(enRes)out.push({codigo:'EV_CAJA_EN_RESERVA',colaboradorId:id,horas:enRes/2})
  if(f.topeSlots!==null&&c.size>f.topeSlots)out.push({codigo:'EV_CAJA_SUPERA_TOPE',colaboradorId:id,excesoHoras:(c.size-f.topeSlots)/2})
  if([...c].some(x=>{const [d,s]=x.split('/').map(Number);return input.disponibilidad_eventual[id][d][s]==='NO_DISPONIBLE'}))out.push({codigo:'EV_CAJA_FUERA_DE_PRESENCIA',colaboradorId:id})
 }
 return out
}

const ORDEN={FULL:0,PART:1,AUX:2,EVENTUAL:3}
/** Reporte por persona (mismos campos que el reporte B). */
export function reporteDisponibilidadCaja(raw:InputAlgoritmo,r:Required<Plan>){
 const {input,info}=compilarDisponibilidadCaja(raw)
 const {O,K}=mascarasAH2040(input)
 const jornadas={...r.jornadas_full,...r.jornadas_part}
 return [...input.colaboradores].sort((a,b)=>ORDEN[a.rol]-ORDEN[b.rol]||(a.id<b.id?-1:a.id>b.id?1:0)).map(c=>{
  const id=c.id
  if(c.rol==='FULL'||c.rol==='PART'){
   const horas=(jornadas[id]??[]).flatMap(j=>j.bloques).reduce((a,b)=>a+b.slot_fin-b.slot_inicio,0)/2
   const contrato=c.rol==='FULL'?c.horasSemanales:(input.contratos?.[id]?.objetivoSlots??0)/2
   return {id,rol:c.rol,horasContractuales:contrato,horasCaja:horas}
  }
  if(c.rol==='AUX'){
   const pres=input.presencia_aux[id].flat().filter(v=>v!=='NO_PRESENTE').length,cj=caja(r.asignacion_aux[id]).size
   return {id,rol:c.rol,horasPresencia:pres/2,horasCaja:cj/2,horasSupervisionOFueraDeCaja:(pres-cj)/2,capacidadCajaEfectivaHoras:K[id].size/2}
  }
  const f=info?.eventuales[id]
  const m=input.disponibilidad_eventual[id]
  const pres=m.flat().filter(v=>v!=='NO_DISPONIBLE').length,cj=caja(r.asignacion_eventual[id]).size
  const res=input.reservas_sector_eventual?.[id]
  const reservado=res?m.reduce((a,row,d)=>a+row.filter((v,s)=>res[d]?.[s]===true&&v!=='NO_DISPONIBLE').length,0):0
  const libre=pres-reservado,tope=input.max_caja_eventual_slots?.[id]
  const disponible=tope===undefined?libre:Math.min(libre,tope)
  return {id,rol:c.rol,acreditada:info?(f?.acreditada??false):null,horasContractuales:f?.perfil?.horasContractuales??null,
   horasPresencia:pres/2,horasReservadasFuncionHabitual:reservado/2,horasFuncionHabitualMinimas:f?.funcionMinimaSlots==null?null:f.funcionMinimaSlots/2,
   topeCajaHoras:tope===undefined?null:tope/2,origenTope:f?.origenTope??[],disponibilidadCajaEfectivaHoras:disponible/2,oportunidadesConDemandaHoras:O[id].size/2,
   horasCaja:cj/2,disponibilidadCajaRestanteHoras:(disponible-cj)/2,horasFuncionHabitualRealizadas:(pres-cj)/2}
 })
}

/** Pares (EVENTUAL e, AUX a) con caja(e) > caja(a): clasificación y causa, franja por franja. */
export function analisisExcesos(raw:InputAlgoritmo,r:Plan){
 const {input}=compilarDisponibilidadCaja(raw)
 const {O,K}=mascarasAH2040(input),Kd=capacidadDeterminada(K)
 const ord=(xs:string[])=>[...xs].sort((a,b)=>a<b?-1:a>b?1:0)
 const out:Record<string,unknown>[]=[]
 for(const e of ord(Object.keys(r.asignacion_eventual))){
  const ce=caja(r.asignacion_eventual[e])
  for(const a of ord(Object.keys(r.asignacion_aux))){
   const ca=caja(r.asignacion_aux[a])
   const presA=new Set<string>();input.presencia_aux[a].forEach((row,d)=>row.forEach((v,s)=>{if(v!=='NO_PRESENTE')presA.add(k(d,s))}))
   if(ce.size<=ca.size||!presA.size)continue
   const clase=!K[a].size?'AUX_SOLO_SUPERVISION':O[e].size&&[...O[e]].every(x=>K[a].has(x))?'COMPARABLE':[...O[e]].some(x=>K[a].has(x))?'PARCIALMENTE_COMPARABLE':'NO_COMPARABLE'
   const w=new Set([...Kd[a]].filter(x=>O[e].has(x)))
   const n=(f:(x:string)=>boolean,s:Set<string>)=>[...s].filter(f).length/2
   out.push({eventualId:e,auxId:a,clase,horasCajaEventual:ce.size/2,horasCajaAux:ca.size/2,excesoHoras:(ce.size-ca.size)/2,
    causa:{auxAusenteHoras:n(x=>!presA.has(x),ce),auxPresenteSinCapacidadDeCajaHoras:n(x=>presA.has(x)&&!K[a].has(x),ce),dentroDeCapacidadAuxHoras:n(x=>K[a].has(x),ce)},
    ventanaDeterminadaHoras:w.size/2,ventanaDeterminadaCajaEventualHoras:n(x=>w.has(x),ce),ventanaDeterminadaCajaAuxHoras:n(x=>w.has(x),ca)})
  }
 }
 return out
}
