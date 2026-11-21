import {describe,expect,it} from 'vitest'
import {resolverConfiguracion,simularCambio,validarFila,type FilaConfigMotor} from '../configuracionPersistente'
import {cambioPermanente,datosTopes,ddmm,leerTopes,normalizarFranjas,permanenteVigente,proximoLunesISO,reglasPersonaEnSemana} from '../configuracionSimple'

const S='091',L='2026-11-23',P='2026-11-30'
const fila=(p:Partial<FilaConfigMotor>&Pick<FilaConfigMotor,'tipo'|'datos'>):FilaConfigMotor=>({id:crypto.randomUUID(),sucursal_id:S,clase:'permanente',colaborador_id:null,vigencia_desde:L,vigencia_hasta:null,activa:true,motivo:'',version:1,...p})
const topes=fila({tipo:'topes_caja_eventual_contrato',datos:{FULL:{activo:true,horas:12},PART:{activo:true,horas:8}}})
const ev='00000000-0000-4000-8000-000000000001'
const perfil=fila({tipo:'perfil_caja_eventual',colaborador_id:ev,datos:{acreditacion:'TODA_LA_PRESENCIA',contratoOrigen:'FULL',horasContractuales:48}})
const apertura=fila({tipo:'excepcion_apertura_aux_unico',datos:{franjas:[0,1,2,3,4,5,6].map(dia=>({dia,desde:'08:00',hasta:'09:00'}))}})
const base=[topes,perfil,apertura]

describe('configuración simple del supervisor (AH2-044 sobre AH2-042)',()=>{
 it('el próximo lunes y la regla vigente',()=>{
  expect(proximoLunesISO(new Date(2026,10,21))).toBe(L)
  expect(proximoLunesISO(new Date(2026,10,23))).toBe(P)
  expect(permanenteVigente(base,'topes_caja_eventual_contrato',P)?.id).toBe(topes.id)
  expect(leerTopes(topes)).toEqual({FULL:{activo:true,horas:12},PART:{activo:true,horas:8}})
  expect(ddmm(P)).toBe('30/11')
 })
 it('cambiar los máximos reemplaza la regla vigente desde el próximo lunes, sin conflictos y por semana completa',()=>{
  const c=cambioPermanente(base,'topes_caja_eventual_contrato',datosTopes({activo:true,horas:14},{activo:false,horas:null}),S,P)
  expect(c).toMatchObject({tipo:'reemplazar',anterior:{id:topes.id},fila:{vigencia_desde:P,vigencia_hasta:null,datos:{FULL:{activo:true,horas:14},PART:{activo:false,horas:null}}}})
  expect(()=>validarFila((c as unknown as {fila:never}).fila)).not.toThrow()
  expect(simularCambio(base,c,S)).toEqual([])
  // Simulación del resultado: la semana del 23/11 conserva 12 h; desde el 30/11 rige 14 h y PART sin máximo.
  const despues=[{...topes,vigencia_hasta:'2026-11-29'},{...(c as unknown as {fila:FilaConfigMotor}).fila,id:'n',activa:true}] as FilaConfigMotor[]
  const tp=(sem:string)=>resolverConfiguracion([...despues,perfil,apertura],S,sem).opciones.topes_caja_eventual_contrato!.configuraciones[0]
  expect(tp(L).FULL).toMatchObject({activo:true,horas:12})
  expect(tp(P)).toMatchObject({FULL:{activo:true,horas:14},PART:{activo:false}})
 })
 it('sin regla previa crea una nueva',()=>{
  expect(cambioPermanente([],'topes_caja_eventual_contrato',datosTopes({activo:true,horas:10},{activo:true,horas:6}),S,P).tipo).toBe('crear')
 })
 it('franjas en que un supervisor solo puede atender caja: valida y ordena',()=>{
  expect(normalizarFranjas([{dia:3,desde:'21:30',hasta:'22:00'},{dia:0,desde:'08:00',hasta:'09:00'}])).toEqual({ok:true,franjas:[{dia:0,desde:'08:00',hasta:'09:00'},{dia:3,desde:'21:30',hasta:'22:00'}]})
  expect(normalizarFranjas([{dia:0,desde:'09:00',hasta:'09:00'}]).ok).toBe(false)
  const c=cambioPermanente(base,'excepcion_apertura_aux_unico',{franjas:[{dia:0,desde:'08:00',hasta:'09:00'},{dia:6,desde:'21:30',hasta:'22:00'}]},S,P)
  expect(simularCambio(base,c,S)).toEqual([])
 })
  })

describe('AH2-049: reglas por persona visibles antes de generar', () => {
  const fila = (extra: Record<string, unknown>) => ({ id: 'r1', sucursal_id: '091', clase: 'temporal', tipo: 'condicion_supervisor', colaborador_id: 'g1', vigencia_desde: '2026-11-23', vigencia_hasta: '2026-11-29', activa: true, version: 1, motivo: 'x',
    datos: { id: 'e', modo: 'DEBE', tipo: 'exclusion_manual', colaboradorId: 'g1' }, ...extra }) as never
  it('muestra la exclusión que toca la semana y no las de otras semanas ni las desactivadas', () => {
    const r = reglasPersonaEnSemana([fila({})], '2026-11-23')
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ colaboradorId: 'g1', excluye: true })
    expect(r[0].texto).toBe('no se incluye en la generación (obligatoria, del 23/11 al 29/11)')
    expect(reglasPersonaEnSemana([fila({})], '2026-11-30')).toEqual([])
    expect(reglasPersonaEnSemana([fila({})], '2026-11-16')).toEqual([])
    expect(reglasPersonaEnSemana([fila({ activa: false })], '2026-11-23')).toEqual([])
    expect(reglasPersonaEnSemana([fila({ tipo: 'topes_caja_eventual_contrato' })], '2026-11-23')).toEqual([])
  })
  it('las permanentes y las de otro tipo también se muestran', () => {
    const r = reglasPersonaEnSemana([fila({ vigencia_hasta: null, vigencia_desde: '2026-11-02', datos: { modo: 'PREFERIRIA', tipo: 'franco' } })], '2026-11-23')
    expect(r[0]).toMatchObject({ excluye: false, texto: 'tiene un franco fijado a mano (preferencia, desde el 02/11)' })
  })
})

describe('AH2-051: el aprendizaje de la 091 arranca en su paso a producción', () => {
  it('descarta semanas generadas antes (simulación) y no filtra otras sucursales', async () => {
    const { desdeInicioAprendizaje } = await import('../integracion')
    const s = [{ generadoEl: '2026-11-19T15:08:35Z' }, { generadoEl: '2026-11-21T20:45:00Z' }]
    expect(desdeInicioAprendizaje(s, '091')).toEqual([{ generadoEl: '2026-11-21T20:45:00Z' }])
    expect(desdeInicioAprendizaje(s, '092')).toHaveLength(2)
  })
})
