import { expect, test } from '@playwright/test'
import { apiCreateProject, apiDeleteProject, apiGetProject, apiSaveProject, openMission, uniqueName } from './helpers.js'

// Demande utilisateur : (1) inverser l'ordre des onglets Édition/
// Diagramme, (2) champ Criticité pour les phases (entre Satisfaction et
// Ordre), (3) champs Durée/Satisfaction/Criticité pour les activités,
// (4) affichage visuel de ces éléments dans le diagramme, pour les
// phases ET les activités.
test('Édition précède Diagramme dans la barre d\'onglets', async ({ page }) => {
  const missionName = uniqueName('e2e-ordre-onglets')
  const mission = await apiCreateProject(missionName)

  try {
    await openMission(page, missionName)
    const tabTexts = await page.locator('.tabs button').allTextContents()
    const editionIndex = tabTexts.indexOf('Édition')
    const diagrammeIndex = tabTexts.indexOf('Diagramme de processus')
    expect(editionIndex).toBeGreaterThanOrEqual(0)
    expect(diagrammeIndex).toBeGreaterThan(editionIndex)
  } finally {
    await apiDeleteProject(mission.id)
  }
})

test('criticité (phase) et durée/satisfaction/criticité (activité) : édition, persistance et affichage dans le diagramme', async ({ page }) => {
  const missionName = uniqueName('e2e-criticite')
  const created = await apiCreateProject(missionName)
  await apiSaveProject({
    ...created,
    actors: [{ id: 'act1', name: 'Client', color: '#4f46e5', description: '', subLanes: 0, backstage: false, about: '', bio: '', goals: [], painPoints: [] }],
    phases: [{ id: 'ph1', name: 'Accueil', order: 0, subColumns: 0, icon: '', kpiLinks: [] }],
    activities: [
      {
        id: 'a1', name: 'Entrer', actorId: 'act1', phaseId: 'ph1', order: 0, column: 0, subRow: 0, offsetX: 0, offsetY: 0,
        description: '', userStories: [], traceLinks: [], painPoints: [], kpiLinks: [],
      },
    ],
  })

  try {
    await openMission(page, missionName)
    await page.getByRole('button', { name: 'Édition' }).click()
    await page.waitForSelector('.editor')

    // Phase : renseigne le champ Criticité (entre Satisfaction et Ordre
    // dans l'en-tête de colonnes, voir ProjectEditor.tsx).
    const phaseRow = page.locator('section', { has: page.getByRole('heading', { name: 'Phases' }) }).locator('ul li').first()
    await phaseRow.locator('.phase-criticality-select').selectOption('fort')

    // Activité : Durée/Satisfaction/Criticité.
    const activityRow = page.locator('section', { has: page.getByRole('heading', { name: 'Activités' }) }).locator('ul li').first()
    await activityRow.locator('.activity-duration-input').fill('7 min')
    await activityRow.locator('.activity-satisfaction-select').selectOption('2')
    await activityRow.locator('.activity-criticality-select').selectOption('moyen')

    // Sauvegarde automatique (ProjectShell.tsx) : laisse le débounce passer.
    await page.waitForTimeout(1200)

    const saved = await apiGetProject(created.id)
    const phase = saved.phases.find((p: { id: string }) => p.id === 'ph1')
    const activity = saved.activities.find((a: { id: string }) => a.id === 'a1')
    expect(phase.criticality).toBe('fort')
    expect(activity.duration).toBe('7 min')
    expect(activity.satisfactionScore).toBe(2)
    expect(activity.criticality).toBe('moyen')

    // Affichage visuel dans le diagramme : badge de criticité sur l'en-tête
    // de phase ET sur la carte d'activité, texte de durée + emoji de
    // satisfaction sur la carte.
    await page.getByRole('button', { name: 'Diagramme de processus' }).click()
    await page.waitForSelector('.react-flow')

    const phaseHeader = page.locator('.phase-header', { hasText: 'Accueil' })
    await expect(phaseHeader.locator('.criticality-badge')).toHaveText('Fort')

    const activityCard = page.locator('.react-flow__node-activity[data-id="a1"]')
    await expect(activityCard).toContainText('7 min')
    await expect(activityCard.locator('.criticality-badge')).toHaveText('Moyen')
  } finally {
    await apiDeleteProject(created.id)
  }
})
