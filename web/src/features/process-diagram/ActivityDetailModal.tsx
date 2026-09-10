import type { Project } from '../../api/types'

interface Props {
  project: Project
  activityId: string
  onClose: () => void
}

const SPEC_TYPE_LABELS: Record<string, string> = {
  StakeholderNeed: 'SSS',
  SystemRequirement: 'Exigence système',
  SubsystemRequirement: 'Exigence sous-système',
  VerificationCriterion: 'Critère de vérification',
}

// Ouverte au clic sur une carte d'activité du diagramme (voir
// ProcessDiagram.tsx, onNodeClick) : vue en lecture seule des
// spécifications et scénarios de test V&V déjà liés à cette activité,
// pour les consulter sans quitter le diagramme. L'édition reste dans
// l'onglet Spécifications — cette modale ne fait que dériver l'affichage
// de l'état du projet déjà chargé, sans nouvel appel réseau.
export function ActivityDetailModal({ project, activityId, onClose }: Props) {
  const activity = project.activities.find((a) => a.id === activityId)
  if (!activity) return null

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
