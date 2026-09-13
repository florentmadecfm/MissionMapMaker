import { useId } from 'react'
import { Search, X } from 'lucide-react'

interface Props {
  value: string
  onChange: (value: string) => void
  placeholder: string
  // Valeurs proposées en autocomplétion (native <datalist>, sans
  // dépendance) — typiquement les mêmes champs déjà utilisés pour filtrer
  // la liste (voir suggestionsFor dans chaque écran appelant), pour que
  // toute suggestion cliquée donne effectivement un résultat.
  suggestions?: string[]
}

// Champ de recherche générique pour filtrer une liste, réutilisé partout
// où l'onglet Édition/Spécifications affiche une liste potentiellement
// longue (Acteurs, Phases, Activités, Interactions, Spécifications, Tests
// V&V) : ne filtre jamais que l'AFFICHAGE (le projet lui-même n'est pas
// modifié), donc sans risque sur les actions déjà en place (édition,
// suppression, réordonnancement).
export function ListFilterInput({ value, onChange, placeholder, suggestions }: Props) {
  const datalistId = useId()
  return (
    <div className="list-filter">
      <Search size={14} aria-hidden="true" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        list={suggestions && suggestions.length > 0 ? datalistId : undefined}
        autoComplete="off"
      />
      {suggestions && suggestions.length > 0 && (
        <datalist id={datalistId}>
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      {value && (
        <button type="button" className="list-filter-clear" onClick={() => onChange('')} aria-label="Effacer la recherche">
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
