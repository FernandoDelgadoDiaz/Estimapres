import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { pluginLabCpSat } from './src/hibrido/servidorLab'

// https://vitejs.dev/config/
export default defineConfig({
  // pluginLabCpSat: solo `vite dev` y solo con AH2_LAB_CPSAT_DIR (laboratorio local de CP-SAT; nunca en el build).
  plugins: [react(), pluginLabCpSat()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})