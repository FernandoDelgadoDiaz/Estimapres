/**
 * Política v1 de LABORATORIO para AH2-040 (decisión del propietario, 20/11/2026: continuar con DIAS).
 * Solo la aplica el flujo híbrido de laboratorio: el motor productivo y el comportamiento heredado no cambian.
 * - Con `politica_recursos_version = 1` y sin modo explícito, la comparabilidad semanal es DIAS.
 * - Con la regla activa, el EVENTUAL sin tope individual queda acotado por la regla (y por su perfil AH2-037),
 *   no por un tope cero: A usa `ejecutarAH2040`, que fija la caja AUX y deriva los topes de cada comparable.
 * Espejo: aliada-optimizer `optimizer/contrato.py` (`politica_laboratorio_v1`).
 */
import type {InputAlgoritmo,ResultadoSemanal} from '../algoritmo/types'
import {ejecutarAlgoritmo} from '../algoritmo/orquestador'
import {MODOS_TOTALES,ejecutarAH2040,type ConfigAH2040} from '../algoritmo/ah2040'

export const COMPARABILIDAD_V1_LABORATORIO='DIAS' as const
type ConCfg=InputAlgoritmo&{comparacion_aux_eventual?:ConfigAH2040}

export function politicaLaboratorioV1(input:InputAlgoritmo):InputAlgoritmo{
 const i=input as ConCfg
 if(i.politica_recursos_version===1&&!i.comparacion_aux_eventual)return {...i,comparacion_aux_eventual:{modo:COMPARABILIDAD_V1_LABORATORIO,pares:[]}} as InputAlgoritmo
 return input
}

/** Motor A bajo la política vigente de la entrada (compilada). */
export function motorAConPolitica(input:InputAlgoritmo):ResultadoSemanal{
 const cfg=(input as ConCfg).comparacion_aux_eventual
 return cfg&&MODOS_TOTALES.has(cfg.modo)?ejecutarAH2040(input,cfg).resultado:ejecutarAlgoritmo(input)
}

/** Igual que `motorAConPolitica` pero sin la relación semanal: contrafáctico para atribuir faltantes a la regla. */
export function motorASinRelacion(input:InputAlgoritmo):ResultadoSemanal{
 const cfg=(input as ConCfg).comparacion_aux_eventual
 return cfg&&MODOS_TOTALES.has(cfg.modo)?ejecutarAH2040(input,{modo:'P0',pares:[]}).resultado:ejecutarAlgoritmo(input)
}
