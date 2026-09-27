import { describe, expect, it } from 'vitest'
import type { Actor, Activity, Phase, Project } from '../../api/types'
import { computeDropTarget, computeLayout, LANE_LABEL_WIDTH, PHASE_HEADER_HEIGHT, SUBCOLUMN_WIDTH, SUBLANE_HEIGHT } from './layout'

// Fabriques minimales, un seul champ à préciser par appel — évite de
// répéter les ~10 champs obligatoires d'Actor/Phase/Activity à chaque
// test (voir web/src/api/types.ts).
function actor(overrides: Partial<Actor> & { id: string; name: string }): Actor {
  return { color: '#000', description: '', subLanes: 0, about: '', bio: '', goals: [], painPoints: [], ...overrides }
}
function phase(overrides: Partial<Phase> & { id: string; name: string; order: number }): Phase {
  return { subColumns: 0, icon: '', kpiLinks: [], ...overrides }
}
function activity(overrides: Partial<Activity> & { id: string; actorId: string; phaseId: string }): Activity {
  return {
    name: '',
    order: 0,
    column: 0,
    subRow: 0,
    offsetX: 0,
    offsetY: 0,
    description: '',
    userStories: [],
    traceLinks: [],
    painPoints: [],
    kpiLinks: [],
    ...overrides,
  }
}
function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'Test',
    createdAt: '',
    updatedAt: '',
    actors: [],
    phases: [],
    activities: [],
    interactions: [],
    specifications: [],
    testScenarios: [],
    ...overrides,
  }
}

describe('computeLayout', () => {
  it('place un acteur, une phase et une activité avec les bons ids de nœud', () => {
    const p = project({
      actors: [actor({ id: 'a1', name: 'Client' })],
      phases: [phase({ id: 'ph1', name: 'Accueil', order: 0 })],
      activities: [activity({ id: 'act1', actorId: 'a1', phaseId: 'ph1', name: 'Entrer' })],
    })
    const { nodes } = computeLayout(p)
    const ids = nodes.map((n) => n.id)
    expect(ids).toContain('actor-header-a1')
    expect(ids).toContain('phase-header-ph1')
    expect(ids).toContain('act1')
  })

  it("trie les acteurs back-stage après les acteurs front-stage, tri stable", () => {
    const p = project({
      actors: [
        actor({ id: 'a1', name: 'Support', backstage: true }),
        actor({ id: 'a2', name: 'Client' }),
        actor({ id: 'a3', name: 'Comptabilité', backstage: true }),
        actor({ id: 'a4', name: 'Serveur' }),
      ],
      phases: [phase({ id: 'ph1', name: 'Accueil', order: 0 })],
    })
    const { nodes } = computeLayout(p)
    const headerOrder = nodes.filter((n) => n.type === 'actorHeader').map((n) => n.data.actorId)
    // front-stage (a2, a4) d'abord, dans leur ordre d'origine, puis
    // back-stage (a1, a3), dans leur ordre d'origine.
    expect(headerOrder).toEqual(['a2', 'a4', 'a1', 'a3'])
  })

  it('assigne des sous-colonnes distinctes à des activités concurrentes (même acteur, même phase)', () => {
    const p = project({
      actors: [actor({ id: 'a1', name: 'Serveur' })],
      phases: [phase({ id: 'ph1', name: 'Commande', order: 0 })],
      activities: [
        activity({ id: 'act1', actorId: 'a1', phaseId: 'ph1', order: 0 }),
        activity({ id: 'act2', actorId: 'a1', phaseId: 'ph1', order: 1 }),
      ],
    })
    const { nodes } = computeLayout(p)
    const act1 = nodes.find((n) => n.id === 'act1')!
    const act2 = nodes.find((n) => n.id === 'act2')!
    // Sous-colonnes différentes -> positions x différentes (empilées côte
    // à côte, voir resolveColumns).
    expect(act1.position.x).not.toBe(act2.position.x)
  })

  it('respecte une colonne explicite (glisser-déposer) plutôt que de la réassigner', () => {
    const p = project({
      actors: [actor({ id: 'a1', name: 'Serveur' })],
      phases: [phase({ id: 'ph1', name: 'Commande', order: 0, subColumns: 2 })],
      activities: [activity({ id: 'act1', actorId: 'a1', phaseId: 'ph1', column: 1 })],
    })
    const { nodes } = computeLayout(p)
    const act1 = nodes.find((n) => n.id === 'act1')!
    const expectedX = LANE_LABEL_WIDTH + 1 * SUBCOLUMN_WIDTH
    expect(act1.position.x).toBeGreaterThanOrEqual(expectedX)
  })

  it('ne compte que les KPI réellement connus du produit (id orphelin filtré)', () => {
    const p = project({
      actors: [actor({ id: 'a1', name: 'Serveur' })],
      phases: [phase({ id: 'ph1', name: 'Commande', order: 0 })],
      activities: [
        activity({ id: 'act1', actorId: 'a1', phaseId: 'ph1', kpiLinks: ['kpi_connu', 'kpi_orphelin'] }),
      ],
    })
    const { nodes } = computeLayout(p, new Set(['kpi_connu']))
    const act1 = nodes.find((n) => n.id === 'act1')!
    expect(act1.data.kpiCount).toBe(1)
  })

  it('sans produit associé (validKpiIds absent), aucun KPI compté', () => {
    const p = project({
      actors: [actor({ id: 'a1', name: 'Serveur' })],
      phases: [phase({ id: 'ph1', name: 'Commande', order: 0 })],
      activities: [activity({ id: 'act1', actorId: 'a1', phaseId: 'ph1', kpiLinks: ['kpi_x'] })],
    })
    const { nodes } = computeLayout(p)
    const act1 = nodes.find((n) => n.id === 'act1')!
    expect(act1.data.kpiCount).toBe(0)
  })
})

describe('computeDropTarget', () => {
  function twoByTwoProject(): Project {
    return project({
      actors: [actor({ id: 'a1', name: 'Client' }), actor({ id: 'a2', name: 'Serveur' })],
      phases: [phase({ id: 'ph1', name: 'Accueil', order: 0 }), phase({ id: 'ph2', name: 'Commande', order: 1 })],
    })
  }

  it('résout la cellule (acteur, phase) sous le point de dépose', () => {
    const p = twoByTwoProject()
    const { nodes } = computeLayout(p)
    // Centre de la 2e ligne (Serveur), 2e colonne (Commande).
    const dropX = LANE_LABEL_WIDTH + SUBCOLUMN_WIDTH * 1.5
    const dropY = PHASE_HEADER_HEIGHT + SUBLANE_HEIGHT * 1.5
    const target = computeDropTarget(p, nodes, { x: dropX, y: dropY })
    expect(target).not.toBeNull()
    expect(target?.actorId).toBe('a2')
    expect(target?.phaseId).toBe('ph2')
  })

  it('renvoie null sans acteur ni phase (rien à cibler)', () => {
    const p = project()
    const target = computeDropTarget(p, [], { x: 0, y: 0 })
    expect(target).toBeNull()
  })
})
