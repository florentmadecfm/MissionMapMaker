import { Check, X } from 'lucide-react'
import type { Specification, TestScenario } from '../../api/types'
import type { ActivityRow } from './mergeSpecDraftsAcrossMissions'

interface Props {
  specifications: Specification[]
  testScenarios: TestScenario[]
  // Activités CIBLE agrégées de TOUTES les missions rattachées au produit
  // (voir ProductSpecVVPanel.tsx) — plus les seules activités d'un projet
  // ouvert (ancienne version mission-locale, TraceabilityMatrix.tsx dans
  // features/specifications, retirée lors du déplacement des
  // spécifications vers le produit) : la traçabilité d'un produit couvre
  // désormais plusieurs missions.
  activityRows: ActivityRow[]
  onToggle: (missionId: string, activityId: string, specId: string) => void
}

export function TraceabilityMatrix({ specifications, testScenarios, activityRows, onToggle }: Props) {
  if (activityRows.length === 0 || specifications.length === 0) {
    return (
      <p className="placeholder">
        Ajoutez au moins une activité dans la variante Cible d'une mission rattachée et une spécification pour voir
        la matrice.
      </p>
    )
  }

  // Une spécification est couverte dès qu'au moins un scénario de test
  // V&V la vérifie (voir le sous-onglet Tests V&V) — indépendant de la
  // traçabilité activité <-> spécification que la matrice édite déjà.
  const isCovered = (specId: string) => testScenarios.some((t) => t.specificationId === specId)

  return (
    <div className="matrix-scroll">
      <table className="trace-matrix">
        <thead>
          <tr>
            <th>Activité (Cible) \ Spécification</th>
            {specifications.map((spec) => (
              <th key={spec.id} title={spec.text}>
                <div>{spec.code}</div>
                <span className={`coverage-badge ${isCovered(spec.id) ? 'covered' : 'uncovered'}`}>
                  {isCovered(spec.id) ? (
                    <>
                      <Check size={12} aria-hidden="true" /> testée
                    </>
                  ) : (
                    <>
                      <X size={12} aria-hidden="true" /> sans test
                    </>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {activityRows.map((row) => (
            <tr key={`${row.missionId}:${row.activity.id}`}>
              <th scope="row">
                {row.activity.name}
                <span className="trace-matrix-mission">{row.missionName}</span>
              </th>
              {specifications.map((spec) => (
                <td key={spec.id}>
                  <input
                    type="checkbox"
                    checked={row.activity.traceLinks.includes(spec.id)}
                    onChange={() => onToggle(row.missionId, row.activity.id, spec.id)}
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
