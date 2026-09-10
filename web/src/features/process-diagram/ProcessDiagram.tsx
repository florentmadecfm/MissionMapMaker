import { useMemo, useState } from 'react'
import { ReactFlow, Background, Controls, MarkerType, useViewport, type Connection, type Edge, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { api } from '../../api/client'
import type { Interaction, Project } from '../../api/types'
import { ActivityDetailModal } from './ActivityDetailModal'
import {
  CARD_HEIGHT_ESTIMATE,
  CARD_WIDTH,
  cellTopLeft,
  computeDropTarget,
  computeLayout,
  type DropTarget,
  type LayoutEdge,
} from './layout'
import { nodeTypes } from './nodes'
import './process-diagram.css'

interface Props {
  project: Project
  onChange: (project: Project) => void
  onSaved: () => void
}

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

// Id DOM-safe pour un marqueur de départ partagé par toutes les flèches
// issues d'un acteur de cette couleur (évite de dupliquer un <marker> par
// flèche alors que la couleur, elle, ne varie que par acteur).
function dotMarkerId(color: string) {
  return `mmm-dot-${color.replace('#', '')}`
}

function gradientId(edgeId: string) {
  return `mmm-grad-${edgeId}`
}

function toFlowEdge(e: LayoutEdge): Edge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    label: e.label,
    type: 'smoothstep',
    // Le trait passe de la couleur de l'acteur de départ à celle de
    // l'acteur d'arrivée (voir <defs> ci-dessous) : on peut suivre une
    // flèche à l'œil même quand elle traverse plusieurs acteurs.
    style: { stroke: `url(#${gradientId(e.id)})`, strokeWidth: 2 },
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

export function ProcessDiagram({ project, onChange, onSaved }: Props) {
  const { nodes, edges } = useMemo(() => computeLayout(project), [project])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  // Cellule (acteur, phase) visée par le glisser en cours, recalculée à
  // chaque déplacement (onNodeDrag) : sert à afficher un aperçu ("ombre")
  // de l'endroit où la carte atterrirait si on la lâchait maintenant.
  const [dragTarget, setDragTarget] = useState<DropTarget | null>(null)
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(null)

  const startColors = useMemo(() => [...new Set(edges.map((e) => e.sourceColor))], [edges])

  const dragTargetPosition = useMemo(
    () => (dragTarget ? cellTopLeft(nodes, dragTarget) : null),
    [dragTarget, nodes],
  )

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const saved = await api.saveProject(project)
      onChange(saved)
      onSaved()
      setSavedAt(new Date().toLocaleTimeString())
    } catch (e) {
      setSaveError(String(e))
    } finally {
      setSaving(false)
    }
  }

  // Pendant le glisser (avant le lâcher), recalcule en continu la cellule
  // visée pour y afficher un aperçu — voir dropShadowNode ci-dessus et
  // .drop-shadow-card en CSS.
  function handleNodeDrag(_event: unknown, node: Node) {
    const activity = project.activities.find((a) => a.id === node.id)
    if (!activity) return
    setDragTarget(computeDropTarget(project, nodes, node.position))
  }

  // Glisser-déposer une carte d'activité la réassigne à l'acteur/la phase
  // de la cellule où elle a été lâchée (et à la position voulue au sein
  // de la pile de cette cellule, si plusieurs activités s'y trouvent déjà
  // — voir computeDropTarget). Comme pour les autres onglets, ce n'est
  // qu'un changement d'état local : il faut « Sauvegarder » pour le
  // persister. La carte elle-même n'a pas de position libre mémorisée :
  // au prochain rendu, computeLayout la replace exactement à la position
  // de grille de sa nouvelle cellule.
  function handleNodeDragStop(_event: unknown, node: Node) {
    setDragTarget(null)
    const activity = project.activities.find((a) => a.id === node.id)
    if (!activity) return // pas une carte d'activité (les en-têtes ne sont pas déplaçables)

    const target = computeDropTarget(project, nodes, node.position)
    if (!target) return

    const siblings = project.activities
      .filter((a) => a.id !== activity.id && a.actorId === target.actorId && a.phaseId === target.phaseId)
      .sort((a, b) => a.order - b.order)
    const rawIndex = Math.max(target.subColumnIndex, 0)

    if (rawIndex <= siblings.length) {
      // Dépose au sein (ou juste après) de la pile actuelle des activités
      // de cet acteur dans cette phase : réordonne par `order`, comme
      // avant l'ajout des colonnes explicites. `column` est remis à 0 pour
      // repasser en empilement automatique, au cas où cette carte avait
      // une position explicite d'un déplacement précédent.
      const sequence = [
        ...siblings.slice(0, rawIndex).map((a) => a.id),
        activity.id,
        ...siblings.slice(rawIndex).map((a) => a.id),
      ]
      const orderById = new Map(sequence.map((id, i) => [id, i]))

      onChange({
        ...project,
        activities: project.activities.map((a) => {
          if (a.id === activity.id) {
            return { ...a, actorId: target.actorId, phaseId: target.phaseId, column: 0, order: orderById.get(a.id) ?? a.order }
          }
          return orderById.has(a.id) ? { ...a, order: orderById.get(a.id) ?? a.order } : a
        }),
      })
      return
    }

    // Dépose au-delà de ce que l'empilement automatique de cet acteur
    // occuperait dans cette phase : l'intention est de s'aligner sur une
    // sous-colonne précise qu'un AUTRE acteur a fait apparaître dans cette
    // phase (voir ADR-020). On fixe une position explicite plutôt que
    // d'insérer dans la pile de cet acteur, qui n'irait de toute façon pas
    // jusque-là.
    onChange({
      ...project,
      activities: project.activities.map((a) =>
        a.id === activity.id ? { ...a, actorId: target.actorId, phaseId: target.phaseId, column: rawIndex } : a,
      ),
    })
  }

  // Glisser depuis la poignée d'une carte vers celle d'une autre crée
  // directement une interaction entre les deux activités, sans repasser
  // par l'onglet Édition. Le texte "Information échangée" (même valeur
  // par défaut que le bouton "+ Ajouter une interaction" de l'onglet
  // Édition) reste à relire/préciser ensuite — cohérent avec le reste de
  // l'app, qui ne suppose jamais un texte final généré automatiquement.
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

  // Clic sur une carte d'activité : ouvre la consultation de ses
  // spécifications et tests V&V liés (voir ActivityDetailModal). Ignoré
  // pour les en-têtes de ligne/colonne, qui n'ont pas ce détail.
  function handleNodeClick(_event: unknown, node: Node) {
    if (node.type !== 'activity') return
    setSelectedActivityId(node.id)
  }

  if (project.actors.length === 0 || project.phases.length === 0) {
    return <p className="placeholder">Ajoutez au moins un acteur et une phase pour voir le diagramme.</p>
  }

  return (
    <div className="process-diagram-page">
      <header className="editor-header">
        <p className="nl-hint" style={{ flex: 1 }}>
          Glissez-déposez une carte pour la réassigner, glissez depuis le bord d'une carte vers une autre pour créer
          une interaction, ou cliquez sur une carte pour consulter ses spécifications et tests liés.
        </p>
        <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>
        {savedAt && <span className="saved-at">Sauvegardé à {savedAt}</span>}
        {saveError && <span className="error">{saveError}</span>}
      </header>
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
          onNodeDrag={handleNodeDrag}
          onNodeDragStop={handleNodeDragStop}
          onConnect={handleConnect}
          onNodeClick={handleNodeClick}
        >
          <Background gap={24} />
          <Controls showInteractive={false} />
          <DropTargetPreview cellPosition={dragTargetPosition} />
        </ReactFlow>
      </div>
      {selectedActivityId && (
        <ActivityDetailModal
          project={project}
          activityId={selectedActivityId}
          onClose={() => setSelectedActivityId(null)}
        />
      )}
    </div>
  )
}
