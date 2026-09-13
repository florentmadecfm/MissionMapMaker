import { useEffect, useState } from 'react'
import { Map, Settings, Users } from 'lucide-react'
import { api } from '../../api/client'
import type { ActorSummary, Project, ProjectSummary } from '../../api/types'
import { ActorView } from '../actor-view/ActorView'
import { ActorMissionsScreen } from '../actor-missions/ActorMissionsScreen'
import { NlInput } from '../nl-input/NlInput'
import { ProcessDiagram } from '../process-diagram/ProcessDiagram'
import { SettingsModal } from '../settings/SettingsModal'
import { SpecificationsPanel } from '../specifications/SpecificationsPanel'
import { CreateVariantModal } from './CreateVariantModal'
import { ExportImportMenu } from './ExportImportMenu'
import { ProjectEditor } from './ProjectEditor'
import { VariantComparisonScreen } from './VariantComparisonScreen'
import { VariantSwitcher } from './VariantSwitcher'
import { VersionHistoryModal } from './VersionHistoryModal'

type Tab = 'generer' | 'edition' | 'diagramme' | 'specifications' | 'acteur'
// Vue de la zone principale, indépendante des onglets d'un projet ouvert :
// 'project' est le fonctionnement habituel (onglets ci-dessus) ; 'actors'
// est l'écran transverse "Acteurs" (ActorMissionsScreen), qui ne nécessite
// pas d'avoir ouvert un projet précis (voir ADR-041) ; 'compare' est la
// vue de comparaison côte à côte entre variantes du projet ouvert
// (VariantComparisonScreen, ADR-063).
type View = 'project' | 'actors' | 'compare'

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
  const [actors, setActors] = useState<ActorSummary[] | null>(null)
  const [actorsError, setActorsError] = useState<string | null>(null)
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
  const [createVariantOpen, setCreateVariantOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
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
  // Index transverse acteur -> missions (écran Acteurs), tenu à jour au
  // niveau du shell plutôt que chargé paresseusement par
  // ActorMissionsScreen : rafraîchi à chaque sauvegarde de projet
  // (handleSaved ci-dessous), pour que l'écran Acteurs reflète toujours
  // les dernières données sauvegardées sans action manuelle (ADR-046).
  const refreshActors = () =>
    api
      .listActors()
      .then((list) => {
        setActors(list)
        setActorsError(null)
      })
      .catch((e) => setActorsError(String(e)))
  // Après toute sauvegarde d'un projet (Édition, Diagramme,
  // Spécifications) : la liste de projets ET l'index d'acteurs peuvent
  // tous deux avoir changé (nom de projet, acteurs ajoutés/renommés...).
  const handleSaved = () => {
    refreshList()
    refreshActors()
  }

  useEffect(() => {
    refreshList()
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
    refreshActors()
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
      refreshActors()
    } catch (e) {
      setError(String(e))
    }
  }

  // Bascule vers la variante nouvellement créée (CreateVariantModal,
  // ADR-062), comme handleCreate le fait déjà pour un nouveau projet
  // ordinaire — sans quoi l'utilisateur devrait la rechercher lui-même
  // dans la liste juste après l'avoir créée.
  function handleVariantCreated(variant: Project) {
    setProject(variant)
    setInitialActorId(undefined)
    setView('project')
    refreshList()
  }

  async function handleLeaveVariantGroup() {
    if (!project) return
    if (
      !window.confirm(
        "Détacher cette mission de son groupe de variantes ? Son contenu n'est pas modifié, seul le lien avec les autres variantes est retiré.",
      )
    ) {
      return
    }
    try {
      const updated = await api.saveProject({ ...project, variantGroupId: '', variantLabel: '' })
      setProject(updated)
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
                    <span className="project-name-text">{s.name}</span>
                    {/* Étiquette de variante (ADR-062) : jamais tronquée
                        (flex-shrink: 0, voir App.css) — c'est justement
                        elle qui distingue deux missions au nom presque
                        identique, donc la seule partie qui NE DOIT PAS
                        disparaître si la place manque ; c'est le nom qui
                        cède la place en s'abrégeant. */}
                    {s.variantLabel && <span className="variant-badge">{s.variantLabel}</span>}
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
            <Users size={16} aria-hidden="true" />
            {!sidebarCollapsed && 'Acteurs (toutes missions)'}
          </button>
          <button
            type="button"
            className="sidebar-settings"
            onClick={() => setSettingsOpen(true)}
            title={llmConfigured === false ? 'Paramètres — aucun fournisseur LLM configuré' : 'Paramètres'}
          >
            <Settings size={16} aria-hidden="true" />
            {!sidebarCollapsed && 'Paramètres'}
            {llmConfigured === false && <span className="settings-alert-dot" aria-label="Aucun fournisseur LLM configuré" />}
          </button>
        </div>
      </aside>

      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} onSettingsChange={setLlmConfigured} />
      )}

      {createVariantOpen && project && (
        <CreateVariantModal
          project={project}
          onClose={() => setCreateVariantOpen(false)}
          onCreated={handleVariantCreated}
        />
      )}

      {historyOpen && project && (
        <VersionHistoryModal
          project={project}
          onClose={() => setHistoryOpen(false)}
          onRestored={(restored) => {
            setProject(restored)
            handleSaved()
          }}
        />
      )}

      <main className="shell-main">
        {view === 'actors' ? (
          <ActorMissionsScreen actors={actors} error={actorsError} onOpenProject={handleOpenFromActorMissions} />
        ) : view === 'compare' && project ? (
          <VariantComparisonScreen project={project} summaries={summaries} onClose={() => setView('project')} />
        ) : project ? (
          <>
            <div className="tabs-bar">
              <nav className="tabs">
                <button type="button" className={tab === 'generer' ? 'active' : ''} onClick={() => setTab('generer')}>
                  Générer (langage naturel)
                </button>
                <button type="button" className={tab === 'edition' ? 'active' : ''} onClick={() => setTab('edition')}>
                  Édition
                </button>
                <button
                  type="button"
                  className={tab === 'diagramme' ? 'active' : ''}
                  onClick={() => setTab('diagramme')}
                >
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
              {/* Menu export/import au niveau de la barre d'onglets (pas
                  dans l'en-tête d'un seul onglet) : disponible depuis
                  n'importe quel onglet du projet ouvert (ADR-046). */}
              <ExportImportMenu
                project={project}
                onChange={setProject}
                onCreateVariant={() => setCreateVariantOpen(true)}
                onShowHistory={() => setHistoryOpen(true)}
              />
            </div>
            <VariantSwitcher
              project={project}
              summaries={summaries}
              onOpen={handleOpen}
              onLeaveGroup={handleLeaveVariantGroup}
              onCompare={() => setView('compare')}
            />
            {/* key={project.id} sur chaque onglet : sans lui, passer d'un
                projet à un autre en restant sur le même onglet ne
                démonte/remonte pas le composant (seule sa prop `project`
                change), donc son état local (texte de la demande en
                langage naturel, message "Sauvegardé à...", erreur de
                génération...) restait affiché tel quel — décrivant encore
                le projet précédent alors que l'écran affiche déjà le
                nouveau. Remonter le composant à chaque changement de
                projet réinitialise tout son état local d'un coup, plutôt
                que de traquer et réinitialiser chaque state individuellement
                (voir ADR-048). */}
            {tab === 'generer' && (
              <NlInput key={project.id} project={project} onChange={setProject} onGenerated={() => setTab('edition')} />
            )}
            {tab === 'edition' && (
              <ProjectEditor key={project.id} project={project} onChange={setProject} onSaved={handleSaved} />
            )}
            {tab === 'diagramme' && (
              <ProcessDiagram key={project.id} project={project} onChange={setProject} onSaved={handleSaved} />
            )}
            {tab === 'specifications' && (
              <SpecificationsPanel key={project.id} project={project} onChange={setProject} onSaved={handleSaved} />
            )}
            {tab === 'acteur' && (
              <ActorView
                key={project.id}
                project={project}
                onChange={setProject}
                onSaved={handleSaved}
                initialActorId={initialActorId}
              />
            )}
          </>
        ) : (
          // Premier écran vu par un nouvel utilisateur (aucun projet créé
          // ni ouvert) : une simple phrase perdue au milieu d'un grand
          // espace vide ne donnait aucune première impression ni indice
          // d'action (trouvé lors de l'audit UX/UI, ADR-068) — remplacé
          // par un repère visuel (icône, titre, ce que fait l'outil) qui
          // pointe explicitement vers le SEUL vrai point d'entrée de cet
          // écran, le champ "Nom du nouveau projet" de la barre latérale.
          <div className="empty-state">
            <Map size={44} aria-hidden="true" />
            <h2>Bienvenue dans MissionMapMaker</h2>
            <p>
              Cartographiez un processus métier — acteurs, étapes, échanges — en langage naturel ou à la main, avec
              traçabilité vers vos exigences et vos tests.
            </p>
            <p className="empty-state-hint">
              Donnez un nom à votre première mission dans la barre latérale, puis cliquez sur « Créer ».
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
