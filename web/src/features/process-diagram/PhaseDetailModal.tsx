import type { Product, Project } from '../../api/types'
import { KpiLinksSection } from '../products/KpiLinksSection'

interface Props {
  project: Project
  phaseId: string
  onChange: (project: Project) => void
  onClose: () => void
  // Produit associé à la mission — voir KpiLinksSection.tsx et
  // ActivityDetailModal.tsx (même prop, même patron).
  product: Product | undefined
}

// Ouverte au clic sur un en-tête de phase du diagramme (voir
// ProcessDiagram.tsx, handleNodeClick — distingué du bouton "+" qui
// réserve une sous-colonne). Délibérément minimale : l'onglet Édition
// (ProjectEditor.tsx) porte déjà l'édition du nom/icône/durée/
// satisfaction d'une phase (tableau dédié) — aucune raison de la
// dupliquer ici. Seule nouveauté : la section "KPI liés" (Phase 3 du plan
// Produit/Vision/KPI), symétrique de celle d'ActivityDetailModal.tsx.
export function PhaseDetailModal({ project, phaseId, onChange, onClose, product }: Props) {
  const phase = project.phases.find((p) => p.id === phaseId)
  if (!phase) return null

  function updateKpiLinks(ids: string[]) {
    if (!phase) return
    onChange({
      ...project,
      phases: project.phases.map((p) => (p.id === phase.id ? { ...p, kpiLinks: ids } : p)),
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal phase-detail-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>
            {phase.icon && <span aria-hidden="true">{phase.icon} </span>}
            {phase.name}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>
        <KpiLinksSection product={product} linkedIds={phase.kpiLinks} onChange={updateKpiLinks} />
      </div>
    </div>
  )
}
