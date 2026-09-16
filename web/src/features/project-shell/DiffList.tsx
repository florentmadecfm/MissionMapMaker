import type { DiffEntry, DiffStatus } from './missionDiff'

interface Props {
  entries: DiffEntry[]
}

const STATUS_LABELS: Record<DiffStatus, string> = {
  added: 'Ajouté',
  removed: 'Supprimé',
  modified: 'Modifié',
}

const KIND_LABELS: Record<DiffEntry['kind'], string> = {
  actor: 'Personas',
  phase: 'Phases',
  activity: 'Activités',
  interaction: 'Interactions',
}

const KIND_ORDER: DiffEntry['kind'][] = ['actor', 'phase', 'activity', 'interaction']

// Pendant textuel du surlignage sur le diagramme (nodes.tsx/edgeRendering.ts,
// via missionDiff.ts) — un badge de couleur sur une carte ne dit que "ceci a
// changé", jamais QUOI précisément pour un élément modifié (une carte ne
// peut pas afficher la liste de ses champs modifiés sans devenir illisible).
// Groupé par catégorie (mêmes 4 que le diagramme) plutôt que par statut :
// se lit dans le même ordre que les onglets Diagramme/Vue par persona,
// plus naturel pour retrouver un élément précis qu'un simple tri
// ajouté/supprimé/modifié qui mélangerait personas et activités.
export function DiffList({ entries }: Props) {
  if (entries.length === 0) {
    return <p className="diff-list-empty">Aucune différence entre Actuel et Cible.</p>
  }

  return (
    <div className="diff-list">
      {KIND_ORDER.map((kind) => {
        const kindEntries = entries.filter((e) => e.kind === kind)
        if (kindEntries.length === 0) return null
        return (
          <div key={kind} className="diff-list-group">
            <h4 className="diff-list-group-title">{KIND_LABELS[kind]}</h4>
            <ul>
              {kindEntries.map((entry) => (
                <li key={entry.id} className={`diff-list-entry diff-list-entry-${entry.status}`}>
                  <span className={`diff-list-entry-tag diff-list-entry-tag-${entry.status}`}>{STATUS_LABELS[entry.status]}</span>
                  <div className="diff-list-entry-body">
                    <span className="diff-list-entry-label">{entry.label}</span>
                    {entry.subtitle && <span className="diff-list-entry-subtitle">{entry.subtitle}</span>}
                    {entry.changedFields && entry.changedFields.length > 0 && (
                      <span className="diff-list-entry-fields">Modifié : {entry.changedFields.join(', ')}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
