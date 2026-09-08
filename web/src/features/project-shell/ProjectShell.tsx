import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { Project, ProjectSummary } from '../../api/types'
import { ActorView } from '../actor-view/ActorView'
import { NlInput } from '../nl-input/NlInput'
import { ProcessDiagram } from '../process-diagram/ProcessDiagram'
import { SettingsModal } from '../settings/SettingsModal'
import { SpecificationsPanel } from '../specifications/SpecificationsPanel'
import { ProjectEditor } from './ProjectEditor'

type Tab = 'generer' | 'edition' | 'diagramme' | 'specifications' | 'acteur'

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(loadSidebarCollapsed)
  const [settingsOpen, setSettingsOpen] = useState(false)

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

  async function handleCreate() {
    if (!newName.trim()) return
    try {
      const created = await api.createProject(newName.trim())
      setNewName('')
      await refreshList()
      setProject(created)
    } catch (e) {
      setError(String(e))
    }
  }

  async function handleOpen(id: string) {
    try {
      setProject(await api.getProject(id))
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
            className="sidebar-settings"
            onClick={() => setSettingsOpen(true)}
            title="Paramètres"
          >
            {sidebarCollapsed ? '⚙' : '⚙ Paramètres'}
          </button>
        </div>
      </aside>

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

      <main className="shell-main">
        {project ? (
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
            {tab === 'acteur' && <ActorView project={project} />}
          </>
        ) : (
          <p className="placeholder">Créez ou ouvrez un projet pour commencer.</p>
        )}
      </main>
    </div>
  )
}
