import type { Project } from '../../api/types'

interface Props {
  project: Project
  onChange: (project: Project) => void
}

export function TraceabilityMatrix({ project, onChange }: Props) {
  if (project.activities.length === 0 || project.specifications.length === 0) {
    return <p className="placeholder">Ajoutez au moins une activité et une spécification pour voir la matrice.</p>
  }

  function toggle(activityId: string, specId: string) {
    onChange({
      ...project,
      activities: project.activities.map((a) => {
        if (a.id !== activityId) return a
        const linked = a.traceLinks.includes(specId)
        return {
          ...a,
          traceLinks: linked ? a.traceLinks.filter((id) => id !== specId) : [...a.traceLinks, specId],
        }
      }),
    })
  }

  // Une spécification est couverte dès qu'au moins un scénario de test
  // V&V la vérifie (voir le sous-onglet Tests V&V) — indépendant de la
  // traçabilité activité <-> spécification que la matrice édite déjà.
  const isCovered = (specId: string) => project.testScenarios.some((t) => t.specificationId === specId)

  return (
    <div className="matrix-scroll">
      <table className="trace-matrix">
        <thead>
          <tr>
            <th>Activité \ Spécification</th>
            {project.specifications.map((spec) => (
              <th key={spec.id} title={spec.text}>
                <div>{spec.code}</div>
                <span className={`coverage-badge ${isCovered(spec.id) ? 'covered' : 'uncovered'}`}>
                  {isCovered(spec.id) ? '✓ testée' : '✗ sans test'}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {project.activities.map((activity) => (
            <tr key={activity.id}>
              <th scope="row">{activity.name}</th>
              {project.specifications.map((spec) => (
                <td key={spec.id}>
                  <input
                    type="checkbox"
                    checked={activity.traceLinks.includes(spec.id)}
                    onChange={() => toggle(activity.id, spec.id)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
