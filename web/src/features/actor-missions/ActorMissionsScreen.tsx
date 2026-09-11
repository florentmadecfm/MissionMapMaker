import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { ActorSummary, Project } from '../../api/types'
import { ActorDetail } from '../actor-view/ActorDetail'
import { ActorProfileModal } from '../actor-view/ActorProfileModal'

interface Props {
  // Index acteur -> missions, tenu à jour par ProjectShell.tsx (rafraîchi
  // après chaque sauvegarde de projet, voir handleSaved) — null tant que
  // le premier chargement n'a pas répondu. Reçu en prop plutôt que chargé
  // ici : garantit que l'écran affiche toujours les dernières données
  // sauvegardées sans action manuelle de l'utilisateur (ADR-046).
  actors: ActorSummary[] | null
  error: string | null
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
export function ActorMissionsScreen({ actors, error, onOpenProject }: Props) {
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [missionProjects, setMissionProjects] = useState<Record<string, Project>>({})
  const [loadingMissions, setLoadingMissions] = useState(false)
  const [missionsError, setMissionsError] = useState<string | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSaveError, setProfileSaveError] = useState<string | null>(null)
  const [profileSavedAt, setProfileSavedAt] = useState<string | null>(null)

  // Garde l'acteur déjà sélectionné s'il existe toujours à chaque
  // rafraîchissement de `actors` ; sinon (première charge, ou acteur
  // disparu) retombe sur le premier.
  useEffect(() => {
    if (!actors) return
    setSelectedName((current) => (current && actors.some((a) => a.name === current) ? current : actors[0]?.name ?? null))
  }, [actors])

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

  // Change d'acteur sélectionné : referme la fiche et efface le statut de
  // sauvegarde précédent plutôt que de les laisser flotter sur un acteur
  // différent.
  useEffect(() => {
    setProfileOpen(false)
    setProfileSaveError(null)
    setProfileSavedAt(null)
  }, [selectedName])

  // La fiche persona étant partagée par nom entre missions (ADR-056),
  // peu importe laquelle des missions de cet acteur sert de support à la
  // modale — la mission la plus récente (projects[0], déjà triée par
  // recency par ListActors) sert de mission "porteuse" pour l'édition et
  // la sauvegarde.
  const primaryRef = selected?.projects[0] ?? null
  const primaryProject = primaryRef ? missionProjects[primaryRef.projectId] : null

  async function handleProfileSave() {
    if (!primaryProject) return
    setSavingProfile(true)
    setProfileSaveError(null)
    try {
      const saved = await api.saveProject(primaryProject)
      setMissionProjects((prev) => ({ ...prev, [saved.id]: saved }))
      setProfileSavedAt(new Date().toLocaleTimeString())
    } catch (e) {
      setProfileSaveError(String(e))
    } finally {
      setSavingProfile(false)
    }
  }

  if (error) {
    return <p className="error">{error}</p>
  }
  if (!actors) {
    return <p>Chargement…</p>
  }
  if (actors.length === 0) {
    return <p className="placeholder">Aucun acteur pour l'instant — ajoutez-en dans une mission, puis sauvegardez.</p>
  }

  return (
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
            <div className="actor-missions-header">
              <h2 className="panel-title">{selected.name}</h2>
              <button
                type="button"
                className="actor-profile-button"
                onClick={() => setProfileOpen(true)}
                disabled={!primaryProject}
              >
                Voir la fiche
              </button>
            </div>
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
            {profileOpen && primaryProject && primaryRef && (
              <ActorProfileModal
                project={primaryProject}
                actorId={primaryRef.actorId}
                onChange={(updated) => setMissionProjects((prev) => ({ ...prev, [updated.id]: updated }))}
                onClose={() => setProfileOpen(false)}
                onSave={handleProfileSave}
                saving={savingProfile}
                saveError={profileSaveError}
                savedAt={profileSavedAt}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
