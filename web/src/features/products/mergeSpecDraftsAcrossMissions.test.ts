import { describe, expect, it } from 'vitest'
import type { Activity, DraftSpecification, Specification } from '../../api/types'
import type { ActivityRow } from './mergeSpecDraftsAcrossMissions'
import { mergeSpecDraftsAcrossMissions } from './mergeSpecDraftsAcrossMissions'

function activity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'act1',
    name: 'Commander depuis la table',
    actorId: 'a1',
    phaseId: 'p1',
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

function row(overrides: Partial<ActivityRow> = {}): ActivityRow {
  return {
    missionId: 'm1',
    missionName: 'Mission 1',
    actorName: 'Client',
    activity: activity(),
    ...overrides,
  }
}

function spec(overrides: Partial<Specification> = {}): Specification {
  return {
    id: 'spec1',
    code: 'SSS-001',
    type: 'StakeholderNeed',
    text: 'Le système doit permettre au client de commander depuis la table.',
    status: 'approved',
    priority: 'must',
    ...overrides,
  }
}

describe('mergeSpecDraftsAcrossMissions — création (comportement existant)', () => {
  it('crée une nouvelle spécification et relie l’activité correspondante', () => {
    const draft: DraftSpecification = {
      activityName: 'Commander depuis la table',
      actorName: 'Client',
      text: 'Le système doit permettre au client de commander depuis la table.',
    }
    const result = mergeSpecDraftsAcrossMissions([], [row()], [draft])
    expect(result.addedCount).toBe(1)
    expect(result.revisedCount).toBe(0)
    expect(result.specifications).toHaveLength(1)
    expect(result.activityRows[0].activity.traceLinks).toEqual([result.specifications[0].id])
  })
})

describe('mergeSpecDraftsAcrossMissions — révision (revisesCode)', () => {
  it('révise la spécification existante au lieu d’en créer une nouvelle, et la repasse en brouillon', () => {
    const existing = spec({ id: 'spec1', code: 'SSS-001', text: 'Le système doit permettre au client de commander depuis la table.', status: 'approved' })
    const draft: DraftSpecification = {
      activityName: 'Commander par téléphone',
      actorName: 'Client',
      text: 'Le système doit permettre au client de commander depuis la table ou par téléphone.',
      rationale: 'Couvre aussi la mission Lyon, où la commande se fait par téléphone.',
      revisesCode: 'SSS-001',
    }
    const newRow = row({ missionId: 'm2', activity: activity({ id: 'act2', name: 'Commander par téléphone' }) })

    const result = mergeSpecDraftsAcrossMissions([existing], [newRow], [draft])

    expect(result.addedCount).toBe(0)
    expect(result.revisedCount).toBe(1)
    expect(result.revisedSpecIds).toEqual(['spec1'])
    expect(result.specifications).toHaveLength(1)
    expect(result.specifications[0].text).toBe('Le système doit permettre au client de commander depuis la table ou par téléphone.')
    expect(result.specifications[0].status).toBe('draft')
    expect(result.specifications[0].rationale).toContain('texte précédent')
    // L'activité nouvellement couverte est reliée à la spec révisée.
    expect(result.activityRows[0].activity.traceLinks).toEqual(['spec1'])
  })

  it('ne mute pas les spécifications passées en entrée (copie défensive)', () => {
    const existing = spec({ id: 'spec1', code: 'SSS-001', text: 'Texte original.' })
    const draft: DraftSpecification = {
      activityName: 'Commander depuis la table',
      actorName: 'Client',
      text: 'Texte révisé.',
      revisesCode: 'SSS-001',
    }
    mergeSpecDraftsAcrossMissions([existing], [row()], [draft])
    expect(existing.text).toBe('Texte original.')
    expect(existing.status).toBe('approved')
  })

  it('se replie sur une création quand revisesCode ne correspond à aucune spécification connue', () => {
    const draft: DraftSpecification = {
      activityName: 'Commander depuis la table',
      actorName: 'Client',
      text: 'Nouveau besoin.',
      revisesCode: 'SSS-999',
    }
    const result = mergeSpecDraftsAcrossMissions([], [row()], [draft])
    expect(result.revisedCount).toBe(0)
    expect(result.addedCount).toBe(1)
  })
})
