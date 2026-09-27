import { expect, test } from '@playwright/test'
import { apiCreateProject, apiDeleteProject, apiGetProject, apiSaveProject, openMission, uniqueName } from './helpers.js'

// Manipulation du diagramme : créer une interaction par glisser depuis
// une poignée, déplacer une activité — les deux gestes cités dans le
// signalement utilisateur "le diagramme disparaît" (voir
// DiagramErrorBoundary.tsx/ProcessDiagram.tsx). Régression directe sur
// ces deux gestes plutôt qu'une nouvelle tentative de reproduire le
// crash lui-même (jamais reproduit malgré plusieurs investigations).
test('créer une interaction par glisser-déposer et déplacer une activité fonctionnent sans erreur', async ({ page }) => {
  const missionName = uniqueName('e2e-diagram-manip')
  const created = await apiCreateProject(missionName)

  await apiSaveProject({
    ...created,
    actors: [
      { id: 'act_client', name: 'Client', color: '#4f46e5', description: '', subLanes: 0, backstage: false, about: '', bio: '', goals: [], painPoints: [] },
      { id: 'act_serveur', name: 'Serveur', color: '#059669', description: '', subLanes: 0, backstage: false, about: '', bio: '', goals: [], painPoints: [] },
    ],
    phases: [
      { id: 'ph_accueil', name: 'Accueil', order: 0, subColumns: 0, icon: '', kpiLinks: [] },
      { id: 'ph_commande', name: 'Commande', order: 1, subColumns: 0, icon: '', kpiLinks: [] },
    ],
    activities: [
      { id: 'a_entrer', name: 'Entrer', actorId: 'act_client', phaseId: 'ph_accueil', order: 0, column: 0, subRow: 0, offsetX: 0, offsetY: 0, description: '', userStories: [], traceLinks: [], painPoints: [], kpiLinks: [] },
      { id: 'a_commander', name: 'Commander', actorId: 'act_client', phaseId: 'ph_commande', order: 0, column: 0, subRow: 0, offsetX: 0, offsetY: 0, description: '', userStories: [], traceLinks: [], painPoints: [], kpiLinks: [] },
    ],
  })

  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))

  try {
    await openMission(page, missionName)
    await page.getByRole('button', { name: 'Diagramme de processus' }).click()
    await page.waitForSelector('.react-flow', { timeout: 10000 })

    // Création d'interaction : glisser depuis la poignée de sortie de
    // "Entrer" jusqu'à la carte "Commander".
    const fromHandle = page.locator('[data-nodeid="a_entrer"][data-handleid="out-h0"]').first()
    const toNode = page.locator('.react-flow__node-activity[data-id="a_commander"]').first()
    const fb = await fromHandle.boundingBox()
    const tb = await toNode.boundingBox()
    if (!fb || !tb) throw new Error('poignée ou carte introuvable')
    await page.mouse.move(fb.x + fb.width / 2, fb.y + fb.height / 2)
    await page.mouse.down()
    await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 10 })
    await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(1200)

    // Déplacement d'activité : glisser la carte "Entrer" vers une autre
    // case, en saisissant son centre géométrique. Découvert en écrivant
    // ce test (document.elementFromPoint) puis corrigé : le tracé
    // invisible de 20px (.react-flow__edge-interaction, ajouté par React
    // Flow pour faciliter le clic sur une flèche fine) de l'interaction
    // tout juste créée recouvrait la majeure partie de la carte dès que
    // les flèches sont passées au-dessus des cartes (voir
    // process-diagram.css, commit caeaf74) — un mousedown au centre y
    // saisissait la FLÈCHE, pas la carte. Corrigé en désactivant
    // pointer-events sur ce tracé invisible spécifiquement (voir
    // process-diagram.css, règle .react-flow__edge-interaction) : le
    // centre de la carte redevient fiable, plus besoin de viser un coin.
    const card = page.locator('.react-flow__node-activity[data-id="a_entrer"]').first()
    const cb = await card.boundingBox()
    if (!cb) throw new Error('carte "Entrer" introuvable')
    const px = cb.x + cb.width * 0.5
    const py = cb.y + cb.height * 0.5
    await page.mouse.move(px, py)
    await page.mouse.down()
    await page.mouse.move(px + 200, py + 130, { steps: 10 })
    await page.mouse.move(px + 200, py + 130, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(1200)

    // Aucune erreur JS pendant toute la manipulation, et le canevas reste
    // affiché (ni DiagramErrorBoundary ni écran blanc).
    expect(errors).toEqual([])
    await expect(page.locator('.react-flow')).toBeVisible()
    await expect(page.locator('.diagram-error-boundary')).toHaveCount(0)

    const updated = await apiGetProject(created.id)
    expect(updated.interactions.length).toBeGreaterThan(0)
    // Le glisser a bien changé QUELQUE CHOSE sur la position de l'activité
    // (case, sous-colonne/ligne, ou simple décalage fin) — la case précise
    // où elle atterrit dépend de la géométrie exacte du canevas au moment
    // du test, non reproduite ici à l'identique ; ce qui compte pour cette
    // régression est que le geste ait un effet ET ne casse rien (voir les
    // assertions ci-dessus), pas la position exacte résultante.
    const moved = updated.activities.find((a: { id: string }) => a.id === 'a_entrer')
    const original = { actorId: 'act_client', phaseId: 'ph_accueil', column: 0, subRow: 0, offsetX: 0, offsetY: 0 }
    const changed = ['actorId', 'phaseId', 'column', 'subRow', 'offsetX', 'offsetY'].some(
      (key) => moved[key] !== (original as Record<string, unknown>)[key],
    )
    expect(changed).toBe(true)
  } finally {
    await apiDeleteProject(created.id)
  }
})
