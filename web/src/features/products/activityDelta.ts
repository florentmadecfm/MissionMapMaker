import type { ActivityRow } from './mergeSpecDraftsAcrossMissions'
import type { Project } from '../../api/types'

// Calcule le DELTA d'activités entre missions rattachées à un même
// produit — demande explicite : à la liaison d'une mission, n'analyser
// que ce qu'elle apporte de réellement NOUVEAU (pas déjà couvert par les
// autres missions déjà liées) ; à la déliaison, repérer ce qu'elle
// apportait et qui n'est plus couvert par aucune mission restante.
//
// Identité d'une activité COMPARABLE ENTRE missions : le triplet (nom
// d'acteur, nom de phase, nom de l'activité), jamais un id — les id sont
// propres à chaque mission (deux missions qui modélisent la même
// activité créent chacune leur propre Actor/Phase/Activity). Le nom de
// l'activité participe à l'identité (pas seulement acteur + phase) :
// deux activités distinctes d'un même acteur dans une même phase (ex.
// "Choisir les plats" et "Payer l'addition", toutes deux Client/Commande)
// sont deux besoins différents, jamais la même activité "dupliquée".
// Comparaison insensible à la casse/aux espaces, même convention que
// `sameName`/`sameText` dans mergeSpecDraftsAcrossMissions.ts.

export interface ActivityRowWithPhase extends Pick<ActivityRow, 'missionId' | 'missionName' | 'actorName' | 'activity'> {
  phaseName: string
}

function normalize(s: string): string {
  return s.trim().toLowerCase()
}

export function activityIdentityKey(row: Pick<ActivityRowWithPhase, 'actorName' | 'phaseName' | 'activity'>): string {
  return `${normalize(row.actorName)}\u0000${normalize(row.phaseName)}\u0000${normalize(row.activity.name)}`
}

// Résout le nom de la phase d'une activité à partir du Project qui la
// porte — les ActivityRow existants (mergeSpecDraftsAcrossMissions.ts) ne
// portent pas ce champ (jamais nécessaire avant ce calcul de delta), donc
// résolu ici plutôt que d'alourdir ce type partagé pour ce seul usage.
export function phaseNameOf(project: Project, activity: { phaseId: string }): string {
  return project.target?.phases.find((p) => p.id === activity.phaseId)?.name ?? ''
}

// Toutes les activités CIBLE de `project`, avec le nom de leur acteur et
// de leur phase déjà résolus — un projet sans Cible (target absent)
// n'apporte aucune activité, seule la Cible participe à la traçabilité
// d'un produit (même règle que ProductSpecVVPanel.activityRows).
export function targetActivityRows(project: Project): ActivityRowWithPhase[] {
  if (!project.target) return []
  const { actors, phases, activities } = project.target
  return activities.map((activity) => ({
    missionId: project.id,
    missionName: project.name,
    actorName: actors.find((a) => a.id === activity.actorId)?.name ?? '',
    phaseName: phases.find((p) => p.id === activity.phaseId)?.name ?? '',
    activity,
  }))
}

// Lignes de `rows` dont AUCUNE ligne de `otherRows` ne partage l'identité
// (acteur + phase + nom d'activité) — le delta utilisé à la fois pour
// "quoi analyser" (une mission vient d'être liée : ce qu'elle apporte de
// réellement nouveau par rapport aux autres missions déjà liées) et pour
// "quoi réexaminer" (une mission vient d'être déliée : ce qu'elle
// apportait et qui n'est plus couvert par les missions restantes) —
// symétrique par construction, les deux bandeaux de ProductSpecVVPanel.tsx
// appellent cette même fonction avec des arguments inversés.
export function rowsNotIn<T extends Pick<ActivityRowWithPhase, 'actorName' | 'phaseName' | 'activity'>>(
  rows: T[],
  otherRows: Pick<ActivityRowWithPhase, 'actorName' | 'phaseName' | 'activity'>[],
): T[] {
  const otherKeys = new Set(otherRows.map(activityIdentityKey))
  return rows.filter((r) => !otherKeys.has(activityIdentityKey(r)))
}

// Formate une courte liste lisible d'activités (pour un texte de bandeau)
// — plafonnée à 3 entrées nommées, le reste résumé par un compte, plutôt
// qu'une liste qui pourrait devenir trop longue pour une mission apportant
// beaucoup d'activités d'un coup.
export function formatActivityList(rows: Pick<ActivityRowWithPhase, 'actorName' | 'phaseName' | 'activity'>[]): string {
  const shown = rows.slice(0, 3).map((r) => `« ${r.activity.name} » (${r.actorName}, ${r.phaseName})`)
  const rest = rows.length - shown.length
  if (rest <= 0) return shown.join(', ')
  return `${shown.join(', ')} et ${rest} autre${rest > 1 ? 's' : ''}`
}
