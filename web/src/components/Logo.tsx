interface Props {
  size?: number
}

// Logo de l'app : trois nœuds reliés en pipeline ascendant (étapes d'un
// processus qui progressent) — évoque à la fois la cartographie de
// mission (des étapes reliées) et l'univers Ops/DevOps (pipeline, flux de
// travail, graphe de nœuds), plutôt que l'ancien favicon par défaut du
// gabarit Vite (dégradé abstrait sans rapport avec l'app). Recoloré à la
// palette du design system ajouté dans design-system/ (fond hive foncé,
// nœuds honey) — même dégradé que --color-primary-gradient (index.css) —
// en gardant le tracé/la forme d'origine plutôt que d'adopter le logo
// abeille du design system, qui porte la marque d'une autre entreprise
// (voir design-system/preview/logos.html). Utilisé à la fois comme
// favicon (public/favicon.svg, copie statique du même tracé) et ici, en
// en-tête de la barre latérale (ProjectShell.tsx).
export function Logo({ size = 20 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="mmm-logo-gradient" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#283848" />
          <stop offset="1" stopColor="#1d2a37" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#mmm-logo-gradient)" />
      <path d="M7 17 L12 12 L17 7" stroke="#e8d000" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="7" cy="17" r="1.8" fill="#e8d000" />
      <circle cx="12" cy="12" r="1.8" fill="#e8d000" />
      <circle cx="17" cy="7" r="1.8" fill="#e8d000" />
    </svg>
  )
}
