import { expect, test } from '@playwright/test'
import {
  apiCreateProduct,
  apiCreateProject,
  apiDeleteProduct,
  apiDeleteProject,
  apiGetProject,
  apiSaveProject,
  gotoHome,
  openMission,
  uniqueName,
} from './helpers.js'

// Régression directe sur la demande : "la partie spécification et tests et
// matrice de traçabilité doit être déplacée dans la partie Produit", avec
// un onglet "Stratégie" (contenu historique) et un onglet "Spécification
// et VV" (nouveau, mêmes éléments qu'avant mais agrégés sur toutes les
// missions rattachées) — l'onglet "Spécifications" d'une mission a été
// entièrement retiré, ce contenu ne vit plus que côté Produits.
test('spécifications/tests/traçabilité se gèrent depuis Produits, agrégés sur plusieurs missions', async ({ page }) => {
  const productName = uniqueName('e2e-produit-specvv')
  const mission1Name = uniqueName('e2e-mission-specvv-1')
  const mission2Name = uniqueName('e2e-mission-specvv-2')

  const product = await apiCreateProduct(productName)

  const mission1 = await apiCreateProject(mission1Name)
  const base1 = {
    productId: product.id,
    actors: [{ id: 'act1', name: 'Client', color: '#4f46e5', description: '', subLanes: 0, backstage: false, about: '', bio: '', goals: [], painPoints: [] }],
    phases: [{ id: 'ph1', name: 'Accueil', order: 0, subColumns: 0, icon: '', kpiLinks: [] }],
    activities: [
      { id: 'act_m1', name: 'Accueillir (mission 1)', actorId: 'act1', phaseId: 'ph1', order: 0, column: 0, subRow: 0, offsetX: 0, offsetY: 0, description: '', userStories: [], traceLinks: [], painPoints: [], kpiLinks: [] },
    ],
    interactions: [],
  }
  await apiSaveProject({ ...mission1, ...base1, target: { label: 'Cible', ...base1 } })

  const mission2 = await apiCreateProject(mission2Name)
  const base2 = {
    productId: product.id,
    actors: [{ id: 'act2', name: 'Serveur', color: '#059669', description: '', subLanes: 0, backstage: false, about: '', bio: '', goals: [], painPoints: [] }],
    phases: [{ id: 'ph2', name: 'Service', order: 0, subColumns: 0, icon: '', kpiLinks: [] }],
    activities: [
      { id: 'act_m2', name: 'Servir (mission 2)', actorId: 'act2', phaseId: 'ph2', order: 0, column: 0, subRow: 0, offsetX: 0, offsetY: 0, description: '', userStories: [], traceLinks: [], painPoints: [], kpiLinks: [] },
    ],
    interactions: [],
  }
  await apiSaveProject({ ...mission2, ...base2, target: { label: 'Cible', ...base2 } })

  try {
    await gotoHome(page)
    await page.locator('.sidebar-products').click()
    await page.locator('.products-select').selectOption({ label: productName })

    // Les deux onglets attendus, "Stratégie" actif par défaut.
    await expect(page.locator('.tabs button', { hasText: 'Stratégie' })).toHaveClass(/active/)
    await expect(page.locator('.tabs button', { hasText: 'Spécification et VV' })).toBeVisible()

    await page.locator('.tabs button', { hasText: 'Spécification et VV' }).click()
    await expect(page.locator('.tabs.subtabs button', { hasText: 'Spécifications' })).toBeVisible()

    // Ajoute une spécification manuellement (pas de clé API en E2E).
    await page.getByRole('button', { name: '+ Ajouter une spécification' }).click()
    const specTextarea = page.locator('.spec-card .spec-text').first()
    await specTextarea.fill('Le système doit confirmer la commande en moins de 5 secondes.')
    await page.waitForTimeout(1200) // autosave débouncée (ProductsScreen.tsx)

    // Matrice de traçabilité : les deux missions liées apparaissent,
    // chacune avec son activité Cible.
    await page.locator('.tabs.subtabs button', { hasText: 'Matrice de traçabilité' }).click()
    const matrix = page.locator('.trace-matrix')
    await expect(matrix).toBeVisible()
    const row1 = matrix.locator('tbody tr', { hasText: 'Accueillir (mission 1)' })
    const row2 = matrix.locator('tbody tr', { hasText: 'Servir (mission 2)' })
    await expect(row1).toBeVisible()
    await expect(row2).toBeVisible()
    await expect(row1.locator('.trace-matrix-mission')).toHaveText(mission1Name)
    await expect(row2.locator('.trace-matrix-mission')).toHaveText(mission2Name)

    // Coche la traçabilité pour les DEUX missions — cochage optimiste
    // (handleToggleTraceLink, ProductSpecVVPanel.tsx), confirmé/persisté
    // par une sauvegarde DIRECTE de la mission concernée juste après.
    await row1.locator('input[type="checkbox"]').check()
    await row2.locator('input[type="checkbox"]').check()
    await page.waitForTimeout(800)

    const updated1 = await apiGetProject(mission1.id)
    const updated2 = await apiGetProject(mission2.id)
    expect(updated1.target.activities[0].traceLinks.length).toBe(1)
    expect(updated2.target.activities[0].traceLinks.length).toBe(1)
    expect(updated1.target.activities[0].traceLinks[0]).toBe(updated2.target.activities[0].traceLinks[0])

    // La mission n'a plus aucun onglet "Spécifications" : ce contenu ne
    // vit plus que côté Produits.
    await openMission(page, mission1Name)
    await expect(page.locator('.tabs-bar .tabs button', { hasText: 'Spécifications' })).toHaveCount(0)
  } finally {
    await apiDeleteProject(mission1.id)
    await apiDeleteProject(mission2.id)
    await apiDeleteProduct(product.id)
  }
})
