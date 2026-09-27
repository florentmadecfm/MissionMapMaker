import { expect, test } from '@playwright/test'
import {
  apiCreateProduct,
  apiCreateProject,
  apiDeleteProduct,
  apiDeleteProject,
  apiSaveProduct,
  apiSaveProject,
  gotoHome,
  openMission,
  uniqueName,
} from './helpers.js'

// Les deux angles narratifs de la mise en valeur Produit/KPI/Missions —
// repris de la vérification déjà menée pour cette PR : "Produit →
// Persona" (bloc "Valeur apportée" dans la Vue par persona) et
// "Missions → Produit" (vue "Valeur des missions" de l'écran Produits).
test('angle Produit → Persona : le cadrage de valeur apparaît dans la Vue par persona', async ({ page }) => {
  const productName = uniqueName('e2e-produit-valeur')
  const missionName = uniqueName('e2e-mission-valeur')

  const product = await apiCreateProduct(productName)
  await apiSaveProduct({
    ...product,
    kpis: [{ id: 'kpi_temps', name: "Temps d'attente réduit", baseline: '12', target: '5', unit: 'min' }],
  })
  const mission = await apiCreateProject(missionName)
  await apiSaveProject({
    ...mission,
    productId: product.id,
    actors: [{ id: 'act1', name: 'Serveur', color: '#059669', description: '', subLanes: 0, backstage: false, about: '', bio: '', goals: [], painPoints: [] }],
    phases: [{ id: 'ph1', name: 'Accueil', order: 0, subColumns: 0, icon: '', kpiLinks: [] }],
    activities: [
      {
        id: 'act_a',
        name: 'Accueillir',
        actorId: 'act1',
        phaseId: 'ph1',
        order: 0,
        column: 0,
        subRow: 0,
        offsetX: 0,
        offsetY: 0,
        description: '',
        userStories: [],
        traceLinks: [],
        painPoints: [],
        kpiLinks: ['kpi_temps'],
      },
    ],
  })

  try {
    await openMission(page, missionName)
    await page.getByRole('button', { name: 'Vue par persona' }).click()
    await page.locator('.actor-select').selectOption({ label: 'Serveur' })

    // Scopé au bloc résumé (.actor-kpi-value) : le nom du KPI apparaît
    // AUSSI dans la chip par activité juste en dessous (granularité plus
    // fine), getByText non scopé serait ambigu entre les deux.
    const valueBlock = page.locator('.actor-kpi-value')
    await expect(valueBlock).toContainText(`Valeur apportée par ${productName}`)
    await expect(valueBlock).toContainText("Temps d'attente réduit")
    await expect(valueBlock).toContainText('12 → 5 min')
  } finally {
    await apiDeleteProject(mission.id)
    await apiDeleteProduct(product.id)
  }
})

test('angle Missions → Produit : "Valeur des missions" liste les missions contributrices', async ({ page }) => {
  const productName = uniqueName('e2e-produit-impact')
  const missionName = uniqueName('e2e-mission-impact')

  const product = await apiCreateProduct(productName)
  await apiSaveProduct({
    ...product,
    kpis: [{ id: 'kpi_temps', name: "Temps d'attente réduit", baseline: '12', target: '5', unit: 'min' }],
  })
  const mission = await apiCreateProject(missionName)
  await apiSaveProject({
    ...mission,
    productId: product.id,
    actors: [{ id: 'act1', name: 'Serveur', color: '#059669', description: '', subLanes: 0, backstage: false, about: '', bio: '', goals: [], painPoints: [] }],
    phases: [{ id: 'ph1', name: 'Accueil', order: 0, subColumns: 0, icon: '', kpiLinks: [] }],
    activities: [
      {
        id: 'act_a',
        name: 'Accueillir',
        actorId: 'act1',
        phaseId: 'ph1',
        order: 0,
        column: 0,
        subRow: 0,
        offsetX: 0,
        offsetY: 0,
        description: '',
        userStories: [],
        traceLinks: [],
        painPoints: [],
        kpiLinks: ['kpi_temps'],
      },
    ],
  })

  try {
    await gotoHome(page)
    await page.locator('.sidebar-products').click()
    await page.locator('.products-select').selectOption({ label: productName })
    await page.getByText('Valeur des missions').click()
    await page.waitForTimeout(1000)

    const card = page.locator('.kpi-impact-card').filter({ hasText: "Temps d'attente réduit" })
    await expect(card).toBeVisible()
    await expect(card.locator('.kpi-impact-value')).toHaveText('12 → 5 min')
    await expect(card.getByText(missionName)).toBeVisible()
  } finally {
    await apiDeleteProject(mission.id)
    await apiDeleteProduct(product.id)
  }
})
