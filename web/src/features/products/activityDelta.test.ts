import { describe, expect, it } from 'vitest'
import type { Project } from '../../api/types'
import { activityIdentityKey, formatActivityList, phaseNameOf, rowsNotIn, targetActivityRows } from './activityDelta'

function actor(id: string, name: string) {
  return { id, name, color: '#000', description: '', subLanes: 0, about: '', bio: '', goals: [], painPoints: [] }
}

function phase(id: string, name: string) {
  return { id, name, order: 0, subColumns: 0, icon: '', kpiLinks: [] }
}

function activity(id: string, name: string, actorId: string, phaseId: string, traceLinks: string[] = []) {
  return {
    id,
    name,
    actorId,
    phaseId,
    order: 0,
    column: 0,
    subRow: 0,
    offsetX: 0,
    offsetY: 0,
    description: '',
    userStories: [],
    traceLinks,
    painPoints: [],
    kpiLinks: [],
  }
}

function project(id: string, name: string, target: Project['target']): Project {
  return { id, name, createdAt: '', updatedAt: '', actors: [], phases: [], activities: [], interactions: [], target }
}

describe('activityDelta — identité comparable entre missions', () => {
  it('considère deux activités identiques (même acteur + phase + nom), insensible à la casse/aux espaces', () => {
    const a = { actorName: ' Client ', phaseName: 'Commande', activity: activity('a1', "  Payer l'addition", 'a', 'p') }
    const b = { actorName: 'client', phaseName: 'commande', activity: activity('a2', "payer l'addition", 'a', 'p') }
    expect(activityIdentityKey(a)).toBe(activityIdentityKey(b))
  })

  it('distingue deux activités différentes du même acteur dans la même phase', () => {
    const a = { actorName: 'Client', phaseName: 'Commande', activity: activity('a1', 'Choisir les plats', 'a', 'p') }
    const b = { actorName: 'Client', phaseName: 'Commande', activity: activity('a2', "Payer l'addition", 'a', 'p') }
    expect(activityIdentityKey(a)).not.toBe(activityIdentityKey(b))
  })
})

describe('targetActivityRows / phaseNameOf', () => {
  it("n'apporte aucune ligne pour un projet sans variante Cible", () => {
    const p = project('m1', 'Mission', undefined)
    expect(targetActivityRows(p)).toEqual([])
  })

  it('résout acteur et phase par id depuis la Cible', () => {
    const target = {
      label: 'Cible',
      actors: [actor('a1', 'Client')],
      phases: [phase('p1', 'Commande')],
      activities: [activity('act1', 'Commander', 'a1', 'p1')],
      interactions: [],
    }
    const p = project('m1', 'Mission', target)
    const rows = targetActivityRows(p)
    expect(rows).toHaveLength(1)
    expect(rows[0].actorName).toBe('Client')
    expect(rows[0].phaseName).toBe('Commande')
    expect(phaseNameOf(p, { phaseId: 'p1' })).toBe('Commande')
    expect(phaseNameOf(p, { phaseId: 'inconnu' })).toBe('')
  })
})

describe('rowsNotIn — calcul du delta (lien et déliaison)', () => {
  const missionA = project('mA', 'Mission A', {
    label: 'Cible',
    actors: [actor('a1', 'Client')],
    phases: [phase('p1', 'Commande')],
    activities: [activity('act1', 'Commander depuis la table', 'a1', 'p1', ['spec1'])],
    interactions: [],
  })

  it("une mission qui n'apporte rien de nouveau a un delta vide (cas lien : 'rien à analyser')", () => {
    const missionB = project('mB', 'Mission B', {
      label: 'Cible',
      actors: [actor('a2', 'Client')],
      phases: [phase('p2', 'Commande')],
      activities: [activity('act2', 'Commander depuis la table', 'a2', 'p2')],
      interactions: [],
    })
    const rowsA = targetActivityRows(missionA)
    const rowsB = targetActivityRows(missionB)
    expect(rowsNotIn(rowsB, rowsA)).toEqual([])
  })

  it('une mission qui apporte une activité réellement nouvelle la fait apparaître dans le delta', () => {
    const missionC = project('mC', 'Mission C', {
      label: 'Cible',
      actors: [actor('a3', 'Client')],
      phases: [phase('p3', 'Commande')],
      activities: [activity('act3', 'Commander par téléphone', 'a3', 'p3')],
      interactions: [],
    })
    const rowsA = targetActivityRows(missionA)
    const rowsC = targetActivityRows(missionC)
    const delta = rowsNotIn(rowsC, rowsA)
    expect(delta).toHaveLength(1)
    expect(delta[0].activity.name).toBe('Commander par téléphone')
  })

  it('symétrique pour la déliaison : ce qui disparaît avec la mission et que personne ne couvre plus', () => {
    const remaining = project('mR', 'Mission restante', {
      label: 'Cible',
      actors: [actor('a9', 'Serveur')],
      phases: [phase('p9', 'Service')],
      activities: [activity('act9', 'Nettoyer la table', 'a9', 'p9')],
      interactions: [],
    })
    const rowsA = targetActivityRows(missionA)
    const rowsRemaining = targetActivityRows(remaining)
    // La mission A est déliée : son activité "Commander depuis la table"
    // n'a pas d'équivalent dans ce qui reste (Mission restante) → orpheline.
    const removed = rowsNotIn(rowsA, rowsRemaining)
    expect(removed).toHaveLength(1)
    expect(removed[0].activity.name).toBe('Commander depuis la table')
  })
})

describe('formatActivityList', () => {
  function row(name: string, actorName: string, phaseName: string) {
    return { actorName, phaseName, activity: activity(name, name, 'a', 'p') }
  }

  it('liste toutes les entrées sans troncature en dessous du seuil', () => {
    const rows = [row('Payer', 'Client', 'Commande'), row('Nettoyer', 'Serveur', 'Service')]
    expect(formatActivityList(rows)).toBe('« Payer » (Client, Commande), « Nettoyer » (Serveur, Service)')
  })

  it('tronque au-delà de 3 entrées et résume le reste par un compte', () => {
    const rows = [row('A', 'Client', 'P'), row('B', 'Client', 'P'), row('C', 'Client', 'P'), row('D', 'Client', 'P'), row('E', 'Client', 'P')]
    const formatted = formatActivityList(rows)
    expect(formatted).toContain('« A »')
    expect(formatted).toContain('« C »')
    expect(formatted).not.toContain('« D »')
    expect(formatted).toContain('et 2 autres')
  })
})
