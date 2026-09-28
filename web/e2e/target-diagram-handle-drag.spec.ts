import { expect, test } from '@playwright/test'
import { apiCreateProject, apiDeleteProject, apiGetProject, apiSaveProject, openMission, uniqueName } from './helpers.js'

// Régression directe sur le signalement "dans le diagramme cible, j'ai
// déplacé une activité dans une même case (persona et phase) et j'ai
// perdu le diagramme, diagramme tout blanc. et pas de message d'erreur" :
// investigué en écrivant ce test, le geste décrit (glisser une carte à
// partir d'un point proche de son bord — ici le bord bas, à 95% de sa
// hauteur — vers une autre carte de la MÊME case) saisit en réalité une
// poignée de connexion plutôt que le corps de la carte (les poignées sont
// réparties sur tous les bords, voir nodes.tsx), créant une interaction
// plutôt qu'un simple déplacement. Root cause : <ReactFlow nodes={...}>
// était piloté (computeLayout) SANS onNodesChange (voir ProcessDiagram.tsx)
// — anti-pattern documenté de la librairie XYFlow, qui désynchronise son
// suivi interne (position en cours de glisser, dimensions mesurées) du
// tableau de nœuds affiché dès qu'un re-rendu survient pendant le geste
// (ex. setDragTarget à chaque mousemove, voir handleNodeDrag) : les
// flèches cessaient de s'afficher (constaté ici avec un compte de nœuds
// DOM correct mais un compte de FLÈCHES DOM inférieur au nombre réel
// d'interactions), sans qu'aucune exception ne soit levée nulle part —
// exactement le symptôme "aucun message d'erreur". Corrigé en câblant
// onNodesChange (useNodesState) pour que React Flow reste maître de cet
// état interne entre deux resynchronisations depuis `project`.
test('glisser une activité vers une poignée de la carte voisine, dans la même case, en vue Cible : toutes les flèches restent affichées', async ({ page }) => {
  const missionName = uniqueName('e2e-target-handle-drag')
  const created = await apiCreateProject(missionName)

  const base = {
    actors: [
      { id: 'act1', name: 'Client', color: '#4f46e5', description: '', subLanes: 0, backstage: false, about: '', bio: '', goals: [], painPoints: [] },
    ],
    phases: [
      { id: 'ph1', name: 'Accueil', order: 0, subColumns: 0, icon: '', kpiLinks: [] },
    ],
    activities: [
      { id: 'a1', name: 'Entrer', actorId: 'act1', phaseId: 'ph1', order: 0, column: 0, subRow: 0, offsetX: 0, offsetY: 0, description: '', userStories: [], traceLinks: [], painPoints: [], kpiLinks: [] },
      { id: 'a2', name: 'Saluer', actorId: 'act1', phaseId: 'ph1', order: 1, column: 0, subRow: 0, offsetX: 0, offsetY: 0, description: '', userStories: [], traceLinks: [], painPoints: [], kpiLinks: [] },
      { id: 'a3', name: "S'asseoir", actorId: 'act1', phaseId: 'ph1', order: 2, column: 0, subRow: 0, offsetX: 0, offsetY: 0, description: '', userStories: [], traceLinks: [], painPoints: [], kpiLinks: [] },
    ],
    interactions: [
      { id: 'int1', fromActivityId: 'a1', toActivityId: 'a2', information: 'salutation' },
    ],
  }
  await apiSaveProject({ ...created, ...base, target: { label: 'Cible', ...base } })

  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
  page.on('pageerror', (e) => pageErrors.push(String(e)))

  try {
    await openMission(page, missionName)
    await page.locator('.variant-toggle-target').click()
    await page.getByRole('button', { name: 'Diagramme de processus' }).click()
    await page.waitForSelector('.react-flow', { timeout: 10000 })

    const cardA2 = page.locator('.react-flow__node-activity[data-id="a2"]').first()
    const cardA3 = page.locator('.react-flow__node-activity[data-id="a3"]').first()
    const boxA2 = await cardA2.boundingBox()
    const boxA3 = await cardA3.boundingBox()
    if (!boxA2 || !boxA3) throw new Error('cartes "Saluer"/"S\'asseoir" introuvables')

    const startX = boxA2.x + boxA2.width * 0.5
    const startY = boxA2.y + boxA2.height * 0.95
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(boxA3.x + boxA3.width * 0.5, boxA3.y + boxA3.height * 0.5, { steps: 15 })
    await page.mouse.move(boxA3.x + boxA3.width * 0.5, boxA3.y + boxA3.height * 0.5, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(1200)

    // Puis clique sur l'activité manipulée — second déclencheur signalé
    // par l'utilisateur ("c'est aussi quand je clique sur une activité
    // après l'avoir déplacée").
    await page.locator('.react-flow__node-activity[data-id="a2"]').first().click({ position: { x: 10, y: 10 } })
    await page.waitForTimeout(500)

    expect(consoleErrors).toEqual([])
    expect(pageErrors).toEqual([])
    await expect(page.locator('.diagram-error-boundary')).toHaveCount(0)
    await expect(page.locator('.react-flow')).toBeVisible()

    const updated = await apiGetProject(created.id)
    const interactionCount = updated.target.interactions.length
    // Autant de flèches affichées dans le DOM que d'interactions
    // enregistrées : c'est précisément CE compte qui divergeait (flèches
    // manquantes malgré des données intactes) avant le correctif.
    await expect(page.locator('.react-flow__edge')).toHaveCount(interactionCount)
    // Toutes les cartes d'activité de la case restent visibles (aucun
    // écran blanc).
    await expect(page.locator('.react-flow__node-activity')).toHaveCount(3)
  } finally {
    await apiDeleteProject(created.id)
  }
})
