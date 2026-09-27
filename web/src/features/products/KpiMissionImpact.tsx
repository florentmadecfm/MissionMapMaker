import type { Project, ProductKpi } from '../../api/types'
import { buildKpiTree, formatKpiValue } from './kpiTree'

interface Props {
  kpis: ProductKpi[]
  // Projets COMPLETS des missions déjà rattachées au produit — chargés
  // par ProductsScreen.tsx (même patron que ActorMissionsScreen.tsx :
  // Promise.all(api.getProject(...)) sur une poignée de missions), pas
  // une nouvelle route d'agrégation côté serveur (Product/Project restent
  // des magasins séparés, voir le plan Produit/KPI/Missions).
  missionProjects: Project[]
}

interface MissionContribution {
  missionId: string
  missionName: string
  items: string[]
}

// Missions qui contribuent CONCRÈTEMENT à un KPI donné — une entrée par
// activité/phase dont kpiLinks référence ce KPI, groupée par mission
// (une mission sans aucun élément lié n'apparaît pas dans le résultat).
function contributionsFor(kpiId: string, missionProjects: Project[]): MissionContribution[] {
  const result: MissionContribution[] = []
  for (const project of missionProjects) {
    const items: string[] = []
    for (const activity of project.activities) {
      if (!activity.kpiLinks.includes(kpiId)) continue
      const actorName = project.actors.find((a) => a.id === activity.actorId)?.name
      items.push(`Activité : ${activity.name}${actorName ? ` (${actorName})` : ''}`)
    }
    for (const phase of project.phases) {
      if (!phase.kpiLinks.includes(kpiId)) continue
      items.push(`Phase : ${phase.name}`)
    }
    if (items.length > 0) {
      result.push({ missionId: project.id, missionName: project.name, items })
    }
  }
  return result
}

// Angle "Missions → Produit" (plan Produit/KPI/Missions) : pour chaque
// KPI du produit, mène avec son cadrage de valeur (formatKpiValue, voir
// kpiTree.ts) puis liste les missions qui la construisent concrètement —
// la valeur d'abord, la traçabilité comme preuve ensuite, jamais
// l'inverse. Présentationnel et en lecture seule, symétrique de
// KpiTreeDiagram.tsx.
export function KpiMissionImpact({ kpis, missionProjects }: Props) {
  const tree = buildKpiTree(kpis)

  if (tree.length === 0) {
    return <p className="placeholder">Aucun KPI pour l'instant.</p>
  }

  return (
    <div className="kpi-mission-impact">
      {tree.map(({ kpi, depth }) => {
        const value = formatKpiValue(kpi)
        const contributions = contributionsFor(kpi.id, missionProjects)
        const totalItems = contributions.reduce((sum, c) => sum + c.items.length, 0)
        return (
          <div key={kpi.id} className="kpi-impact-card" style={{ ['--kpi-depth' as string]: depth }}>
            <div className="kpi-impact-header">
              <span className="kpi-impact-name">{kpi.name || '(sans nom)'}</span>
              {value && <span className="kpi-impact-value">{value}</span>}
            </div>
            {kpi.definition && <p className="kpi-impact-definition">{kpi.definition}</p>}
            {contributions.length === 0 ? (
              <p className="placeholder">Cette valeur n'est encore portée par aucune mission.</p>
            ) : (
              <>
                <p className="kpi-impact-summary">
                  Portée par {contributions.length} mission{contributions.length > 1 ? 's' : ''} ({totalItems}{' '}
                  élément{totalItems > 1 ? 's' : ''} lié{totalItems > 1 ? 's' : ''})
                </p>
                <ul className="kpi-impact-missions">
                  {contributions.map((c) => (
                    <li key={c.missionId}>
                      <details>
                        <summary>
                          {c.missionName} — {c.items.length} élément{c.items.length > 1 ? 's' : ''}
                        </summary>
                        <ul>
                          {c.items.map((item, i) => (
                            <li key={i}>{item}</li>
                          ))}
                        </ul>
                      </details>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
