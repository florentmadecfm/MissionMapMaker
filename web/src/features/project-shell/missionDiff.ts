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
// l'utilisateur réorganise l'un des deux diagrammes. Renvoie la liste des
// CHAMPS qui diffèrent (étiquettes lisibles, pour la liste détaillée de
// VariantComparisonScreen.tsx) plutôt qu'un simple booléen — "égal" n'est
// alors que "cette liste est vide" (voir *_EQUAL ci-dessous), sans dupliquer
// la comparaison entre le diff et le détail affiché à l'utilisateur.
function activityChangedFields(a: Activity, b: Activity): string[] {
  const fields: string[] = []
  if (a.name !== b.name) fields.push('nom')
  if (a.actorId !== b.actorId) fields.push('persona')
  if (a.phaseId !== b.phaseId) fields.push('phase')
  if (a.order !== b.order) fields.push('ordre')
  if (a.description !== b.description) fields.push('description')
  if (JSON.stringify(a.userStories) !== JSON.stringify(b.userStories)) fields.push('user stories')
  if (JSON.stringify(a.traceLinks) !== JSON.stringify(b.traceLinks)) fields.push('traçabilité')
  if (JSON.stringify(a.painPoints) !== JSON.stringify(b.painPoints)) fields.push('points de friction')
  return fields
}

function actorChangedFields(a: Actor, b: Actor): string[] {
  const fields: string[] = []
  if (a.name !== b.name) fields.push('nom')
  if (a.color !== b.color) fields.push('couleur')
  if (a.description !== b.description) fields.push('description')
  if (Boolean(a.backstage) !== Boolean(b.backstage)) fields.push('back-stage')
  if (a.about !== b.about) fields.push('à propos')
  if (a.bio !== b.bio) fields.push('bio')
  if (JSON.stringify(a.goals) !== JSON.stringify(b.goals)) fields.push('objectifs')
  if (JSON.stringify(a.painPoints) !== JSON.stringify(b.painPoints)) fields.push('points de friction')
  return fields
}

function phaseChangedFields(a: Phase, b: Phase): string[] {
  const fields: string[] = []
  if (a.name !== b.name) fields.push('nom')
  if (a.order !== b.order) fields.push('ordre')
  if (a.icon !== b.icon) fields.push('icône')
  if ((a.duration || '') !== (b.duration || '')) fields.push('durée')
  if ((a.satisfactionScore || 0) !== (b.satisfactionScore || 0)) fields.push('satisfaction')
  return fields
}

function interactionChangedFields(a: Interaction, b: Interaction): string[] {
  const fields: string[] = []
  if (a.fromActivityId !== b.fromActivityId) fields.push('origine')
  if (a.toActivityId !== b.toActivityId) fields.push('destination')
  if (a.information !== b.information) fields.push('information')
  if ((a.description || '') !== (b.description || '')) fields.push('description')
  if ((a.condition || '') !== (b.condition || '')) fields.push('condition')
  if ((a.physicalEvidence || '') !== (b.physicalEvidence || '')) fields.push('preuve physique')
  return fields
}

const activityEqual = (a: Activity, b: Activity) => activityChangedFields(a, b).length === 0
const actorEqual = (a: Actor, b: Actor) => actorChangedFields(a, b).length === 0
const phaseEqual = (a: Phase, b: Phase) => phaseChangedFields(a, b).length === 0
const interactionEqual = (a: Interaction, b: Interaction) => interactionChangedFields(a, b).length === 0

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

// Une ligne de la liste détaillée des différences (VariantComparisonScreen.tsx,
// ADR-081) — le pendant textuel du surlignage sur le diagramme : les
// mêmes statuts et les mêmes 4 catégories, mais consultables d'un coup
// d'œil sans avoir à repérer chaque badge sur les deux diagrammes.
export interface DiffEntry {
  kind: 'actor' | 'phase' | 'activity' | 'interaction'
  status: DiffStatus
  id: string
  // Nom de l'élément — "Ancien nom → Nouveau nom" quand le champ `name`
  // lui-même fait partie de ce qui a changé (le seul champ assez central
  // pour mériter d'apparaître dans le libellé plutôt que dans le détail).
  label: string
  // Contexte supplémentaire : persona/phase pour une activité, origine →
  // destination pour une interaction — absent pour un persona/une phase,
  // qui n'ont rien de plus pertinent à afficher ici.
  subtitle?: string
  // Champs qui diffèrent (voir *ChangedFields ci-dessus) — uniquement pour
  // un élément "modifié" ; absent pour ajouté/supprimé (tout le contenu
  // est nouveau/disparu, énumérer les champs n'apporterait rien).
  changedFields?: string[]
}

// L'élément qu'une entrée de la liste détaillée (DiffList.tsx) désigne,
// une fois sélectionnée — ce que ProcessDiagram.tsx a besoin de savoir
// pour surligner CET élément précis (et estomper le reste) sur l'un ou
// l'autre des deux diagrammes. Un sous-ensemble de DiffEntry (kind + id)
// plutôt que l'entrée complète : VariantComparisonScreen.tsx n'a besoin
// de retenir que ça pour piloter les deux panneaux.
export type DiffFocusTarget = Pick<DiffEntry, 'kind' | 'id'>

// État d'un élément du diagramme UNE FOIS qu'une entrée de la liste est
// sélectionnée (voir DiffFocusTarget ci-dessus) — 'focused' sur l'élément
// désigné, 'dimmed' sur tous les autres. Absent (pas de sélection en
// cours) : rendu inchangé, uniquement le badge de statut habituel.
export type DiffSelection = 'focused' | 'dimmed'

const KIND_SORT_ORDER: Record<DiffStatus, number> = { added: 0, modified: 1, removed: 2 }

function sortEntries(entries: DiffEntry[]): DiffEntry[] {
  return entries.sort((a, b) => KIND_SORT_ORDER[a.status] - KIND_SORT_ORDER[b.status] || a.label.localeCompare(b.label))
}

// Construit la liste détaillée à partir des mêmes Maps que computeMissionDiff
// (calculées une seule fois, réutilisées ici) — plutôt que de refaire le
// rapprochement par id, ce qui dupliquerait diffById pour un résultat
// nécessairement cohérent avec le surlignage du diagramme.
export function buildDiffEntries(current: DiffableCollections, target: DiffableCollections, diff: MissionDiff): DiffEntry[] {
  const activityNameById = new Map<string, string>()
  for (const a of current.activities) activityNameById.set(a.id, a.name)
  for (const a of target.activities) activityNameById.set(a.id, a.name)
  const actorNameById = new Map<string, string>()
  for (const a of current.actors) actorNameById.set(a.id, a.name)
  for (const a of target.actors) actorNameById.set(a.id, a.name)
  const phaseNameById = new Map<string, string>()
  for (const p of current.phases) phaseNameById.set(p.id, p.name)
  for (const p of target.phases) phaseNameById.set(p.id, p.name)

  const currentActivityById = new Map(current.activities.map((a) => [a.id, a]))
  const targetActivityById = new Map(target.activities.map((a) => [a.id, a]))
  const currentActorById = new Map(current.actors.map((a) => [a.id, a]))
  const targetActorById = new Map(target.actors.map((a) => [a.id, a]))
  const currentPhaseById = new Map(current.phases.map((p) => [p.id, p]))
  const targetPhaseById = new Map(target.phases.map((p) => [p.id, p]))
  const currentInteractionById = new Map(current.interactions.map((i) => [i.id, i]))
  const targetInteractionById = new Map(target.interactions.map((i) => [i.id, i]))

  const entries: DiffEntry[] = []

  for (const [id, status] of diff.actors) {
    const before = currentActorById.get(id)
    const after = targetActorById.get(id)
    const item = after ?? before!
    const label = before && after && before.name !== after.name ? `${before.name} → ${after.name}` : item.name
    entries.push({ kind: 'actor', status, id, label, changedFields: before && after ? actorChangedFields(before, after) : undefined })
  }

  for (const [id, status] of diff.phases) {
    const before = currentPhaseById.get(id)
    const after = targetPhaseById.get(id)
    const item = after ?? before!
    const label = before && after && before.name !== after.name ? `${before.name} → ${after.name}` : item.name
    entries.push({ kind: 'phase', status, id, label, changedFields: before && after ? phaseChangedFields(before, after) : undefined })
  }

  for (const [id, status] of diff.activities) {
    const before = currentActivityById.get(id)
    const after = targetActivityById.get(id)
    const item = after ?? before!
    const label = before && after && before.name !== after.name ? `${before.name} → ${after.name}` : item.name
    const actorName = actorNameById.get(item.actorId) ?? '?'
    const phaseName = phaseNameById.get(item.phaseId) ?? '?'
    entries.push({
      kind: 'activity',
      status,
      id,
      label,
      subtitle: `${actorName} · ${phaseName}`,
      changedFields: before && after ? activityChangedFields(before, after) : undefined,
    })
  }

  for (const [id, status] of diff.interactions) {
    const before = currentInteractionById.get(id)
    const after = targetInteractionById.get(id)
    const item = after ?? before!
    const fromName = activityNameById.get(item.fromActivityId) ?? '?'
    const toName = activityNameById.get(item.toActivityId) ?? '?'
    entries.push({
      kind: 'interaction',
      status,
      id,
      label: item.information || '(sans libellé)',
      subtitle: `${fromName} → ${toName}`,
      changedFields: before && after ? interactionChangedFields(before, after) : undefined,
    })
  }

  return sortEntries(entries)
}
