import type { DiffEntry, DiffFocusTarget, DiffStatus } from './missionDiff'

interface Props {
  entries: DiffEntry[]
  // Différence actuellement mise en avant sur les diagrammes (voir
  // ProcessDiagram.tsx, Props.focusedDiff) — `null` tant qu'aucune entrée
  // n'a été choisie. Comparée par kind+id (pas par référence) à chaque
  // entrée pour savoir laquelle afficher comme sélectionnée.
  selected: DiffFocusTarget | null
  // Reclique sur l'entrée déjà sélectionnée -> `null` (désélection) : géré
  // ici plutôt que par le parent, pour que "cliquer une entrée" reste un
  // seul geste, quel que soit son état de départ.
  onSelect: (target: DiffFocusTarget | null) => void
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
//
// Chaque entrée est aussi un bouton (ADR-082) : la cliquer surligne CET
// élément précis sur le ou les diagrammes concernés (et estompe le
// reste) — voir ProcessDiagram.tsx, Props.focusedDiff/FocusOnDiffSelection.
// Un simple badge de couleur sur une carte, parmi d'autres, ne suffit pas
// toujours à la repérer d'un coup d'œil sur un diagramme chargé.
export function DiffList({ entries, selected, onSelect }: Props) {
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
              {kindEntries.map((entry) => {
                const isSelected = selected?.kind === entry.kind && selected.id === entry.id
                return (
                  <li key={entry.id} className={`diff-list-entry diff-list-entry-${entry.status}${isSelected ? ' diff-list-entry-selected' : ''}`}>
                    <button
                      type="button"
                      className="diff-list-entry-button"
                      aria-pressed={isSelected}
                      onClick={() => onSelect(isSelected ? null : { kind: entry.kind, id: entry.id })}
                    >
                      <span className={`diff-list-entry-tag diff-list-entry-tag-${entry.status}`}>{STATUS_LABELS[entry.status]}</span>
                      <div className="diff-list-entry-body">
                        <span className="diff-list-entry-label">{entry.label}</span>
                        {entry.subtitle && <span className="diff-list-entry-subtitle">{entry.subtitle}</span>}
                        {entry.changedFields && entry.changedFields.length > 0 && (
                          <span className="diff-list-entry-fields">Modifié : {entry.changedFields.join(', ')}</span>
                        )}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
