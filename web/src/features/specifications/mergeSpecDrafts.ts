import type { DraftSpecification, Project, Specification } from '../../api/types'

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

// `existing` inclut déjà les specs ajoutées lors des itérations précédentes
// de la boucle de fusion (mutée en place via push) : pas besoin d'offset.
function nextSssCode(existing: Specification[]) {
  const count = existing.filter((s) => s.code.startsWith('SSS-')).length
  return `SSS-${String(count + 1).padStart(3, '0')}`
}

export interface MergeSpecResult {
  project: Project
  addedCount: number
  unmatchedActivities: string[]
}

// Fusionne les besoins partie prenante (SSS) proposés par le LLM pour
// chaque activité : une spécification StakeholderNeed est créée par
// proposition (sauf doublon exact déjà lié à la même activité), reliée à
// l'activité correspondante via traceLinks. Les propositions dont
// l'activité/l'acteur ne correspond à rien dans le projet ouvert sont
// ignorées et remontées dans unmatchedActivities.
export function mergeSpecDrafts(project: Project, drafts: DraftSpecification[]): MergeSpecResult {
  const specifications: Specification[] = [...project.specifications]
  const activities = project.activities.map((a) => ({ ...a, traceLinks: [...a.traceLinks] }))
  const unmatchedActivities: string[] = []
  let addedCount = 0

  for (const draft of drafts) {
    const activity = activities.find(
      (a) => sameName(a.name, draft.activityName) && sameName(project.actors.find((x) => x.id === a.actorId)?.name ?? '', draft.actorName),
    )
    if (!activity) {
      unmatchedActivities.push(`${draft.activityName} (${draft.actorName})`)
      continue
    }

    const alreadyLinked = activity.traceLinks
      .map((id) => specifications.find((s) => s.id === id))
      .some((s) => s && sameText(s.text, draft.text))
    if (alreadyLinked) continue

    const spec: Specification = {
      id: newId('spec'),
      code: nextSssCode(specifications),
      type: 'StakeholderNeed',
      text: draft.text,
      rationale: draft.rationale,
      status: 'draft',
      priority: 'must',
    }
    specifications.push(spec)
    addedCount++
    activity.traceLinks.push(spec.id)
  }

  return {
    project: { ...project, specifications, activities },
    addedCount,
    unmatchedActivities,
  }
}
