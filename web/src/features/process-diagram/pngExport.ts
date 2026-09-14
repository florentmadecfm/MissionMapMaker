import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { toPng } from 'html-to-image'
import type { Project } from '../../api/types'
import { ReadOnlyProcessDiagram } from './ReadOnlyProcessDiagram'

// pixelRatio de l'export = 1 / zoom courant plutôt qu'un facteur fixe basé
// sur la taille du conteneur à l'écran : plus un diagramme a de
// phases/personas, plus fitView() doit zoomer pour tout faire tenir dans
// la même fenêtre, donc plus le texte affiché — et capturé — est petit.
// 1/zoom restitue au contraire la densité NATIVE de chaque carte (celle
// qu'elle aurait à 100 % de zoom) quel que soit le nombre de
// phases/personas. EXPORT_ABSOLUTE_MAX_DIMENSION reste un garde-fou dur
// sur la plus grande dimension de l'image finale (mémoire, poids du
// fichier, limite de canevas du navigateur) qui prime sur 1/zoom pour un
// diagramme réellement démesuré ; EXPORT_MAX_PIXEL_RATIO borne le
// grossissement même pour un tout petit diagramme très zoomé.
export const EXPORT_MIN_PIXEL_RATIO = 1
export const EXPORT_MAX_PIXEL_RATIO = 8
export const EXPORT_ABSOLUTE_MAX_DIMENSION = 8000

// Exclut du PNG capturé les éléments de chrome de l'interface, sans
// équivalent sur une image destinée à être partagée/imprimée :
// - les nœuds "+ Phase"/"+ Activité" (classe react-flow__node-<type>,
//   voir @xyflow/react) : affordances d'édition ;
// - les petits "+" en coin des en-têtes de phase/persona (add-subcolumn/
//   add-sublane) — mêmes classes déjà masquées par .diagram-readonly pour
//   ReadOnlyProcessDiagram ;
// - les poignées de connexion (classe react-flow__handle) : de petits
//   ronds toujours dans le DOM, pratiquement invisibles au zoom habituel
//   du diagramme affiché à l'écran mais qui ressortent nettement une fois
//   le contenu mis à l'échelle pour occuper toute la résolution d'export ;
// - les boutons de zoom (Controls), le panneau d'export lui-même
//   (react-flow__panel) et le filigrane "React Flow" (attribution) :
//   chrome de l'outil, pas du diagramme.
const PNG_EXPORT_EXCLUDED_CLASSES = [
  'react-flow__handle',
  'react-flow__node-addPhase',
  'react-flow__node-addActivity',
  'add-subcolumn-button',
  'add-sublane-button',
  'react-flow__controls',
  'react-flow__panel',
  'react-flow__attribution',
]

export function shouldIncludeInPngExport(node: Element): boolean {
  const classList = (node as HTMLElement).classList
  if (!classList) return true
  return !PNG_EXPORT_EXCLUDED_CLASSES.some((c) => classList.contains(c))
}

// Lit le facteur d'échelle courant dans le `transform` CSS posé par React
// Flow sur son conteneur ".react-flow__viewport" (ex.
// "translate(12px, 34px) scale(0.42)") — évite de dépendre du hook
// useReactFlow() (donc d'un <ReactFlowProvider> englobant), pour que cette
// même fonction serve aussi bien le canevas interactif que le rendu
// hors-écran d'une variante non affichée (voir OffscreenExportDiagram,
// ProcessDiagram.tsx), qui n'a besoin d'aucun de ces deux.
export function parseZoomFromTransform(transform: string | undefined): number {
  const match = transform?.match(/scale\(([\d.]+)\)/)
  return match ? Number(match[1]) : 1
}

// Capture un conteneur React Flow déjà stabilisé (fitView appliqué, mise
// en page à jour) en PNG — voir les constantes ci-dessus pour le choix de
// la résolution.
export async function captureReactFlowPng(containerEl: HTMLElement, viewportEl: HTMLElement | null): Promise<string> {
  const rect = containerEl.getBoundingClientRect()
  const zoom = parseZoomFromTransform(viewportEl?.style.transform)
  const nativeScaleRatio = zoom > 0 ? 1 / zoom : EXPORT_MAX_PIXEL_RATIO
  const dimensionCapRatio = EXPORT_ABSOLUTE_MAX_DIMENSION / Math.max(rect.width, rect.height, 1)
  const pixelRatio = Math.max(
    EXPORT_MIN_PIXEL_RATIO,
    Math.min(nativeScaleRatio, dimensionCapRatio, EXPORT_MAX_PIXEL_RATIO),
  )
  return toPng(containerEl, { backgroundColor: '#ffffff', pixelRatio, filter: shouldIncludeInPngExport })
}

// Attend que le `transform` du viewport ait réellement changé par rapport
// à `before` — fitView() met à jour l'état interne de façon synchrone,
// mais le style CSS qui en découle ne se reflète dans le DOM qu'au
// prochain rendu React (commit + peinture) ; un nombre fixe de frames
// attendues s'est avéré insuffisant sur un gros diagramme. Borné à 20
// frames (~300ms) pour ne jamais bloquer indéfiniment si le nouveau
// cadrage recalculé est identique au précédent.
export async function waitForTransformSettled(viewportEl: HTMLElement | null, before: string | undefined) {
  for (let i = 0; i < 20; i++) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    if (viewportEl && viewportEl.style.transform !== before) break
  }
}

export function triggerPngDownload(dataUrl: string, filename: string) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename.replace(/[/\\?%*:|"<>]/g, '_')
  a.click()
}

// Nombre de frames attendues après le montage hors-écran, le temps que
// fitView (prop déclarative sur ReadOnlyProcessDiagram, appliquée
// automatiquement au montage — pas besoin de l'appeler nous-mêmes comme
// pour le canevas interactif) et la mise en page se stabilisent avant la
// capture.
const OFFSCREEN_SETTLE_FRAMES = 30

// Exporte en PNG une variante (Actuel ou Cible) qui n'est PAS celle
// actuellement affichée sur le canevas interactif : monte
// ReadOnlyProcessDiagram (déjà utilisé par la comparaison Actuel/Cible)
// dans un conteneur hors-écran (jamais visible ni interactif — position
// fixed hors du viewport), attend sa stabilisation, capture, puis démonte
// et retire le conteneur — sans jamais toucher à l'écran affiché à
// l'utilisateur ni à l'état édité par ProjectShell.
export async function exportOffscreenProjectToPng(project: Project): Promise<string> {
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.top = '0'
  container.style.left = '-10000px'
  container.style.width = '1600px'
  container.style.height = '1000px'
  container.style.pointerEvents = 'none'
  // .process-diagram (ReadOnlyProcessDiagram.tsx) est pensée comme un
  // ENFANT FLEX (flex: 1, voir process-diagram.css) — sans un parent
  // display:flex pour lui donner un contexte, flex: 1 n'a aucun effet et
  // sa hauteur s'effondre à 0 (React Flow refuse alors de mesurer le
  // graphe : "parent container needs a width and a height").
  container.style.display = 'flex'
  container.style.flexDirection = 'column'
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    root.render(createElement(ReadOnlyProcessDiagram, { project }))
    for (let i = 0; i < OFFSCREEN_SETTLE_FRAMES; i++) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    }
    const containerEl = container.querySelector<HTMLElement>('.react-flow')
    const viewportEl = container.querySelector<HTMLElement>('.react-flow__viewport')
    if (!containerEl) throw new Error('Diagramme introuvable (rendu hors-écran)')
    return await captureReactFlowPng(containerEl, viewportEl)
  } finally {
    root.unmount()
    container.remove()
  }
}
