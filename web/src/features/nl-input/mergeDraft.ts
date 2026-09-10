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
        subLanes: 0,
      })
    }
  }

  const phases: Phase[] = [...project.phases]
  for (const dp of draft.phases) {
    if (!phases.some((p) => sameName(p.name, dp.name))) {
      phases.push({ id: newId('ph'), name: dp.name, order: dp.order || phases.length + 1, subColumns: 0 })
    }
  }

  const findActorId = (name: string) => actors.find((a) => sameName(a.name, name))?.id
  const findPhaseId = (name: string) => phases.find((p) => sameName(p.name, name))?.id

  // Deux acteurs différents peuvent avoir une activité de même nom (ex.
  // "Payer" côté client et côté serveur) : dédoublonnage et résolution
  // toujours par la paire (nom, acteur), jamais par le nom seul, sinon on
  // perdrait l'une des deux activités ou on relierait une interaction à
  // la mauvaise.
  const activities: Activity[] = [...project.activities]
  for (const da of draft.activities) {
    const actorId = findActorId(da.actorName)
    const phaseId = findPhaseId(da.phaseName)
    if (!actorId || !phaseId) continue // acteur/phase non résolu : activité ignorée, à ajouter manuellement
    if (activities.some((a) => sameName(a.name, da.name) && a.actorId === actorId)) continue
    activities.push({
      id: newId('a'),
      name: da.name,
      actorId,
      phaseId,
      order: activities.length + 1,
      column: 0,
      subRow: 0,
      description: da.description ?? '',
      sourceText: da.name,
      userStories: [],
      traceLinks: [],
    })
  }

  // Applique les modifications d'activités déjà existantes (renommage,
  // nouvelle description, réaffectation acteur/phase) décrites par
  // draft.activityChanges — jamais de suppression, et seulement si
  // l'activité ciblée (nom, acteur ACTUELS) est retrouvée telle quelle
  // dans le projet : une cible non résolue est ignorée plutôt que de
  // risquer de modifier la mauvaise activité. Appliqué avant la
  // résolution des interactions ci-dessous pour que celles-ci puissent
  // référencer le nom déjà à jour d'une activité renommée dans la même
  // réponse.
  for (const change of draft.activityChanges ?? []) {
    const targetActorId = findActorId(change.actorName)
    const idx = activities.findIndex(
      (a) => sameName(a.name, change.activityName) && (!targetActorId || a.actorId === targetActorId),
    )
    if (idx === -1) continue
    const current = activities[idx]
    const newActorId = change.newActorName ? findActorId(change.newActorName) ?? current.actorId : current.actorId
    const newPhaseId = change.newPhaseName ? findPhaseId(change.newPhaseName) ?? current.phaseId : current.phaseId
    activities[idx] = {
      ...current,
      name: change.newName?.trim() || current.name,
      description: change.newDescription?.trim() || current.description,
      actorId: newActorId,
      phaseId: newPhaseId,
    }
  }

  // Résout une activité par (nom, acteur) — mais tolère un nom d'acteur
  // vide ou non reconnu plutôt que d'exiger une correspondance stricte :
  // un LLM chargé de décrire UNIQUEMENT une nouvelle interaction entre
  // deux activités déjà existantes (aucun changement d'activité/acteur/
  // phase) omet parfois fromActorName/toActorName, jugés redondants une
  // fois l'activité déjà nommée sans ambiguïté — avant, cela faisait
  // échouer silencieusement toute la résolution (aucun acteur n'a un id
  // `undefined`), donc l'interaction entière disparaissait sans retour.
  // Symétrique de la tolérance déjà en place pour activityChanges
  // ci-dessus (`!targetActorId || ...`).
  const findActivityId = (name: string, actorName: string) => {
    const actorId = findActorId(actorName)
    return activities.find((a) => sameName(a.name, name) && (!actorId || a.actorId === actorId))?.id
  }

  const interactions: Interaction[] = [...project.interactions]
  for (const di of draft.interactions) {
    const fromId = findActivityId(di.fromActivityName, di.fromActorName)
    const toId = findActivityId(di.toActivityName, di.toActorName)
    if (!fromId || !toId) continue
    if (interactions.some((i) => i.fromActivityId === fromId && i.toActivityId === toId && sameName(i.information, di.information))) {
      continue
    }
    interactions.push({ id: newId('int'), fromActivityId: fromId, toActivityId: toId, information: di.information })
  }

  return { ...project, actors, phases, activities, interactions }
}
