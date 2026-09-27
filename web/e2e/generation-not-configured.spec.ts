import { expect, test } from '@playwright/test'
import { apiCreateProject, apiDeleteProject, openMission, uniqueName } from './helpers.js'

// Dégradation gracieuse de la génération assistée quand aucune clé API
// n'est configurée (état par défaut, y compris en CI — voir
// cmd/server/main.go, setupGenerateService) : le message explicite
// s'affiche au lieu de planter. Ne couvre jamais un vrai appel LLM (coût,
// non-déterminisme, clé API à gérer en secret CI — voir le plan tests/
// CI) : seule cette dégradation l'est.
test('génération sans clé API configurée affiche le message "non configuré" au lieu de planter', async ({ page }) => {
  const missionName = uniqueName('e2e-generation-non-configuree')
  const mission = await apiCreateProject(missionName)

  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))

  try {
    await openMission(page, missionName)
    await page.getByRole('button', { name: 'Générer (langage naturel)' }).click()
    await page.locator('textarea').fill('Le fonctionnement d\'un restaurant : le client entre, commande, mange, paie.')
    await page.getByRole('button', { name: 'Générer', exact: true }).click()

    await expect(page.getByText(/Génération indisponible : aucune clé API n'est configurée/)).toBeVisible({ timeout: 10000 })
    expect(errors).toEqual([])
  } finally {
    await apiDeleteProject(mission.id)
  }
})
