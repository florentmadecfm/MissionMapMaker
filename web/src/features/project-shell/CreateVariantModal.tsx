import { useState } from 'react'
import { api } from '../../api/client'
import type { Project } from '../../api/types'

interface Props {
  project: Project
  onClose: () => void
  onCreated: (project: Project) => void
}

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

// Ouverte depuis le menu ☰ de la barre d'onglets (voir ExportImportMenu.tsx) :
// crée une nouvelle mission qui reprend l'intégralité du contenu de celle
// ouverte (acteurs, diagramme, spécifications, tests), liée à elle comme
// VARIANTE (Project.variantGroupId/variantLabel, ADR-062) — utile pour
// comparer un état actuel et une ou plusieurs cibles ("as-is"/"to-be")
// sans repartir de zéro ni perdre le point de départ commun. Si le
// projet ouvert n'appartient encore à aucun groupe, il y entre lui-même
// à cette occasion, avec l'étiquette saisie pour "cette mission".
export function CreateVariantModal({ project, onClose, onCreated }: Props) {
  const isFirstVariant = !project.variantGroupId
  const [currentLabel, setCurrentLabel] = useState('État actuel')
  const [newLabel, setNewLabel] = useState('Cible')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    const label = newLabel.trim()
    if (!label) return
    setCreating(true)
    setError(null)
    try {
      const groupId = project.variantGroupId || newId('vg')

      // Le projet ouvert entre dans le groupe s'il n'y était pas déjà —
      // sans quoi la nouvelle variante serait liée à un groupe dont elle
      // serait la seule membre visible.
      let sourceProject = project
      if (isFirstVariant) {
        sourceProject = await api.saveProject({
          ...project,
          variantGroupId: groupId,
          variantLabel: currentLabel.trim() || 'État actuel',
        })
      }

      // createProject ne renvoie qu'une coquille vide (id/name propres) :
      // le contenu de la mission source y est recopié tel quel (mêmes ids
      // internes — sans conséquence, un projet ne référence jamais les ids
      // d'un autre) avant de sauvegarder pour de bon.
      const created = await api.createProject(`${project.name} — ${label}`)
      const variant = await api.saveProject({
        ...created,
        actors: sourceProject.actors,
        phases: sourceProject.phases,
        activities: sourceProject.activities,
        interactions: sourceProject.interactions,
        specifications: sourceProject.specifications,
        testScenarios: sourceProject.testScenarios,
        variantGroupId: groupId,
        variantLabel: label,
      })

      onCreated(variant)
      onClose()
    } catch (e) {
      setError(String(e))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Créer une variante</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>
        <p className="nl-hint">
          La nouvelle variante démarre avec exactement le même contenu que « {project.name} » (acteurs, diagramme,
          spécifications), puis évolue indépendamment — utile pour comparer un état actuel et une cible.
        </p>

        {isFirstVariant && (
          <>
            <label className="field-label" htmlFor="variant-current-label">
              Nom de « {project.name} » dans le groupe
            </label>
            <input
              id="variant-current-label"
              value={currentLabel}
              onChange={(e) => setCurrentLabel(e.target.value)}
            />
          </>
        )}

        <label className="field-label" htmlFor="variant-new-label">
          Nom de la nouvelle variante
        </label>
        <input
          id="variant-new-label"
          autoFocus
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={handleCreate}
            disabled={creating || !newLabel.trim()}
          >
            {creating ? 'Création…' : 'Créer la variante'}
          </button>
        </div>
      </div>
    </div>
  )
}
