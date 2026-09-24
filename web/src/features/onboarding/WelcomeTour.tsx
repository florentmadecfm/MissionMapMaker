import { useLayoutEffect, useRef, useState } from 'react'
import { TOUR_STEPS } from './tourSteps'

interface Props {
  step: number
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}

// Marge entre l'élément mis en avant et le cadre de surbrillance, et entre
// ce cadre et la carte d'étape/le bord de l'écran.
const SPOTLIGHT_PADDING = 6
const CARD_MARGIN = 16
// Fréquence de re-mesure de l'élément ciblé pendant qu'une étape est
// affichée — l'élément peut légèrement bouger (police qui finit de
// charger, mise en page React Flow qui se stabilise après un changement
// d'onglet) ; un sondage léger est plus simple et robuste qu'un
// ResizeObserver/MutationObserver à mettre en place puis nettoyer pour un
// gain marginal, sur une durée de vie de toute façon très courte (une
// visite guidée dure quelques secondes par étape).
const REMEASURE_INTERVAL_MS = 250

// Visite guidée à la première utilisation (ADR-078) : contrairement à la
// version précédente (un simple diaporama d'écrans autonomes), chaque
// étape change réellement d'onglet (ProjectShell.tsx pilote `tab` à
// partir de TOUR_STEPS[step].tab) et met en surbrillance l'élément RÉEL
// qui porte la fonctionnalité décrite (TOUR_STEPS[step].target) — via un
// unique <div> dont le box-shadow à très large étalement assombrit tout
// l'écran SAUF sa propre zone (astuce CSS classique de "spotlight" à un
// seul élément, sans avoir à découper le fond en 4 rectangles). Un calque
// plein écran séparé, invisible, capte tous les clics pendant la visite
// (ProjectShell.tsx bascule sur un projet de démonstration le temps de la
// visite — voir tourDemoProject.ts — jamais persisté ; mieux vaut éviter
// toute interaction accidentelle avec lui plutôt que de gérer les
// conséquences d'une modification sur des données fictives).
export function WelcomeTour({ step, onNext, onPrev, onClose }: Props) {
  const stepData = TOUR_STEPS[step]
  const isFirst = step === 0
  const isLast = step === TOUR_STEPS.length - 1
  const Icon = stepData.icon

  const [targetRect, setTargetRect] = useState<DOMRect | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardPos, setCardPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null)
  // Hauteur naturelle (non contrainte) de la carte pour l'étape en cours —
  // mesurée une seule fois par étape (voir la remise à zéro ci-dessous),
  // au moment où cardPos vaut encore null : la carte est alors affichée en
  // mode centré (.welcome-tour-centered, sans maxHeight), donc à sa taille
  // de contenu réelle. Sert à décider si la carte a la place de s'afficher
  // pleinement à côté de la cible (voir l'effet suivant) plutôt que de
  // comparer à sa propre taille déjà contrainte lors des remesures
  // suivantes.
  const naturalCardHeightRef = useRef<number | null>(null)

  // Mesure (et re-mesure à intervalle) l'élément ciblé par cette étape —
  // absent tant que l'onglet/écran visé n'a pas fini de se rendre (voir
  // TOUR_STEPS[step].tab, piloté par ProjectShell.tsx en parallèle),
  // retrouvé dès qu'il apparaît. Repart de zéro à chaque changement
  // d'étape (`step` en dépendance) : l'ancien élément n'a plus de sens.
  //
  // scrollIntoView dès que l'élément est retrouvé (une seule fois par
  // étape, voir `scrolled`) : un écran comme Produits défile en interne
  // (.products-screen) et la section KPI se trouve après Vision/
  // Différenciateurs/Piliers — sans ce scroll, l'élément ciblé restait
  // hors du champ visible, la carte d'étape se positionnait alors par
  // rapport à un rectangle situé sous le bas de l'écran et se retrouvait
  // elle-même coupée (boutons Précédent/Suivant inaccessibles, bug
  // remonté par l'utilisateur sur l'étape "Produits"). scrollIntoView
  // remonte automatiquement TOUS les ancêtres défilants concernés (pas
  // seulement .products-screen), ce qui met cette étape à l'abri du même
  // problème sur n'importe quelle étape future.
  useLayoutEffect(() => {
    setTargetRect(null)
    naturalCardHeightRef.current = null
    let scrolled = false
    function measure() {
      const el = document.querySelector(stepData.target)
      if (el && !scrolled) {
        el.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' })
        scrolled = true
      }
      setTargetRect(el ? el.getBoundingClientRect() : null)
    }
    measure()
    const interval = window.setInterval(measure, REMEASURE_INTERVAL_MS)
    window.addEventListener('resize', measure)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('resize', measure)
    }
  }, [step, stepData.target])

  // Repositionne la carte d'étape juste après l'élément mis en avant (en
  // dessous s'il y a la place, sinon au-dessus), recalculé à chaque
  // déplacement de la cible ou changement de taille de la carte
  // elle-même (le texte d'une étape à l'autre n'a pas la même longueur).
  //
  // Choisit le côté qui offre le plus de place plutôt que de toujours
  // préférer "en dessous" puis se rabattre sur un unique `Math.max(top,
  // CARD_MARGIN)` : cette dernière étape pouvait, pour une cible proche du
  // haut de l'écran avec une carte trop haute pour l'espace disponible
  // au-dessus, repousser la carte jusqu'à chevaucher la zone en
  // surbrillance elle-même. `maxHeight` borne désormais la carte à
  // l'espace réellement disponible du côté choisi (avec défilement
  // interne, voir .welcome-tour en CSS) : elle ne peut alors plus jamais
  // déborder sur la cible, quelle que soit la longueur de son texte.
  //
  // Mais une cible elle-même très haute (ex. le tableau de KPI à plusieurs
  // cartes, étape "Produits") peut ne laisser assez de place NI au-dessus
  // NI en dessous pour la carte à sa taille naturelle : la contraindre
  // quand même la réduisait au point de rendre Précédent/Suivant
  // inatteignables sans défiler DANS la carte elle-même (bug remonté par
  // l'utilisateur). Dans ce cas, `cardPos` reste null : la carte retombe
  // en mode centré (.welcome-tour-centered, non contraint par la cible) —
  // le halo de surbrillance reste affiché autour de la cible (piloté par
  // `targetRect`, indépendant de `cardPos`), seule la carte d'instructions
  // n'essaie plus de se coller à côté d'elle.
  useLayoutEffect(() => {
    if (!targetRect || !cardRef.current) {
      setCardPos(null)
      return
    }
    const cardRect = cardRef.current.getBoundingClientRect()
    if (naturalCardHeightRef.current === null) {
      naturalCardHeightRef.current = cardRect.height
    }
    const naturalHeight = naturalCardHeightRef.current
    const spotlightTop = targetRect.top - SPOTLIGHT_PADDING
    const spotlightBottom = targetRect.bottom + SPOTLIGHT_PADDING
    const spaceAbove = spotlightTop - CARD_MARGIN * 2
    const spaceBelow = window.innerHeight - CARD_MARGIN * 2 - spotlightBottom
    if (spaceAbove < naturalHeight && spaceBelow < naturalHeight) {
      setCardPos(null)
      return
    }
    const placeBelow = spaceBelow >= cardRect.height || spaceBelow >= spaceAbove
    const maxHeight = Math.max(placeBelow ? spaceBelow : spaceAbove, 120)
    const top = placeBelow
      ? spotlightBottom + CARD_MARGIN
      : Math.max(CARD_MARGIN, spotlightTop - CARD_MARGIN - Math.min(cardRect.height, maxHeight))
    let left = targetRect.left + targetRect.width / 2 - cardRect.width / 2
    left = Math.min(Math.max(left, CARD_MARGIN), window.innerWidth - cardRect.width - CARD_MARGIN)
    setCardPos({ top, left, maxHeight })
  }, [targetRect])

  return (
    <>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
      <div className="tour-blocker" onClick={onClose} />
      {targetRect && (
        <div
          className="tour-spotlight"
          style={{
            top: targetRect.top - SPOTLIGHT_PADDING,
            left: targetRect.left - SPOTLIGHT_PADDING,
            width: targetRect.width + SPOTLIGHT_PADDING * 2,
            height: targetRect.height + SPOTLIGHT_PADDING * 2,
          }}
        />
      )}
      <div
        ref={cardRef}
        className={`welcome-tour${cardPos ? '' : ' welcome-tour-centered'}`}
        style={cardPos ? { top: cardPos.top, left: cardPos.left, maxHeight: cardPos.maxHeight } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="welcome-tour-skip" onClick={onClose}>
          Passer
        </button>

        <div className="welcome-tour-icon">
          <Icon size={32} aria-hidden="true" />
        </div>
        <h2>{stepData.title}</h2>
        <p>{stepData.body}</p>

        <div className="welcome-tour-dots" aria-hidden="true">
          {TOUR_STEPS.map((s, i) => (
            <span key={s.title} className={i === step ? 'active' : ''} />
          ))}
        </div>

        <div className="welcome-tour-actions">
          <button type="button" onClick={onPrev} disabled={isFirst}>
            Précédent
          </button>
          <span className="welcome-tour-progress">
            {step + 1} / {TOUR_STEPS.length}
          </span>
          <button type="button" className="btn-primary" onClick={isLast ? onClose : onNext}>
            {isLast ? 'Terminer' : 'Suivant'}
          </button>
        </div>
      </div>
    </>
  )
}
