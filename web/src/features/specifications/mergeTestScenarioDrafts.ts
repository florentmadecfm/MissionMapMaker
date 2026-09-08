import type { DraftTestScenario, Project, TestScenario } from '../../api/types'

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

const sameCode = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

// `existing` inclut déjà les scénarios ajoutés lors des itérations
// précédentes de la boucle de fusion (mutée en place via push) : pas
// besoin d'offset.
function nextTestCode(existing: TestScenario[]) {
  const count = existing.filter((t) => t.code.startsWith('TC-')).length
  return `TC-${String(count + 1).padStart(3, '0')}`
}

export interface MergeTestScenarioResult {
  project: Project
  addedCount: number
  unmatchedSpecifications: string[]
}

// Fusionne les scénarios de test V&V proposés par le LLM pour chaque
// spécification (identifiée par son code, ex. "SSS-001") : un
// TestScenario est créé par proposition (sauf doublon exact déjà lié à la
// même spécification), relié via specificationId. Les propositions dont
// le code ne correspond à aucune spécification du projet ouvert sont
// ignorées et remontées dans unmatchedSpecifications.
export function mergeTestScenarioDrafts(project: Project, drafts: DraftTestScenario[]): MergeTestScenarioResult {
  const testScenarios: TestScenario[] = [...project.testScenarios]
  const unmatchedSpecifications: string[] = []
  let addedCount = 0

  for (const draft of drafts) {
    const specification = project.specifications.find((s) => sameCode(s.code, draft.specificationCode))
    if (!specification) {
      unmatchedSpecifications.push(draft.specificationCode)
      continue
    }

    const alreadyLinked = testScenarios.some(
      (t) => t.specificationId === specification.id && sameTitle(t.title, draft.title),
    )
    if (alreadyLinked) continue

    const scenario: TestScenario = {
      id: newId('test'),
      code: nextTestCode(testScenarios),
      title: draft.title,
      specificationId: specification.id,
      preconditions: draft.preconditions,
      steps: draft.steps.map((s) => ({ action: s.action, expectedResult: s.expectedResult })),
      status: 'draft',
    }
    testScenarios.push(scenario)
    addedCount++
  }

  return {
    project: { ...project, testScenarios },
    addedCount,
    unmatchedSpecifications,
  }
}
