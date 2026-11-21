import { test, expect } from '@playwright/test'
test('AH2-048 Horarios: el supervisor muestra sus horas en caja', async ({ page }) => {
  const cajeros=[{id:'c1',nombre:'Cajero Uno',tipo:'FULL',horasSemanales:48,activo:true}]
  const aux=[{id:'a1',nombre:'Supervisor Uno',horasSemanales:48,activo:true,horarioSemanal:Array(7).fill('08:00-16:00')}]
  const jc=(d:number)=>d===6?{dia:6,esFranco:true,turnos:[],horas:0}:{dia:d,esFranco:false,turnos:[{inicio:'09:00',fin:'17:00'}],horas:8}
  const ja=(d:number)=>d===5?{dia:5,esFranco:true,turnos:[],horas:0,rol:'franco'}:{dia:d,esFranco:false,turnos:[{inicio:'08:00',fin:'16:00'}],horas:8,rol:'aux_supervisor'}
  const slots=(d:number)=>Array.from({length:30},(_,s)=>d===0?(s<2||(s>=10&&s<12)):d===1?s<2:false)
  const s={id:'s1',fechaLunes:'2026-11-23',version:1,descripcion:'x',generadoEl:'2026-11-19T12:00:00Z',editadoManualmente:false,resumenPorColaborador:{},necesidadFranjas:Array.from({length:31},()=>Array(7).fill(1)),
    cajaAux:[{colaboradorId:'a1',nombre:'Supervisor Uno',slotsCajaPorDia:Array.from({length:7},(_,d)=>slots(d))}],
    horarios:[{colaboradorId:'c1',rolGeneral:'cajero',errores:[],jornadas:Array.from({length:7},(_,d)=>jc(d))},{colaboradorId:'a1',rolGeneral:'aux_supervisor',errores:[],jornadas:Array.from({length:7},(_,d)=>ja(d))}]}
  await page.addInitScript(({cajeros,aux,s})=>{localStorage.setItem('cajeros_colaboradores',JSON.stringify(cajeros));localStorage.setItem('aliada_auxiliares',JSON.stringify(aux));localStorage.setItem('aliada_historial_semanas',JSON.stringify([s]))},{cajeros,aux,s})
  await page.setViewportSize({width:1400,height:1000})
  await page.goto('/horarios')
  const fila=page.getByRole('row',{name:/Supervisor Uno/})
  await expect(fila).toContainText('8:00 - 9:00')
  await expect(fila).toContainText('13:00 - 14:00')
  await expect(fila).not.toContainText('08:00 - 16:00')
  await expect(fila).toContainText('Sin caja')
  await expect(fila).toContainText('3 h en caja')
})
