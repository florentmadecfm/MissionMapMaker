interface Props {
  size?: number
}

// Logo de l'app : trois nœuds reliés en pipeline ascendant (étapes d'un
// processus qui progressent) — évoque à la fois la cartographie de
// mission (des étapes reliées) et l'univers Ops/DevOps (pipeline, flux de
// travail, graphe de nœuds), plutôt que l'ancien favicon par défaut du
// gabarit Vite (dégradé abstrait sans rapport avec l'app). Même dégradé
// que --color-primary-gradient (index.css) pour rester cohérent avec le
// reste de l'identité visuelle. Utilisé à la fois comme favicon
// (public/favicon.svg, copie statique du même tracé) et ici, en en-tête
// de la barre latérale (ProjectShell.tsx).
export function Logo({ size = 20 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="mmm-logo-gradient" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6366f1" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#mmm-logo-gradient)" />
      <path d="M7 17 L12 12 L17 7" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="7" cy="17" r="1.8" fill="#fff" />
      <circle cx="12" cy="12" r="1.8" fill="#fff" />
      <circle cx="17" cy="7" r="1.8" fill="#fff" />
    </svg>
  )
}
