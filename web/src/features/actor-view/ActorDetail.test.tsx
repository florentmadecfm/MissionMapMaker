import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Product, Project } from '../../api/types'
import { ActorDetail } from './ActorDetail'

function baseProject(): Project {
  return {
    id: 'p1',
    name: 'Test',
    createdAt: '',
    updatedAt: '',
    actors: [{ id: 'a1', name: 'Serveur', color: '#000', description: '', subLanes: 0, about: '', bio: '', goals: [], painPoints: [] }],
    phases: [{ id: 'ph1', name: 'Accueil', order: 0, subColumns: 0, icon: '', kpiLinks: [] }],
    activities: [
      {
        id: 'act1',
        name: 'Accueillir le client',
        actorId: 'a1',
        phaseId: 'ph1',
        order: 0,
        column: 0,
        subRow: 0,
        offsetX: 0,
        offsetY: 0,
        description: '',
        userStories: [],
        traceLinks: [],
        painPoints: [],
        kpiLinks: ['kpi1'],
      },
    ],
    interactions: [],
  }
}

function baseProduct(): Product {
  return {
    id: 'prod1',
    name: 'Produit test',
    createdAt: '',
    updatedAt: '',
    differentiators: [],
    pillars: [],
    kpis: [{ id: 'kpi1', name: "Temps d'attente réduit", baseline: '12', target: '5', unit: 'min' }],
    specifications: [],
    testScenarios: [],
    pendingImpactReviewMissionIds: [],
  }
}

describe('ActorDetail — angle "Produit → Persona"', () => {
  it('affiche le bloc "Valeur apportée" avec le cadrage de valeur quand un produit est fourni', () => {
    render(<ActorDetail project={baseProject()} actorId="a1" product={baseProduct()} />)
    expect(screen.getByText(/Valeur apportée par Produit test/)).toBeInTheDocument()
    expect(screen.getByText("Temps d'attente réduit")).toBeInTheDocument()
    expect(screen.getByText('12 → 5 min')).toBeInTheDocument()
  })

  it("n'affiche aucun bloc de valeur sans produit associé (état explicite, pas une erreur)", () => {
    render(<ActorDetail project={baseProject()} actorId="a1" />)
    expect(screen.queryByText(/Valeur apportée par/)).not.toBeInTheDocument()
  })

  it('reste silencieux (pas de chip KPI) quand le produit fourni ne touche aucun KPI de la persona', () => {
    const emptyProduct: Product = { ...baseProduct(), kpis: [] }
    render(<ActorDetail project={baseProject()} actorId="a1" product={emptyProduct} />)
    expect(screen.queryByText(/Valeur apportée par/)).not.toBeInTheDocument()
  })
})
