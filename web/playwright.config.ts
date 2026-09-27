import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

const PORT = 8080

// Isole complètement les données de ce run (voir cmd/server/main.go,
// MMM_DATA_DIR) — un dossier temporaire OS frais à chaque lancement,
// jamais /data (données réelles) ni un chemin versionné : un test qui
// oublierait de nettoyer ses propres missions ne pollue jamais un run
// suivant, en local comme en CI.
const dataDir = mkdtempSync(path.join(tmpdir(), 'mmm-e2e-'))

// Suite E2E (bout en bout), voir web/e2e/ — distincte des tests unitaires
// Vitest (web/src/**/*.test.ts[x]), jamais ramassée par vitest (voir
// test.exclude, vite.config.ts) ni l'inverse ici (testDir ci-dessous).
export default defineConfig({
  testDir: './e2e',
  // Une seule instance du serveur, une seule base de données (dataDir
  // ci-dessus) partagée par toute la suite : exécution séquentielle
  // plutôt que parallèle, pour ne jamais faire courir deux tests l'un
  // contre l'autre sur le même état serveur (ex. deux créations de
  // mission en même temps).
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  // Le binaire est déjà construit par une étape CI séparée
  // (`npm run build` PUIS `go build`, jamais l'inverse — go:embed
  // embarque web/dist) : cette config ne fait que le LANCER, jamais le
  // construire, pour rester lisible et faciliter la mise en cache côté
  // CI. En local, `npm run build && go build -o ../bin/pulse-missionmap-e2e
  // ../cmd/server` (depuis web/) avant `npm run e2e`.
  webServer: {
    command: '../bin/pulse-missionmap-e2e',
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    env: {
      MMM_ADDR: `:${PORT}`,
      MMM_DATA_DIR: dataDir,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  },
  projects: [
    // Chromium seul (voir le plan) — même navigateur que celui déjà
    // utilisé pour toute la vérification manuelle de ce projet, pas de
    // matrice multi-navigateur pour ce premier lot. executablePath fixé
    // sur l'environnement de développement de ce projet (voir
    // PLAYWRIGHT_BROWSERS_PATH) : sans lui, @playwright/test cherche par
    // défaut le build "headless shell" séparé, absent ici (seul le
    // Chromium complet, déjà utilisé par toutes les vérifications
    // manuelles de ce projet, est installé) — ignoré en CI, où
    // `playwright install --with-deps chromium` télécharge le build
    // attendu par défaut.
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(process.env.CI ? {} : { launchOptions: { executablePath: '/opt/pw-browsers/chromium' } }),
      },
    },
  ],
})
