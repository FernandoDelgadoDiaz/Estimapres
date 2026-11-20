/** Build separado. No altera el build ni las rutas productivas. */
import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {resolve} from 'node:path'
export default defineConfig({plugins:[react()],build:{outDir:'dist-piloto',rollupOptions:{input:resolve(process.cwd(),'piloto-horarios.html')}}})
