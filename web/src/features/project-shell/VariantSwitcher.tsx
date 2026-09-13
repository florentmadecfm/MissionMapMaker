import { GitCompareArrows } from 'lucide-react'
import type { Project, ProjectSummary } from '../../api/types'

interface Props {
  project: Project
  summaries: ProjectSummary[]
  onOpen: (id: string) => void
  onLeaveGroup: () => void
}

// Barre de bascule entre variantes d'une même mission (ADR-062) — état
// actuel / cible(s), ou toute autre variante créée depuis "Créer une
// variante…". N'affiche rien tant que le projet ouvert n'appartient à
// aucun groupe : les résumés (summaries) déjà chargés par ProjectShell
// pour la barre latérale suffisent, filtrés ici par variantGroupId, sans
// requête supplémentaire.
export function VariantSwitcher({ project, summaries, onOpen, onLeaveGroup }: Props) {
  if (!project.variantGroupId) return null

  const siblings = [...summaries]
    .filter((s) => s.variantGroupId === project.variantGroupId)
    .sort((a, b) => (a.variantLabel ?? a.name).localeCompare(b.variantLabel ?? b.name))

  return (
    <div className="variant-switcher">
      <span className="variant-switcher-label">
        <GitCompareArrows size={14} aria-hidden="true" /> Variantes
      </span>
      {siblings.map((s) => (
        <button
          key={s.id}
          type="button"
          className={`variant-pill${s.id === project.id ? ' active' : ''}`}
          onClick={() => onOpen(s.id)}
          title={s.name}
        >
          {s.variantLabel || s.name}
        </button>
      ))}
      <button
        type="button"
        className="variant-leave"
        onClick={onLeaveGroup}
        title="Retirer cette mission du groupe de variantes (son contenu n'est pas modifié)"
      >
        Détacher
      </button>
    </div>
  )
}
