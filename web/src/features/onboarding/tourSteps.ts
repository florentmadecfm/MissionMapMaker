import { ClipboardCheck, GitCompareArrows, Map, Sparkles, Users, Workflow, type LucideIcon } from 'lucide-react'
import type { Tab } from '../project-shell/ProjectShell'

export interface TourStep {
  icon: LucideIcon
  title: string
  body: string
  // Sélecteur CSS de l'élément réel à mettre en surbrillance pour cette
  // étape (voir WelcomeTour.tsx) — toujours un élément déjà présent une
  // fois TOUR_DEMO_PROJECT installé et le bon onglet actif (aucun ne
  // dépend d'une interaction préalable, comme ouvrir une modale).
  target: string
  // Onglet à activer pour cette étape — absent pour l'étape 1, qui pointe
  // un élément de la barre latérale (visible quel que soit l'onglet).
  tab?: Tab
}

export const TOUR_STEPS: TourStep[] = [
  {
    icon: Map,
    title: 'Bienvenue dans Pulse.MissionMap',
    body: "Cartographiez un processus métier — personas, étapes, échanges — avec traçabilité vers vos exigences et vos tests. Tout commence ici : donnez un nom à votre mission.",
    target: '.new-project',
  },
  {
    icon: Sparkles,
    title: 'Décrivez, l’IA cartographie',
    body: 'Décrivez votre mission en langage naturel ici : personas, phases, activités et interactions sont proposés automatiquement, prêts à ajuster.',
    target: '.nl-input',
    tab: 'generer',
  },
  {
    icon: Workflow,
    title: 'Un diagramme qui se manipule',
    body: 'Glissez-déposez les activités entre personas et phases, reliez-les pour créer des interactions, annulez/rétablissez (Ctrl+Z), exportez en PNG ou générez un sketch illustré.',
    target: '.activity-card',
    tab: 'diagramme',
  },
  {
    icon: Users,
    title: 'Personas partagés & points de friction',
    body: 'Chaque persona (à propos, bio, objectifs) est partagé par nom entre toutes vos missions. Un point de friction relevé peut être résolu en un clic : spécification et scénario de test générés automatiquement.',
    target: '.actor-chips',
    tab: 'acteur',
  },
  {
    icon: GitCompareArrows,
    title: 'Comparez Actuel et Cible',
    body: 'Créez une version « Cible » de votre mission et comparez-la côte à côte avec l’état « Actuel » pour visualiser précisément ce qui change.',
    target: '.variant-toggle-row',
    tab: 'diagramme',
  },
  {
    icon: ClipboardCheck,
    title: 'Tracez, exportez, personnalisez',
    body: 'Les spécifications se relient à vos activités pour une traçabilité complète. Exportez en Excel ou PNG, et personnalisez les prompts de génération depuis Paramètres.',
    target: '.spec-card',
    tab: 'specifications',
  },
]
