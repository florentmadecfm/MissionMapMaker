import { expect, test } from '@playwright/test'
import { apiDeleteProduct, apiCreateProduct, apiGetProduct, gotoHome, uniqueName } from './helpers.js'

// Renommer un produit (CRUD complet sur le nom, pas seulement à la
// création — demande utilisateur) : le nom était jusqu'ici affiché en
// lecture seule (<h2 className="panel-title">, ProductsScreen.tsx),
// remplacé par un <input> autosauvegardé (même mécanisme debounce que le
// reste de l'écran, voir AUTOSAVE_DEBOUNCE_MS).
test('renomme un produit existant et le nouveau nom survit à un rechargement', async ({ page }) => {
  const originalName = uniqueName('e2e-produit-avant')
  const renamedName = uniqueName('e2e-produit-apres')
  const product = await apiCreateProduct(originalName)

  try {
    await gotoHome(page)
    await page.locator('.sidebar-products').click()
    await page.locator('.products-select').selectOption({ label: originalName })

    const nameInput = page.locator('.product-name-input')
    await expect(nameInput).toHaveValue(originalName)
    await nameInput.fill(renamedName)

    // Laisse le débounce (900ms) passer, PUIS recharge — même patron que
    // products-autosave.spec.ts pour les différenciateurs.
    await page.waitForTimeout(1300)
    await page.reload()
    await page.waitForSelector('.sidebar-products', { timeout: 10000 })
    await page.locator('.sidebar-products').click()
    // L'option ne porte plus l'ancien nom : sélectionne par id (stable),
    // comme le ferait un utilisateur qui vient de renommer le produit et
    // le retrouve dans la liste sous son nouveau nom.
    await page.locator('.products-select').selectOption({ value: product.id })

    await expect(page.locator('.product-name-input')).toHaveValue(renamedName)
    await expect(page.locator('.products-select')).toContainText(renamedName)

    const updated = await apiGetProduct(product.id)
    expect(updated.name).toBe(renamedName)
  } finally {
    await apiDeleteProduct(product.id)
  }
})

// Symétrique du test de service Go (TestProductService_UpdateRejectsEmptyName) :
// vide le nom depuis l'UI et vérifie que la dégradation reste gracieuse
// (message inline, pas de sauvegarde silencieuse d'un produit sans nom
// qui deviendrait une option de dropdown illisible).
test('vider le nom affiche une erreur inline et désactive Enregistrer', async ({ page }) => {
  const originalName = uniqueName('e2e-produit-nom-vide')
  const product = await apiCreateProduct(originalName)

  try {
    await gotoHome(page)
    await page.locator('.sidebar-products').click()
    await page.locator('.products-select').selectOption({ label: originalName })

    await page.locator('.product-name-input').fill('')
    await expect(page.getByText('Le nom du produit ne peut pas être vide.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeDisabled()

    // Laisse le temps à un éventuel débounce de se déclencher : le nom
    // vide ne doit JAMAIS être envoyé au serveur (voir le garde-fou dans
    // runSave, ProductsScreen.tsx) — le produit garde son nom d'origine.
    await page.waitForTimeout(1300)
    const stillOriginal = await apiGetProduct(product.id)
    expect(stillOriginal.name).toBe(originalName)
  } finally {
    await apiDeleteProduct(product.id)
  }
})
