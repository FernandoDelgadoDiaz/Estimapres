/** Solo lectura con sesión verificada, usuario y sucursal explícitos. Sin fallback local. */
import {supabase} from '../lib/supabase'
import {filaAItemRoster,filaARegla} from '../utils/almacen'
import type {Colaborador,Auxiliar,Eventual} from '../types'

export async function cargarDatosPiloto(usuario:string,sucursal:string){
 if(!supabase||!usuario||!sucursal)throw new Error('Falta configurar el acceso privado.')
 const {data:{user},error:authError}=await supabase.auth.getUser()
 if(authError||!user||user.is_anonymous||user.id!==usuario)throw new Error('La sesión no tiene acceso a este piloto.')
 const [roster,reglas]=await Promise.all([
  supabase.from('colaboradores').select('*').eq('local_id',user.id).eq('sucursal_id',sucursal).eq('activo',true).order('created_at',{ascending:true}),
  supabase.from('reglas_configurables').select('*').eq('local_id',user.id).eq('sucursal_id',sucursal).order('created_at',{ascending:true}),
 ])
 if(roster.error||reglas.error)throw new Error('No se pudo leer la dotación y las reglas de la cuenta. No se usa una copia local.')
 const all=[...(roster.data??[]),...(reglas.data??[])]
 if(all.some(f=>f.local_id!==user.id||f.sucursal_id!==sucursal))throw new Error('Datos fuera del ámbito autorizado.')
 const grupo=(g:'cajero'|'auxiliar'|'eventual')=>(roster.data??[]).filter(f=>f.grupo===g).map(f=>filaAItemRoster(g,f))
 return {cajeros:grupo('cajero') as Colaborador[],auxiliares:grupo('auxiliar') as Auxiliar[],eventuales:grupo('eventual') as Eventual[],reglas:(reglas.data??[]).map(filaARegla)}
}
