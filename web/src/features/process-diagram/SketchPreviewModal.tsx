import { triggerPngDownload } from './pngExport'

interface Props {
  dataUrl: string
  filename: string
  onClose: () => void
}

// Aperçu du sketch de diagramme généré par IA (ADR-073) — affiché avant
// tout téléchargement, plutôt qu'un fichier livré à l'aveugle sans que
// l'utilisateur ait vu le résultat (voir ProcessDiagram.tsx,
// handleGenerateSketch/onSketchGenerated). triggerPngDownload marche pour
// n'importe quelle data URL image, pas seulement un PNG d'export React
// Flow (pngExport.ts).
export function SketchPreviewModal({ dataUrl, filename, onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal sketch-preview-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Sketch généré</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>
        <img className="sketch-preview-image" src={dataUrl} alt="Sketch généré du diagramme" />
        <div className="nl-actions">
          <button type="button" className="btn-primary" onClick={() => triggerPngDownload(dataUrl, filename)}>
            Télécharger
          </button>
          <button type="button" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  )
}
