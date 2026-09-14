import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleHelp, ImageDown } from 'lucide-react'
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Panel,
  useReactFlow,
  useViewport,
  type Connection,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { toPng } from 'html-to-image'
import type { Activity, Interaction, Phase, Project } from '../../api/types'
import { generateAndMerge } from '../nl-input/generateUpdate'
import { ActorProfileModal } from '../actor-view/ActorProfileModal'
import { ActivityDetailModal } from './ActivityDetailModal'
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
  type LayoutEdge,
} from './layout'
import { nodeTypes } from './nodes'
import './process-diagram.css'

interface Props {
  project: Project
  onChange: (project: Project) => void
  // Transmis à ActivityDetailModal -> PainPointSolutionsModal — voir ce
  // dernier fichier. false quand omis (onglet Diagramme utilisé hors du
  // contexte Actuel/Cible, ex. tests).
  isTargetActive?: boolean
}

// Doit rester cohérent avec maxTextLength côté serveur
// (internal/service/generate_service.go) et avec la même constante de
// NlInput.tsx : au-delà, la génération est de toute façon rejetée.
const MAX_TEXT_LENGTH = 20000

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

// pixelRatio de l'export = 1 / zoom courant (voir handleExport) plutôt
// qu'un facteur fixe basé sur la taille du CONTENEUR à l'écran (ancienne
// approche, insuffisante) : plus un diagramme a de phases/acteurs, plus
// fitView() doit zoomer pour tout faire tenir dans la même fenêtre, donc
// plus le texte affiché — et capturé — est petit. 1/zoom restitue au
// contraire la densité NATIVE de chaque carte (celle qu'elle aurait à
// 100 % de zoom) quel que soit le nombre de phases/acteurs : l'image
// grandit avec le contenu plutôt que le texte rétrécissant avec lui.
// EXPORT_ABSOLUTE_MAX_DIMENSION reste un garde-fou dur sur la plus grande
// dimension de l'image finale (mémoire, poids du fichier, limite de
// canevas du navigateur) qui prime sur 1/zoom pour un diagramme
// réellement démesuré ; EXPORT_MAX_PIXEL_RATIO borne le grossissement
// même pour un tout petit diagramme très zoomé.
const EXPORT_MIN_PIXEL_RATIO = 1
const EXPORT_MAX_PIXEL_RATIO = 8
const EXPORT_ABSOLUTE_MAX_DIMENSION = 8000

// Exclut du PNG capturé les éléments de chrome de l'interface, sans
// équivalent sur une image destinée à être partagée/imprimée :
// - les nœuds "+ Phase"/"+ Activité" (classe react-flow__node-<type>,
//   voir @xyflow/react) : affordances d'édition ;
// - les petits "+" en coin des en-têtes de phase/acteur (add-subcolumn/
//   add-sublane) — mêmes classes déjà masquées par .diagram-readonly pour
//   ReadOnlyProcessDiagram (ADR-063), même raison ici ;
// - les poignées de connexion (classe react-flow__handle) : de petits
//   ronds toujours dans le DOM (voir HANDLE_OFFSETS, nodes.tsx),
//   pratiquement invisibles au zoom habituel du diagramme affiché à
//   l'écran mais qui ressortent nettement une fois le contenu mis à
//   l'échelle pour occuper toute la résolution d'export ;
// - les boutons de zoom (Controls), CE panneau d'export lui-même
//   (react-flow__panel) et le filigrane "React Flow" (attribution) : chrome
//   de l'outil, pas du diagramme.
const PNG_EXPORT_EXCLUDED_CLASSES = [
  'react-flow__handle',
  'react-flow__node-addPhase',
  'react-flow__node-addActivity',
  'add-subcolumn-button',
  'add-sublane-button',
  'react-flow__controls',
  'react-flow__panel',
  'react-flow__attribution',
]

function shouldIncludeInPngExport(node: Element): boolean {
  const classList = (node as HTMLElement).classList
  if (!classList) return true
  return !PNG_EXPORT_EXCLUDED_CLASSES.some((c) => classList.contains(c))
}

// Export PNG du diagramme (backlog blueprint #10, ADR-072) — mêmes
// contraintes que AutoFitOnChange ci-dessus : useReactFlow() n'est
// utilisable qu'à l'intérieur de <ReactFlow>, d'où ce composant enfant
// plutôt qu'un bouton dans l'en-tête (hors de cet arbre).
//
// Recadre via fitView() (le même mécanisme, déjà fiable, qu'AutoFitOnChange
// ci-dessus) plutôt que de recalculer soi-même la transformation à partir
// de getNodesBounds/getViewportForBounds (approche standard de la
// documentation React Flow) : ces deux fonctions s'appuient sur les
// dimensions MESURÉES de chaque nœud (node.measured), qui se sont avérées
// non renseignées pour ce diagramme au moment de l'export (nœuds
// personnalisés sans dimension fixe déclarée) — bounds calculées à partir
// de simples points (position x/y), sans tenir compte de la largeur/hauteur
// réelle des cartes, ce qui sous-évaluait largement le cadrage et laissait
// une bande vide disproportionnée sur l'image. fitView(), lui, s'appuie sur
// la même mesure DOM déjà utilisée pour l'affichage normal du diagramme —
// donc déjà fiable par construction — plutôt que d'y ajouter une deuxième
// dépendance.
function DownloadPngButton({ projectName }: { projectName: string }) {
  const { fitView, getZoom } = useReactFlow()
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setExporting(true)
    setError(null)
    try {
      const viewportEl = document.querySelector<HTMLElement>('.process-diagram .react-flow__viewport')
      const transformBefore = viewportEl?.style.transform

      await fitView({ padding: 0.1, duration: 0 })

      // fitView met à jour l'état interne de façon synchrone, mais le style
      // CSS qui en découle ne se reflète dans le DOM qu'au prochain rendu
      // React (commit + peinture) — un nombre fixe de frames attendues
      // s'est avéré insuffisant sur un gros diagramme (colonne d'acteurs
      // encore tronquée sur l'image capturée) : on attend activement que
      // le transform ait réellement changé plutôt que de deviner un délai,
      // borné à 20 frames (~300ms) pour ne jamais bloquer indéfiniment si
      // le nouveau cadrage recalculé est identique au précédent.
      for (let i = 0; i < 20; i++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        if (viewportEl && viewportEl.style.transform !== transformBefore) break
      }

      const containerEl = document.querySelector<HTMLElement>('.process-diagram .react-flow')
      if (!containerEl) throw new Error('Diagramme introuvable')

      const rect = containerEl.getBoundingClientRect()
      const zoom = getZoom()
      // Densité native (1/zoom) bornée par le garde-fou de taille finale
      // ET par EXPORT_MAX_PIXEL_RATIO — voir le commentaire sur ces
      // constantes ci-dessus.
      const nativeScaleRatio = zoom > 0 ? 1 / zoom : EXPORT_MAX_PIXEL_RATIO
      const dimensionCapRatio = EXPORT_ABSOLUTE_MAX_DIMENSION / Math.max(rect.width, rect.height, 1)
      const pixelRatio = Math.max(
        EXPORT_MIN_PIXEL_RATIO,
        Math.min(nativeScaleRatio, dimensionCapRatio, EXPORT_MAX_PIXEL_RATIO),
      )

      const dataUrl = await toPng(containerEl, {
        backgroundColor: '#ffffff',
        pixelRatio,
        filter: shouldIncludeInPngExport,
      })

      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `${projectName || 'diagramme'}.png`.replace(/[/\\?%*:|"<>]/g, '_')
      a.click()
    } catch (e) {
      setError(String(e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <Panel position="top-right" className="diagram-export-panel">
      <button type="button" onClick={handleExport} disabled={exporting}>
        <ImageDown size={14} aria-hidden="true" />
        {exporting ? 'Export…' : 'Exporter en PNG'}
      </button>
      {error && <span className="error">{error}</span>}
    </Panel>
  )
}

// Id DOM-safe pour un marqueur de départ partagé par toutes les flèches
// issues d'un acteur de cette couleur (évite de dupliquer un <marker> par
// flèche alors que la couleur, elle, ne varie que par acteur).
// Exportée avec gradientId/toFlowEdge ci-dessous : réutilisées telles
// quelles par ReadOnlyProcessDiagram.tsx (vue de comparaison de variantes,
// ADR-063), qui a besoin du même rendu de flèches sans dupliquer cette
// logique.
export function dotMarkerId(color: string) {
  return `mmm-dot-${color.replace('#', '')}`
}

export function gradientId(edgeId: string) {
  return `mmm-grad-${edgeId}`
}

// Une interaction conditionnelle (embranchement, ADR-060) affiche sa
// condition en préfixe ("Si <condition>"), suivie de l'information
// échangée si elle est également renseignée — plutôt que deux libellés
// séparés sur la même flèche. Une preuve physique (service blueprint,
// ADR-071), quand renseignée, s'ajoute en suffixe derrière une icône
// 🧾 : signale sa présence sans avoir à ouvrir l'interaction, sans pour
// autant justifier un nouveau badge dédié comme .activity-card-branch
// (bien plus rare qu'un embranchement, une flèche à la fois suffit).
function edgeLabel(e: LayoutEdge): string {
  const base = !e.condition ? e.label : e.label ? `Si ${e.condition} — ${e.label}` : `Si ${e.condition}`
  if (!e.physicalEvidence) return base
  const evidence = `🧾 ${e.physicalEvidence}`
  return base ? `${base} · ${evidence}` : evidence
}

export function toFlowEdge(e: LayoutEdge): Edge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    label: edgeLabel(e),
    type: 'smoothstep',
    // Le trait passe de la couleur de l'acteur de départ à celle de
    // l'acteur d'arrivée (voir <defs> ci-dessous) : on peut suivre une
    // flèche à l'œil même quand elle traverse plusieurs acteurs. Une
    // interaction conditionnelle (embranchement) est en plus tracée en
    // pointillés, pour la distinguer d'un flux systématique sans avoir à
    // lire le libellé.
    style: {
      stroke: `url(#${gradientId(e.id)})`,
      strokeWidth: 2,
      strokeDasharray: e.condition ? '6 4' : undefined,
    },
    // Point de départ : petit disque plein dans la couleur de l'acteur
    // source. Pointe d'arrivée : flèche pleine dans la couleur de
    // l'acteur cible, plus large que le trait pour bien marquer la fin.
    markerStart: dotMarkerId(e.sourceColor),
    markerEnd: { type: MarkerType.ArrowClosed, color: e.targetColor, width: 18, height: 18 },
    labelStyle: { fontSize: 11, fontWeight: 600, fill: 'var(--color-text)' },
    labelBgStyle: { fill: '#ffffff', fillOpacity: 0.92 },
    labelBgPadding: [5, 3],
    labelBgBorderRadius: 4,
  }
}

// Sauvegarde automatique (ProjectShell.tsx) : cet onglet ne persiste plus
// lui-même, il se contente de remonter chaque changement via onChange.
export function ProcessDiagram({ project, onChange, isTargetActive = false }: Props) {
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
  const [updateText, setUpdateText] = useState('')
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [updateNotConfigured, setUpdateNotConfigured] = useState(false)

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
      onChange(await generateAndMerge(project, updateText))
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

    onChange({
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
    onChange({ ...project, interactions: [...project.interactions, interaction] })
  }

  // Bouton "+ Phase" de la colonne ajoutée après la dernière phase : même
  // logique que "+ Ajouter une phase" de l'onglet Édition (nom par
  // défaut à préciser ensuite), pour construire le diagramme sans y
  // aller et venir.
  function addPhase() {
    const phase: Phase = { id: newId('ph'), name: 'Nouvelle phase', order: project.phases.length + 1, subColumns: 0, icon: '' }
    onChange({ ...project, phases: [...project.phases, phase] })
  }

  // Bouton "+" en coin de l'en-tête de phase : réserve une sous-colonne
  // supplémentaire pour CETTE phase (voir Phase.subColumns), avant même
  // qu'une activité y soit déposée — sans quoi il n'y aurait nulle part où
  // glisser-déposer une activité pour la faire apparaître.
  function addSubColumnForPhase(phaseId: string) {
    onChange({
      ...project,
      phases: project.phases.map((p) => (p.id === phaseId ? { ...p, subColumns: Math.max(p.subColumns, 1) + 1 } : p)),
    })
  }

  // Symétrique de addSubColumnForPhase, sur l'axe vertical (voir
  // Actor.subLanes).
  function addSubLaneForActor(actorId: string) {
    onChange({
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
    onChange({ ...project, activities: [...project.activities, activity] })
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
          <DownloadPngButton projectName={project.name} />
        </ReactFlow>
      </div>
      {selectedActivityId && (
        <ActivityDetailModal
          project={project}
          activityId={selectedActivityId}
          onChange={onChange}
          onClose={() => setSelectedActivityId(null)}
          isTargetActive={isTargetActive}
        />
      )}
      {selectedInteractionId && (
        <InteractionDetailModal
          project={project}
          interactionId={selectedInteractionId}
          onChange={onChange}
          onClose={() => setSelectedInteractionId(null)}
        />
      )}
      {selectedActorProfileId && (
        <ActorProfileModal
          project={project}
          actorId={selectedActorProfileId}
          onChange={onChange}
          onClose={() => setSelectedActorProfileId(null)}
        />
      )}
    </div>
  )
}
