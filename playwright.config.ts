import { defineConfig } from '@playwright/test'

const url = 'http://127.0.0.1:4176'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  use: {
    baseURL: url,
    browserName: 'chromium',
    serviceWorkers: 'block',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4176 --strictPort',
    url,
    reuseExistingServer: false,
    // AH2_LAB_CPSAT_DIR (opcional): activa el CP-SAT local del servidor de desarrollo para la prueba integral.
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '', AH2_LAB_CPSAT_DIR: process.env.AH2_LAB_CPSAT_DIR ?? '', AH2_PYTHON: process.env.AH2_PYTHON ?? 'python3' },
  },
})
