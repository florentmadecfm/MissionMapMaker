import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// Filet de sécurité SCOPÉ au canevas du diagramme (contrairement à
// ErrorBoundary.tsx, qui enveloppe toute l'app et viderait donc TOUT
// l'écran — barre latérale et onglets compris — si le crash remonté par
// l'utilisateur ("le diagramme disparaît, le reste de l'app reste
// utilisable") était une exception de rendu React classique). Une
// investigation précédente n'avait pas réussi à reproduire ce crash
// malgré un test de résistance poussé (voir ADR/commit caeaf74) ; ce
// composant sert autant de résilience (le diagramme affiche un message
// au lieu de rien plutôt que de planter en silence) que de DIAGNOSTIC
// pour la prochaine occurrence — componentDidCatch loggue la stack
// complète, à récupérer depuis la console ou "Détail technique"
// ci-dessous la prochaine fois que ça survient.
export class DiagramErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[Diagramme] erreur de rendu interceptée par DiagramErrorBoundary :', error, info.componentStack)
  }

  // Réessayer sans recharger toute la page (contrairement à
  // ErrorBoundary.tsx) : le reste de l'app n'ayant pas été affecté, rien
  // ne justifie de perdre le contexte de navigation (onglet, mission
  // ouverte) pour un problème visiblement confiné au diagramme.
  reset = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="diagram-error-boundary">
        <h3>Le diagramme n'a pas pu s'afficher</h3>
        <p>
          Une erreur inattendue est survenue en dessinant le diagramme. Le reste de l'application n'est pas affecté
          — vos données sont normalement intactes (sauvegarde automatique). Essayez de réessayer ; si le problème
          persiste, changez d'onglet puis revenez, ou rechargez la page.
        </p>
        <button type="button" className="btn-primary" onClick={this.reset}>
          Réessayer
        </button>
        <details>
          <summary>Détail technique (utile pour signaler le problème)</summary>
          <pre>{error.stack ?? error.message}</pre>
        </details>
      </div>
    )
  }
}
