import { expect, test } from '@playwright/test'
import { apiCreateProduct, apiDeleteProduct, gotoHome, uniqueName } from './helpers.js'

// Sauvegarde automatique de l'écran Produits (différenciateurs/piliers/
// KPI) : un différenciateur ajouté doit survivre sans avoir cliqué
// "Enregistrer" — c'était le bug signalé par l'utilisateur avant l'ajout
// de l'autosave (ProductsScreen.tsx, runSave/AUTOSAVE_DEBOUNCE_MS).
test('un différenciateur ajouté survit à un rechargement sans cliquer "Enregistrer"', async ({ page }) => {
  const productName = uniqueName('e2e-produit-autosave')
  const product = await apiCreateProduct(productName)

  try {
    await gotoHome(page)
    await page.locator('.sidebar-products').click()
    await page.locator('.products-select').selectOption({ label: productName })

    await page.locator('input[placeholder="Nouveau différenciateur"]').fill('Lien direct KPI ↔ diagramme')
    await page.getByRole('button', { name: 'Ajouter' }).first().click()

    // Laisse le débounce (900ms) passer, PUIS recharge — sans jamais
    // cliquer sur le bouton "Enregistrer" en bas de l'écran. La vue
    // ('project'/'products'/...) est un simple état React, jamais
    // persisté dans l'URL (pas de deep-linking) : un rechargement retombe
    // sur la vue par défaut, il faut donc re-naviguer vers Produits.
    await page.waitForTimeout(1300)
    await page.reload()
    await page.waitForSelector('.sidebar-products', { timeout: 10000 })
    await page.locator('.sidebar-products').click()
    await page.locator('.products-select').selectOption({ label: productName })

    await expect(page.getByText('Lien direct KPI ↔ diagramme')).toBeVisible()
  } finally {
    await apiDeleteProduct(product.id)
  }
})
