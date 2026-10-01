import type {
  Activity,
  DraftPainPointDiagramChange,
  Interaction,
  PainPointChangeType,
  PainPointResolution,
  Project,
  ProjectVariant,
  Specification,
  TestScenario,
} from '../../api/types'

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

// Dupliqués depuis mergeTestScenarioDrafts.ts (même convention que newId
// ci-dessus) plutôt que partagés : la numérotation ne dépend que des
// specs/tests déjà présents dans LE PRODUIT passé en paramètre, pas d'un
// état partagé entre les flux de génération.
function nextSssCode(existing: Specification[]) {
  const count = existing.filter((s) => s.code.startsWith('SSS-')).length
  return `SSS-${String(count + 1).padStart(3, '0')}`
}

function nextTestCode(existing: TestScenario[]) {
  const count = existing.filter((t) => t.code.startsWith('TC-')).length
  return `TC-${String(count + 1).padStart(3, '0')}`
}

interface VariantCollections {
  actors: ProjectVariant['actors']
  phases: ProjectVariant['phases']
  activities: Activity[]
  interactions: Interaction[]
}

function pickCollections(x: VariantCollections): VariantCollections {
  return { actors: x.actors, phases: x.phases, activities: x.activities, interactions: x.interactions }
}

// Insensible à la casse/aux accents/aux espaces de bord : le LLM reprend
// en général le nom exact fourni en contexte, mais pas toujours au
// caractère près (majuscule différente, accent oublié...) — une
// comparaison stricte (===) faisait alors échouer toute la mise en
// correspondance pour une différence purement cosmétique, alors que le
// texte réellement produit par un modèle en usage réel s'est avéré
// souvent proche mais pas identique.
function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritiques combinants (accents), une fois décomposés par NFD
    .trim()
    .toLowerCase()
}

function findByNormalizedName<T>(items: T[], name: string | undefined, getName: (item: T) => string): T | undefined {
  if (!name?.trim()) return undefined
  const target = normalizeName(name)
  return items.find((item) => normalizeName(getName(item)) === target)
}

// Résolution par NOM uniquement (jamais par ID) : le LLM ne connaît que
// les noms déjà présents dans le contexte envoyé (voir PainPointContext,
// PainPointSolutionsModal.buildContext) — cohérent avec le reste de
// l'app (mergeDraft.ts, mergeSpecDraftsAcrossMissions.ts...). Meilleur
// effort : un nom qui ne correspond à rien renvoie undefined plutôt que
// de faire échouer toute l'opération, voir applyDiagramChange.
function findActivityByName(activities: Activity[], name: string | undefined): Activity | undefined {
  return findByNormalizedName(activities, name, (a) => a.name)
}

// Applique à une cible (collections d'activités/interactions/phases) le
// changement structurel décrit par le LLM pour la solution CHOISIE — par
// correspondance de noms au sein de CETTE cible (jamais l'état actuel).
// Dégrade proprement (applied: false, cible inchangée) si les noms
// fournis ne correspondent à rien : la SSS/le test, créés séparément
// (voir applyPainPointResolution), restent de toute façon acquis même
// dans ce cas.
function applyDiagramChange(
  collections: VariantCollections,
  sourceActivity: Activity,
  changeType: PainPointChangeType,
  change: DraftPainPointDiagramChange,
): { collections: VariantCollections; applied: boolean } {
  const { actors, phases, activities, interactions } = collections

  switch (changeType) {
    case 'add_activity': {
      if (!change.newActivityName) return { collections, applied: false }
      const actor =
        findByNormalizedName(actors, change.newActivityActorName, (a) => a.name) ??
        actors.find((a) => a.id === sourceActivity.actorId)
      const phase =
        findByNormalizedName(phases, change.newActivityPhaseName, (p) => p.name) ??
        phases.find((p) => p.id === sourceActivity.phaseId)
      if (!actor || !phase) return { collections, applied: false }
      const maxOrder = activities.filter((a) => a.phaseId === phase.id).reduce((m, a) => Math.max(m, a.order), -1)
      const created: Activity = {
        id: newId('act'),
        name: change.newActivityName,
        actorId: actor.id,
        phaseId: phase.id,
        order: maxOrder + 1,
        column: 0,
        subRow: 0,
        offsetX: 0,
        offsetY: 0,
        description: change.newActivityDescription || '',
        userStories: [],
        traceLinks: [],
        painPoints: [],
        kpiLinks: [],
      }
      return { collections: { ...collections, activities: [...activities, created] }, applied: true }
    }

    case 'remove_activity': {
      const removed = findActivityByName(activities, change.removeActivityName) ?? sourceActivity
      if (!activities.some((a) => a.id === removed.id)) return { collections, applied: false }
      return {
        collections: {
          ...collections,
          activities: activities.filter((a) => a.id !== removed.id),
          interactions: interactions.filter((i) => i.fromActivityId !== removed.id && i.toActivityId !== removed.id),
        },
        applied: true,
      }
    }

    case 'merge_activities': {
      const matched = (change.mergeActivityNames ?? [])
        .map((n) => findActivityByName(activities, n))
        .filter((a): a is Activity => Boolean(a))
      const unique = [...new Map(matched.map((a) => [a.id, a])).values()]
      if (unique.length < 2) return { collections, applied: false }
      const mergedId = newId('act')
      const merged: Activity = {
        ...unique[0],
        id: mergedId,
        name: change.mergedActivityName || unique[0].name,
        description: unique.map((a) => a.description).filter(Boolean).join(' / '),
        order: Math.min(...unique.map((a) => a.order)),
        userStories: unique.flatMap((a) => a.userStories),
        traceLinks: [...new Set(unique.flatMap((a) => a.traceLinks))],
        painPoints: unique.flatMap((a) => a.painPoints),
      }
      const removedIds = new Set(unique.map((a) => a.id))
      const nextActivities = [merged, ...activities.filter((a) => !removedIds.has(a.id))]
      const nextInteractions = interactions
        .map((i) => ({
          ...i,
          fromActivityId: removedIds.has(i.fromActivityId) ? mergedId : i.fromActivityId,
          toActivityId: removedIds.has(i.toActivityId) ? mergedId : i.toActivityId,
        }))
        // Deux activités fusionnées qui échangeaient directement entre
        // elles produiraient sinon une interaction en boucle sur
        // l'activité résultante — sans valeur une fois fusionnées.
        .filter((i) => i.fromActivityId !== i.toActivityId)
      return { collections: { ...collections, activities: nextActivities, interactions: nextInteractions }, applied: true }
    }

    case 'add_interaction': {
      const from = findActivityByName(activities, change.interactionFromActivityName)
      const to = findActivityByName(activities, change.interactionToActivityName)
      if (!from || !to) return { collections, applied: false }
      const created: Interaction = {
        id: newId('int'),
        fromActivityId: from.id,
        toActivityId: to.id,
        information: change.interactionInformation || '',
      }
      return { collections: { ...collections, interactions: [...interactions, created] }, applied: true }
    }

    case 'remove_interaction': {
      const from = findActivityByName(activities, change.removeInteractionFromActivityName)
      const to = findActivityByName(activities, change.removeInteractionToActivityName)
      if (!from || !to) return { collections, applied: false }
      const idx = interactions.findIndex((i) => i.fromActivityId === from.id && i.toActivityId === to.id)
      if (idx === -1) return { collections, applied: false }
      return { collections: { ...collections, interactions: interactions.filter((_, i) => i !== idx) }, applied: true }
    }

    default:
      return { collections, applied: false }
  }
}

export interface PainPointResolutionOutcome {
  project: Project
  // Spécification/scénario de test créés pour cette résolution — à ajouter
  // par l'appelant aux collections du PRODUIT (plus de Project.
  // specifications/testScenarios, voir api/types.ts) : cette fonction ne
  // touche jamais le produit elle-même, seulement la mission.
  spec: Specification
  test: TestScenario
  // false si le changement structurel n'a pas pu être déterminé/appliqué
  // (noms non trouvés dans la cible) — la SSS/le test sont eux toujours
  // créés, indépendamment de cette valeur.
  diagramChangeApplied: boolean
}

// Applique la résolution complète d'un point de friction (ADR-066bis,
// révisé lors du déplacement des specs/tests vers le produit) : la SSS/le
// test créés (à charge de l'appelant de les ajouter au produit, voir
// PainPointSolutionsModal.tsx) ET le bookkeeping (PainPoint.
// resolvedBySpecId, Activity.traceLinks) portent désormais TOUJOURS sur la
// CIBLE de la mission — jamais sur l'état Actuel, qui ne participe plus à
// la traçabilité (un produit vise l'état futur du processus) — créée à la
// volée (copie de l'état actuel) si c'est la première fois. `sourceActivity`
// est l'activité porteuse du point de friction telle qu'affichée (Actuel
// ou Cible selon la vue active) ; `isTargetActive` indique si elle se
// trouve déjà dans la cible (pas de recherche par nom nécessaire) — voir
// activeVariant.ts côté appelant.
export function applyPainPointResolution(
  project: Project,
  sourceActivity: Activity,
  painPointId: string,
  productSpecifications: Specification[],
  productTestScenarios: TestScenario[],
  resolution: PainPointResolution,
  changeType: PainPointChangeType,
  isTargetActive: boolean,
): PainPointResolutionOutcome {
  const spec: Specification = {
    id: newId('spec'),
    code: nextSssCode(productSpecifications),
    type: 'StakeholderNeed',
    text: resolution.specificationText,
    rationale: resolution.specificationRationale,
    status: 'draft',
    priority: 'must',
  }
  const test: TestScenario = {
    id: newId('test'),
    code: nextTestCode(productTestScenarios),
    title: resolution.testTitle,
    specificationId: spec.id,
    preconditions: resolution.testPreconditions,
    steps: resolution.testSteps.map((s) => ({ action: s.action, expectedResult: s.expectedResult })),
    status: 'draft',
  }

  const targetBase: ProjectVariant = project.target ?? {
    label: 'Cible',
    ...pickCollections(project),
  }
  // Retrouve l'activité porteuse du point de friction AU SEIN de la
  // cible : directement par id si la vue affichée EST déjà la cible, par
  // id puis par nom sinon (cible existante ayant depuis divergé, ids
  // propres) — repli sur l'activité affichée en dernier recours (place le
  // nouveau contenu par défaut).
  const targetSourceActivity =
    targetBase.activities.find((a) => a.id === sourceActivity.id) ??
    (isTargetActive ? undefined : findActivityByName(targetBase.activities, sourceActivity.name)) ??
    sourceActivity

  const bookkeptActivities = targetBase.activities.map((a) =>
    a.id === targetSourceActivity.id
      ? {
          ...a,
          traceLinks: [...a.traceLinks, spec.id],
          painPoints: a.painPoints.map((p) => (p.id === painPointId ? { ...p, resolvedBySpecId: spec.id } : p)),
        }
      : a,
  )
  const collectionsWithBookkeeping: VariantCollections = { ...pickCollections(targetBase), activities: bookkeptActivities }

  const { collections, applied } = applyDiagramChange(collectionsWithBookkeeping, targetSourceActivity, changeType, resolution.diagramChange)
  const target: ProjectVariant = { label: targetBase.label, ...collections }
  return { project: { ...project, target }, spec, test, diagramChangeApplied: applied }
}
