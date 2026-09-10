import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { ActorSummary, Project } from '../../api/types'
import { ActorDetail } from '../actor-view/ActorDetail'

interface Props {
  // Ouvre ce projet dans la vue "projet" habituelle (onglet Vue par
  // acteur, avec cet acteur présélectionné) — remonté par le bouton
  // "Ouvrir cette mission" de chaque section.
  onOpenProject: (projectId: string, actorId: string) => void
}

// Écran indépendant de tout projet ouvert (voir ProjectShell.tsx, état
// `view`) : liste les acteurs par NOM à travers toutes les missions
// stockées (rapprochement par nom, insensible à la casse — voir
// ADR-041, aucun catalogue d'acteurs global), et pour l'acteur
// sélectionné, rappelle son implication dans chacune en réutilisant
// ActorDetail (même rendu que l'onglet Vue par acteur d'un projet).
export function ActorMissionsScreen({ onOpenProject }: Props) {
  const [actors, setActors] = useState<ActorSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [missionProjects, setMissionProjects] = useState<Record<string, Project>>({})
  const [loadingMissions, setLoadingMissions] = useState(false)
  const [missionsError, setMissionsError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  function loadActors() {
    setRefreshing(true)
    api
      .listActors()
      .then((list) => {
        setActors(list)
        setError(null)
        // Garde l'acteur déjà sélectionné s'il existe toujours ; sinon
        // (première charge, ou acteur disparu) retombe sur le premier.
        setSelectedName((current) => (current && list.some((a) => a.name === current) ? current : list[0]?.name ?? null))
      })
      .catch((e) => setError(String(e)))
      .finally(() => setRefreshing(false))
  }

  useEffect(loadActors, [])

  const selected = actors?.find((a) => a.name === selectedName) ?? null

  useEffect(() => {
    const current = actors?.find((a) => a.name === selectedName)
    if (!current) return
    setLoadingMissions(true)
    setMissionsError(null)
    Promise.all(current.projects.map((ref) => api.getProject(ref.projectId)))
      .then((projects) => {
        setMissionProjects(Object.fromEntries(projects.map((p) => [p.id, p])))
      })
      .catch((e) => setMissionsError(String(e)))
      .finally(() => setLoadingMissions(false))
  }, [selectedName, actors])

  if (error) {
    return <p className="error">{error}</p>
  }
  if (!actors) {
    return <p>Chargement…</p>
  }

  return (
    <div className="actor-missions-screen-wrapper">
      <p className="nl-hint actor-missions-hint">
        Seules les données déjà <strong>sauvegardées</strong> de chaque mission apparaissent ici — une mission tout
        juste créée ou modifiée mais pas encore sauvegardée n'y figure pas encore.{' '}
        <button type="button" onClick={loadActors} disabled={refreshing}>
          {refreshing ? 'Actualisation…' : '↻ Actualiser'}
        </button>
      </p>
      {actors.length === 0 ? (
        <p className="placeholder">
          Aucun acteur pour l'instant — ajoutez-en dans une mission, sauvegardez, puis actualisez.
        </p>
      ) : (
        <div className="actor-missions-screen">
          <aside className="actor-missions-list">
            {actors.map((a) => (
              <button
                key={a.name}
                type="button"
                className={`actor-missions-list-item${a.name === selectedName ? ' active' : ''}`}
                onClick={() => setSelectedName(a.name)}
              >
                <span className="actor-missions-list-name">{a.name}</span>
                <span className="actor-missions-list-count">
                  {a.projects.length} mission{a.projects.length > 1 ? 's' : ''}
                </span>
              </button>
            ))}
          </aside>

          <div className="actor-missions-detail">
            {selected && (
              <>
                <h2 className="panel-title">{selected.name}</h2>
                {loadingMissions && <p>Chargement des missions…</p>}
                {missionsError && <p className="error">{missionsError}</p>}
                {!loadingMissions &&
                  selected.projects.map((ref) => {
                    const project = missionProjects[ref.projectId]
                    return (
                      <section key={ref.projectId} className="actor-mission-section">
                        <header className="actor-mission-header">
                          <span className="actor-dot" style={{ background: ref.color }} />
                          <h3>{ref.projectName}</h3>
                          <button type="button" onClick={() => onOpenProject(ref.projectId, ref.actorId)}>
                            Ouvrir cette mission
                          </button>
                        </header>
                        {ref.description && <p className="actor-mission-description">{ref.description}</p>}
                        {project ? (
                          <ActorDetail project={project} actorId={ref.actorId} />
                        ) : (
                          <p className="placeholder">— indisponible —</p>
                        )}
                      </section>
                    )
                  })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
