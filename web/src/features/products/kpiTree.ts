import type { ProductKpi } from '../../api/types'

export interface KpiTreeNode {
  kpi: ProductKpi
  depth: number
}

// Transforme la liste plate ProductKpi.kpis (jamais stockée imbriquée,
// voir domain.ProductKpi.ParentID côté serveur) en une liste ordonnée en
// profondeur, chaque entrée portant sa profondeur (0 = premier niveau) —
// pour un rendu indenté dans ProductsScreen.tsx. Résistant à un cycle
// (ensemble de nœuds déjà visités pendant la récursion) : ultime filet de
// sécurité, même si Product.Validate() côté serveur et le sélecteur de
// parent (excludeSelfAndDescendants ci-dessous) devraient rendre ce cas
// impossible en pratique.
export function buildKpiTree(kpis: ProductKpi[]): KpiTreeNode[] {
  const byParent = new Map<string, ProductKpi[]>()
  for (const kpi of kpis) {
    const key = kpi.parentId ?? ''
    const list = byParent.get(key) ?? []
    list.push(kpi)
    byParent.set(key, list)
  }

  const result: KpiTreeNode[] = []
  const visited = new Set<string>()

  function walk(parentKey: string, depth: number) {
    for (const kpi of byParent.get(parentKey) ?? []) {
      if (visited.has(kpi.id)) continue
      visited.add(kpi.id)
      result.push({ kpi, depth })
      walk(kpi.id, depth + 1)
    }
  }

  walk('', 0)
  return result
}

// Descendants (directs et indirects) de `selfId`, inclus lui-même —
// utilisé pour exclure ces options du sélecteur "Sous-KPI de" : un KPI ne
// peut jamais devenir son propre sous-KPI, ni celui d'un de ses
// descendants (créerait un cycle, voir Product.Validate côté serveur).
function selfAndDescendantIds(kpis: ProductKpi[], selfId: string): Set<string> {
  const childrenByParent = new Map<string, string[]>()
  for (const kpi of kpis) {
    if (!kpi.parentId) continue
    const list = childrenByParent.get(kpi.parentId) ?? []
    list.push(kpi.id)
    childrenByParent.set(kpi.parentId, list)
  }

  const ids = new Set<string>([selfId])
  const stack = [selfId]
  while (stack.length > 0) {
    const current = stack.pop()!
    for (const childId of childrenByParent.get(current) ?? []) {
      if (ids.has(childId)) continue // cycle déjà présent, ne pas boucler indéfiniment
      ids.add(childId)
      stack.push(childId)
    }
  }
  return ids
}

// KPI éligibles comme parent de `selfId` dans le sélecteur "Sous-KPI de" —
// tous les KPI du produit SAUF lui-même et ses descendants.
export function excludeSelfAndDescendants(kpis: ProductKpi[], selfId: string): ProductKpi[] {
  const excluded = selfAndDescendantIds(kpis, selfId)
  return kpis.filter((k) => !excluded.has(k.id))
}
