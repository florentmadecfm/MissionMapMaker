// Chargé avant chaque fichier de test (voir test.setupFiles, vite.config.ts)
// — matchers DOM supplémentaires (toBeInTheDocument, etc.) pour les
// assertions React Testing Library.
import '@testing-library/jest-dom/vitest'

// jsdom n'implémente pas ResizeObserver (utilisé par ex. par
// ActorDetail.tsx pour les ombres de bord de la timeline) — un simple
// stub sans effet suffit en test, aucun composant n'a besoin d'un vrai
// redimensionnement ici.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub
