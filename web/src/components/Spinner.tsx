import { Loader2 } from 'lucide-react'

interface Props {
  size?: number
}

// Indicateur de chargement partagé par tous les appels au LLM (génération
// depuis le texte libre, mise à jour du diagramme, solutions de points de
// friction, spécifications/tests, portrait/sketch de persona...) — un
// seul composant plutôt que dupliquer l'icône + l'animation dans chaque
// écran qui attend une réponse, qui peut prendre plusieurs secondes sans
// autre repère visuel que le texte du bouton ("Génération…").
export function Spinner({ size = 14 }: Props) {
  return <Loader2 size={size} className="spinner" aria-hidden="true" />
}
