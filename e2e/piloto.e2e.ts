import {test,expect} from '@playwright/test'

test('piloto móvil falla cerrado cuando falta su configuración privada',async({page})=>{
 await page.setViewportSize({width:390,height:844})
 await page.goto('/piloto-horarios.html')
 await expect(page.getByRole('heading',{name:'Piloto privado'})).toBeVisible()
 await expect(page.getByRole('alert')).toContainText('todavía no está habilitado')
 await expect(page.getByRole('button',{name:'Generar mejores horarios'})).toHaveCount(0)
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
})
