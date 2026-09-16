import type { Activity, Actor, Interaction, Phase, Project } from '../../api/types'

export type DiffStatus = 'added' | 'removed' | 'modified'

export interface MissionDiff {
  actors: Map<string, DiffStatus>
  phases: Map<string, DiffStatus>
  activities: Map<string, DiffStatus>
  interactions: Map<string, DiffStatus>
}

export interface DiffCounts {
  added: number
  removed: number
  modified: number
}

export interface MissionDiffSummary {
  actors: DiffCounts
  phases: DiffCounts
  activities: DiffCounts
  interactions: DiffCounts
}

type DiffableCollections = Pick<Project, 'actors' | 'phases' | 'activities' | 'interactions'>

function diffById<T extends { id: string }>(before: T[], after: T[], contentEqual: (a: T, b: T) => boolean): Map<string, DiffStatus> {
  const beforeById = new Map(before.map((item) => [item.id, item]))
  const afterById = new Map(after.map((item) => [item.id, item]))
  const result = new Map<string, DiffStatus>()
  for (const [id, item] of beforeById) {
    const afterItem = afterById.get(id)
    if (!afterItem) result.set(id, 'removed')
    else if (!contentEqual(item, afterItem)) result.set(id, 'modified')
  }
  for (const id of afterById.keys()) {
    if (!beforeById.has(id)) result.set(id, 'added')
  }
  return result
}

// Compare uniquement le CONTENU métier de chaque type d'élément — jamais
// sa position sur le diagramme (Activity.column/subRow/offsetX/offsetY,
// Actor.subLanes, Phase.subColumns) : deux cartes identiques mais
// repositionnées par glisser-déposer ne doivent pas ressortir comme
// "modifiées", sous peine de rendre le surlignage inutilisable dès que
// l'utilisateur réorganise l'un des deux diagrammes.
const activityEqual = (a: Activity, b: Activity) =>
  a.name === b.name &&
  a.actorId === b.actorId &&
  a.phaseId === b.phaseId &&
  a.order === b.order &&
  a.description === b.description &&
  JSON.stringify(a.userStories) === JSON.stringify(b.userStories) &&
  JSON.stringify(a.traceLinks) === JSON.stringify(b.traceLinks) &&
  JSON.stringify(a.painPoints) === JSON.stringify(b.painPoints)

const actorEqual = (a: Actor, b: Actor) =>
  a.name === b.name &&
  a.color === b.color &&
  a.description === b.description &&
  Boolean(a.backstage) === Boolean(b.backstage) &&
  a.about === b.about &&
  a.bio === b.bio &&
  JSON.stringify(a.goals) === JSON.stringify(b.goals) &&
  JSON.stringify(a.painPoints) === JSON.stringify(b.painPoints)

const phaseEqual = (a: Phase, b: Phase) =>
  a.name === b.name &&
  a.order === b.order &&
  a.icon === b.icon &&
  (a.duration || '') === (b.duration || '') &&
  (a.satisfactionScore || 0) === (b.satisfactionScore || 0)

const interactionEqual = (a: Interaction, b: Interaction) =>
  a.fromActivityId === b.fromActivityId &&
  a.toActivityId === b.toActivityId &&
  a.information === b.information &&
  (a.description || '') === (b.description || '') &&
  (a.condition || '') === (b.condition || '') &&
  (a.physicalEvidence || '') === (b.physicalEvidence || '')

// Compare l'état Actuel et Cible d'UNE MÊME mission, élément par élément
// (rapprochement par id — la cible partage les ids des éléments inchangés
// depuis createTargetFromCurrent, voir activeVariant.ts) : un id présent
// d'un seul côté est ajouté/supprimé, présent des deux côtés mais avec un
// contenu différent est modifié. Une seule Map par collection, destinée à
// être partagée par les deux panneaux de VariantComparisonScreen : un id
// "removed" n'existe de toute façon que côté Actuel, "added" que côté
// Cible — pas de risque de statut mal appliqué au mauvais panneau.
export function computeMissionDiff(current: DiffableCollections, target: DiffableCollections): MissionDiff {
  return {
    actors: diffById(current.actors, target.actors, actorEqual),
    phases: diffById(current.phases, target.phases, phaseEqual),
    activities: diffById(current.activities, target.activities, activityEqual),
    interactions: diffById(current.interactions, target.interactions, interactionEqual),
  }
}

function countStatuses(map: Map<string, DiffStatus>): DiffCounts {
  const counts: DiffCounts = { added: 0, removed: 0, modified: 0 }
  for (const status of map.values()) counts[status]++
  return counts
}

export function summarizeMissionDiff(diff: MissionDiff): MissionDiffSummary {
  return {
    actors: countStatuses(diff.actors),
    phases: countStatuses(diff.phases),
    activities: countStatuses(diff.activities),
    interactions: countStatuses(diff.interactions),
  }
}

// Cumule les 4 catégories (personas/phases/activités/interactions) d'un
// résumé en un seul total ajouté/supprimé/modifié — la légende de
// VariantComparisonScreen.tsx affiche ce total plutôt qu'un détail par
// catégorie, plus rapide à lire d'un coup d'œil pour se faire une idée
// générale avant d'aller chercher le détail sur le diagramme lui-même.
export function combinedDiffCounts(summary: MissionDiffSummary): DiffCounts {
  const total: DiffCounts = { added: 0, removed: 0, modified: 0 }
  for (const c of [summary.actors, summary.phases, summary.activities, summary.interactions]) {
    total.added += c.added
    total.removed += c.removed
    total.modified += c.modified
  }
  return total
}
