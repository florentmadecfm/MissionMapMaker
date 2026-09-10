import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { Project, ProjectSummary } from '../../api/types'
import { ActorView } from '../actor-view/ActorView'
import { ActorMissionsScreen } from '../actor-missions/ActorMissionsScreen'
import { NlInput } from '../nl-input/NlInput'
import { ProcessDiagram } from '../process-diagram/ProcessDiagram'
import { SettingsModal } from '../settings/SettingsModal'
import { SpecificationsPanel } from '../specifications/SpecificationsPanel'
import { ProjectEditor } from './ProjectEditor'

type Tab = 'generer' | 'edition' | 'diagramme' | 'specifications' | 'acteur'
// Vue de la zone principale, indépendante des onglets d'un projet ouvert :
// 'project' est le fonctionnement habituel (onglets ci-dessus) ; 'actors'
// est le nouvel écran transverse "Acteurs" (ActorMissionsScreen), qui ne
// nécessite pas d'avoir ouvert un projet précis (voir ADR-041).
type View = 'project' | 'actors'

const SIDEBAR_COLLAPSED_KEY = 'mmm-sidebar-collapsed'

function loadSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

export function ProjectShell() {
  const [summaries, setSummaries] = useState<ProjectSummary[]>([])
  const [project, setProject] = useState<Project | null>(null)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('generer')
  const [view, setView] = useState<View>('project')
  // Acteur à présélectionner dans ActorView quand on y arrive depuis
  // "Ouvrir cette mission" de l'écran Acteurs (voir handleOpenFromActorMissions).
  const [initialActorId, setInitialActorId] = useState<string | undefined>(undefined)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // null tant que le premier chargement des paramètres n'a pas répondu :
  // évite d'afficher brièvement la pastille d'alerte à chaque démarrage
  // avant de savoir si un fournisseur LLM est réellement configuré.
  const [llmConfigured, setLlmConfigured] = useState<boolean | null>(null)

  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0')
      } catch {
        // stockage indisponible (navigation privée...) : la préférence ne survivra pas au rechargement
      }
      return next
    })
  }

  const refreshList = () => api.listProjects().then(setSummaries)

  useEffect(() => {
    refreshList()
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    api
      .getSettings()
      .then((s) => setLlmConfigured(s.configured))
      .catch(() => setLlmConfigured(false))
  }, [])

  async function handleCreate() {
    if (!newName.trim()) return
    try {
      const created = await api.createProject(newName.trim())
      setNewName('')
      await refreshList()
      setProject(created)
      setInitialActorId(undefined)
      setView('project')
    } catch (e) {
      setError(String(e))
    }
  }

  async function handleOpen(id: string) {
    try {
      setProject(await api.getProject(id))
      setInitialActorId(undefined)
      setView('project')
    } catch (e) {
      setError(String(e))
    }
  }

  // "Ouvrir cette mission" depuis l'écran transverse Acteurs : ouvre ce
  // projet comme handleOpen, mais atterrit directement sur l'onglet Vue
  // par acteur avec l'acteur déjà consulté présélectionné, plutôt que de
  // laisser l'utilisateur le rechercher à nouveau.
  async function handleOpenFromActorMissions(projectId: string, actorId: string) {
    try {
      setProject(await api.getProject(projectId))
      setInitialActorId(actorId)
      setTab('acteur')
      setView('project')
    } catch (e) {
      setError(String(e))
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.deleteProject(id)
      if (project?.id === id) setProject(null)
      await refreshList()
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div className="shell">
      <aside className={`shell-sidebar${sidebarCollapsed ? ' collapsed' : ''}`}>
        <div className="sidebar-top">
          {!sidebarCollapsed && <h1>MissionMapMaker</h1>}
          <button
            type="button"
            className="sidebar-toggle"
            onClick={toggleSidebar}
            aria-label={sidebarCollapsed ? 'Déplier le menu' : 'Replier le menu'}
            title={sidebarCollapsed ? 'Déplier le menu' : 'Replier le menu'}
          >
            {sidebarCollapsed ? '»' : '«'}
          </button>
        </div>

        {!sidebarCollapsed && (
          <>
            <div className="new-project">
              <input
                placeholder="Nom du nouveau projet"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              />
              <button type="button" className="btn-primary" onClick={handleCreate}>
                Créer
              </button>
            </div>

            {loading && <p>Chargement…</p>}
            {error && <p className="error">{error}</p>}

            <ul className="project-list">
              {summaries.map((s) => (
                <li key={s.id} className={s.id === project?.id ? 'active' : ''}>
                  <button type="button" onClick={() => handleOpen(s.id)}>
                    {s.name}
                  </button>
                  <button type="button" className="danger" onClick={() => handleDelete(s.id)}>
                    supprimer
                  </button>
                </li>
              ))}
              {!loading && summaries.length === 0 && <li className="empty">Aucun projet pour l'instant.</li>}
            </ul>
          </>
        )}

        <div className="sidebar-bottom">
          <button
            type="button"
            className={`sidebar-actors${view === 'actors' ? ' active' : ''}`}
            onClick={() => setView('actors')}
            title="Acteurs — consulter un acteur à travers toutes les missions"
          >
            {sidebarCollapsed ? '🧑' : '🧑 Acteurs (toutes missions)'}
          </button>
          <button
            type="button"
            className="sidebar-settings"
            onClick={() => setSettingsOpen(true)}
            title={llmConfigured === false ? 'Paramètres — aucun fournisseur LLM configuré' : 'Paramètres'}
          >
            {sidebarCollapsed ? '⚙' : '⚙ Paramètres'}
            {llmConfigured === false && <span className="settings-alert-dot" aria-label="Aucun fournisseur LLM configuré" />}
          </button>
        </div>
      </aside>

      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} onSettingsChange={setLlmConfigured} />
      )}

      <main className="shell-main">
        {view === 'actors' ? (
          <ActorMissionsScreen onOpenProject={handleOpenFromActorMissions} />
        ) : project ? (
          <>
            <nav className="tabs">
              <button type="button" className={tab === 'generer' ? 'active' : ''} onClick={() => setTab('generer')}>
                Générer (langage naturel)
              </button>
              <button type="button" className={tab === 'edition' ? 'active' : ''} onClick={() => setTab('edition')}>
                Édition
              </button>
              <button type="button" className={tab === 'diagramme' ? 'active' : ''} onClick={() => setTab('diagramme')}>
                Diagramme de processus
              </button>
              <button
                type="button"
                className={tab === 'specifications' ? 'active' : ''}
                onClick={() => setTab('specifications')}
              >
                Spécifications
              </button>
              <button type="button" className={tab === 'acteur' ? 'active' : ''} onClick={() => setTab('acteur')}>
                Vue par acteur
              </button>
            </nav>
            {tab === 'generer' && (
              <NlInput project={project} onChange={setProject} onGenerated={() => setTab('edition')} />
            )}
            {tab === 'edition' && (
              <ProjectEditor project={project} onChange={setProject} onSaved={() => refreshList()} />
            )}
            {tab === 'diagramme' && (
              <ProcessDiagram project={project} onChange={setProject} onSaved={() => refreshList()} />
            )}
            {tab === 'specifications' && (
              <SpecificationsPanel project={project} onChange={setProject} onSaved={() => refreshList()} />
            )}
            {tab === 'acteur' && <ActorView project={project} initialActorId={initialActorId} />}
          </>
        ) : (
          <p className="placeholder">Créez ou ouvrez un projet pour commencer.</p>
        )}
      </main>
    </div>
  )
}
