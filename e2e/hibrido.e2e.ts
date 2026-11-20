import {test,expect,type Page} from '@playwright/test'
import {readFileSync} from 'node:fs'

async function generarYVerificar(page:Page,motores:'ab'|'a'){
 const writes:string[]=[]
 page.on('request',r=>{if(!['GET','HEAD'].includes(r.method())&&!r.url().includes('/__lab/cp-sat'))writes.push(r.url())})
 await page.goto('/lab-condiciones.html')
 await page.getByLabel('Datos').selectOption('sucursal')
 if(motores==='ab')await page.getByLabel('Motores').selectOption('ab')
 await page.getByRole('button',{name:'Verificar y generar prueba'}).click()
 await expect(page.getByRole('heading',{name:'Propuesta de laboratorio'})).toBeVisible({timeout:120000})
 const progreso=page.getByRole('list',{name:'Progreso'})
 await expect(progreso).toContainText('Motor A: terminado')
 await expect(progreso).toContainText('Selección')
 await expect(page.getByText(/^Cobertura: \d/)).toBeVisible()
 await expect(page.getByRole('heading',{name:'Horas-caja por persona'})).toBeVisible()
 await expect(page.getByRole('heading',{name:'Supervisión AUX'})).toBeVisible()
 await expect(page.getByText('Eventual de tarde: sin AUX comparable')).toBeVisible()
 await expect(page.getByText(/Eventual con función habitual .* h ≤ Auxiliar de caja .* h/)).toBeVisible()
 const [descarga]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Descargar PDF no oficial'}).click()])
 expect(descarga.suggestedFilename()).toBe('propuesta-prueba-no-oficial.pdf')
 const bytes=readFileSync(await descarga.path())
 expect(bytes.subarray(0,5).toString()).toBe('%PDF-')
 expect(writes).toEqual([])
 expect(await page.evaluate(()=>({local:Object.keys(localStorage),session:Object.keys(sessionStorage)}))).toEqual({local:[],session:[]})
 return progreso
}

test('laboratorio con A: sucursal sintética, propuesta única, supervisión, AH2-040 y PDF no oficial',async({page})=>{
 await page.route('**/__lab/cp-sat/estado',r=>r.fulfill({status:404,body:''}))
 const progreso=await generarYVerificar(page,'a')
 await expect(progreso).not.toContainText('CP-SAT')
 await expect(page.getByText(/Origen: motor A/)).toBeVisible()
})

test('prueba integral: interfaz → A + CP-SAT local con progreso real → selección → PDF',async({page,request})=>{
 const estado=await request.get('/__lab/cp-sat/estado')
 const disponible=estado.ok()&&await estado.json().then(x=>x?.disponible===true,()=>false)
 test.skip(!disponible,'CP-SAT local no configurado (AH2_LAB_CPSAT_DIR)')
 test.setTimeout(180000)
 const progreso=await generarYVerificar(page,'ab')
 await expect(progreso).toContainText('CP-SAT: sobre enviado')
 await expect(progreso).toContainText('CP-SAT: fase · faltantes: OPTIMAL')
 await expect(progreso).toContainText('CP-SAT: respuesta')
 await expect(progreso).toContainText('Validación independiente')
})

test('topes de caja EVENTUAL por contrato de origen: activar, desactivar sin 0 h y ver el tope aplicado',async({page})=>{
 await page.route('**/__lab/cp-sat/estado',r=>r.fulfill({status:404,body:''}))
 await page.goto('/lab-condiciones.html')
 await page.getByLabel('Datos').selectOption('sucursal')
 await expect(page.getByLabel('Tope FULL activo')).not.toBeChecked()
 await expect(page.getByLabel('Tope FULL horas')).toBeDisabled()
 await page.getByLabel('Tope FULL activo').check()
 await page.getByRole('button',{name:'Verificar y generar prueba'}).click()
 await expect(page.getByRole('alert').first()).toContainText('activo sin horas')
 await page.getByLabel('Tope FULL horas').fill('1')
 await page.getByLabel('Tope PART activo').check()
 await page.getByLabel('Tope PART horas').fill('0.5')
 await page.getByRole('button',{name:'Verificar y generar prueba'}).click()
 await expect(page.getByRole('heading',{name:'Propuesta de laboratorio'})).toBeVisible({timeout:60000})
 const fila=(nombre:RegExp)=>page.getByRole('row').filter({hasText:nombre}).filter({hasText:'EVENTUAL'}).filter({hasNotText:'(EVENTUAL)'})
 await expect(fila(/Eventual con función habitual/)).toContainText('1 h')
 await expect(fila(/Eventual de tarde/)).toContainText('0.5 h')
 await page.getByLabel('Tope FULL activo').uncheck()
 await page.getByLabel('Tope PART activo').uncheck()
 await expect(page.getByLabel('Tope FULL horas')).toHaveValue('1') // desactivar conserva el valor editable
 await page.getByRole('button',{name:'Verificar y generar prueba'}).click()
 await expect(page.getByRole('heading',{name:'Propuesta de laboratorio'})).toBeVisible({timeout:60000})
 await expect(fila(/Eventual de tarde/)).toContainText('sin tope')
})
