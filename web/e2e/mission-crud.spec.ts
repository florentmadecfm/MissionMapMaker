import { expect, test } from '@playwright/test'
import { apiDeleteProject, gotoHome, uniqueName } from './helpers.js'

// Parcours "mission vierge" : créer une mission depuis l'interface,
// ajouter un persona/une phase/une activité depuis l'onglet Édition
// (jamais couvert avant cette suite — seul le câblage API l'était), puis
// vérifier que le diagramme les affiche. Le golden path d'un nouvel
// utilisateur qui découvre l'app.
test('créer une mission et ajouter persona/phase/activité fait apparaître la carte dans le diagramme', async ({ page }) => {
  const missionName = uniqueName('e2e-mission-crud')
  let projectId: string | undefined

  try {
    await gotoHome(page)
    await page.locator('.new-project input').fill(missionName)
    await page.getByRole('button', { name: 'Créer' }).click()
    await page.waitForSelector('.tabs-bar', { timeout: 10000 })

    await page.getByRole('button', { name: 'Édition' }).click()

    await page.getByRole('button', { name: '+ Ajouter un persona' }).click()
    // Une ligne persona a 3 <input> (couleur, nom, case à cocher back-
    // stage) : seul le nom n'a pas de `type` explicite (donc "text" par
    // défaut).
    await page
      .locator('section', { has: page.getByRole('heading', { name: 'Personas' }) })
      .locator('ul li input:not([type])')
      .last()
      .fill('Client')

    await page.getByRole('button', { name: '+ Ajouter une phase' }).click()
    await page
      .locator('section', { has: page.getByRole('heading', { name: 'Phases' }) })
      .locator('ul li input:not([type])')
      .last()
      .fill('Accueil')

    await page.getByRole('button', { name: '+ Ajouter une activité' }).click()
    await page
      .locator('section', { has: page.getByRole('heading', { name: 'Activités' }) })
      .locator('ul li input')
      .last()
      .fill('Entrer dans le restaurant')

    // Sauvegarde automatique (ProjectShell.tsx) : laisse le débounce
    // passer avant de changer d'onglet.
    await page.waitForTimeout(1200)

    await page.getByRole('button', { name: 'Diagramme de processus' }).click()
    await page.waitForSelector('.react-flow', { timeout: 10000 })
    await expect(page.getByText('Entrer dans le restaurant')).toBeVisible()

    // Résout l'id du projet via son nom pour le nettoyage (voir finally).
    const res = await page.request.get('http://localhost:8080/api/projects')
    const summaries = (await res.json()) as Array<{ id: string; name: string }>
    projectId = summaries.find((s) => s.name === missionName)?.id
  } finally {
    if (projectId) await apiDeleteProject(projectId)
  }
})
