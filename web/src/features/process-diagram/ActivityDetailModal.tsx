import { useState } from 'react'
import type { PainPoint, Project } from '../../api/types'

interface Props {
  project: Project
  activityId: string
  onChange: (project: Project) => void
  onClose: () => void
}

const SPEC_TYPE_LABELS: Record<string, string> = {
  StakeholderNeed: 'SSS',
  SystemRequirement: 'Exigence système',
  SubsystemRequirement: 'Exigence sous-système',
  VerificationCriterion: 'Critère de vérification',
}

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

// Ouverte au clic sur une carte d'activité du diagramme (voir
// ProcessDiagram.tsx, onNodeClick) : vue des spécifications et scénarios
// de test V&V déjà liés à cette activité (lecture seule — l'édition reste
// dans l'onglet Spécifications), et des points de friction (texte libre),
// ceux-ci éditables directement ici (comme le reste du diagramme, un
// changement d'état local — « Sauvegarder » reste nécessaire pour le
// persister).
export function ActivityDetailModal({ project, activityId, onChange, onClose }: Props) {
  const [newPainPoint, setNewPainPoint] = useState('')
  const activity = project.activities.find((a) => a.id === activityId)
  if (!activity) return null

  function addPainPoint() {
    const text = newPainPoint.trim()
    if (!text || !activity) return
    const painPoint: PainPoint = { id: newId('pp'), text }
    onChange({
      ...project,
      activities: project.activities.map((a) =>
        a.id === activity.id ? { ...a, painPoints: [...a.painPoints, painPoint] } : a,
      ),
    })
    setNewPainPoint('')
  }

  function removePainPoint(id: string) {
    if (!activity) return
    onChange({
      ...project,
      activities: project.activities.map((a) =>
        a.id === activity.id ? { ...a, painPoints: a.painPoints.filter((p) => p.id !== id) } : a,
      ),
    })
  }

  const actor = project.actors.find((a) => a.id === activity.actorId)
  const phase = project.phases.find((p) => p.id === activity.phaseId)

  const specs = activity.traceLinks
    .map((specId) => project.specifications.find((s) => s.id === specId))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))

  const specIds = new Set(specs.map((s) => s.id))
  const tests = [
    ...new Map(project.testScenarios.filter((t) => specIds.has(t.specificationId)).map((t) => [t.id, t])).values(),
  ]

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal activity-detail-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>{activity.name}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>
        <p className="activity-detail-meta">
          {actor?.name ?? '(acteur supprimé)'} · {phase?.name ?? '(phase supprimée)'}
        </p>
        {activity.description && <p className="activity-detail-meta">{activity.description}</p>}

        <h3>Points de friction</h3>
        {activity.painPoints.length === 0 ? (
          <p className="actor-warning">Aucun point de friction pour l'instant.</p>
        ) : (
          <ul className="item-list item-list-warning">
            {activity.painPoints.map((p) => (
              <li key={p.id}>
                <span>{p.text}</span>
                <button type="button" className="danger" onClick={() => removePainPoint(p.id)}>
                  supprimer
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="item-add">
          <input
            value={newPainPoint}
            onChange={(e) => setNewPainPoint(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPainPoint()}
            placeholder="Ex. le client attend souvent plusieurs minutes avant d'être servi"
          />
          <button type="button" onClick={addPainPoint} disabled={!newPainPoint.trim()}>
            Ajouter
          </button>
        </div>

        <h3>Spécifications liées</h3>
        {specs.length === 0 ? (
          <p className="actor-warning">
            Aucune spécification liée pour l'instant — générez-les ou ajoutez-les depuis l'onglet Spécifications.
          </p>
        ) : (
          <ul className="spec-list">
            {specs.map((s) => (
              <li key={s.id} className="spec-view-card">
                <div className="spec-view-meta">
                  <span className="spec-chip">{s.code}</span>
                  <span>{SPEC_TYPE_LABELS[s.type] ?? s.type}</span>
                  <span>{s.status}</span>
                </div>
                <p className="spec-view-text">{s.text}</p>
              </li>
            ))}
          </ul>
        )}

        <h3>Tests V&V liés</h3>
        {specs.length === 0 ? null : tests.length === 0 ? (
          <p className="actor-warning">
            Aucun test lié pour l'instant — générez-les ou ajoutez-les depuis l'onglet Spécifications.
          </p>
        ) : (
          <ul className="spec-list">
            {tests.map((t) => {
              const linkedSpec = project.specifications.find((s) => s.id === t.specificationId)
              return (
                <li key={t.id} className="spec-view-card">
                  <div className="spec-view-meta">
                    <span className="test-chip">{t.code}</span>
                    <span>{t.title}</span>
                    {linkedSpec && <span>— vérifie {linkedSpec.code}</span>}
                  </div>
                  {t.preconditions && <p className="spec-view-text">Préconditions : {t.preconditions}</p>}
                  {t.steps.length > 0 && (
                    <table className="test-steps">
                      <thead>
                        <tr>
                          <th>#</th>
                          <th>Action</th>
                          <th>Résultat attendu</th>
                        </tr>
                      </thead>
                      <tbody>
                        {t.steps.map((step, i) => (
                          <tr key={i}>
                            <td>{i + 1}</td>
                            <td>{step.action}</td>
                            <td>{step.expectedResult}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
