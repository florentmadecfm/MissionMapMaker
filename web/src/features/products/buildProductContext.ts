import type { Product, ProductVisionContext } from '../../api/types'

// Construit le contexte envoyé à l'IA (generateVisionRefinement/
// generateKpiSuggestions, Phase 2 du plan Produit/Vision/KPI) à partir du
// brouillon courant de ProductsScreen.tsx — Pick plutôt que Product entier :
// le brouillon en cours d'édition n'a pas besoin d'id/createdAt/updatedAt/
// kpis pour ce contexte.
export function buildProductContext(
  product: Pick<Product, 'name' | 'visionStatement' | 'differentiators' | 'pillars'>,
): ProductVisionContext {
  return {
    productName: product.name,
    visionStatement: product.visionStatement ?? '',
    differentiators: product.differentiators,
    pillars: product.pillars,
  }
}
