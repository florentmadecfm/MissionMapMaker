import { expect, test } from '@playwright/test'
import {
  apiCreateProduct,
  apiCreateProject,
  apiDeleteProduct,
  apiDeleteProject,
  apiGetProduct,
  apiSaveProduct,
  apiSaveProject,
  gotoHome,
  uniqueName,
} from './helpers.js'

// Régression directe sur la demande : "quand on lie une nouvelle mission à
// un produit, il faut relancer la génération des SSS et VV du système en
// prenant en compte les différentes missions" — un bandeau d'impact
// apparaît dans "Spécification et VV" dès qu'une mission est liée depuis
// l'écran Produits, et se vide soit en lançant l'analyse (bouton "Analyser
// l'impact", qui réutilise le même appel IA que "Proposer les SSS…", testé
// ailleurs — ici sans clé API, qui affiche le message habituel "non
// configuré" sans planter) soit en l'ignorant explicitement.
test('lier une nouvelle mission fait apparaître un bandeau d\'impact, "Ignorer" le vide sans appel IA', async ({ page }) => {
  const productName = uniqueName('e2e-produit-impact')
  const mission1Name = uniqueName('e2e-mission-impact-1')
  const mission2Name = uniqueName('e2e-mission-impact-2')

  const product = await apiCreateProduct(productName)
  await apiSaveProduct({
    ...product,
    specifications: [
      {
        id: 'spec1',
        code: 'SSS-001',
        type: 'StakeholderNeed',
        text: 'Le système doit permettre au client de commander depuis la table.',
        status: 'approved',
        priority: 'must',
      },
    ],
  })

  const mission1 = await apiCreateProject(mission1Name)
  const base1 = {
    productId: product.id,
    actors: [{ id: 'a1', name: 'Client', color: '#4f46e5', description: '', subLanes: 0, backstage: false, about: '', bio: '', goals: [], painPoints: [] }],
    phases: [{ id: 'p1', name: 'Commande', order: 0, subColumns: 0, icon: '', kpiLinks: [] }],
    activities: [
      { id: 'act1', name: 'Commander depuis la table', actorId: 'a1', phaseId: 'p1', order: 0, column: 0, subRow: 0, offsetX: 0, offsetY: 0, description: '', userStories: [], traceLinks: ['spec1'], painPoints: [], kpiLinks: [] },
    ],
    interactions: [],
  }
  await apiSaveProject({ ...mission1, ...base1, target: { label: 'Cible', ...base1 } })

  // Mission 2 : PAS ENCORE liée au produit (liée plus bas via l'UI, geste
  // que ce test exerce explicitement plutôt que de court-circuiter via
  // l'API comme product-spec-vv.spec.ts).
  const mission2 = await apiCreateProject(mission2Name)
  const base2 = {
    actors: [{ id: 'a2', name: 'Client', color: '#059669', description: '', subLanes: 0, backstage: false, about: '', bio: '', goals: [], painPoints: [] }],
    phases: [{ id: 'p2', name: 'Commande', order: 0, subColumns: 0, icon: '', kpiLinks: [] }],
    activities: [
      { id: 'act2', name: 'Commander par téléphone', actorId: 'a2', phaseId: 'p2', order: 0, column: 0, subRow: 0, offsetX: 0, offsetY: 0, description: '', userStories: [], traceLinks: [], painPoints: [], kpiLinks: [] },
    ],
    interactions: [],
  }
  await apiSaveProject({ ...mission2, ...base2, target: { label: 'Cible', ...base2 } })

  try {
    await gotoHome(page)
    await page.locator('.sidebar-products').click()
    await page.locator('.products-select').selectOption({ label: productName })

    await page.locator('.tabs button', { hasText: 'Spécification et VV' }).click()
    await expect(page.locator('.impact-review-banner')).toHaveCount(0)

    // Lie la mission 2 depuis l'onglet Stratégie (section "Missions rattachées").
    await page.locator('.tabs button', { hasText: 'Stratégie' }).click()
    await page.locator('.add-item-row select').selectOption({ label: mission2Name })
    await page.getByRole('button', { name: 'Lier', exact: true }).click()
    await expect(page.locator('.add-item-row select option', { hasText: mission2Name })).toHaveCount(0)

    // Le bandeau d'impact apparaît, avec le nom de la mission fraîchement liée.
    await page.locator('.tabs button', { hasText: 'Spécification et VV' }).click()
    const banner = page.locator('.impact-review-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText(mission2Name)

    const productAfterLink = await apiGetProduct(product.id)
    expect(productAfterLink.pendingImpactReviewMissionIds).toEqual([mission2.id])

    // "Ignorer" : vide la liste côté produit sans appel IA (aucune clé
    // configurée en e2e — si un appel partait, generateNotConfigured
    // s'afficherait, jamais le cas ici). Passe par onChange/setDraftDirty
    // (autosave débouncée, ProductsScreen.tsx), pas une sauvegarde
    // immédiate : laisse le débounce (900ms) passer avant de vérifier côté
    // API, même convention que products-autosave.spec.ts.
    await page.getByRole('button', { name: 'Ignorer' }).click()
    await expect(banner).toHaveCount(0)
    await expect(page.locator('.nl-warning', { hasText: 'aucune clé API' })).toHaveCount(0)
    await page.waitForTimeout(1300)

    const productAfterDismiss = await apiGetProduct(product.id)
    expect(productAfterDismiss.pendingImpactReviewMissionIds).toEqual([])
  } finally {
    await apiDeleteProject(mission1.id)
    await apiDeleteProject(mission2.id)
    await apiDeleteProduct(product.id)
  }
})
