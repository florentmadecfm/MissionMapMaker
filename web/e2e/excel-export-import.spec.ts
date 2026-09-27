import { expect, test } from '@playwright/test'
import {
  apiCreateProduct,
  apiCreateProject,
  apiDeleteProduct,
  apiDeleteProject,
  apiGetProject,
  apiSaveProduct,
  apiSaveProject,
  openMission,
  uniqueName,
} from './helpers.js'

// Round-trip export/import Excel avec produit/KPI/kpiLinks — repris de la
// vérification déjà menée pour la PR "export/import Excel prend en
// compte le produit" : exporte une mission liée à un produit à KPI, puis
// importe le fichier dans une seconde mission liée au même produit,
// vérifie que kpiLinks est bien restauré (pas seulement les activités/
// phases "de base").
test('export puis import Excel restaure les liens KPI', async ({ page }) => {
  const productName = uniqueName('e2e-produit-excel')
  const missionSourceName = uniqueName('e2e-mission-source')
  const missionCibleName = uniqueName('e2e-mission-cible')

  const product = await apiCreateProduct(productName)
  await apiSaveProduct({
    ...product,
    pillars: [],
    kpis: [{ id: 'kpi_temps', name: "Temps d'attente réduit", baseline: '12', target: '5', unit: 'min' }],
  })

  const source = await apiCreateProject(missionSourceName)
  await apiSaveProject({
    ...source,
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

  const cible = await apiCreateProject(missionCibleName)
  await apiSaveProject({
    ...cible,
    productId: product.id,
    actors: [{ id: 'act2', name: 'Serveur', color: '#059669', description: '', subLanes: 0, backstage: false, about: '', bio: '', goals: [], painPoints: [] }],
    phases: [{ id: 'ph2', name: 'Accueil', order: 0, subColumns: 0, icon: '', kpiLinks: [] }],
    activities: [
      {
        id: 'act_b',
        name: 'Accueillir',
        actorId: 'act2',
        phaseId: 'ph2',
        order: 0,
        column: 0,
        subRow: 0,
        offsetX: 0,
        offsetY: 0,
        description: '',
        userStories: [],
        traceLinks: [],
        painPoints: [],
        kpiLinks: [],
      },
    ],
  })

  try {
    await openMission(page, missionSourceName)
    await page.locator('.export-import-menu .header-menu-trigger').click()
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Exporter en Excel' }).click()
    const download = await downloadPromise
    const filePath = await download.path()
    if (!filePath) throw new Error('téléchargement introuvable')

    await openMission(page, missionCibleName)
    page.once('dialog', (dialog) => dialog.accept())
    await page.locator('.export-import-menu input[type=file]').setInputFiles(filePath)
    await page.waitForTimeout(1500)

    const updated = await apiGetProject(cible.id)
    // L'import régénère les ids d'activité à partir des lignes du fichier
    // (voir importExcel.ts) : impossible de retrouver "act_b", on cherche
    // par nom comme le ferait un utilisateur relisant le fichier importé.
    const activity = updated.activities.find((a: { name: string }) => a.name === 'Accueillir')
    expect(activity?.kpiLinks).toContain('kpi_temps')
  } finally {
    await apiDeleteProject(source.id)
    await apiDeleteProject(cible.id)
    await apiDeleteProduct(product.id)
  }
})
