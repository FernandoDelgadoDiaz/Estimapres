/**
 * AH2-040 — comparación EXPERIMENTAL de definiciones de «EVENTUAL ≤ AUX comparable» (motor A).
 * Espejo exacto de aliada-optimizer `optimizer/ah2040.py` (mismas definiciones de O, K y modos).
 * NO es regla homologada: se activa solo con `comparacion_aux_eventual`, nunca vuelve publicable
 * un plan y no crea un default de tope eventual.
 *
 *  O(e) oportunidades de caja del EVENTUAL e (demanda > 0, desde 09:00, antes del corte, disponible,
 *       sin reserva sectorial, tope explícito ≠ 0).
 *  K(a) capacidad EFECTIVA de caja del AUX a (demanda > 0 y a puede atender caja sin dejar la
 *       supervisión descubierta). Un AUX exclusivamente supervisor tiene K = ∅.
 *  P0 sin relación semanal · P1 pares explícitos con O(e) ⊆ K(a): caja(e) ≤ caja(a)
 *  P2 automática con a* = máximo |K(a) ∩ O(e)|: caja(e) ≤ caja(a*)
 *  P2E estricta: caja(e) ≤ caja(a) para todo a con solapamiento
 *  P3 ventana compartida con capacidad DETERMINADA: Kd(a) = franjas de K(a) en que a es el único AUX que
 *     puede atender caja (con dos AUX intercambiables ninguno es comparable individualmente: la prioridad
 *     AUX por franja de AH2-036 ya garantiza que uno esté en caja). W = Kd(a) ∩ O(e): caja_W(e) ≤ caja_W(a).
 */
import type {InputAlgoritmo,ResultadoSemanal} from './types'
import {ejecutarAlgoritmo} from './orquestador'

export const MODOS_AH2040=['P0','P1','P2','P2E','P3'] as const
/** PT (laboratorio de disponibilidad de caja): límite semanal estricto caja(e) ≤ caja(a) contra TODO AUX con
 *  capacidad efectiva de caja, haya o no solapamiento. Solo mide el costo de la lectura literal. */
/** SEMANAL (AH2-040, regla ratificada 20/11/2026): totales semanales caja(e) ≤ caja(a) contra CADA AUX realmente
 *  comparable: K(a) ≠ ∅ y K(a) ∩ O(e) ≠ ∅. Sin AUX comparable: sin relación (nunca tope cero). Sin promedios.
 *  PC: variante más estrecha (O(e) ⊆ K(a)); solo para documentar la ambigüedad técnica con fixtures. */
/** Alternativas de comparabilidad SEMANAL (20/11/2026, sin umbrales numéricos; ninguna homologada):
 *  OPORTUNIDAD: además |K(a)| ≥ min(|O(e)|, tope(e)); DIAS: todo día con oportunidades de e tiene capacidad de caja de a. */
/** DIAS_CAPACIDAD: DIAS y además |K(a)| ≥ min(|O(e)|, tope(e)) (duración efectiva semanal).
 *  SATURACION: comparables por DIAS; min(caja(e), |K(a)|) ≤ caja(a) (exceso solo si el AUX agotó su capacidad). */
export const MODOS_VALIDOS_AH2040=[...MODOS_AH2040,'PT','SEMANAL','PC','OPORTUNIDAD','DIAS','DIAS_CAPACIDAD','SATURACION'] as const
export const MODOS_COMPARABILIDAD=new Set(['SEMANAL','PC','OPORTUNIDAD','DIAS','DIAS_CAPACIDAD','SATURACION'])
/** Modos que imponen y verifican la regla de totales semanales. */
export const MODOS_TOTALES=new Set(['SEMANAL','OPORTUNIDAD','DIAS','DIAS_CAPACIDAD','SATURACION'])
export type ModoAH2040=typeof MODOS_VALIDOS_AH2040[number]
export interface ParAH2040 {eventualId:string;auxId:string}
export interface ConfigAH2040 {modo:ModoAH2040;pares?:ParAH2040[]}
export interface RelacionAH2040 {eventualId:string;auxId:string;ventana:string[]|null;origen:string;solapamientoHoras?:number;capacidadAuxSlots?:number}

const key=(d:number,s:number)=>`${d}/${s}`

/** Supervisor designado del día (misma regla que `support.designated` en B). */
function designado(input:InputAlgoritmo,d:number):string|undefined{
 if(!input.supervisor_jornada_completa)return undefined
 const ids=Object.keys(input.presencia_aux)
 const presentes=(s:number)=>ids.filter(id=>input.presencia_aux[id][d][s]!=='NO_PRESENTE')
 if(Math.max(...Array.from({length:30},(_,s)=>presentes(s).length))<2)return undefined
 return [...ids].sort((a,b)=>{const ta=input.presencia_aux[a][d].filter(x=>x!=='NO_PRESENTE').length,tb=input.presencia_aux[b][d].filter(x=>x!=='NO_PRESENTE').length;return tb-ta||(a<b?-1:a>b?1:0)})[0]
}

export function mascarasAH2040(input:InputAlgoritmo){
 const K:Record<string,Set<string>>={},O:Record<string,Set<string>>={}
 for(const id of Object.keys(input.presencia_aux))K[id]=new Set()
 for(const id of Object.keys(input.disponibilidad_eventual))O[id]=new Set()
 const corte=input.eventuales_caja_hora_limite?(Number(input.eventuales_caja_hora_limite.slice(0,2))-8)*2+Number(input.eventuales_caja_hora_limite.slice(3))/30:30
 for(let d=0;d<7;d++){
  const sup=designado(input,d)
  for(let s=0;s<30;s++){
   if(input.demanda[d][s]<=0)continue
   const present=Object.keys(input.presencia_aux).filter(id=>input.presencia_aux[id][d][s]!=='NO_PRESENTE')
   const open=s<2&&(input.apertura_solo_aux??true)
   const last=input.sin_aux_cierre===false?28:27
   if((open&&(present.length===2||(present.length===1&&input.supervision_apertura_externa?.[d]?.[s]===true)))||(s>=2&&s<=last&&present.length===2))
    for(const id of present)if(id!==sup&&(!open||[0,1].every(k=>input.presencia_aux[id][d][k]!=='NO_PRESENTE')))K[id].add(key(d,s))
   if(s>=2&&s<corte)for(const [id,m] of Object.entries(input.disponibilidad_eventual))
    if(input.max_caja_eventual_slots?.[id]!==0&&m[d][s]!=='NO_DISPONIBLE'&&input.reservas_sector_eventual?.[id]?.[d]?.[s]!==true)O[id].add(key(d,s))
  }
 }
 return {O,K}
}

/** Kd(a): franjas de K(a) donde ningún otro AUX tiene capacidad de caja. */
export function capacidadDeterminada(K:Record<string,Set<string>>){
 const cnt=new Map<string,number>()
 for(const set of Object.values(K))for(const t of set)cnt.set(t,(cnt.get(t)??0)+1)
 return Object.fromEntries(Object.entries(K).map(([a,set])=>[a,new Set([...set].filter(t=>cnt.get(t)===1))])) as Record<string,Set<string>>
}

export function relacionesAH2040(input:InputAlgoritmo,cfg:ConfigAH2040){
 const rels:RelacionAH2040[]=[],notas:Record<string,unknown>[]=[]
 if(cfg.modo==='P0')return {rels,notas}
 const {O,K}=mascarasAH2040(input)
 const ordenar=(xs:string[])=>[...xs].sort((a,b)=>a<b?-1:a>b?1:0)
 if(cfg.modo==='P1'){
  for(const par of cfg.pares??[]){
   const {eventualId:e,auxId:a}=par
   if(!O[e]||!K[a])notas.push({codigo:'PAR_DESCONOCIDO',...par})
   else if(K[a].size>0&&[...O[e]].every(x=>K[a].has(x)))rels.push({eventualId:e,auxId:a,ventana:null,origen:'P1-par-explicito'})
   else notas.push({codigo:'PAR_NO_COMPARABLE',...par,oportunidadesFueraDeAux:[...O[e]].filter(x=>!K[a].has(x)).length/2})
  }
  for(const e of ordenar(Object.keys(O)))if(!rels.some(r=>r.eventualId===e))notas.push({codigo:'EVENTUAL_SIN_PAR',eventualId:e})
  return {rels,notas}
 }
 if(MODOS_COMPARABILIDAD.has(cfg.modo)){
  const dias=(set:Set<string>)=>new Set([...set].map(x=>x.split('/')[0]))
  for(const e of ordenar(Object.keys(O))){
   const efectiva=Math.min(O[e].size,input.max_caja_eventual_slots?.[e]??O[e].size)
   const comp=ordenar(Object.keys(K)).filter(a=>{
    if(!K[a].size)return false
    if(cfg.modo==='PC')return O[e].size>0&&[...O[e]].every(x=>K[a].has(x))
    if(![...K[a]].some(x=>O[e].has(x)))return false
    if(cfg.modo==='OPORTUNIDAD')return K[a].size>=efectiva
    if(cfg.modo==='DIAS'||cfg.modo==='DIAS_CAPACIDAD'||cfg.modo==='SATURACION'){
     const da=dias(K[a])
     if(![...dias(O[e])].every(d=>da.has(d)))return false
     return cfg.modo!=='DIAS_CAPACIDAD'||K[a].size>=efectiva
    }
    return true
   })
   if(!comp.length)notas.push({codigo:'EVENTUAL_SIN_AUX_COMPARABLE',eventualId:e,oportunidadesHoras:O[e].size/2})
   for(const a of comp)rels.push({eventualId:e,auxId:a,ventana:null,origen:`${cfg.modo}-total-semanal`,solapamientoHoras:(cfg.modo==='PC'?O[e].size:[...K[a]].filter(x=>O[e].has(x)).length)/2,
    ...(cfg.modo==='SATURACION'?{capacidadAuxSlots:K[a].size}:{})})
  }
  return {rels,notas}
 }
 if(cfg.modo==='PT'){
  for(const e of ordenar(Object.keys(O))){
   const comparables=ordenar(Object.keys(K)).filter(a=>K[a].size>0)
   if(!O[e].size||!comparables.length)notas.push({codigo:'EVENTUAL_SIN_AUX_COMPARABLE',eventualId:e})
   if(O[e].size)for(const a of comparables)rels.push({eventualId:e,auxId:a,ventana:null,origen:'PT-limite-semanal-estricto'})
  }
  return {rels,notas}
 }
 const base=cfg.modo==='P3'?capacidadDeterminada(K):K
 for(const e of ordenar(Object.keys(O))){
  const overl=ordenar(Object.keys(base)).map(a=>({a,w:[...base[a]].filter(x=>O[e].has(x))})).filter(x=>x.w.length>0)
  if(!overl.length){notas.push({codigo:'EVENTUAL_SIN_AUX_COMPARABLE',eventualId:e});continue}
  if(cfg.modo==='P2'){
   const best=[...overl].sort((x,y)=>y.w.length-x.w.length||K[y.a].size-K[x.a].size||(x.a<y.a?-1:1))[0]
   rels.push({eventualId:e,auxId:best.a,ventana:null,origen:'P2-maximo-solapamiento'})
  }else if(cfg.modo==='P2E')for(const x of overl)rels.push({eventualId:e,auxId:x.a,ventana:null,origen:'P2E-todo-solapado'})
  else for(const x of overl)rels.push({eventualId:e,auxId:x.a,ventana:x.w.sort(),origen:'P3-ventana-compartida'})
 }
 return {rels,notas}
}

const cajaSet=(m:string[][]|undefined)=>new Set((m??[]).flatMap((row,d)=>row.map((v,s)=>v==='CAJA'?key(d,s):'').filter(Boolean)))

/** Verificador independiente: recalcula relaciones y horas desde el plan. */
export function verificarAH2040(input:InputAlgoritmo,r:Pick<ResultadoSemanal,'asignacion_aux'|'asignacion_eventual'>,cfg:ConfigAH2040){
 const {rels,notas}=relacionesAH2040(input,cfg)
 const violaciones=rels.flatMap(rel=>{
  const w=rel.ventana?new Set(rel.ventana):null
  const cnt=(set:Set<string>)=>w?[...set].filter(x=>w.has(x)).length:set.size
  const ce=cnt(cajaSet(r.asignacion_eventual[rel.eventualId])),ca=cnt(cajaSet(r.asignacion_aux[rel.auxId]))
  return Math.min(ce,rel.capacidadAuxSlots??ce)>ca?[{eventualId:rel.eventualId,auxId:rel.auxId,origen:rel.origen,ventanaHoras:w?w.size/2:null,horasEventual:ce/2,horasAux:ca/2,excesoHoras:(ce-ca)/2}]:[]
 })
 return {modo:cfg.modo,relaciones:rels.length,violaciones,notas}
}

/**
 * Ejecuta A bajo un modo. La pasada 3 (eventuales) corre después de fijar la caja AUX y esta no depende
 * de los eventuales: (1) se corre la cascada; (2) con la caja AUX resultante se derivan topes por
 * eventual (modos de totales) o reservas por franja (P3, condición suficiente: el eventual solo hace caja
 * en la ventana compartida cuando ese AUX también la hace); (3) se vuelve a correr y se comprueba que la
 * caja AUX no cambió. Eventuales sin tope explícito usan 210 franjas (= sin tope), como el default de B.
 */
/**
 * Roles AUX rotativos (sin supervisor designado): en las franjas donde los dos AUX presentes tienen capacidad de
 * caja y uno está en caja y el otro supervisa, la identidad es intercambiable sin cambiar cobertura ni
 * supervisión. Para la regla SEMANAL, A asigna cada tramo contiguo de esas franjas (desde 09:00) al AUX con menos
 * horas-caja acumuladas (desempate por id), de modo determinístico. CP-SAT (B) elige la identidad en el modelo.
 */
export function balancearIdentidadAux(input:InputAlgoritmo,r:ResultadoSemanal,comparadores?:Set<string>):ResultadoSemanal{
 const {K}=mascarasAH2040(input)
 const ids=Object.keys(input.presencia_aux).sort((a,b)=>a<b?-1:a>b?1:0)
 const aux=Object.fromEntries(ids.map(id=>[id,r.asignacion_aux[id].map(row=>[...row])]))
 const libre=(d:number,s:number)=>{
  if(s<2)return null
  const pres=ids.filter(id=>input.presencia_aux[id][d][s]!=='NO_PRESENTE')
  if(pres.length!==2||!pres.every(id=>K[id].has(key(d,s))))return null
  const caja=pres.filter(id=>aux[id][d][s]==='CAJA')
  return caja.length===1?pres:null
 }
 const total=Object.fromEntries(ids.map(id=>[id,0]))
 const tramos:{d:number;slots:number[];par:string[]}[]=[]
 for(let d=0;d<7;d++){
  let actual:{d:number;slots:number[];par:string[]}|null=null
  for(let s=0;s<30;s++){
   const par=libre(d,s)
   if(par&&actual&&actual.par.join()===par.join()&&actual.slots[actual.slots.length-1]===s-1)actual.slots.push(s)
   else if(par){actual={d,slots:[s],par};tramos.push(actual)}
   else{actual=null;for(const id of ids)if(aux[id][d][s]==='CAJA')total[id]++}
  }
 }
 for(const t of tramos){
  const [a,b]=t.par
  // Solo los AUX comparables limitan a algún EVENTUAL: el tramo va primero a un comparable y, entre
  // comparables (o entre no comparables), al de menos horas-caja acumuladas.
  const ca=comparadores?comparadores.has(a):true,cb=comparadores?comparadores.has(b):true
  const elegido=ca!==cb?(ca?a:b):total[a]<total[b]||(total[a]===total[b]&&a<b)?a:b,otro=elegido===a?b:a
  for(const s of t.slots){aux[elegido][t.d][s]='CAJA';aux[otro][t.d][s]='PARADO'}
  total[elegido]+=t.slots.length
 }
 return {...r,asignacion_aux:aux as ResultadoSemanal['asignacion_aux']}
}

const BALANCEA=MODOS_COMPARABILIDAD

export function ejecutarAH2040(input:InputAlgoritmo,cfg:ConfigAH2040){
 const base:InputAlgoritmo=structuredClone(input)
 base.max_caja_eventual_slots={...Object.fromEntries(Object.keys(base.disponibilidad_eventual).map(id=>[id,210])),...(input.max_caja_eventual_slots??{})}
 const comparadores=new Set(relacionesAH2040(input,cfg).rels.map(x=>x.auxId))
 const ajustar=(r:ResultadoSemanal)=>BALANCEA.has(cfg.modo)?balancearIdentidadAux(input,r,comparadores):r
 const r0=ajustar(ejecutarAlgoritmo(base))
 const {rels}=relacionesAH2040(input,cfg)
 if(!rels.length)return {resultado:r0,inputEfectivo:base,auxEstable:true}
 const ajustado:InputAlgoritmo=structuredClone(base)
 const cajaAux=Object.fromEntries(Object.keys(input.presencia_aux).map(a=>[a,cajaSet(r0.asignacion_aux[a])]))
 for(const rel of rels){
  if(rel.ventana===null){
   // SATURACION: si el AUX ya agotó su capacidad efectiva no limita; si no, min(x, K) ≤ c con c < K ⇒ x ≤ c.
   if(rel.capacidadAuxSlots!==undefined&&cajaAux[rel.auxId].size>=rel.capacidadAuxSlots)continue
   ajustado.max_caja_eventual_slots![rel.eventualId]=Math.min(ajustado.max_caja_eventual_slots![rel.eventualId],cajaAux[rel.auxId].size)
  }else{
   const reservas=(ajustado.reservas_sector_eventual??={})
   const m=(reservas[rel.eventualId]??=Array.from({length:7},()=>Array(30).fill(false)))
   for(const k of rel.ventana)if(!cajaAux[rel.auxId].has(k)){const [d,s]=k.split('/').map(Number);m[d][s]=true}
  }
 }
 const r1=ajustar(ejecutarAlgoritmo(ajustado))
 const auxEstable=Object.keys(input.presencia_aux).every(a=>[...cajaSet(r1.asignacion_aux[a])].join()===[...cajaAux[a]].join())
 return {resultado:r1,inputEfectivo:ajustado,auxEstable}
}

/** Métricas recalculadas desde el plan (mismas que el laboratorio B). */
export function metricasAH2040(input:InputAlgoritmo,r:ResultadoSemanal){
 const grid=Array.from({length:7},()=>Array(30).fill(0))
 for(const w of [...Object.values(r.jornadas_full),...Object.values(r.jornadas_part)])for(const j of w)for(const b of j.bloques)for(let s=b.slot_inicio;s<b.slot_fin;s++)grid[j.dia][s]++
 for(const m of [...Object.values(r.asignacion_aux),...Object.values(r.asignacion_eventual)])m.forEach((row,d)=>row.forEach((v,s)=>{if(v==='CAJA')grid[d][s]++}))
 const falt=input.demanda.map((row,d)=>row.map((n,s)=>Math.max(0,n-grid[d][s]))),sobr=input.demanda.map((row,d)=>row.map((n,s)=>Math.max(0,grid[d][s]-n)))
 const total=input.demanda.flat().reduce((a,b)=>a+b,0),f=falt.flat().reduce((a,b)=>a+b,0)
 const horas=(m:Record<string,string[][]>)=>Object.fromEntries(Object.keys(m).sort().map(id=>[id,m[id].flat().filter(v=>v==='CAJA').length/2]))
 const disp=Object.fromEntries(Object.entries(input.disponibilidad_eventual).map(([id,m])=>[id,m.flat().filter(v=>v!=='NO_DISPONIBLE').length]))
 const hEv=horas(r.asignacion_eventual)
 return {demandaHoras:total/2,faltantesHoras:f/2,sobrantesHoras:sobr.flat().reduce((a,b)=>a+b,0)/2,coberturaPct:total?Math.round(100000*(total-f)/total)/1000:100,
  faltantesPorFranja:falt,horasCajaAux:horas(r.asignacion_aux),horasCajaEventual:hEv,
  horasSectorialesPreservadasEventual:Object.fromEntries(Object.keys(hEv).map(id=>[id,(disp[id]-hEv[id]*2)/2]))}
}
