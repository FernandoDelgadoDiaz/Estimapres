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
 return {porDia,costePicos,deficitsOrdenados,faltantesPicosHoras:faltantesPicos/2,peorDeficitRelativo:peor,peorDeficitPct:100*peor.numerador/peor.denominador,totalSlots:total,ponderadoSlots:ponderado}
}

export type Equilibrio=ReturnType<typeof medirEquilibrio>

/** Negativo: candidato mejor. Mismo orden primario que CP-SAT. Empate conserva A. */
export function compararEquilibrio(a:Equilibrio,b:Equilibrio,sobrantesA:number,sobrantesB:number,eventualA:number,eventualB:number){
 for(const [x,y] of [[a.totalSlots,b.totalSlots],[a.ponderadoSlots,b.ponderadoSlots],[sobrantesA,sobrantesB],[a.costePicos,b.costePicos]])if(x!==y)return x-y
 for(let i=0;i<a.deficitsOrdenados.length;i++){
  const r=a.deficitsOrdenados[i],t=b.deficitsOrdenados[i],delta=r.numerador*t.denominador-t.numerador*r.denominador
  if(delta)return delta
 }
 return eventualA-eventualB
}

/** Una mejora nunca descubre picos de A ni aumenta faltantes ponderados o sobrantes. */
export function protegeReferencia(input:InputAlgoritmo,referencia:number[][],candidato:number[][],excesoA:number,excesoB:number){
 const a=medirEquilibrio(input,referencia),b=medirEquilibrio(input,candidato),{mascara}=estructuraPicos(input)
 return b.totalSlots<=a.totalSlots&&b.ponderadoSlots<=a.ponderadoSlots&&excesoB<=excesoA&&
  mascara.every((row,d)=>row.every((p,s)=>!p||candidato[d][s]<=referencia[d][s]))
}
