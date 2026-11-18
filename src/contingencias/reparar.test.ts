import { readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fechaLocal, preparar, type SolicitudContingencia } from './modelo'
import { repararA, validarLocal } from './reparar'
import { aprobarPrueba } from './versionLocal'
import demo from './semana-demo.json'

const solicitud: SolicitudContingencia = {
  snapshot: demo as SolicitudContingencia['snapshot'], zona: 'America/Argentina/Rio_Gallegos',
  aviso: '2026-11-17T02:45:00Z', ausencias: [{ id:'med-1', persona:'f0', tipo:'licencia',
    estado:'confirmada', desde:'2026-11-16', hasta:'2026-11-18' }],
}

describe('contingencias en una copia comunicada', () => {
  it('congela el lunes local y repara exclusivamente martes y miércoles', () => {
    expect(fechaLocal(solicitud.aviso,solicitud.zona)).toBe('2026-11-16')
    const base = structuredClone(solicitud.snapshot.baseline)
    const r = repararA(solicitud)
    expect(r.desde).toBe('2026-11-17')
    expect(r.errores).toEqual([])
    expect(r.plan.jornadas.f0[0]).toEqual(base.jornadas.f0[0])
    expect(r.plan.jornadas.f0[1].bloques).toEqual([])
    expect(r.plan.jornadas.f0[2].bloques).toEqual([])
    expect(solicitud.snapshot.baseline).toEqual(base)
    for (const [id,week] of Object.entries(r.plan.jornadas)) expect(week.slice(3)).toEqual(base.jornadas[id].slice(3))
    const records = aprobarPrueba(solicitud,r,'Supervisor local','2026-11-17T02:50:00Z',1)
    expect(records.ambito).toBe('prueba-local')
    expect(records.estado).toBe('APROBADO')
    expect(records.vigenciaHipotetica.map(t=>[t.desde,t.hastaEfectivo])).toEqual([
      ['2026-11-16','2026-11-16'],['2026-11-17','2026-11-18'],['2026-11-19','2026-11-22']])
  })

  it('maneja ampliación, regreso anticipado y anulación sin quitar a la persona de la dotación', () => {
    const a=solicitud.ausencias[0]
    const ext={ ...solicitud, ausencias:[{...a,hasta:'2026-11-19'}] }
    expect(preparar(ext).modificable).toEqual([false,true,true,true,false,false,false])
    expect(preparar({...solicitud,ausencias:[{...a,hasta:'2026-11-17'}]}).modificable).toEqual([false,true,false,false,false,false,false])
    const anulada: SolicitudContingencia = {...solicitud,ausencias:[{...a,estado:'anulada'}]}
    expect(repararA(anulada).plan).toEqual(solicitud.snapshot.baseline)
    expect(anulada.snapshot.input.colaboradores.some(p=>p.id===a.persona)).toBe(true)
  })

  it('rechaza manipulación de un día bloqueado', () => {
    const r = repararA(solicitud)
    r.plan.jornadas.f0[0].bloques = []
    expect(validarLocal(solicitud,r.plan)).toContain('Jornada congelada')
    expect(()=>aprobarPrueba(solicitud,r,'Supervisor','2026-11-17T02:50:00Z',1)).toThrow(/aprobar/)
  })
})

const guardar = process.env.AH2_REPLAN_RESULTADOS
const banco = process.env.AH2_REPLAN_CASOS
it.skipIf(!banco || !guardar)('ejecuta A en todos los expedientes sintéticos', () => {
  const casos = JSON.parse(readFileSync(banco!,'utf8')) as { id:string; caso:SolicitudContingencia }[]
  const resultados = casos.map(({id,caso})=>{
    const inicio=performance.now()
    return {id,...repararA(caso),ms:performance.now()-inicio}
  })
  writeFileSync(guardar!, resultados.map(x=>JSON.stringify(x)).join('\n')+'\n')
}, 180_000)
