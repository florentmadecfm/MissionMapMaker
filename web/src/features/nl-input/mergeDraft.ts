import type { Activity, Actor, DraftProcess, Interaction, Phase, Project } from '../../api/types'

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

const ACTOR_COLORS = ['#2563eb', '#f97316', '#a855f7', '#dc2626', '#0ea5e9', '#16a34a', '#64748b']

// Fusionne une ébauche générée par LLM dans le projet actuellement ouvert :
// les acteurs/phases/activités déjà présents (par nom, insensible à la
// casse) ne sont pas dupliqués, seuls les éléments nouveaux sont ajoutés.
// Le résultat reste entièrement éditable/supprimable avant sauvegarde.
export function mergeDraft(project: Project, draft: DraftProcess): Project {
  const actors: Actor[] = [...project.actors]
  for (const da of draft.actors) {
    if (!actors.some((a) => sameName(a.name, da.name))) {
      actors.push({
        id: newId('act'),
        name: da.name,
        color: ACTOR_COLORS[actors.length % ACTOR_COLORS.length],
        description: da.description ?? '',
      })
    }
  }

  const phases: Phase[] = [...project.phases]
  for (const dp of draft.phases) {
    if (!phases.some((p) => sameName(p.name, dp.name))) {
      phases.push({ id: newId('ph'), name: dp.name, order: dp.order || phases.length + 1 })
    }
  }

  const findActorId = (name: string) => actors.find((a) => sameName(a.name, name))?.id
  const findPhaseId = (name: string) => phases.find((p) => sameName(p.name, name))?.id

  const activities: Activity[] = [...project.activities]
  for (const da of draft.activities) {
    if (activities.some((a) => sameName(a.name, da.name))) continue
    const actorId = findActorId(da.actorName)
    const phaseId = findPhaseId(da.phaseName)
    if (!actorId || !phaseId) continue // acteur/phase non résolu : activité ignorée, à ajouter manuellement
    activities.push({
      id: newId('a'),
      name: da.name,
      actorId,
      phaseId,
      order: activities.length + 1,
      column: 0,
      description: da.description ?? '',
      sourceText: da.name,
      userStories: [],
      traceLinks: [],
    })
  }

  const findActivityId = (name: string) => activities.find((a) => sameName(a.name, name))?.id

  const interactions: Interaction[] = [...project.interactions]
  for (const di of draft.interactions) {
    const fromId = findActivityId(di.fromActivityName)
    const toId = findActivityId(di.toActivityName)
    if (!fromId || !toId) continue
    if (interactions.some((i) => i.fromActivityId === fromId && i.toActivityId === toId && sameName(i.information, di.information))) {
      continue
    }
    interactions.push({ id: newId('int'), fromActivityId: fromId, toActivityId: toId, information: di.information })
  }

  return { ...project, actors, phases, activities, interactions }
}
