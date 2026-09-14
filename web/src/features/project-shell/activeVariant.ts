import type { Project, ProjectVariant } from '../../api/types'

// Quel état du diagramme d'une mission est actuellement affiché/édité —
// 'current' (les 6 collections au premier niveau de Project, comme avant)
// ou 'target' (Project.target, la cible, absente tant qu'elle n'a pas été
// créée). Remplace l'ancien système où une cible était un second PROJET
// séparé lié par un groupe de variantes : elle reste maintenant partie de
// la même mission, jamais une entrée à part dans le panneau de gauche.
export type ActiveVariant = 'current' | 'target'

const VARIANT_COLLECTIONS = [
  'actors',
  'phases',
  'activities',
  'interactions',
  'specifications',
  'testScenarios',
] as const

type VariantCollections = Pick<Project, (typeof VARIANT_COLLECTIONS)[number]>

// Projette le projet réel vers l'objet Project "de travail" que
// consomment tous les onglets d'édition (Édition, Diagramme,
// Spécifications, Vue par acteur, Générer) — inchangés : ils continuent à
// lire/écrire actors/phases/.../testScenarios au premier niveau, sans
// jamais savoir s'ils éditent l'état actuel ou la cible. Pour 'current',
// le projet réel a déjà exactement cette forme (identité). Pour 'target',
// les 6 collections de la cible sont recopiées au premier niveau — le
// champ `target` original reste néanmoins présent (via le spread), pour
// que la résolution de point de friction (qui doit toujours pouvoir
// atteindre/créer la cible, même depuis la vue Actuel) le retrouve sans
// prop dédiée.
export function toWorkingProject(project: Project, active: ActiveVariant): Project {
  if (active === 'current' || !project.target) return project
  const t = project.target
  return { ...project, actors: t.actors, phases: t.phases, activities: t.activities, interactions: t.interactions, specifications: t.specifications, testScenarios: t.testScenarios }
}

// Opération inverse : reporte un projet "de travail" modifié par un onglet
// (onChange) dans le vrai projet — en 'current', le projet de travail a
// déjà la bonne forme (y compris un `target` à jour, voir toWorkingProject
// ci-dessus) et peut être renvoyé tel quel. En 'target', ses 6 collections
// de premier niveau sont réinjectées dans `target` (label conservé),
// sans toucher à l'état actuel du vrai projet.
export function fromWorkingProject(original: Project, working: Project, active: ActiveVariant): Project {
  if (active === 'current') return working
  const variant: ProjectVariant = {
    label: original.target?.label || 'Cible',
    actors: working.actors,
    phases: working.phases,
    activities: working.activities,
    interactions: working.interactions,
    specifications: working.specifications,
    testScenarios: working.testScenarios,
  }
  return { ...original, target: variant }
}

// Crée la cible d'une mission comme copie indépendante complète de l'état
// actuel (ADR-062bis, décision utilisateur) — jamais un second projet.
export function createTargetFromCurrent(project: Project): Project {
  const variant: ProjectVariant = {
    label: 'Cible',
    actors: project.actors,
    phases: project.phases,
    activities: project.activities,
    interactions: project.interactions,
    specifications: project.specifications,
    testScenarios: project.testScenarios,
  }
  return { ...project, target: variant }
}

export function pickVariantCollections(project: VariantCollections): VariantCollections {
  const result = {} as VariantCollections
  for (const key of VARIANT_COLLECTIONS) {
    ;(result as Record<string, unknown>)[key] = project[key]
  }
  return result
}
