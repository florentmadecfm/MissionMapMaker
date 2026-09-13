import type { PainPointResolution, Project, Specification, TestScenario } from '../../api/types'

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

// Dupliqués depuis mergeSpecDrafts.ts/mergeTestScenarioDrafts.ts (même
// convention que newId ci-dessus, déjà répétée telle quelle dans chaque
// fichier de fusion de ce dossier) plutôt que partagés : la numérotation
// ne dépend que des specs/tests déjà présents dans LE projet passé en
// paramètre, pas d'un état partagé entre les 3 flux de génération.
function nextSssCode(existing: Specification[]) {
  const count = existing.filter((s) => s.code.startsWith('SSS-')).length
  return `SSS-${String(count + 1).padStart(3, '0')}`
}

function nextTestCode(existing: TestScenario[]) {
  const count = existing.filter((t) => t.code.startsWith('TC-')).length
  return `TC-${String(count + 1).padStart(3, '0')}`
}

// Convertit la SSS + le scénario de test générés pour la solution choisie
// d'un point de friction (ADR-066) en une vraie Specification + un vrai
// TestScenario ajoutés au projet — reliés à l'activité porteuse du point
// de friction (traceLinks, comme toute autre SSS) et au point de friction
// lui-même (PainPoint.resolvedBySpecId), qui n'est alors plus proposé en
// résolution (voir ActivityDetailModal.tsx).
export function mergePainPointResolution(
  project: Project,
  activityId: string,
  painPointId: string,
  resolution: PainPointResolution,
): Project {
  const spec: Specification = {
    id: newId('spec'),
    code: nextSssCode(project.specifications),
    type: 'StakeholderNeed',
    text: resolution.specificationText,
    rationale: resolution.specificationRationale,
    status: 'draft',
    priority: 'must',
  }
  const test: TestScenario = {
    id: newId('test'),
    code: nextTestCode(project.testScenarios),
    title: resolution.testTitle,
    specificationId: spec.id,
    preconditions: resolution.testPreconditions,
    steps: resolution.testSteps.map((s) => ({ action: s.action, expectedResult: s.expectedResult })),
    status: 'draft',
  }

  return {
    ...project,
    specifications: [...project.specifications, spec],
    testScenarios: [...project.testScenarios, test],
    activities: project.activities.map((a) => {
      if (a.id !== activityId) return a
      return {
        ...a,
        traceLinks: [...a.traceLinks, spec.id],
        painPoints: a.painPoints.map((p) => (p.id === painPointId ? { ...p, resolvedBySpecId: spec.id } : p)),
      }
    }),
  }
}
