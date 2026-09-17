import { ClipboardCheck, Download, FlaskConical, GitCompareArrows, Map, Sparkles, Users, Workflow, type LucideIcon } from 'lucide-react'
import type { SubTab } from '../specifications/SpecificationsPanel'
import type { Tab } from '../project-shell/ProjectShell'

export interface TourStep {
  icon: LucideIcon
  title: string
  body: string
  // Sélecteur CSS de l'élément réel à mettre en surbrillance pour cette
  // étape (voir WelcomeTour.tsx) — toujours un élément déjà présent une
  // fois TOUR_DEMO_PROJECT installé et le bon onglet (et sous-onglet,
  // specSubTab ci-dessous) actifs (aucun ne dépend d'une interaction
  // préalable, comme ouvrir une modale).
  target: string
  // Onglet à activer pour cette étape — absent pour l'étape 1, qui pointe
  // un élément de la barre latérale (visible quel que soit l'onglet).
  tab?: Tab
  // Sous-onglet à activer au sein de l'onglet Spécifications (SSS/V&V/
  // matrice, SpecificationsPanel.tsx) — sans quoi une étape ciblant les
  // scénarios de test se retrouverait à chercher .spec-card dans le
  // sous-onglet Spécifications (SSS) resté actif par défaut. Sans effet
  // pour un `tab` différent de 'specifications'.
  specSubTab?: SubTab
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
    body: 'Glissez-déposez les activités entre personas et phases, reliez-les pour créer des interactions, annulez/rétablissez (Ctrl+Z), ou générez un sketch illustré.',
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
    title: 'Spécifications, tracées à vos activités',
    body: 'Chaque activité peut se relier à une ou plusieurs spécifications (SSS) : la traçabilité vers vos exigences reste visible d’un coup d’œil, ici comme sur la matrice dédiée.',
    target: '.spec-card',
    tab: 'specifications',
    specSubTab: 'specifications',
  },
  {
    icon: FlaskConical,
    title: 'Scénarios de test (V&V)',
    body: 'Chaque spécification peut être vérifiée par un ou plusieurs scénarios de test, avec leurs étapes détaillées — la vérification et validation, au même endroit que le reste.',
    target: '.spec-card',
    tab: 'specifications',
    specSubTab: 'tests',
  },
  {
    icon: Download,
    title: 'Exportez et personnalisez',
    body: 'Exportez l’ensemble en Excel ou en PNG depuis ce menu, et personnalisez les prompts de génération depuis Paramètres.',
    target: '.header-menu-trigger',
    tab: 'specifications',
    specSubTab: 'specifications',
  },
]
