import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleHelp, Redo2, Undo2 } from 'lucide-react'
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  useReactFlow,
  useViewport,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { api } from '../../api/client'
import type { Activity, Interaction, Phase, Project } from '../../api/types'
import { generateAndMerge } from '../nl-input/generateUpdate'
import { ActorProfileModal } from '../actor-view/ActorProfileModal'
import { toWorkingProject } from '../project-shell/activeVariant'
import { HeaderMenu } from '../project-shell/HeaderMenu'
import { ActivityDetailModal } from './ActivityDetailModal'
import { dotMarkerId, gradientId, toFlowEdge } from './edgeRendering'
import { InteractionDetailModal } from './InteractionDetailModal'
import {
  CARD_HEIGHT_ESTIMATE,
  CARD_WIDTH,
  cellTopLeft,
  computeDropTarget,
  computeLayout,
  MAX_OFFSET_X,
  MAX_OFFSET_Y,
  type DropTarget,
} from './layout'
import { nodeTypes } from './nodes'
import { captureReactFlowPng, exportOffscreenProjectToPng, triggerPngDownload, waitForTransformSettled } from './pngExport'
import { SketchPreviewModal } from './SketchPreviewModal'
import './process-diagram.css'

interface Props {
  project: Project
  onChange: (project: Project) => void
  // Transmis à ActivityDetailModal -> PainPointSolutionsModal — voir ce
  // dernier fichier. false quand omis (onglet Diagramme utilisé hors du
  // contexte Actuel/Cible, ex. tests).
  isTargetActive?: boolean
  // Le vrai projet (Actuel + Cible), pour que l'export PNG puisse
  // proposer d'exporter l'autre variante que celle affichée à l'écran —
  // `project` ci-dessus, lui, porte déjà la CIBLE remplacée par l'ACTUEL
  // (ou l'inverse) selon activeVariant côté ProjectShell (voir
  // activeVariant.ts, toWorkingProject). Optionnel : omis, seule la
  // variante affichée est proposée à l'export (ex. tests).
  rootProject?: Project | null
}

// Doit rester cohérent avec maxTextLength côté serveur
// (internal/service/generate_service.go) et avec la même constante de
// NlInput.tsx : au-delà, la génération est de toute façon rejetée.
const MAX_TEXT_LENGTH = 20000

// Profondeur maximale de l'historique annuler/rétablir du diagramme (voir
// commitChange, ProcessDiagram) — un état complet du projet par entrée,
// bornée pour ne pas accumuler indéfiniment en mémoire sur une longue
// session d'édition.
const MAX_UNDO_HISTORY = 50

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

// Aperçu de dépose ("ombre") pendant le glisser d'une carte. Rendu en
// calque superposé (position CSS absolue, converti coordonnées du
// canevas -> écran via useViewport), plutôt que comme un nœud parmi
// `nodes` : passer un tableau `nodes` qui change à chaque frame du
// glisser cassait le rendu — React Flow resynchronise sa position interne
// sur le tableau contrôlé reçu en prop à chaque rendu, ce qui figeait la
// carte déplacée à sa position statique (calculée par computeLayout, donc
// indépendante du glisser en cours) au lieu de suivre le curseur.
function DropTargetPreview({ cellPosition }: { cellPosition: { x: number; y: number } | null }) {
  const viewport = useViewport()
  if (!cellPosition) return null
  return (
    <div
      className="drop-shadow-card"
      style={{
        position: 'absolute',
        left: viewport.x + cellPosition.x * viewport.zoom,
        top: viewport.y + cellPosition.y * viewport.zoom,
        width: CARD_WIDTH * viewport.zoom,
        height: CARD_HEIGHT_ESTIMATE * viewport.zoom,
      }}
    />
  )
}

// `fitView` (prop sur <ReactFlow>) ne recadre la vue qu'au montage : tant
// que l'onglet reste ouvert (génération d'un complément en langage
// naturel, boutons "+", CRUD dans l'onglet Édition...), le nombre de
// nœuds change mais la vue ne recadre jamais dessus — une activité créée
// hors du cadre actuel semble alors ne "rien changer" au diagramme, alors
// que la donnée a bien été mise à jour (ADR-043). Recadrer explicitement
// via useReactFlow().fitView() dès que le nombre de nœuds change corrige
// ce cas sans perturber le zoom/pan pendant une interaction qui ne change
// pas ce nombre (glisser-déposer, simple relecture...). Rendu comme
// enfant de <ReactFlow>, seul endroit où useReactFlow() est utilisable
// (même contrainte que useViewport() pour DropTargetPreview ci-dessus).
function AutoFitOnChange({ nodeCount }: { nodeCount: number }) {
  const { fitView } = useReactFlow()
  const prevCount = useRef(nodeCount)
  useEffect(() => {
    if (nodeCount !== prevCount.current) {
      fitView({ duration: 300, padding: 0.15 })
      prevCount.current = nodeCount
    }
  }, [nodeCount, fitView])
  return null
}

type ExportVariant = 'current' | 'target'

// Export PNG du diagramme (backlog blueprint #10), avec le choix de la
// variante quand la mission en a une (Actuel seulement, Cible seulement,
// ou les deux — sinon un simple bouton, pas de menu à ouvrir pour une
// seule option). useReactFlow() n'est utilisable qu'à l'intérieur de
// <ReactFlow>, d'où ce composant enfant plutôt qu'un bouton dans l'en-tête
// (hors de cet arbre).
function DownloadPngButton({
  project,
  isTargetActive,
  rootProject,
  onSketchGenerated,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: {
  // Le diagramme actuellement affiché (variante active) — sert à la fois
  // à l'export PNG technique (projectName) et au sketch IA ci-dessous
  // (noms d'acteurs/phases/activités, voir handleGenerateSketch).
  project: Project
  isTargetActive: boolean
  // Le vrai projet (Actuel + Cible), voir Props.rootProject ci-dessus —
  // null si non fourni (aucun choix de variante proposé, seule celle
  // affichée à l'écran est exportable).
  rootProject: Project | null
  // Remonte le sketch généré au parent (ProcessDiagram) plutôt que de le
  // télécharger directement d'ici — voir handleGenerateSketch : affiché
  // dans SketchPreviewModal (rendue hors de <ReactFlow>, ce composant-ci
  // vit dedans) avant tout téléchargement, jamais un fichier livré à
  // l'aveugle sans que l'utilisateur ait vu le résultat.
  onSketchGenerated: (dataUrl: string, filename: string) => void
  // Annuler/rétablir (voir commitChange/handleUndo/handleRedo,
  // ProcessDiagram) : l'historique lui-même vit dans le composant parent
  // (partagé avec tous les autres gestes d'édition du diagramme, pas
  // seulement l'export), ce bouton ne fait que déclencher/désactiver.
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
}) {
  const { fitView } = useReactFlow()
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sketching, setSketching] = useState(false)
  const [sketchError, setSketchError] = useState<string | null>(null)
  const hasTarget = Boolean(rootProject?.target)
  const projectName = project.name

  // Capture le canevas INTERACTIF déjà affiché à l'écran. Recadre via
  // fitView() (le même mécanisme, déjà fiable, qu'AutoFitOnChange
  // ci-dessus) plutôt que de recalculer soi-même la transformation à
  // partir de getNodesBounds/getViewportForBounds (approche standard de
  // la documentation React Flow) : ces deux fonctions s'appuient sur les
  // dimensions MESURÉES de chaque nœud (node.measured), qui se sont
  // avérées non renseignées pour ce diagramme au moment de l'export
  // (nœuds personnalisés sans dimension fixe déclarée) — bounds calculées
  // à partir de simples points (position x/y), sans tenir compte de la
  // largeur/hauteur réelle des cartes, ce qui sous-évaluait largement le
  // cadrage. fitView(), lui, s'appuie sur la même mesure DOM déjà
  // utilisée pour l'affichage normal du diagramme — donc déjà fiable par
  // construction.
  async function captureLiveCanvas(): Promise<string> {
    const viewportEl = document.querySelector<HTMLElement>('.process-diagram .react-flow__viewport')
    const transformBefore = viewportEl?.style.transform
    await fitView({ padding: 0.1, duration: 0 })
    await waitForTransformSettled(viewportEl, transformBefore)
    // Capture .process-diagram (et non .process-diagram .react-flow) : le
    // <svg><defs> des dégradés/marqueurs de flèches (dotMarkerId/gradientId,
    // edgeRendering.ts) est un FRÈRE de <ReactFlow>, pas un descendant — le
    // capturer est nécessaire pour que les url(#...) référencés par le
    // style des flèches restent résolubles dans le PNG exporté, sans quoi
    // le trait (et le marqueur de départ) devient invisible alors que la
    // pointe de flèche intégrée à React Flow, elle, survit (définie dans
    // son propre <svg>, à l'intérieur de .react-flow).
    const containerEl = document.querySelector<HTMLElement>('.process-diagram')
    if (!containerEl) throw new Error('Diagramme introuvable')
    return captureReactFlowPng(containerEl, viewportEl)
  }

  // La variante demandée est-elle celle actuellement affichée sur le
  // canevas interactif ? Si oui, la capturer directement (plus fidèle,
  // pas de second rendu) ; sinon, la rendre hors-écran (voir
  // exportOffscreenProjectToPng, pngExport.ts) sans jamais toucher à ce
  // qui est affiché à l'utilisateur ni à l'état édité par ProjectShell.
  async function exportOne(variant: ExportVariant) {
    const isLive = (variant === 'target') === isTargetActive
    const dataUrl = isLive
      ? await captureLiveCanvas()
      : await exportOffscreenProjectToPng(toWorkingProject(rootProject as Project, variant))
    const suffix = hasTarget ? (variant === 'target' ? ' — cible' : ' — actuel') : ''
    triggerPngDownload(dataUrl, `${projectName || 'diagramme'}${suffix}.png`)
  }

  async function handleExport(selection: ExportVariant | 'both') {
    setExporting(true)
    setError(null)
    try {
      if (selection === 'both') {
        await exportOne('current')
        await exportOne('target')
      } else {
        await exportOne(selection)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setExporting(false)
    }
  }

  // Génération d'image (ADR-073) : illustration "sketch" résumant le
  // diagramme actuellement affiché (variante active uniquement — pas de
  // choix Actuel/Cible/Les deux comme l'export PNG technique ci-dessus,
  // une illustration d'ensemble a moins besoin de cette granularité).
  // Jamais persistée sur le projet — mais affichée (onSketchGenerated,
  // voir SketchPreviewModal) avant tout téléchargement, contrairement à
  // l'export PNG technique ci-dessus qui télécharge directement (c'est
  // déjà un rendu FIDÈLE du diagramme affiché à l'écran, pas besoin d'un
  // second aperçu ; le sketch, lui, est une génération dont le résultat
  // mérite d'être vu avant de l'enregistrer).
  async function handleGenerateSketch() {
    setSketching(true)
    setSketchError(null)
    try {
      const { imageDataUrl } = await api.generateDiagramSketch({
        missionName: project.name,
        actorNames: project.actors.map((a) => a.name),
        phaseNames: [...project.phases].sort((a, b) => a.order - b.order).map((p) => p.name),
        activityNames: project.activities.map((a) => a.name),
      })
      onSketchGenerated(imageDataUrl, `${project.name || 'diagramme'} — sketch.png`)
    } catch (e) {
      setSketchError(String(e))
    } finally {
      setSketching(false)
    }
  }

  return (
    <Panel position="top-right" className="diagram-export-panel">
      <div className="diagram-toolbar-row">
        <button
          type="button"
          className="diagram-history-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Annuler (Ctrl+Z)"
          aria-label="Annuler la dernière action du diagramme"
        >
          <Undo2 size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="diagram-history-btn"
          onClick={onRedo}
          disabled={!canRedo}
          title="Rétablir (Ctrl+Maj+Z)"
          aria-label="Rétablir l'action annulée"
        >
          <Redo2 size={14} aria-hidden="true" />
        </button>
        {/* Menu burger unique : regroupe l'export PNG (technique, fidèle au
            diagramme affiché) ET la génération de sketch (illustration IA)
            — deux boutons séparés auparavant, fusionnés ici pour ne garder
            qu'un seul déclencheur dans ce coin du canevas, cohérent avec le
            menu burger des actions fichier (ExportImportMenu.tsx,
            ProjectShell.tsx). */}
        <HeaderMenu triggerClassName="png-export-trigger" triggerLabel="Export du diagramme (PNG) et génération d'un sketch IA">
          {hasTarget ? (
            <>
              <button type="button" onClick={() => handleExport('current')} disabled={exporting}>
                {exporting ? 'Export…' : 'Exporter en PNG — Actuel seulement'}
              </button>
              <button type="button" onClick={() => handleExport('target')} disabled={exporting}>
                {exporting ? 'Export…' : 'Exporter en PNG — Cible seulement'}
              </button>
              <button type="button" onClick={() => handleExport('both')} disabled={exporting}>
                {exporting ? 'Export…' : 'Exporter en PNG — Les deux'}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => handleExport('current')} disabled={exporting}>
              {exporting ? 'Export…' : 'Exporter en PNG'}
            </button>
          )}
          <button type="button" onClick={handleGenerateSketch} disabled={sketching}>
            {sketching ? 'Génération…' : 'Générer un sketch'}
          </button>
        </HeaderMenu>
      </div>
      {error && <span className="error">{error}</span>}
      {sketchError && <span className="error">{sketchError}</span>}
    </Panel>
  )
}

// Sauvegarde automatique (ProjectShell.tsx) : cet onglet ne persiste plus
// lui-même, il se contente de remonter chaque changement via onChange.
export function ProcessDiagram({ project, onChange, isTargetActive = false, rootProject = null }: Props) {
  const { nodes, edges } = useMemo(() => computeLayout(project), [project])
  // Astuces d'utilisation du diagramme (glisser-déposer, boutons "+"...) :
  // repliées par défaut plutôt qu'un paragraphe dense toujours affiché en
  // haut de l'écran — trouvé lors de l'audit UX/UI (ADR-068), c'était le
  // premier élément vu à chaque ouverture de l'onglet, sur tout projet,
  // même pour un utilisateur qui connaît déjà l'outil.
  const [hintOpen, setHintOpen] = useState(false)
  // Cellule (acteur, phase) visée par le glisser en cours, recalculée à
  // chaque déplacement (onNodeDrag) : sert à afficher un aperçu ("ombre")
  // de l'endroit où la carte atterrirait si on la lâchait maintenant.
  const [dragTarget, setDragTarget] = useState<DropTarget | null>(null)
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null)
  const [selectedInteractionId, setSelectedInteractionId] = useState<string | null>(null)
  const [selectedActorProfileId, setSelectedActorProfileId] = useState<string | null>(null)
  // Sketch IA généré (ADR-073) en attente d'aperçu/téléchargement — voir
  // DownloadPngButton.onSketchGenerated et SketchPreviewModal ci-dessous.
  const [sketchPreview, setSketchPreview] = useState<{ dataUrl: string; filename: string } | null>(null)
  const [updateText, setUpdateText] = useState('')
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [updateNotConfigured, setUpdateNotConfigured] = useState(false)

  // Annuler/rétablir une action du diagramme — pile locale d'états
  // précédents, indépendante de la sauvegarde automatique (ProjectShell.tsx) :
  // chaque geste d'édition (glisser-déposer, ajout de phase/activité,
  // création d'interaction, modification via une modale de détail...)
  // passe par commitChange ci-dessous plutôt que d'appeler onChange
  // directement, pour être capturé dans l'historique. Bornée
  // (MAX_UNDO_HISTORY) pour ne pas accumuler indéfiniment en mémoire sur
  // une longue session d'édition.
  const [past, setPast] = useState<Project[]>([])
  const [future, setFuture] = useState<Project[]>([])

  // Changer de variante (Actuel/Cible) remplace entièrement `project` par
  // un diagramme sans rapport avec l'historique accumulé jusque-là — sans
  // remonter ProcessDiagram (contrairement à l'ouverture d'un autre
  // projet, qui le fait via key={project.id}, voir ProjectShell.tsx),
  // donc à vider explicitement ici plutôt que de laisser les piles
  // pointer vers la mauvaise variante.
  useEffect(() => {
    setPast([])
    setFuture([])
  }, [isTargetActive])

  function commitChange(next: Project) {
    setPast((p) => [...p, project].slice(-MAX_UNDO_HISTORY))
    setFuture([])
    onChange(next)
  }

  function handleUndo() {
    if (past.length === 0) return
    const previous = past[past.length - 1]
    setPast((p) => p.slice(0, -1))
    setFuture((f) => [project, ...f].slice(0, MAX_UNDO_HISTORY))
    onChange(previous)
  }

  function handleRedo() {
    if (future.length === 0) return
    const next = future[0]
    setFuture((f) => f.slice(1))
    setPast((p) => [...p, project].slice(-MAX_UNDO_HISTORY))
    onChange(next)
  }

  // Raccourcis clavier standards — ignorés si le focus est dans un champ
  // texte (saisie en cours dans une modale de détail, le champ de mise à
  // jour en langage naturel...) : Ctrl/Cmd+Z y doit annuler la frappe
  // elle-même (comportement natif du navigateur), pas une action du
  // diagramme.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return
      const key = e.key.toLowerCase()
      if (!(e.ctrlKey || e.metaKey) || key !== 'z') return
      e.preventDefault()
      if (e.shiftKey) {
        handleRedo()
      } else {
        handleUndo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, past, future])

  const startColors = useMemo(() => [...new Set(edges.map((e) => e.sourceColor))], [edges])

  const dragTargetPosition = useMemo(
    () => (dragTarget ? cellTopLeft(nodes, dragTarget) : null),
    [dragTarget, nodes],
  )

  // Décrire des ajouts/modifications en langage naturel sans quitter le
  // diagramme : même pipeline que l'onglet "Générer" (generateAndMerge,
  // partagé avec NlInput.tsx — voir generateUpdate.ts), qui fournit au LLM
  // le processus déjà existant en contexte pour qu'il puisse à la fois
  // éviter les doublons ET exprimer de vraies modifications d'activités
  // déjà présentes (renommage, description précisée, changement
  // d'acteur/de phase) plutôt que de rester sans effet faute de savoir ce
  // qui existe déjà (ADR-040).
  async function handleGenerateUpdate() {
    if (!updateText.trim()) return
    setUpdating(true)
    setUpdateError(null)
    setUpdateNotConfigured(false)
    try {
      commitChange(await generateAndMerge(project, updateText))
      setUpdateText('')
    } catch (e) {
      const message = String(e)
      if (message.includes('clé API non configurée')) {
        setUpdateNotConfigured(true)
      } else {
        setUpdateError(message)
      }
    } finally {
      setUpdating(false)
    }
  }

  // Pendant le glisser (avant le lâcher), recalcule en continu la cellule
  // visée pour y afficher un aperçu — voir dropShadowNode ci-dessus et
  // .drop-shadow-card en CSS.
  function handleNodeDrag(_event: unknown, node: Node) {
    const activity = project.activities.find((a) => a.id === node.id)
    if (!activity) return
    setDragTarget(computeDropTarget(project, nodes, node.position, activity.actorId, activity.phaseId))
  }

  // Glisser-déposer une carte d'activité la réassigne à l'acteur/la phase
  // de la cellule où elle a été lâchée (et à la position voulue au sein
  // de la pile de cette cellule, si plusieurs activités s'y trouvent déjà
  // — voir computeDropTarget). Comme pour les autres onglets, remonte par
  // onChange et sera sauvegardé automatiquement (ProjectShell.tsx).
  function handleNodeDragStop(_event: unknown, node: Node) {
    setDragTarget(null)
    const activity = project.activities.find((a) => a.id === node.id)
    if (!activity) return // pas une carte d'activité (les en-têtes ne sont pas déplaçables)

    const target = computeDropTarget(project, nodes, node.position, activity.actorId, activity.phaseId)
    if (!target) return

    const targetSubRow = Math.max(target.subRowIndex, 0)
    const siblings = project.activities
      .filter(
        (a) =>
          a.id !== activity.id &&
          a.actorId === target.actorId &&
          a.phaseId === target.phaseId &&
          Math.max(a.subRow, 0) === targetSubRow,
      )
      .sort((a, b) => a.order - b.order)
    const rawIndex = Math.max(target.subColumnIndex, 0)

    let updatedActivities: Activity[]
    if (rawIndex <= siblings.length) {
      // Dépose au sein (ou juste après) de la pile actuelle des activités
      // de cet acteur dans cette phase (et cette sous-ligne) : réordonne
      // par `order`, comme avant l'ajout des colonnes explicites. `column`
      // est remis à 0 pour repasser en empilement automatique, au cas où
      // cette carte avait une position explicite d'un déplacement
      // précédent. `subRow` est fixé à la sous-ligne visée (0 = ligne
      // principale de l'acteur).
      const sequence = [
        ...siblings.slice(0, rawIndex).map((a) => a.id),
        activity.id,
        ...siblings.slice(rawIndex).map((a) => a.id),
      ]
      const orderById = new Map(sequence.map((id, i) => [id, i]))

      updatedActivities = project.activities.map((a) => {
        if (a.id === activity.id) {
          return {
            ...a,
            actorId: target.actorId,
            phaseId: target.phaseId,
            column: 0,
            subRow: targetSubRow,
            order: orderById.get(a.id) ?? a.order,
          }
        }
        return orderById.has(a.id) ? { ...a, order: orderById.get(a.id) ?? a.order } : a
      })
    } else {
      // Dépose au-delà de ce que l'empilement automatique de cet acteur
      // occuperait dans cette phase (et cette sous-ligne) : l'intention est
      // de s'aligner sur une sous-colonne précise qu'un AUTRE acteur a fait
      // apparaître dans cette phase (voir ADR-020). On fixe une position
      // explicite plutôt que d'insérer dans la pile de cet acteur, qui
      // n'irait de toute façon pas jusque-là.
      updatedActivities = project.activities.map((a) =>
        a.id === activity.id
          ? { ...a, actorId: target.actorId, phaseId: target.phaseId, column: rawIndex, subRow: targetSubRow }
          : a,
      )
    }

    // Décalage fin (ADR-051) : au-delà de la case elle-même (déterminée
    // ci-dessus), l'écart entre le point de dépose réel et la position par
    // défaut de cette case affine la position affichée sans changer la
    // case — computeLayout de la position par défaut (offsetX/Y remis à 0
    // le temps du calcul) sert de référence, plutôt que de dupliquer ici
    // la logique de résolution des sous-colonnes (resolveColumns).
    const zeroed = updatedActivities.map((a) => (a.id === activity.id ? { ...a, offsetX: 0, offsetY: 0 } : a))
    const defaultNode = computeLayout({ ...project, activities: zeroed }).nodes.find((n) => n.id === activity.id)
    const defaultPosition = defaultNode?.position ?? node.position
    const offsetX = Math.min(Math.max(node.position.x - defaultPosition.x, 0), MAX_OFFSET_X)
    const offsetY = Math.min(Math.max(node.position.y - defaultPosition.y, 0), MAX_OFFSET_Y)

    commitChange({
      ...project,
      activities: zeroed.map((a) => (a.id === activity.id ? { ...a, offsetX, offsetY } : a)),
    })
  }

  // Glisser depuis la poignée d'une carte vers celle d'une autre crée
  // directement une interaction entre les deux activités, sans repasser
  // par l'onglet Édition. Le texte "Information échangée" (même valeur
  // par défaut que le bouton "+ Ajouter une interaction" de l'onglet
  // Édition) reste à préciser ensuite — cohérent avec le reste de l'app,
  // qui ne suppose jamais un texte final généré automatiquement. Cliquer
  // sur la flèche fraîchement créée (InteractionDetailModal, voir
  // handleEdgeClick) permet de la nommer sans quitter le diagramme, en
  // plus de l'édition déjà possible dans l'onglet Édition (ADR-049).
  // Les poignées de départ/arrivée réellement utilisées ne sont pas
  // mémorisées : computeLayout choisit le routage (haut/bas ou
  // gauche/droite) à partir de la topologie à chaque rendu, comme pour
  // toute autre interaction du projet.
  function handleConnect(connection: Connection) {
    const { source, target } = connection
    if (!source || !target || source === target) return
    const interaction: Interaction = {
      id: newId('int'),
      fromActivityId: source,
      toActivityId: target,
      information: 'Information échangée',
    }
    commitChange({ ...project, interactions: [...project.interactions, interaction] })
  }

  // Bouton "+ Phase" de la colonne ajoutée après la dernière phase : même
  // logique que "+ Ajouter une phase" de l'onglet Édition (nom par
  // défaut à préciser ensuite), pour construire le diagramme sans y
  // aller et venir.
  function addPhase() {
    const phase: Phase = { id: newId('ph'), name: 'Nouvelle phase', order: project.phases.length + 1, subColumns: 0, icon: '' }
    commitChange({ ...project, phases: [...project.phases, phase] })
  }

  // Bouton "+" en coin de l'en-tête de phase : réserve une sous-colonne
  // supplémentaire pour CETTE phase (voir Phase.subColumns), avant même
  // qu'une activité y soit déposée — sans quoi il n'y aurait nulle part où
  // glisser-déposer une activité pour la faire apparaître.
  function addSubColumnForPhase(phaseId: string) {
    commitChange({
      ...project,
      phases: project.phases.map((p) => (p.id === phaseId ? { ...p, subColumns: Math.max(p.subColumns, 1) + 1 } : p)),
    })
  }

  // Symétrique de addSubColumnForPhase, sur l'axe vertical (voir
  // Actor.subLanes).
  function addSubLaneForActor(actorId: string) {
    commitChange({
      ...project,
      actors: project.actors.map((a) => (a.id === actorId ? { ...a, subLanes: Math.max(a.subLanes, 1) + 1 } : a)),
    })
  }

  // Bouton "+ Activité" de la cellule d'un acteur, même colonne : ajoute
  // une activité pour CET acteur (contrairement à l'onglet Édition, qui
  // prend toujours le premier acteur/la première phase par défaut —
  // ici l'acteur est déjà connu du contexte). Placée dans la première
  // phase par défaut ; à repositionner ensuite par glisser-déposer ou
  // depuis l'onglet Édition, comme toute activité.
  function addActivityForActor(actorId: string) {
    if (project.phases.length === 0) return
    const activity: Activity = {
      id: newId('a'),
      name: 'Nouvelle activité',
      actorId,
      phaseId: project.phases[0].id,
      order: project.activities.length + 1,
      column: 0,
      subRow: 0,
      offsetX: 0,
      offsetY: 0,
      description: '',
      userStories: [],
      traceLinks: [],
      painPoints: [],
    }
    commitChange({ ...project, activities: [...project.activities, activity] })
  }

  // Clic sur une carte d'activité : ouvre la consultation de ses
  // spécifications et tests V&V liés (voir ActivityDetailModal). Clic sur
  // un bouton "+" de la colonne d'ajout : crée la phase/l'activité
  // correspondante. Clic sur le bouton "+" en coin d'un en-tête de
  // phase/acteur (voir nodes.tsx) : réserve une sous-colonne/sous-ligne
  // supplémentaire — distingué du reste de l'en-tête (qui n'a pas
  // d'action au clic) via event.target, React Flow ne remontant pas
  // d'identifiant de sous-élément cliqué.
  function handleNodeClick(event: React.MouseEvent, node: Node) {
    if (node.type === 'activity') {
      setSelectedActivityId(node.id)
    } else if (node.type === 'addPhase') {
      addPhase()
    } else if (node.type === 'addActivity') {
      addActivityForActor(node.data.actorId as string)
    } else if (node.type === 'phaseHeader' && (event.target as HTMLElement).closest('.add-subcolumn-button')) {
      addSubColumnForPhase(node.data.phaseId as string)
    } else if (node.type === 'actorHeader') {
      if ((event.target as HTMLElement).closest('.add-sublane-button')) {
        addSubLaneForActor(node.data.actorId as string)
      } else {
        setSelectedActorProfileId(node.data.actorId as string)
      }
    } else if (node.type === 'painPointCell') {
      const activityId = (event.target as HTMLElement).closest('[data-activity-id]')?.getAttribute('data-activity-id')
      if (activityId) setSelectedActivityId(activityId)
    }
  }

  // Clic sur une flèche d'interaction : ouvre InteractionDetailModal pour
  // la nommer/renommer directement depuis le diagramme (voir handleConnect
  // ci-dessus, qui ne pose qu'un texte générique à préciser ensuite).
  function handleEdgeClick(_event: React.MouseEvent, edge: Edge) {
    setSelectedInteractionId(edge.id)
  }

  if (project.actors.length === 0 || project.phases.length === 0) {
    return <p className="placeholder">Ajoutez au moins un persona et une phase pour voir le diagramme.</p>
  }

  return (
    <div className="process-diagram-page">
      <header className="editor-header">
        <button
          type="button"
          className="diagram-hint-toggle"
          onClick={() => setHintOpen((v) => !v)}
          aria-expanded={hintOpen}
        >
          <CircleHelp size={14} aria-hidden="true" />
          Comment utiliser ce diagramme
        </button>
      </header>
      {hintOpen && (
        <p className="nl-hint diagram-hint-text">
          Glissez-déposez une carte pour la réassigner, glissez depuis le bord d'une carte vers une autre pour créer
          une interaction (cliquez ensuite sur la flèche pour la nommer), cliquez sur une carte pour consulter ses
          spécifications et tests liés, cliquez sur le nom d'un persona pour ouvrir sa fiche (à propos, bio,
          objectifs, points de friction du métier), utilisez les boutons "+" après la dernière phase pour ajouter
          une phase ou une activité, ou le petit "+" en coin d'un en-tête pour ajouter une colonne (phase) ou une
          ligne (persona) supplémentaire.
        </p>
      )}
      <div className="diagram-nl-update">
        <textarea
          rows={2}
          maxLength={MAX_TEXT_LENGTH}
          placeholder="Décrivez des ajouts ou modifications en langage naturel (ex. « le support escalade aussi les tickets urgents au responsable »)…"
          value={updateText}
          onChange={(e) => setUpdateText(e.target.value)}
        />
        <button type="button" onClick={handleGenerateUpdate} disabled={updating || !updateText.trim()}>
          {updating ? 'Mise à jour…' : 'Mettre à jour le diagramme'}
        </button>
      </div>
      {updateNotConfigured && (
        <div className="nl-warning">
          Génération indisponible : aucune clé API n'est configurée. Ouvrez <strong>Paramètres</strong> en bas de
          la barre latérale pour en saisir une, ou utilisez l'édition manuelle.
        </div>
      )}
      {updateError && <p className="error">{updateError}</p>}
      <div className="process-diagram">
        {/* Défini une fois, référencé par les styles/markers des flèches
            ci-dessus : dégradé par flèche (couleur départ -> arrivée) et un
            marqueur "point de départ" mutualisé par couleur d'acteur. */}
        <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden="true">
          <defs>
            {edges.map((e) => (
              <linearGradient
                key={e.id}
                id={gradientId(e.id)}
                gradientUnits="userSpaceOnUse"
                x1={e.gradient.x1}
                y1={e.gradient.y1}
                x2={e.gradient.x2}
                y2={e.gradient.y2}
              >
                <stop offset="0%" stopColor={e.sourceColor} />
                <stop offset="100%" stopColor={e.targetColor} />
              </linearGradient>
            ))}
            {startColors.map((color) => (
              <marker
                key={color}
                id={dotMarkerId(color)}
                markerWidth={8}
                markerHeight={8}
                refX={4}
                refY={4}
                viewBox="0 0 8 8"
              >
                <circle cx={4} cy={4} r={3.2} fill={color} />
              </marker>
            ))}
          </defs>
        </svg>
        <ReactFlow
          nodes={nodes as unknown as Node[]}
          edges={edges.map(toFlowEdge)}
          nodeTypes={nodeTypes}
          fitView
          nodesConnectable
          elementsSelectable
          panOnScroll
          zoomOnScroll
          // Le zoom minimal par défaut de React Flow (0.5) empêchait
          // fitView() de dézoomer suffisamment pour un diagramme à
          // beaucoup de phases/acteurs — trouvé lors de la vérification de
          // l'export PNG (ADR-072) : la colonne d'acteurs se retrouvait
          // partiellement hors du cadre visible (masquée par l'overflow du
          // conteneur), y compris dans la vue interactive normale, pas
          // seulement à l'export.
          minZoom={0.1}
          onNodeDrag={handleNodeDrag}
          onNodeDragStop={handleNodeDragStop}
          onConnect={handleConnect}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
        >
          <Background gap={24} />
          <Controls showInteractive={false} />
          <DropTargetPreview cellPosition={dragTargetPosition} />
          <AutoFitOnChange nodeCount={nodes.length} />
          <DownloadPngButton
            project={project}
            isTargetActive={isTargetActive}
            rootProject={rootProject}
            onSketchGenerated={(dataUrl, filename) => setSketchPreview({ dataUrl, filename })}
            canUndo={past.length > 0}
            canRedo={future.length > 0}
            onUndo={handleUndo}
            onRedo={handleRedo}
          />
        </ReactFlow>
      </div>
      {selectedActivityId && (
        <ActivityDetailModal
          project={project}
          activityId={selectedActivityId}
          onChange={commitChange}
          onClose={() => setSelectedActivityId(null)}
          isTargetActive={isTargetActive}
        />
      )}
      {selectedInteractionId && (
        <InteractionDetailModal
          project={project}
          interactionId={selectedInteractionId}
          onChange={commitChange}
          onClose={() => setSelectedInteractionId(null)}
        />
      )}
      {selectedActorProfileId && (
        <ActorProfileModal
          project={project}
          actorId={selectedActorProfileId}
          onChange={commitChange}
          onClose={() => setSelectedActorProfileId(null)}
        />
      )}
      {sketchPreview && (
        <SketchPreviewModal
          dataUrl={sketchPreview.dataUrl}
          filename={sketchPreview.filename}
          onClose={() => setSketchPreview(null)}
        />
      )}
    </div>
  )
}
