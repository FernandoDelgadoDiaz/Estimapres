/** AH2-038 experimental. Métricas independientes del motor, en medias horas.
 * Picos: días de mayor demanda semanal, máximos de cada día y pesos explícitos > 1.
 * Intensidad de cada pico = demanda de la franja × demanda diaria × peso local.
 * Sin umbral, día fijo ni ponderación comercial inventada. El cociente diario se
 * compara exactamente por productos cruzados, sin redondear porcentajes.
 */
import type {InputAlgoritmo} from '../algoritmo/types'

export function estructuraPicos(input:InputAlgoritmo){
 const demandaDia=input.demanda.map(row=>row.reduce((a,b)=>a+b,0)),max=Math.max(...demandaDia)
 const diasPico=demandaDia.map(n=>n>0&&n===max)
 const mascara=input.demanda.map((row,d)=>{const maxDia=Math.max(...row);return row.map((n,s)=>n>0&&(diasPico[d]||n===maxDia||(input.pesos_franja?.[s]??1)>1))})
 return {demandaDia,diasPico,mascara}
}

/** AH2-043 (v2): prioridad entera de cada franja = peso local × (100 + hora pico + día pico).
 * Hora pico: 100 · demanda de la franja / máxima de ese día. Día pico: 100 · demanda del día / la del día más fuerte.
 * Misma fórmula entera que CP-SAT (`aliada-optimizer/optimizer/weekly_balance.py`). */
export function prioridadesFranja(input:InputAlgoritmo){
 const dia=input.demanda.map(row=>row.reduce((a,b)=>a+b,0)),hi=Math.max(0,...dia)
 return input.demanda.map((row,d)=>{const tope=Math.max(0,...row),pd=hi?Math.floor(100*dia[d]/hi):0
  return row.map((n,s)=>n>0?(input.pesos_franja?.[s]??1)*(100+Math.floor(100*n/tope)+pd):0)})
}
/** Coste convexo de k faltantes en una franja: 1 + 2 + … + k. El segundo faltante de la misma franja cuesta el doble
 * que el primero: los faltantes se reparten antes de abrir un hueco y la prioridad decide dónde caen. */
export const costeConvexo=(_n:number,k:number)=>k*(k+1)/2
export function costeReparto(input:InputAlgoritmo,faltantes:number[][]){
 const prio=prioridadesFranja(input);let total=0
 input.demanda.forEach((row,d)=>row.forEach((n,s)=>{if(n>0)total+=prio[d][s]*costeConvexo(n,Math.min(faltantes[d][s],n))}))
 // Equilibrio entre días: la F-ésima media hora faltante de un mismo día cuesta F × peso del día (100 · demanda / día más fuerte).
 const dia=input.demanda.map(r=>r.reduce((a,b)=>a+b,0)),hi=Math.max(0,...dia)
 dia.forEach((n,d)=>{if(!n)return;const f=Math.min(faltantes[d].reduce((a,b)=>a+b,0),n);total+=Math.floor(100*n/hi)*f*(f+1)/2})
 return total
}

export function medirEquilibrio(input:InputAlgoritmo,faltantes:number[][]){
 const {demandaDia,diasPico,mascara}=estructuraPicos(input)
 let costePicos=0,faltantesPicos=0,ponderado=0,total=0
 const porDia=demandaDia.map((n,d)=>{
  const falta=faltantes[d].reduce((a,b)=>a+b,0)
  for(let s=0;s<input.demanda[d].length;s++){
   const x=faltantes[d][s],w=input.pesos_franja?.[s]??1
   total+=x;ponderado+=x*w
   if(mascara[d][s]){faltantesPicos+=x;costePicos+=x*input.demanda[d][s]*n*w}
  }
  return {dia:d,demandaHoras:n/2,faltantesHoras:falta/2,coberturaPct:n?100*(n-falta)/n:100,diaPico:diasPico[d]}
 })
 let peor={numerador:0,denominador:1}
 for(const row of porDia)if(row.demandaHoras>0&&row.faltantesHoras*peor.denominador>peor.numerador*row.demandaHoras)
  peor={numerador:row.faltantesHoras*2,denominador:row.demandaHoras*2}
 const deficitsOrdenados=porDia.filter(x=>x.demandaHoras>0).map(x=>({numerador:x.faltantesHoras*2,denominador:x.demandaHoras*2})).sort((a,b)=>b.numerador*a.denominador-a.numerador*b.denominador)
 return {porDia,costePicos,costeReparto:input.equilibrio_semanal_version===2?costeReparto(input,faltantes):0,deficitsOrdenados,faltantesPicosHoras:faltantesPicos/2,peorDeficitRelativo:peor,peorDeficitPct:100*peor.numerador/peor.denominador,totalSlots:total,ponderadoSlots:ponderado}
}

export type Equilibrio=ReturnType<typeof medirEquilibrio>

/** Negativo: candidato mejor. Mismo orden primario que CP-SAT. Empate conserva A. */
export function compararEquilibrio(a:Equilibrio,b:Equilibrio,sobrantesA:number,sobrantesB:number,eventualA:number,eventualB:number){
 // v2 (AH2-043): el reparto con prioridad a picos va antes de la protección estricta de picos. En v1 vale 0 en ambos.
 for(const [x,y] of [[a.totalSlots,b.totalSlots],[a.ponderadoSlots,b.ponderadoSlots],[sobrantesA,sobrantesB],[a.costeReparto,b.costeReparto],[a.costePicos,b.costePicos]])if(x!==y)return x-y
 for(let i=0;i<a.deficitsOrdenados.length;i++){
  const r=a.deficitsOrdenados[i],t=b.deficitsOrdenados[i],delta=r.numerador*t.denominador-t.numerador*r.denominador
  if(delta)return delta
 }
 return eventualA-eventualB
}

/**
 * Una mejora nunca descubre picos de A ni aumenta faltantes ponderados. AH2-071 (decisión del propietario, 27/11/2026:
 * «cobertura primero»): las cajas de más solo cuentan si se pide (`exigirSobrantes`), no para elegir entre motores.
 */
export function protegeReferencia(input:InputAlgoritmo,referencia:number[][],candidato:number[][],excesoA:number,excesoB:number,exigirSobrantes=true){
 const a=medirEquilibrio(input,referencia),b=medirEquilibrio(input,candidato),{mascara}=estructuraPicos(input)
 return b.totalSlots<=a.totalSlots&&b.ponderadoSlots<=a.ponderadoSlots&&(!exigirSobrantes||excesoB<=excesoA)&&
  mascara.every((row,d)=>row.every((p,s)=>!p||candidato[d][s]<=referencia[d][s]))
}
