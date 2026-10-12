import { expect, test } from '@playwright/test'
import { apiCreateProject, apiDeleteProject, apiSaveProject, gotoHome, uniqueName } from './helpers.js'

// Régression directe sur la demande : "dans l'onglet édition, quand on
// est dans un tableau et qu'on scrolle vers le bas, il faut toujours
// voir l'en-tête du tableau pour garder en contexte les éléments qu'on
// voit dans le cas d'une grande liste" — en-tête de colonnes (.col-
// headers, ProjectEditor.tsx) en `position: sticky` (App.css), collé en
// haut de .shell-main (le conteneur qui scrolle réellement, voir
// ProjectShell.tsx) tant que sa <section> reste à l'écran.
test("l'en-tête de colonnes d'une section reste visible en haut quand on scrolle une longue liste", async ({ page }) => {
  const missionName = uniqueName('e2e-sticky-header')

  const project = await apiCreateProject(missionName)
  const actors = Array.from({ length: 20 }, (_, i) => ({
    id: `a${i + 1}`,
    name: `Persona ${i + 1}`,
    color: '#4f46e5',
    description: '',
    subLanes: 0,
    backstage: false,
    about: '',
    bio: '',
    goals: [],
    painPoints: [],
  }))
  await apiSaveProject({ ...project, actors })

  try {
    await gotoHome(page)
    await page.locator('.project-list button', { hasText: missionName }).click()
    await page.waitForSelector('.tabs-bar', { timeout: 10000 })
    await page.getByRole('button', { name: 'Édition' }).click()

    const header = page.locator('.editor .col-headers').first()
    await expect(header).toBeVisible()
    await expect(header).toHaveCSS('position', 'sticky')

    const lastRow = page.locator('.editor section', { has: page.getByRole('heading', { name: 'Personas' }) }).locator('ul > li').last()
    const shellMain = page.locator('.shell-main')

    // Deux points de scroll, tous deux assez loin pour que l'en-tête soit
    // déjà "collé" au premier — comparer le point de départ (non scrollé,
    // où l'en-tête est encore à sa position naturelle, PLUS BAS que son
    // futur point de collage) au second donnerait une fausse mesure : ce
    // n'est qu'une fois réellement collé que sa position doit rester
    // stable malgré un scroll supplémentaire.
    await shellMain.evaluate((el) => {
      el.scrollTop = 400
    })
    await page.waitForTimeout(150)
    const topAtScroll1 = (await header.boundingBox())!.y
    const rowTopAtScroll1 = (await lastRow.boundingBox())!.y

    await shellMain.evaluate((el) => {
      el.scrollTop = 700
    })
    await page.waitForTimeout(150)
    const topAtScroll2 = (await header.boundingBox())!.y
    const rowTopAtScroll2 = (await lastRow.boundingBox())!.y

    // Preuve qu'un vrai scroll supplémentaire a eu lieu : la dernière
    // ligne (Persona 20) a continué de se déplacer vers le haut de l'écran.
    expect(rowTopAtScroll2).toBeLessThan(rowTopAtScroll1 - 50)
    // L'en-tête, lui, reste à la même position écran entre les deux points
    // de scroll — collé en haut de .shell-main plutôt qu'emporté avec le
    // reste de la liste.
    expect(Math.abs(topAtScroll2 - topAtScroll1)).toBeLessThan(2)

    // Retour utilisateur : "il ne faut pas qu'on puisse voir le tableau
    // défiler au-dessus du header" — l'en-tête collé doit affleurer le
    // tout bord visible de .shell-main (pas seulement sous son padding-
    // top, voir le commentaire de .editor .col-headers dans App.css),
    // sans quoi la fin de la ligne précédente reste visible dans
    // l'interstice au-dessus de lui.
    const shellMainTop = (await shellMain.boundingBox())!.y
    expect(Math.abs(topAtScroll2 - shellMainTop)).toBeLessThan(1)
  } finally {
    await apiDeleteProject(project.id)
  }
})
