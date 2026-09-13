import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { Project, ProjectVersion } from '../../api/types'
import { ReadOnlyProcessDiagram } from '../process-diagram/ReadOnlyProcessDiagram'

interface Props {
  project: Project
  onClose: () => void
  onRestored: (project: Project) => void
}

function formatSavedAt(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Ouverte depuis le menu ☰ de la barre d'onglets (voir ExportImportMenu.tsx) —
// backlog blueprint #7, ADR-070. S'appuie entièrement sur les sauvegardes
// horodatées déjà écrites par le backend à chaque "Sauvegarder" (une par
// écrasement, voir Repository.backupExisting) : aucune notion de version
// distincte à gérer côté frontend, seulement les lister et permettre de
// les consulter/restaurer. Réutilise ReadOnlyProcessDiagram (déjà bâti
// pour la comparaison de variantes, ADR-063) pour la prévisualisation,
// plutôt qu'un nouveau rendu dédié.
export function VersionHistoryModal({ project, onClose, onRestored }: Props) {
  const [versions, setVersions] = useState<ProjectVersion[] | null>(null)
  const [listError, setListError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [preview, setPreview] = useState<Project | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    api
      .listVersions(project.id)
      .then((list) => {
        setVersions(list)
        if (list.length > 0) setSelectedId(list[0].id)
      })
      .catch((e) => setListError(String(e)))
  }, [project.id])

  useEffect(() => {
    if (!selectedId) {
      setPreview(null)
      return
    }
    setPreviewLoading(true)
    setPreviewError(null)
    api
      .getVersion(project.id, selectedId)
      .then(setPreview)
      .catch((e) => setPreviewError(String(e)))
      .finally(() => setPreviewLoading(false))
  }, [project.id, selectedId])

  async function handleRestore() {
    if (!selectedId) return
    const version = versions?.find((v) => v.id === selectedId)
    if (
      !window.confirm(
        `Restaurer la mission dans l'état où elle était le ${version ? formatSavedAt(version.savedAt) : 'sélectionné'} ? ` +
          "L'état actuel sera lui-même conservé dans l'historique (rien n'est perdu).",
      )
    ) {
      return
    }
    setRestoring(true)
    setPreviewError(null)
    try {
      const restored = await api.restoreVersion(project.id, selectedId)
      onRestored(restored)
      onClose()
    } catch (e) {
      setPreviewError(String(e))
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal version-history-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Historique des versions</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>
        <p className="nl-hint">
          Une version est enregistrée à chaque « Sauvegarder » sur « {project.name} ». Consultez un état passé du
          diagramme ci-dessous, ou restaurez-le : l'état actuel sera lui-même conservé dans l'historique.
        </p>

        {listError && <p className="error">{listError}</p>}

        {versions && versions.length === 0 && !listError && (
          <p className="placeholder">
            Aucune version antérieure enregistrée pour cette mission — l'historique se remplit à partir de la
            prochaine sauvegarde qui modifie un état déjà sauvegardé.
          </p>
        )}

        {versions && versions.length > 0 && (
          <div className="version-history-body">
            <ul className="version-history-list">
              {versions.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    className={v.id === selectedId ? 'active' : ''}
                    onClick={() => setSelectedId(v.id)}
                  >
                    {formatSavedAt(v.savedAt)}
                  </button>
                </li>
              ))}
            </ul>
            <div className="version-history-preview">
              {previewLoading && <p className="placeholder">Chargement de l'aperçu…</p>}
              {previewError && <p className="error">{previewError}</p>}
              {!previewLoading && preview && <ReadOnlyProcessDiagram project={preview} />}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Fermer
          </button>
          {versions && versions.length > 0 && (
            <button type="button" className="btn-primary" onClick={handleRestore} disabled={!selectedId || restoring}>
              {restoring ? 'Restauration…' : 'Restaurer cette version'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
