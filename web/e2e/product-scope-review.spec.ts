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

// Régression directe sur la demande : "quand je retire une mission d'un
// produit, il faut aussi relancer une analyse de specs / proposer une
// analyse car le périmètre a changé" — symétrique de
// product-impact-review.spec.ts (liaison), mais pour une déliaison : pas
// de nouvel appel IA (rien de nouveau à générer quand le périmètre
// RÉTRÉCIT), un signalement déterministe à la place — bandeau dans
// "Spécification et VV" + avertissement sur chaque spécification devenue
// orpheline (plus référencée par aucune activité Cible des missions
// encore liées).
test('délier une mission fait apparaître un bandeau de périmètre et un avertissement sur les spécifications orphelines', async ({ page }) => {
  const productName = uniqueName('e2e-produit-scope')
  const mission1Name = uniqueName('e2e-mission-scope-paris')
  const mission2Name = uniqueName('e2e-mission-scope-lyon')

  const product = await apiCreateProduct(productName)
  await apiSaveProduct({
    ...product,
    specifications: [
      // Référencée par la mission 1 (gardée liée) : ne doit jamais
      // porter l'avertissement.
      {
        id: 'spec1',
        code: 'SSS-001',
        type: 'StakeholderNeed',
        text: 'Le système doit permettre au client de commander depuis la table.',
        status: 'approved',
        priority: 'must',
      },
      // Référencée UNIQUEMENT par la mission 2 (sera déliée) : doit
      // devenir orpheline après la déliaison.
      {
        id: 'spec2',
        code: 'SSS-002',
        type: 'StakeholderNeed',
        text: 'Le système doit permettre au client de commander par téléphone.',
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

  const mission2 = await apiCreateProject(mission2Name)
  const base2 = {
    productId: product.id,
    actors: [{ id: 'a2', name: 'Client', color: '#059669', description: '', subLanes: 0, backstage: false, about: '', bio: '', goals: [], userStories: [], painPoints: [] }],
    phases: [{ id: 'p2', name: 'Commande', order: 0, subColumns: 0, icon: '', kpiLinks: [] }],
    activities: [
      { id: 'act2', name: 'Commander par téléphone', actorId: 'a2', phaseId: 'p2', order: 0, column: 0, subRow: 0, offsetX: 0, offsetY: 0, description: '', userStories: [], traceLinks: ['spec2'], painPoints: [], kpiLinks: [] },
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

    // Délie la mission 2 depuis l'onglet Stratégie (section "Missions
    // rattachées") — ciblée via la <li> qui contient son nom, jamais le
    // premier bouton "Délier" trouvé (il y en a un par mission liée).
    await page.locator('.tabs button', { hasText: 'Stratégie' }).click()
    const mission2Row = page.locator('.item-list li', { hasText: mission2Name })
    await mission2Row.getByRole('button', { name: 'Délier' }).click()
    await expect(mission2Row).toHaveCount(0)
    // ProductSpecVVPanel recharge les missions liées (missionProjects,
    // fetch asynchrone par id) dès que `linkedMissions` change — laisse ce
    // fetch se terminer avant de s'appuyer sur orphanedSpecIds (dérivé de
    // missionProjects), sans quoi spec2 resterait vu comme référencé par
    // la mission 2 encore présente dans l'état précédent du fetch.
    await page.waitForTimeout(1000)

    // Le bandeau de périmètre apparaît, avec le nom de la mission déliée
    // ET le delta exact (acteur + phase + nom, voir activityDelta.ts) de
    // ce qu'elle apportait et qui n'est plus couvert par la mission 1
    // restée liée — demande explicite, pas seulement "le périmètre a
    // changé" sans détail.
    await page.locator('.tabs button', { hasText: 'Spécification et VV' }).click()
    const banner = page.locator('.impact-review-banner', { hasText: 'retirée de ce produit' })
    await expect(banner).toBeVisible()
    await expect(banner).toContainText(mission2Name)
    await expect(banner).toContainText('1 activité')
    await expect(banner).toContainText('Commander par téléphone')

    const productAfterUnlink = await apiGetProduct(product.id)
    expect(productAfterUnlink.pendingScopeReviewMissionIds).toEqual([mission2.id])

    // "Revoir les spécifications" : ouvre le sous-onglet Spécifications,
    // où seule spec2 (orpheline) porte l'avertissement — jamais spec1,
    // toujours référencée par la mission 1 restée liée.
    await page.getByRole('button', { name: 'Revoir les spécifications' }).click()
    await expect(banner).toHaveCount(0)

    // `spec.code` est affiché via la VALEUR d'un <input> (pas un nœud de
    // texte) : `hasText` ne le voit jamais — on filtre sur cette valeur
    // explicitement plutôt que sur le texte visible de la carte.
    const spec1Card = page.locator('.spec-card').filter({ has: page.locator('input.spec-code[value="SSS-001"]') })
    const spec2Card = page.locator('.spec-card').filter({ has: page.locator('input.spec-code[value="SSS-002"]') })
    await expect(spec2Card.locator('.spec-orphan-warning')).toBeVisible()
    await expect(spec1Card.locator('.spec-orphan-warning')).toHaveCount(0)

    // Vide la liste côté produit (autosave débouncée, ProductsScreen.tsx)
    // — laisse le débounce (900ms) passer avant de vérifier côté API,
    // même convention que product-impact-review.spec.ts.
    await page.waitForTimeout(1300)
    const productAfterReview = await apiGetProduct(product.id)
    expect(productAfterReview.pendingScopeReviewMissionIds).toEqual([])
  } finally {
    await apiDeleteProject(mission1.id)
    await apiDeleteProject(mission2.id)
    await apiDeleteProduct(product.id)
  }
})

// Troisième règle de la même demande : "s'il ne reste plus de mission
// liée au produit, on supprime toutes les specs sans la possibilité
// d'analyse car il n'y a aucune mission reliée" — cas à une seule
// mission : la délier fait tomber le produit à zéro mission liée, donc
// SUPPRESSION IMMÉDIATE de toutes les spécifications (et des scénarios de
// test, qui ne peuvent jamais être "flottants", voir
// TestScenario.SpecificationID) — jamais de bandeau, rien à analyser
// puisqu'aucune activité Cible ne reste pour justifier quoi que ce soit.
test('délier la dernière mission d\'un produit supprime directement toutes les spécifications et tests', async ({ page }) => {
  const productName = uniqueName('e2e-produit-scope-vide')
  const missionName = uniqueName('e2e-mission-scope-seule')

  const product = await apiCreateProduct(productName)
  const savedProduct = await apiSaveProduct({
    ...product,
    specifications: [
      { id: 'spec1', code: 'SSS-001', type: 'StakeholderNeed', text: 'Le système doit permettre de commander.', status: 'approved', priority: 'must' },
    ],
  })
  await apiSaveProduct({
    ...savedProduct,
    testScenarios: [
      { id: 'test1', code: 'TC-001', title: 'Vérifier la commande', specificationId: 'spec1', steps: [], status: 'draft' },
    ],
  })

  const mission = await apiCreateProject(missionName)
  const base = {
    productId: product.id,
    actors: [{ id: 'a1', name: 'Client', color: '#4f46e5', description: '', subLanes: 0, backstage: false, about: '', bio: '', goals: [], painPoints: [] }],
    phases: [{ id: 'p1', name: 'Commande', order: 0, subColumns: 0, icon: '', kpiLinks: [] }],
    activities: [
      { id: 'act1', name: 'Commander', actorId: 'a1', phaseId: 'p1', order: 0, column: 0, subRow: 0, offsetX: 0, offsetY: 0, description: '', userStories: [], traceLinks: ['spec1'], painPoints: [], kpiLinks: [] },
    ],
    interactions: [],
  }
  await apiSaveProject({ ...mission, ...base, target: { label: 'Cible', ...base } })

  try {
    await gotoHome(page)
    await page.locator('.sidebar-products').click()
    await page.locator('.products-select').selectOption({ label: productName })
    await page.locator('.tabs button', { hasText: 'Stratégie' }).click()

    const missionRow = page.locator('.item-list li', { hasText: missionName })
    await missionRow.getByRole('button', { name: 'Délier' }).click()
    await expect(missionRow).toHaveCount(0)

    await page.locator('.tabs button', { hasText: 'Spécification et VV' }).click()
    // Aucune mission liée : pas de bandeau possible (rien à analyser),
    // retombe directement sur le message "Aucune mission rattachée".
    await expect(page.locator('.impact-review-banner')).toHaveCount(0)
    await expect(page.locator('.placeholder', { hasText: 'Aucune mission rattachée' })).toBeVisible()

    const productAfter = await apiGetProduct(product.id)
    expect(productAfter.specifications).toEqual([])
    expect(productAfter.testScenarios).toEqual([])
    expect(productAfter.pendingScopeReviewMissionIds).toEqual([])
    expect(productAfter.pendingImpactReviewMissionIds).toEqual([])
  } finally {
    await apiDeleteProject(mission.id)
    await apiDeleteProduct(product.id)
  }
})
