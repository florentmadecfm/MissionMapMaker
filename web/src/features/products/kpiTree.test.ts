import { describe, expect, it } from 'vitest'
import type { ProductKpi } from '../../api/types'
import { buildKpiForest, buildKpiTree, excludeSelfAndDescendants, formatKpiValue } from './kpiTree'

function kpi(overrides: Partial<ProductKpi> & { id: string; name: string }): ProductKpi {
  return overrides
}

describe('buildKpiTree', () => {
  it('ordonne en profondeur, un sous-KPI juste après son parent', () => {
    const kpis: ProductKpi[] = [
      kpi({ id: 'k1', name: 'Racine' }),
      kpi({ id: 'k2', name: 'Enfant', parentId: 'k1' }),
      kpi({ id: 'k3', name: 'Autre racine' }),
    ]
    const tree = buildKpiTree(kpis)
    expect(tree.map((n) => n.kpi.id)).toEqual(['k1', 'k2', 'k3'])
    expect(tree.find((n) => n.kpi.id === 'k2')?.depth).toBe(1)
    expect(tree.find((n) => n.kpi.id === 'k1')?.depth).toBe(0)
  })

  it('ne boucle jamais indéfiniment sur un cycle (parentId circulaire)', () => {
    const kpis: ProductKpi[] = [
      kpi({ id: 'k1', name: 'A', parentId: 'k2' }),
      kpi({ id: 'k2', name: 'B', parentId: 'k1' }),
    ]
    const tree = buildKpiTree(kpis)
    // Aucun des deux n'est jamais visité depuis la racine ('') dans ce cas
    // (ni k1 ni k2 n'a de parent absent) — walk() ne part que des vraies
    // racines, le cycle reste donc simplement invisible ici, pas une
    // boucle infinie.
    expect(tree).toEqual([])
  })
})

describe('buildKpiForest', () => {
  it('traite un KPI orphelin (parentId inconnu) comme une racine, ne le perd jamais', () => {
    const kpis: ProductKpi[] = [
      kpi({ id: 'k1', name: 'Orphelin', parentId: 'id-inexistant' }),
      kpi({ id: 'k2', name: 'Racine normale' }),
    ]
    const forest = buildKpiForest(kpis)
    expect(forest.map((n) => n.kpi.id).sort()).toEqual(['k1', 'k2'])
  })

  it('imbrique correctement enfant sous parent', () => {
    const kpis: ProductKpi[] = [kpi({ id: 'k1', name: 'Racine' }), kpi({ id: 'k2', name: 'Enfant', parentId: 'k1' })]
    const forest = buildKpiForest(kpis)
    expect(forest).toHaveLength(1)
    expect(forest[0].kpi.id).toBe('k1')
    expect(forest[0].children.map((c) => c.kpi.id)).toEqual(['k2'])
  })
})

describe('excludeSelfAndDescendants', () => {
  it("exclut le KPI lui-même et tous ses descendants (jamais son propre sous-KPI)", () => {
    const kpis: ProductKpi[] = [
      kpi({ id: 'k1', name: 'Racine' }),
      kpi({ id: 'k2', name: 'Enfant', parentId: 'k1' }),
      kpi({ id: 'k3', name: 'Petit-enfant', parentId: 'k2' }),
      kpi({ id: 'k4', name: 'Sans rapport' }),
    ]
    const candidates = excludeSelfAndDescendants(kpis, 'k1')
    expect(candidates.map((k) => k.id)).toEqual(['k4'])
  })
})

describe('formatKpiValue', () => {
  it('actuel et cible renseignés : "actuel → cible unité"', () => {
    expect(formatKpiValue(kpi({ id: 'k', name: 'x', baseline: '12', target: '5', unit: 'min' }))).toBe('12 → 5 min')
  })

  it('cible seule renseignée', () => {
    expect(formatKpiValue(kpi({ id: 'k', name: 'x', target: '5', unit: 'min' }))).toBe('cible : 5 min')
  })

  it('actuel seul renseigné', () => {
    expect(formatKpiValue(kpi({ id: 'k', name: 'x', baseline: '12', unit: 'min' }))).toBe('actuel : 12 min')
  })

  it('ni actuel ni cible : chaîne vide (au chargeur d\'afficher juste le nom)', () => {
    expect(formatKpiValue(kpi({ id: 'k', name: 'x' }))).toBe('')
  })

  it('sans unité : pas de suffixe superflu', () => {
    expect(formatKpiValue(kpi({ id: 'k', name: 'x', baseline: '12', target: '5' }))).toBe('12 → 5')
  })
})
