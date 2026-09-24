import type { Activity, Actor, DraftProcess, Interaction, Phase, Project } from '../../api/types'

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

const ACTOR_COLORS = ['#2563eb', '#f97316', '#a855f7', '#dc2626', '#0ea5e9', '#16a34a', '#64748b']

// Résultat de mergeDraft : le projet fusionné, et `changed` qui indique si
// l'ébauche a réellement eu un effet visible — au moins un ajout ou une
// modification a été appliqué, distinct d'une ébauche vide ou dont aucun
// élément n'a pu être résolu (noms d'acteur/phase/activité qui ne
// correspondent à rien dans le projet). Sans ce signal, une demande de
// mise à jour qui n'aboutit à rien (LLM qui juge qu'il n'y a rien à
// ajouter, ou noms non reconnus) se referme silencieusement, indiscernable
// pour l'utilisateur d'un vrai bug — voir generateUpdate.ts/ProcessDiagram.tsx.
export interface MergeResult {
  project: Project
  changed: boolean
}

// Fusionne une ébauche générée par LLM dans le projet actuellement ouvert :
// les acteurs/phases/activités déjà présents (par nom, insensible à la
// casse) ne sont pas dupliqués, seuls les éléments nouveaux sont ajoutés.
// Le résultat reste entièrement éditable/supprimable avant sauvegarde.
export function mergeDraft(project: Project, draft: DraftProcess): MergeResult {
  let changed = false
  const actors: Actor[] = [...project.actors]
  for (const da of draft.actors) {
    if (!actors.some((a) => sameName(a.name, da.name))) {
      changed = true
      actors.push({
        id: newId('act'),
        name: da.name,
        color: ACTOR_COLORS[actors.length % ACTOR_COLORS.length],
        description: da.description ?? '',
        subLanes: 0,
        about: '',
        bio: '',
        goals: [],
        painPoints: [],
      })
    }
  }

  const phases: Phase[] = [...project.phases]
  for (const dp of draft.phases) {
    if (!phases.some((p) => sameName(p.name, dp.name))) {
      changed = true
      phases.push({
        id: newId('ph'),
        name: dp.name,
        order: dp.order || phases.length + 1,
        subColumns: 0,
        icon: dp.icon ?? '',
        kpiLinks: [],
      })
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
    changed = true
    activities.push({
      id: newId('a'),
      name: da.name,
      actorId,
      phaseId,
      order: activities.length + 1,
      column: 0,
      subRow: 0,
      offsetX: 0,
      offsetY: 0,
      description: da.description ?? '',
      sourceText: da.name,
      userStories: [],
      traceLinks: [],
      painPoints: [],
      kpiLinks: [],
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
    const newName = change.newName?.trim() || current.name
    const newDescription = change.newDescription?.trim() || current.description
    if (newName !== current.name || newDescription !== current.description || newActorId !== current.actorId || newPhaseId !== current.phaseId) {
      changed = true
    }
    activities[idx] = {
      ...current,
      name: newName,
      description: newDescription,
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
    changed = true
    interactions.push({
      id: newId('int'),
      fromActivityId: fromId,
      toActivityId: toId,
      information: di.information,
      condition: di.condition || undefined,
      physicalEvidence: di.physicalEvidence || undefined,
    })
  }

  return { project: { ...project, actors, phases, activities, interactions }, changed }
}
