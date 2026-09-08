import { useState } from 'react'
import { api } from '../../api/client'
import type { Project, TestScenario, TestStep } from '../../api/types'
import { mergeTestScenarioDrafts } from './mergeTestScenarioDrafts'

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

interface Props {
  project: Project
  onChange: (project: Project) => void
}

// Sous-onglet "Tests V&V" de l'onglet Spécifications : scénarios de test
// de vérification/validation, au format V&V générique inspiré de
// Polarion (titre, préconditions, étapes numérotées action / résultat
// attendu), chacun lié à la spécification (typiquement une SSS) qu'il
// vérifie. Un scénario peut être proposé par le LLM (à la génération des
// SSS, voir SpecificationsPanel.handleGenerateSss, ou ici à la demande
// pour des SSS existantes) ou saisi à la main.
export function TestScenariosPanel({ project, onChange }: Props) {
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [generateNotConfigured, setGenerateNotConfigured] = useState(false)
  const [generateInfo, setGenerateInfo] = useState<string | null>(null)

  const sssSpecs = project.specifications.filter((s) => s.type === 'StakeholderNeed')
  const specsWithoutTest = sssSpecs.filter((s) => !project.testScenarios.some((t) => t.specificationId === s.id))

  async function handleGenerateTests() {
    if (specsWithoutTest.length === 0) return
    setGenerating(true)
    setGenerateError(null)
    setGenerateNotConfigured(false)
    setGenerateInfo(null)
    try {
      const specRefs = specsWithoutTest.map((s) => ({ code: s.code, text: s.text }))
      const drafts = await api.generateTestScenarios(specRefs)
      const result = mergeTestScenarioDrafts(project, drafts)
      onChange(result.project)
      const parts = [`${result.addedCount} scénario${result.addedCount > 1 ? 's' : ''} de test proposé${result.addedCount > 1 ? 's' : ''}`]
      if (result.unmatchedSpecifications.length > 0) {
        parts.push(`${result.unmatchedSpecifications.length} spécification(s) non reconnue(s) : ${result.unmatchedSpecifications.join(', ')}`)
      }
      setGenerateInfo(parts.join(' — '))
    } catch (e) {
      const message = String(e)
      if (message.includes('clé API non configurée')) {
        setGenerateNotConfigured(true)
      } else {
        setGenerateError(message)
      }
    } finally {
      setGenerating(false)
    }
  }

  function addScenario() {
    if (sssSpecs.length === 0) return
    const scenario: TestScenario = {
      id: newId('test'),
      code: `TC-${String(project.testScenarios.length + 1).padStart(3, '0')}`,
      title: 'Nouveau scénario de test',
      specificationId: sssSpecs[0].id,
      steps: [{ action: '', expectedResult: '' }],
      status: 'draft',
    }
    onChange({ ...project, testScenarios: [...project.testScenarios, scenario] })
  }

  function updateScenario(id: string, patch: Partial<TestScenario>) {
    onChange({
      ...project,
      testScenarios: project.testScenarios.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })
  }

  function removeScenario(id: string) {
    onChange({ ...project, testScenarios: project.testScenarios.filter((t) => t.id !== id) })
  }

  function updateStep(scenarioId: string, stepIndex: number, patch: Partial<TestStep>) {
    const scenario = project.testScenarios.find((t) => t.id === scenarioId)
    if (!scenario) return
    const steps = scenario.steps.map((s, i) => (i === stepIndex ? { ...s, ...patch } : s))
    updateScenario(scenarioId, { steps })
  }

  function addStep(scenarioId: string) {
    const scenario = project.testScenarios.find((t) => t.id === scenarioId)
    if (!scenario) return
    updateScenario(scenarioId, { steps: [...scenario.steps, { action: '', expectedResult: '' }] })
  }

  function removeStep(scenarioId: string, stepIndex: number) {
    const scenario = project.testScenarios.find((t) => t.id === scenarioId)
    if (!scenario) return
    updateScenario(scenarioId, { steps: scenario.steps.filter((_, i) => i !== stepIndex) })
  }

  return (
    <section>
      <div className="nl-actions">
        <button
          type="button"
          className="btn-primary"
          onClick={handleGenerateTests}
          disabled={generating || specsWithoutTest.length === 0}
        >
          {generating
            ? 'Génération…'
            : `Générer les scénarios de test pour les SSS sans test (IA)${specsWithoutTest.length > 0 ? ` (${specsWithoutTest.length})` : ''}`}
        </button>
      </div>
      {generateNotConfigured && (
        <div className="nl-warning">
          Génération indisponible : aucune clé API n'est configurée. Ouvrez <strong>⚙ Paramètres</strong> en bas de
          la barre latérale pour en saisir une, ou ajoutez les scénarios manuellement ci-dessous.
        </div>
      )}
      {!generateNotConfigured && !generateInfo && specsWithoutTest.length === 0 && sssSpecs.length > 0 && (
        <p className="generate-info">Toutes les SSS ont déjà un scénario de test lié.</p>
      )}
      {sssSpecs.length === 0 && <p className="nl-hint">Aucune SSS pour l'instant : générez ou ajoutez d'abord des spécifications.</p>}
      {generateError && <p className="error">{generateError}</p>}
      {generateInfo && <p className="generate-info">{generateInfo}</p>}

      <ul className="spec-list">
        {project.testScenarios.map((scenario) => {
          const linkedSpec = project.specifications.find((s) => s.id === scenario.specificationId)
          return (
            <li key={scenario.id} className="spec-card">
              <div className="spec-card-meta">
                <input
                  className="spec-code"
                  value={scenario.code}
                  onChange={(e) => updateScenario(scenario.id, { code: e.target.value })}
                />
                <input
                  className="test-title"
                  value={scenario.title}
                  onChange={(e) => updateScenario(scenario.id, { title: e.target.value })}
                  placeholder="Titre du scénario"
                />
                <select
                  value={scenario.specificationId}
                  onChange={(e) => updateScenario(scenario.id, { specificationId: e.target.value })}
                >
                  {project.specifications.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code}
                    </option>
                  ))}
                </select>
                <select
                  value={scenario.status}
                  onChange={(e) => updateScenario(scenario.id, { status: e.target.value as TestScenario['status'] })}
                >
                  <option value="draft">brouillon</option>
                  <option value="approved">approuvé</option>
                  <option value="deprecated">obsolète</option>
                </select>
                <button type="button" className="danger" onClick={() => removeScenario(scenario.id)}>
                  supprimer
                </button>
              </div>
              {linkedSpec && (
                <p className="test-linked-spec">
                  Vérifie <strong>{linkedSpec.code}</strong> — {linkedSpec.text}
                </p>
              )}
              <textarea
                className="spec-text"
                rows={1}
                placeholder="Préconditions (facultatif)"
                value={scenario.preconditions ?? ''}
                onChange={(e) => updateScenario(scenario.id, { preconditions: e.target.value })}
              />
              <table className="test-steps">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Action</th>
                    <th>Résultat attendu</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {scenario.steps.map((step, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>
                        <input value={step.action} onChange={(e) => updateStep(scenario.id, i, { action: e.target.value })} />
                      </td>
                      <td>
                        <input
                          value={step.expectedResult}
                          onChange={(e) => updateStep(scenario.id, i, { expectedResult: e.target.value })}
                        />
                      </td>
                      <td>
                        <button type="button" className="danger" onClick={() => removeStep(scenario.id, i)}>
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" onClick={() => addStep(scenario.id)}>
                + Ajouter une étape
              </button>
            </li>
          )
        })}
        {project.testScenarios.length === 0 && <li className="empty">Aucun scénario de test pour l'instant.</li>}
      </ul>
      <button type="button" onClick={addScenario} disabled={sssSpecs.length === 0}>
        + Ajouter un scénario de test
      </button>
    </section>
  )
}
