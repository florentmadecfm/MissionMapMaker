import { expect, test } from '@playwright/test'
import { apiCreateProject, apiDeleteProject, apiGetProject, apiSaveProject, gotoHome, uniqueName } from './helpers.js'

// Régression directe sur la demande : "dans l'onglet d'édition, il faut
// pouvoir changer l'ordre des Personas comme pour les phases de la
// mission" — même patron que le réordonnancement des phases déjà en
// place (movePhase, ADR-069), mais sur les personas (moveActor,
// ProjectEditor.tsx) : l'ordre d'affichage d'un persona (dans l'onglet
// Édition ET dans le diagramme, au sein de son groupe front-/back-stage,
// voir layout.ts) suit directement l'ordre du tableau `project.actors`,
// réordonné ici en échangeant la position de deux personas voisins.
test("les boutons ‹/› de la section Personas changent l'ordre d'affichage, dans l'onglet Édition comme dans le diagramme", async ({ page }) => {
  const missionName = uniqueName('e2e-persona-reorder')

  const project = await apiCreateProject(missionName)
  await apiSaveProject({
    ...project,
    actors: [
      { id: 'a1', name: 'Client', color: '#4f46e5', description: '', subLanes: 0, backstage: false, about: '', bio: '', goals: [], painPoints: [] },
      { id: 'a2', name: 'Serveur', color: '#059669', description: '', subLanes: 0, backstage: false, about: '', bio: '', goals: [], painPoints: [] },
      { id: 'a3', name: 'Cuisinier', color: '#d97706', description: '', subLanes: 0, backstage: false, about: '', bio: '', goals: [], painPoints: [] },
    ],
    phases: [{ id: 'p1', name: 'Commande', order: 0, subColumns: 0, icon: '', kpiLinks: [] }],
  })

  try {
    await gotoHome(page)
    await page.locator('.project-list button', { hasText: missionName }).click()
    await page.waitForSelector('.tabs-bar', { timeout: 10000 })
    await page.getByRole('button', { name: 'Édition' }).click()

    const personaSection = page.locator('section', { has: page.getByRole('heading', { name: 'Personas' }) })
    const personaRows = personaSection.locator('ul > li')
    await expect(personaRows).toHaveCount(3)
    // Ordre initial : Client, Serveur, Cuisinier (ordre d'apiSaveProject).
    await expect(personaRows.nth(0).locator('input:not([type])')).toHaveValue('Client')
    await expect(personaRows.nth(1).locator('input:not([type])')).toHaveValue('Serveur')
    await expect(personaRows.nth(2).locator('input:not([type])')).toHaveValue('Cuisinier')

    // Bouton "plus haut" de la première ligne (Client) désactivé — déjà en
    // tête de liste, rien au-dessus.
    await expect(personaRows.nth(0).getByRole('button', { name: /plus haut/ })).toBeDisabled()
    // Bouton "plus bas" de la dernière ligne (Cuisinier) désactivé — déjà
    // en fin de liste, rien en dessous.
    await expect(personaRows.nth(2).getByRole('button', { name: /plus bas/ })).toBeDisabled()

    // Descend "Client" d'un cran : Client <-> Serveur échangent de place.
    await personaRows.nth(0).getByRole('button', { name: /plus bas/ }).click()
    await expect(personaRows.nth(0).locator('input:not([type])')).toHaveValue('Serveur')
    await expect(personaRows.nth(1).locator('input:not([type])')).toHaveValue('Client')
    await expect(personaRows.nth(2).locator('input:not([type])')).toHaveValue('Cuisinier')

    // Persisté côté serveur (autosave débouncée, ProjectShell.tsx).
    await page.waitForTimeout(1200)
    const saved = await apiGetProject(project.id)
    expect(saved.actors.map((a: { name: string }) => a.name)).toEqual(['Serveur', 'Client', 'Cuisinier'])

    // Le diagramme reflète le même ordre (lane-node actor-header, voir
    // layout.ts — tri stable par backstage, ici tous front-stage : l'ordre
    // du tableau `actors` est directement celui des lignes). toContainText
    // (pas toHaveText) : chaque en-tête porte aussi le bouton "+"
    // d'ajout de sous-ligne, pas seulement le nom.
    await page.getByRole('button', { name: 'Diagramme de processus' }).click()
    await page.waitForSelector('.react-flow', { timeout: 10000 })
    await expect(page.locator('.actor-header')).toContainText(['Serveur', 'Client', 'Cuisinier'])
  } finally {
    await apiDeleteProject(project.id)
  }
})
