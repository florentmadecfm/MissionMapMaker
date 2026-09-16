import { useEffect, useRef, useState } from 'react'
import { CircleHelp, Map, Settings, Users } from 'lucide-react'
import { api } from '../../api/client'
import type { ActorSummary, Project, ProjectSummary } from '../../api/types'
import { Logo } from '../../components/Logo'
import { ActorView } from '../actor-view/ActorView'
import { ActorMissionsScreen } from '../actor-missions/ActorMissionsScreen'
import { NlInput } from '../nl-input/NlInput'
import { ProcessDiagram } from '../process-diagram/ProcessDiagram'
import { WelcomeTour } from '../onboarding/WelcomeTour'
import { TOUR_DEMO_PROJECT } from '../onboarding/tourDemoProject'
import { TOUR_STEPS } from '../onboarding/tourSteps'
import { SettingsModal } from '../settings/SettingsModal'
import { SpecificationsPanel } from '../specifications/SpecificationsPanel'
import {
  type ActiveVariant,
  createTargetFromCurrent,
  fromWorkingProject,
  removeTargetFromProject,
  toWorkingProject,
} from './activeVariant'
import { ExportImportMenu } from './ExportImportMenu'
import { ProjectEditor } from './ProjectEditor'
import { VariantComparisonScreen } from './VariantComparisonScreen'
import { VariantToggle } from './VariantToggle'
import { VersionHistoryModal } from './VersionHistoryModal'

export type Tab = 'generer' | 'edition' | 'diagramme' | 'specifications' | 'acteur'
// Vue de la zone principale, indépendante des onglets d'un projet ouvert :
// 'project' est le fonctionnement habituel (onglets ci-dessus) ; 'actors'
// est l'écran transverse "Acteurs" (ActorMissionsScreen), qui ne nécessite
// pas d'avoir ouvert un projet précis (voir ADR-041) ; 'compare' est la
// vue de comparaison côte à côte entre variantes du projet ouvert
// (VariantComparisonScreen, ADR-063).
type View = 'project' | 'actors' | 'compare'

const SIDEBAR_COLLAPSED_KEY = 'mmm-sidebar-collapsed'
// Visite guidée (ADR-078, WelcomeTour.tsx) : affichée automatiquement tant
// que cette clé est absente du stockage local de ce navigateur — posée dès
// la fermeture (Passer ou Terminer, même geste), jamais réaffichée
// ensuite sans action explicite ("Revoir la visite guidée", sidebar).
const WELCOME_TOUR_SEEN_KEY = 'mmm-welcome-tour-seen'
// Délai d'inactivité avant sauvegarde automatique (voir runSave) — assez
// court pour que rien ne se perde en cas de fermeture accidentelle de
// l'onglet, assez long pour ne pas envoyer une requête à chaque frappe.
const AUTOSAVE_DEBOUNCE_MS = 900

function loadSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function loadWelcomeTourSeen(): boolean {
  try {
    return localStorage.getItem(WELCOME_TOUR_SEEN_KEY) === '1'
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
  const [historyOpen, setHistoryOpen] = useState(false)
  // Visite guidée (voir WELCOME_TOUR_SEEN_KEY ci-dessus) : initialisée à
  // l'inverse de "déjà vue" — s'ouvre donc seule au tout premier chargement
  // de l'app sur ce navigateur, sans attendre un effet après montage.
  const [tourOpen, setTourOpen] = useState(() => !loadWelcomeTourSeen())
  const [tourStep, setTourStep] = useState(0)
  // Capture l'état réel (projet ouvert, onglet, vue, variante affichée,
  // sidebar repliée ou non) juste avant que la visite guidée ne les
  // remplace le temps de sa durée (voir l'effet ci-dessous) — restauré tel
  // quel à la fermeture. Un ref plutôt qu'un state : lu/écrit uniquement
  // depuis des effets/handlers, jamais depuis le rendu.
  const preTourStateRef = useRef<{
    project: Project | null
    tab: Tab
    view: View
    activeVariant: ActiveVariant
    sidebarCollapsed: boolean
  } | null>(null)
  // Quel état du diagramme de la mission ouverte est affiché/édité (voir
  // activeVariant.ts) — remis à 'current' à chaque changement de projet
  // ouvert (handleOpen/handleCreate/handleOpenFromActorMissions), comme
  // initialActorId ci-dessous.
  const [activeVariant, setActiveVariant] = useState<ActiveVariant>('current')
  const [creatingTarget, setCreatingTarget] = useState(false)
  // Sauvegarde automatique (remplace les anciens boutons "Sauvegarder" de
  // chaque onglet, voir ProjectEditor/ProcessDiagram/SpecificationsPanel/
  // ActorView) : dirtyRef passe à true à chaque modification remontée par
  // un onglet (handleWorkingChange), remis à false une fois la sauvegarde
  // en cours réussie. savingRef évite deux sauvegardes en vol à la fois ;
  // si une modification arrive pendant l'envoi, elle est reprise juste
  // après (voir le `finally` de runSave) plutôt que perdue.
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
  const projectRef = useRef<Project | null>(null)
  projectRef.current = project
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

  // Ouverture de la visite guidée (premier chargement, ou "Revoir la
  // visite guidée") : mémorise l'état réel (une seule fois — un effet qui
  // s'exécuterait à chaque changement d'étape écraserait la sauvegarde
  // avec l'état DÉJÀ modifié par la visite), installe la mission de
  // démonstration (tourDemoProject.ts, jamais persistée) et déplie la
  // barre latérale (les cibles de l'étape 1 — .new-project — y vivent, et
  // une barre repliée les masquerait).
  useEffect(() => {
    if (!tourOpen) return
    if (!preTourStateRef.current) {
      preTourStateRef.current = { project, tab, view, activeVariant, sidebarCollapsed }
    }
    setView('project')
    setProject(TOUR_DEMO_PROJECT)
    setActiveVariant('current')
    setSidebarCollapsed(false)
    // Snapshot volontairement pris une seule fois par ouverture (voir le
    // commentaire ci-dessus) : ne doit PAS se redéclencher sur
    // project/tab/view/activeVariant/sidebarCollapsed, seulement sur
    // tourOpen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tourOpen])

  // Bascule l'onglet affiché à chaque étape (voir TOUR_STEPS[i].tab,
  // tourSteps.ts) — l'étape 1 (tab absent) n'y touche pas, elle pointe un
  // élément de la barre latérale, visible quel que soit l'onglet actif.
  useEffect(() => {
    if (!tourOpen) return
    const step = TOUR_STEPS[tourStep]
    if (step.tab) setTab(step.tab)
  }, [tourOpen, tourStep])

  // "Passer" et "Terminer" de la visite guidée (WelcomeTour.tsx) déclenchent
  // tous deux ce même geste : une fois vue (même partiellement), elle ne se
  // rouvre plus seule — seul "Revoir la visite guidée" (sidebar) la
  // rouvre explicitement, sans re-toucher au stockage (déjà à '1').
  // Restaure l'état capturé à l'ouverture (projet réellement ouvert,
  // onglet, vue, variante, sidebar) plutôt que de laisser la mission de
  // démonstration affichée.
  function closeTour() {
    setTourOpen(false)
    setTourStep(0)
    const prev = preTourStateRef.current
    preTourStateRef.current = null
    if (prev) {
      setProject(prev.project)
      setTab(prev.tab)
      setView(prev.view)
      setActiveVariant(prev.activeVariant)
      setSidebarCollapsed(prev.sidebarCollapsed)
    }
    try {
      localStorage.setItem(WELCOME_TOUR_SEEN_KEY, '1')
    } catch {
      // stockage indisponible (navigation privée...) : la visite guidée réapparaîtra au prochain chargement
    }
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

  // Sauvegarde effective — voir le commentaire sur dirtyRef/savingRef
  // ci-dessus. N'utilise jamais `project` capturé par une fermeture (qui
  // pourrait être périmé au moment où un retentative différée se déclenche),
  // toujours projectRef.current, tenu à jour à chaque rendu.
  async function runSave() {
    const current = projectRef.current
    if (!current || !dirtyRef.current || savingRef.current) return
    savingRef.current = true
    dirtyRef.current = false
    setSaveStatus('saving')
    setSaveErrorMsg(null)
    try {
      const saved = await api.saveProject(current)
      setProject(saved)
      setSaveStatus('saved')
      setSavedAt(new Date().toLocaleTimeString())
      handleSaved()
    } catch (e) {
      setSaveStatus('error')
      setSaveErrorMsg(String(e))
      dirtyRef.current = true // à retenter — rien n'a été perdu
    } finally {
      savingRef.current = false
      // Une modification est arrivée pendant l'envoi (dirtyRef remis à
      // true par handleWorkingChange, ou par l'échec ci-dessus) : la
      // reprendre maintenant plutôt qu'attendre un hypothétique prochain
      // changement de `project` qui ne viendrait peut-être jamais.
      if (dirtyRef.current) {
        window.setTimeout(() => {
          void runSave()
        }, AUTOSAVE_DEBOUNCE_MS)
      }
    }
  }

  useEffect(() => {
    if (!dirtyRef.current) return
    const timer = window.setTimeout(() => {
      void runSave()
    }, AUTOSAVE_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
    // runSave n'est pas mémoïsée (nouvelle fermeture à chaque rendu) et ne
    // doit déclencher cet effet QUE sur un changement de `project`, pas à
    // chaque rendu — même choix que SettingsModal.tsx (tableau de
    // dépendances volontairement incomplet).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project])

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

  // Réinitialise l'état de sauvegarde automatique à l'ouverture/création
  // d'un projet : le contenu qui vient d'arriver du serveur n'est jamais
  // "sale" (dirtyRef à false), et l'indicateur ne doit pas continuer à
  // afficher l'état de la mission précédente.
  function resetAutosaveState() {
    dirtyRef.current = false
    setSaveStatus('idle')
    setSaveErrorMsg(null)
    setSavedAt(null)
  }

  async function handleCreate() {
    if (!newName.trim()) return
    try {
      const created = await api.createProject(newName.trim())
      setNewName('')
      await refreshList()
      setProject(created)
      setInitialActorId(undefined)
      setActiveVariant('current')
      resetAutosaveState()
      setView('project')
    } catch (e) {
      setError(String(e))
    }
  }

  async function handleOpen(id: string) {
    try {
      setProject(await api.getProject(id))
      setInitialActorId(undefined)
      setActiveVariant('current')
      resetAutosaveState()
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
      setActiveVariant('current')
      resetAutosaveState()
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

  // Crée la cible de la mission ouverte (copie indépendante complète de
  // l'état actuel, voir activeVariant.ts) et bascule dessus — jamais un
  // second projet dans le panneau de gauche (remplace CreateVariantModal).
  async function handleCreateTarget() {
    if (!project) return
    setCreatingTarget(true)
    try {
      const updated = await api.saveProject(createTargetFromCurrent(project))
      setProject(updated)
      setActiveVariant('target')
    } catch (e) {
      setError(String(e))
    } finally {
      setCreatingTarget(false)
    }
  }

  // Symétrique de handleCreateTarget : retire la cible, sans toucher à
  // l'état Actuel. Confirmation requise (perte du travail propre à la
  // cible, hors historique des versions) — même garde-fou que l'import
  // Excel, seule autre opération destructive de remplacement de cet écran
  // (voir ExportImportMenu.tsx). Rebascule sur Actuel si la cible
  // supprimée était la variante affichée : rester sur 'target' afficherait
  // alors l'état Actuel par défaut de toWorkingProject (project.target
  // absent) sans le signaler, une confusion à éviter (ADR-062, même
  // raison que le bouton radio explicite Actuel/Cible).
  async function handleDeleteTarget() {
    if (!project?.target) return
    if (!window.confirm('Supprimer la cible de cette mission ? L\'état Actuel ne sera pas affecté.')) return
    try {
      const updated = await api.saveProject(removeTargetFromProject(project))
      setProject(updated)
      if (activeVariant === 'target') setActiveVariant('current')
    } catch (e) {
      setError(String(e))
    }
  }

  // Projection du projet réel vers la version consommée par les onglets
  // (voir activeVariant.ts) — identité en 'current', recopie de la cible
  // en 'target'. handleWorkingChange fait le trajet inverse à chaque
  // modification remontée par un onglet.
  const workingProject = project ? toWorkingProject(project, activeVariant) : null
  // Ignore toute modification pendant la visite guidée : le projet affiché
  // est alors TOUR_DEMO_PROJECT (tourDemoProject.ts), jamais persisté —
  // un onglet reste monté et câblé normalement (aucune complexité en plus
  // à gérer dans NlInput/ProcessDiagram/etc.), mais toute interaction
  // avec lui (normalement bloquée par le calque plein écran de
  // WelcomeTour.tsx, sauf pour un raccourci clavier global comme Ctrl+Z
  // du diagramme) reste sans effet plutôt que de tenter une sauvegarde
  // vouée à échouer (projet fictif, absent du serveur).
  function handleWorkingChange(updated: Project) {
    if (!project || tourOpen) return
    dirtyRef.current = true
    setProject(fromWorkingProject(project, updated, activeVariant))
  }

  // Changement remonté depuis la vue de comparaison (VariantComparisonScreen) :
  // celle-ci route déjà chaque modification vers la bonne moitié du projet
  // réel (fromWorkingProject par panneau) avant d'appeler ceci — contrairement
  // à handleWorkingChange ci-dessus, pas de second passage par activeVariant.
  function handleComparisonChange(updated: Project) {
    if (tourOpen) return
    dirtyRef.current = true
    setProject(updated)
  }

  return (
    <div className="shell">
      <aside className={`shell-sidebar${sidebarCollapsed ? ' collapsed' : ''}`}>
        <div className="sidebar-top">
          {!sidebarCollapsed && (
            <h1>
              <Logo size={20} />
              MissionMapMaker
            </h1>
          )}
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
                <li key={s.id} className={view === 'project' && s.id === project?.id ? 'active' : ''}>
                  <button type="button" onClick={() => handleOpen(s.id)}>
                    <span className="project-name-text">{s.name}</span>
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
            title="Personas — consulter un persona à travers toutes les missions"
          >
            <Users size={16} aria-hidden="true" />
            {!sidebarCollapsed && 'Personas (toutes missions)'}
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
          {/* Rappel manuel de la visite guidée (WelcomeTour.tsx) pour qui
              l'a passée ou veut la revoir — seul point d'entrée hors du
              tout premier chargement de l'app. */}
          <button type="button" className="sidebar-replay-tour" onClick={() => setTourOpen(true)} title="Revoir la visite guidée">
            <CircleHelp size={16} aria-hidden="true" />
            {!sidebarCollapsed && 'Revoir la visite guidée'}
          </button>
        </div>
      </aside>

      {tourOpen && (
        <WelcomeTour
          step={tourStep}
          onNext={() => setTourStep((s) => Math.min(s + 1, TOUR_STEPS.length - 1))}
          onPrev={() => setTourStep((s) => Math.max(s - 1, 0))}
          onClose={closeTour}
        />
      )}

      {settingsOpen && (
        <SettingsModal onClose={() => setSettingsOpen(false)} onSettingsChange={setLlmConfigured} />
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
          <VariantComparisonScreen project={project} onChange={handleComparisonChange} onClose={() => setView('project')} />
        ) : project && workingProject ? (
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
                  Vue par persona
                </button>
              </nav>
              {/* Menu export/import au niveau de la barre d'onglets (pas
                  dans l'en-tête d'un seul onglet) : disponible depuis
                  n'importe quel onglet du projet ouvert (ADR-046). */}
              <ExportImportMenu project={workingProject} onChange={handleWorkingChange} onShowHistory={() => setHistoryOpen(true)} />
            </div>
            <div className="variant-toggle-row">
              <VariantToggle
                project={project}
                active={activeVariant}
                onSwitch={setActiveVariant}
                onCreateTarget={handleCreateTarget}
                onDeleteTarget={handleDeleteTarget}
                onCompare={() => setView('compare')}
                creating={creatingTarget}
              />
              {/* Sauvegarde automatique (voir runSave ci-dessus) — un seul
                  indicateur pour tous les onglets, plus de bouton
                  "Sauvegarder" ni de message par onglet. */}
              <span className="autosave-status" aria-live="polite">
                {saveStatus === 'saving' && 'Sauvegarde…'}
                {saveStatus === 'saved' && savedAt && `Sauvegardé à ${savedAt}`}
                {saveStatus === 'error' && (
                  <span className="autosave-status-error">
                    Échec de la sauvegarde : {saveErrorMsg}
                    <button
                      type="button"
                      onClick={() => {
                        dirtyRef.current = true
                        void runSave()
                      }}
                    >
                      Réessayer
                    </button>
                  </span>
                )}
              </span>
            </div>
            {/* key={project.id} sur chaque onglet (PAS sur activeVariant :
                basculer Actuel/Cible ne fait que changer les données
                affichées par les mêmes composants contrôlés, aucune raison
                de les démonter) : sans lui, passer d'un projet à un autre
                en restant sur le même onglet ne démonte/remonte pas le
                composant (seule sa prop `project` change), donc son état
                local (texte de la demande en langage naturel, message
                "Sauvegardé à...", erreur de génération...) restait affiché
                tel quel — décrivant encore le projet précédent alors que
                l'écran affiche déjà le nouveau. Remonter le composant à
                chaque changement de projet réinitialise tout son état
                local d'un coup, plutôt que de traquer et réinitialiser
                chaque state individuellement (voir ADR-048). */}
            {tab === 'generer' && (
              <NlInput key={project.id} project={workingProject} onChange={handleWorkingChange} onGenerated={() => setTab('edition')} />
            )}
            {tab === 'edition' && (
              <ProjectEditor key={project.id} project={workingProject} onChange={handleWorkingChange} />
            )}
            {tab === 'diagramme' && (
              <ProcessDiagram
                key={project.id}
                project={workingProject}
                onChange={handleWorkingChange}
                isTargetActive={activeVariant === 'target'}
                rootProject={project}
              />
            )}
            {tab === 'specifications' && (
              <SpecificationsPanel key={project.id} project={workingProject} onChange={handleWorkingChange} />
            )}
            {tab === 'acteur' && (
              <ActorView key={project.id} project={workingProject} onChange={handleWorkingChange} initialActorId={initialActorId} />
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
              Cartographiez un processus métier — personas, étapes, échanges — en langage naturel ou à la main, avec
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
