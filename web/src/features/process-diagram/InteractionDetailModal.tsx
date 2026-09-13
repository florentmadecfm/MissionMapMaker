import { useState } from 'react'
import type { Project } from '../../api/types'

interface Props {
  project: Project
  interactionId: string
  onChange: (project: Project) => void
  onClose: () => void
}

// Ouverte au clic sur une flèche d'interaction du diagramme (voir
// ProcessDiagram.tsx, onEdgeClick) : contrairement à ActivityDetailModal
// (lecture seule), permet de nommer/renommer l'information échangée
// directement depuis le diagramme, sans repasser par l'onglet Édition —
// une interaction créée par glisser-déposer entre deux cartes n'a par
// défaut que le texte générique "Information échangée" (voir
// handleConnect) à préciser ensuite. Comme le reste du diagramme, ce n'est
// qu'un changement d'état local (onChange) : il faut « Sauvegarder » pour
// le persister (voir ADR-049).
export function InteractionDetailModal({ project, interactionId, onChange, onClose }: Props) {
  const interaction = project.interactions.find((i) => i.id === interactionId)
  const [text, setText] = useState(interaction?.information ?? '')
  const [condition, setCondition] = useState(interaction?.condition ?? '')
  const [physicalEvidence, setPhysicalEvidence] = useState(interaction?.physicalEvidence ?? '')

  if (!interaction) return null

  const fromActivity = project.activities.find((a) => a.id === interaction.fromActivityId)
  const toActivity = project.activities.find((a) => a.id === interaction.toActivityId)
  const fromActor = project.actors.find((a) => a.id === fromActivity?.actorId)
  const toActor = project.actors.find((a) => a.id === toActivity?.actorId)

  function handleSave() {
    onChange({
      ...project,
      interactions: project.interactions.map((i) =>
        i.id === interactionId
          ? {
              ...i,
              information: text,
              condition: condition.trim() || undefined,
              physicalEvidence: physicalEvidence.trim() || undefined,
            }
          : i,
      ),
    })
    onClose()
  }

  function handleRemove() {
    onChange({ ...project, interactions: project.interactions.filter((i) => i.id !== interactionId) })
    onClose()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal interaction-detail-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Interaction</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>
        <p className="activity-detail-meta">
          {fromActor?.name ?? '(acteur supprimé)'} · {fromActivity?.name ?? '(activité supprimée)'}
          {' → '}
          {toActor?.name ?? '(acteur supprimé)'} · {toActivity?.name ?? '(activité supprimée)'}
        </p>
        <label className="field-label" htmlFor="interaction-information">
          Information échangée
        </label>
        <input
          id="interaction-information"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        />
        <label className="field-label" htmlFor="interaction-condition">
          Condition (optionnelle — fait de cette interaction un embranchement)
        </label>
        <input
          id="interaction-condition"
          value={condition}
          onChange={(e) => setCondition(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder="Ex. paiement refusé"
        />
        <label className="field-label" htmlFor="interaction-physical-evidence">
          Preuve(s) physique(s) — optionnel (service blueprint)
        </label>
        <input
          id="interaction-physical-evidence"
          value={physicalEvidence}
          onChange={(e) => setPhysicalEvidence(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          placeholder="Ex. reçu papier, email de confirmation"
        />
        <div className="modal-actions">
          <button type="button" className="danger" onClick={handleRemove}>
            Supprimer
          </button>
          <button type="button" className="btn-primary" onClick={handleSave}>
            Valider
          </button>
        </div>
      </div>
    </div>
  )
}
