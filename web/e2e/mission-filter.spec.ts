import { expect, test } from '@playwright/test'
import { apiCreateProject, apiDeleteProject, gotoHome, openMission, uniqueName } from './helpers.js'

// Deux demandes utilisateur distinctes, regroupées dans le même fichier
// car toutes deux touchent la même zone (sidebar + onglet Édition d'une
// mission) :
// 1. Le sélecteur "Produit associé" de l'onglet Édition n'avait pas lieu
//    d'être là (retour utilisateur) — retiré, la liaison mission↔produit
//    se fait désormais uniquement depuis l'écran Produits.
// 2. Un filtre pour retrouver rapidement une mission dans la sidebar,
//    au-delà de MISSION_FILTER_THRESHOLD missions (ProjectShell.tsx).

test('le sélecteur "Produit associé" n\'apparaît plus dans l\'onglet Édition', async ({ page }) => {
  const missionName = uniqueName('e2e-sans-produit-associe')
  const mission = await apiCreateProject(missionName)

  try {
    await openMission(page, missionName)
    await page.getByRole('button', { name: 'Édition' }).click()
    await page.waitForSelector('.editor')
    await expect(page.getByText('Produit associé')).toHaveCount(0)
    await expect(page.locator('.editor-product-select')).toHaveCount(0)
  } finally {
    await apiDeleteProject(mission.id)
  }
})

test('un filtre permet de retrouver rapidement une mission dans la sidebar', async ({ page }) => {
  const prefix = uniqueName('e2e-filtre-mission')
  // Au-delà de MISSION_FILTER_THRESHOLD (8) pour que le champ de
  // recherche apparaisse (ProjectShell.tsx, même patron que
  // FILTER_THRESHOLD dans ProjectEditor.tsx).
  const names = Array.from({ length: 9 }, (_, i) => `${prefix}-${i}`)
  const missions = await Promise.all(names.map((n) => apiCreateProject(n)))

  try {
    await gotoHome(page)
    await page.waitForSelector('.sidebar-missions .list-filter input', { timeout: 10000 })

    await page.locator('.sidebar-missions .list-filter input').fill(`${prefix}-3`)
    const items = page.locator('.project-list li')
    await expect(items).toHaveCount(1)
    await expect(items.first()).toContainText(`${prefix}-3`)

    await page.locator('.sidebar-missions .list-filter input').fill('zzz-introuvable-garanti')
    await expect(page.locator('.project-list li.empty')).toBeVisible()

    await page.locator('.list-filter-clear').click()
    await expect(page.locator('.sidebar-missions .list-filter input')).toHaveValue('')
  } finally {
    await Promise.all(missions.map((m) => apiDeleteProject(m.id)))
  }
})
