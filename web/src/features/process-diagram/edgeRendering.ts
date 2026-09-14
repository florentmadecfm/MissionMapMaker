import { MarkerType, type Edge } from '@xyflow/react'
import type { LayoutEdge } from './layout'

// Rendu des flèches du diagramme (dégradé de couleur, style pointillé
// pour un embranchement, libellé) — module indépendant plutôt que défini
// dans ProcessDiagram.tsx : à la fois ReadOnlyProcessDiagram.tsx (vue de
// comparaison Actuel/Cible) et l'export PNG hors-écran d'une variante non
// affichée (voir pngExport.ts) en ont besoin sans dépendre de
// ProcessDiagram.tsx elle-même (qui, à l'inverse, a besoin de
// ReadOnlyProcessDiagram.tsx pour ce second cas) — les définir ici évite
// un cycle d'imports entre ces trois fichiers.

// Id DOM-safe pour un marqueur de départ partagé par toutes les flèches
// issues d'un persona de cette couleur (évite de dupliquer un <marker>
// par flèche alors que la couleur, elle, ne varie que par persona).
export function dotMarkerId(color: string) {
  return `mmm-dot-${color.replace('#', '')}`
}

export function gradientId(edgeId: string) {
  return `mmm-grad-${edgeId}`
}

// Une interaction conditionnelle (embranchement) affiche SEULEMENT sa
// condition en préfixe ("Si <condition>") — jamais suivie de
// l'information échangée : c'est la condition qui distingue une branche
// d'une autre au premier coup d'œil (l'information, elle, reste
// consultable en cliquant la flèche, voir InteractionDetailModal.tsx),
// et le libellé combiné débordait vite sur la carte voisine, surtout
// pour deux branches proches l'une de l'autre. Une preuve physique
// (service blueprint), quand renseignée, s'ajoute en suffixe derrière une
// icône 🧾 : signale sa présence sans avoir à ouvrir l'interaction, sans
// pour autant justifier un nouveau badge dédié comme .activity-card-branch
// (bien plus rare qu'un embranchement, une flèche à la fois suffit).
// Longueur maximale d'un libellé de flèche affiché SUR le diagramme —
// condition + information échangée + preuve physique combinées peuvent
// vite dépasser la place disponible entre deux cartes rapprochées,
// recouvrant alors la carte voisine (texte illisible, superposé). Le
// texte complet reste toujours consultable en cliquant la flèche (voir
// InteractionDetailModal.tsx) : la troncature ici n'est qu'un repli
// d'affichage, jamais une perte de donnée.
const MAX_EDGE_LABEL_LENGTH = 28

function truncateEdgeLabel(text: string): string {
  return text.length > MAX_EDGE_LABEL_LENGTH ? `${text.slice(0, MAX_EDGE_LABEL_LENGTH - 1).trimEnd()}…` : text
}

function edgeLabel(e: LayoutEdge): string {
  const base = e.condition ? `Si ${e.condition}` : e.label
  const withEvidence = !e.physicalEvidence ? base : base ? `${base} · 🧾 ${e.physicalEvidence}` : `🧾 ${e.physicalEvidence}`
  return truncateEdgeLabel(withEvidence)
}

export function toFlowEdge(e: LayoutEdge): Edge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    label: edgeLabel(e),
    type: 'smoothstep',
    // Le trait passe de la couleur du persona de départ à celle du
    // persona d'arrivée (voir <defs>, ProcessDiagram.tsx/
    // ReadOnlyProcessDiagram.tsx) : on peut suivre une flèche à l'œil même
    // quand elle traverse plusieurs personas. Une interaction
    // conditionnelle (embranchement) est en plus tracée en pointillés,
    // pour la distinguer d'un flux systématique sans avoir à lire le
    // libellé.
    style: {
      stroke: `url(#${gradientId(e.id)})`,
      strokeWidth: 2,
      strokeDasharray: e.condition ? '6 4' : undefined,
    },
    // Point de départ : petit disque plein dans la couleur du persona
    // source. Pointe d'arrivée : flèche pleine dans la couleur du persona
    // cible, plus large que le trait pour bien marquer la fin.
    markerStart: dotMarkerId(e.sourceColor),
    markerEnd: { type: MarkerType.ArrowClosed, color: e.targetColor, width: 18, height: 18 },
    labelStyle: { fontSize: 11, fontWeight: 600, fill: 'var(--color-text)' },
    labelBgStyle: { fill: '#ffffff', fillOpacity: 0.92 },
    labelBgPadding: [5, 3],
    labelBgBorderRadius: 4,
  }
}
