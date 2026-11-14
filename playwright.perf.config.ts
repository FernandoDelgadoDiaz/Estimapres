// #7 · AH2-020 — Configuración SOLO para la medición de rendimiento (e2e/rendimiento.perf.ts).
// Usa el build de producción (vite preview), no el servidor de desarrollo. Requiere `npm run build` antes.
import { defineConfig } from '@playwright/test'

const url = 'http://127.0.0.1:4177'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.perf.ts',
  workers: 1,
  use: {
    baseURL: url,
    browserName: 'chromium',
    serviceWorkers: 'block',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
  },
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4177 --strictPort',
    url,
    reuseExistingServer: false,
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
  },
})
