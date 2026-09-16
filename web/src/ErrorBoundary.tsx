import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// Filet de sécurité contre un plantage de rendu React n'importe où dans
// l'app : sans lui, une exception non interceptée pendant le rendu (ex.
// accès à un champ manquant sur des données inattendues) démonte TOUT
// l'arbre React et laisse un écran blanc, sans aucun message — exactement
// le symptôme "le diagramme devient tout blanc comme un crash" remonté
// par l'utilisateur. Ce composant n'empêche pas le bug sous-jacent (React
// ne permet pas de "reprendre" un rendu qui a échoué), mais transforme un
// écran blanc muet en message explicite avec le détail de l'erreur — de
// quoi la signaler précisément la prochaine fois qu'elle survient — et un
// moyen de s'en sortir (recharger). L'autosauvegarde (ProjectShell.tsx,
// runSave) limite la perte au pire aux dernières secondes d'édition avant
// le plantage.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erreur de rendu interceptée par ErrorBoundary :', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="error-boundary">
        <h1>Un problème d'affichage est survenu</h1>
        <p>
          Cet écran a rencontré une erreur inattendue et ne peut plus s'afficher correctement. Vos dernières
          modifications ont normalement déjà été sauvegardées automatiquement — rechargez la page pour continuer.
        </p>
        <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
          Recharger la page
        </button>
        <details>
          <summary>Détail technique (utile pour signaler le problème)</summary>
          <pre>{error.stack ?? error.message}</pre>
        </details>
      </div>
    )
  }
}
