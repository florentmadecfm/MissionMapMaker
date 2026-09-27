/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  // Tests unitaires (Vitest) — même config/plugins que le build, pas de
  // fichier séparé. Ne couvre que web/src (unitaire) ; web/e2e/ est un
  // projet Playwright distinct, jamais ramassé ici (voir
  // playwright.config.ts).
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/setupTests.ts'],
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
})
