import type { Product, Project } from '../../api/types'

// Mission fictive utilisée UNIQUEMENT pendant la visite guidée
// (WelcomeTour.tsx, ADR-078) — jamais persistée (aucun appel à l'API),
// jamais listée dans le panneau de gauche : sert seulement à donner à
// chaque étape un écran réel à afficher et un composant concret à mettre
// en surbrillance (carte d'activité, chips de personas, ligne
// Actuel/Cible, fiche de spécification…), plutôt que des écrans vides
// pendant la toute première visite (avant qu'aucune vraie mission
// n'existe). ProjectShell.tsx installe ce projet le temps de la visite et
// restaure l'état précédent à la fermeture.
export const TOUR_DEMO_PROJECT_ID = '__tour_demo__'

const SPEC_ID = 'tour-spec-1'

// Produit fictif (Phase 5 du plan Produit/Vision/KPI) — même statut que
// TOUR_DEMO_PROJECT ci-dessous : jamais persisté, installé le temps de la
// visite guidée uniquement (ProjectShell.tsx bascule `products` sur
// `[TOUR_DEMO_PRODUCT]`). Arbre de KPI à 2 niveaux (un KPI parent + un
// sous-KPI) pour que l'étape "Produits" de la visite ait un vrai exemple
// de hiérarchie à montrer, pas une liste plate.
export const TOUR_DEMO_PRODUCT_ID = '__tour_demo_product__'

const TOUR_KPI_ROOT_ID = 'tour-kpi-temps-service'
const TOUR_KPI_CHILD_ID = 'tour-kpi-attente-accueil'

export const TOUR_DEMO_PRODUCT: Product = {
  id: TOUR_DEMO_PRODUCT_ID,
  name: 'Le Bistrot Rapide',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  visionStatement:
    'Pour les restaurateurs qui veulent réduire le temps d’attente en salle, Le Bistrot Rapide est le concept qui accélère chaque étape du service — contrairement à un service traditionnel, chaque étape est mesurée et optimisée.',
  differentiators: ['Suivi en temps réel du temps de service, étape par étape'],
  pillars: ['Rapidité de service', 'Satisfaction client'],
  kpis: [
    {
      id: TOUR_KPI_ROOT_ID,
      name: 'Temps de service moyen',
      definition: "Durée moyenne entre l'arrivée d'un client et son départ",
      unit: 'min',
      pillar: 'Rapidité de service',
    },
    {
      id: TOUR_KPI_CHILD_ID,
      name: "Temps d'attente à l'accueil",
      definition: "Durée moyenne entre l'arrivée d'un client et sa prise en charge",
      unit: 'min',
      pillar: 'Rapidité de service',
      parentId: TOUR_KPI_ROOT_ID,
    },
  ],
}

export const TOUR_DEMO_PROJECT: Project = {
  id: TOUR_DEMO_PROJECT_ID,
  name: 'Mission de démonstration',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  productId: TOUR_DEMO_PRODUCT_ID,
  actors: [
    {
      id: 'tour-a-serveur',
      name: 'Serveur',
      color: '#16a34a',
      description: '',
      subLanes: 0,
      about: 'Accueille les clients et prend les commandes en salle',
      bio: '',
      goals: [{ id: 'tour-goal-1', text: 'Satisfaire un maximum de clients par service' }],
      painPoints: [{ id: 'tour-app-1', text: 'Trop de tables à gérer en simultané aux heures de pointe' }],
    },
    {
      id: 'tour-a-cuisinier',
      name: 'Cuisinier',
      color: '#2563eb',
      description: '',
      subLanes: 0,
      about: 'Prépare les plats en cuisine',
      bio: '',
      goals: [],
      painPoints: [],
    },
    {
      id: 'tour-a-manager',
      name: 'Manager',
      color: '#f59e0b',
      description: '',
      subLanes: 0,
      about: 'Supervise le service et gère les imprévus',
      bio: '',
      goals: [],
      painPoints: [],
    },
  ],
  phases: [
    { id: 'tour-p-accueil', name: 'Accueil', order: 0, subColumns: 0, icon: '👋', kpiLinks: [TOUR_KPI_ROOT_ID] },
    { id: 'tour-p-commande', name: 'Commande', order: 1, subColumns: 0, icon: '📝', kpiLinks: [] },
    { id: 'tour-p-service', name: 'Service', order: 2, subColumns: 0, icon: '🍽️', kpiLinks: [] },
  ],
  activities: [
    {
      id: 'tour-act-accueillir',
      name: 'Accueillir le client',
      actorId: 'tour-a-serveur',
      phaseId: 'tour-p-accueil',
      order: 0,
      column: 0,
      subRow: 0,
      offsetX: 0,
      offsetY: 0,
      description: '',
      userStories: [],
      traceLinks: [],
      painPoints: [{ id: 'tour-pp-1', text: "Attente trop longue à l'entrée aux heures de pointe" }],
      // Exemple concret pour l'étape de la visite guidée expliquant le
      // lien KPI <-> activité/phase (Phase 5 du plan Produit/Vision/KPI).
      kpiLinks: [TOUR_KPI_CHILD_ID],
    },
    {
      id: 'tour-act-commander',
      name: 'Prendre la commande',
      actorId: 'tour-a-serveur',
      phaseId: 'tour-p-commande',
      order: 1,
      column: 0,
      subRow: 0,
      offsetX: 0,
      offsetY: 0,
      description: '',
      userStories: [],
      traceLinks: [],
      painPoints: [],
      kpiLinks: [],
    },
    {
      id: 'tour-act-preparer',
      name: 'Préparer le plat',
      actorId: 'tour-a-cuisinier',
      phaseId: 'tour-p-commande',
      order: 2,
      column: 0,
      subRow: 0,
      offsetX: 0,
      offsetY: 0,
      description: '',
      userStories: [],
      traceLinks: [SPEC_ID],
      painPoints: [],
      kpiLinks: [],
    },
    {
      id: 'tour-act-servir',
      name: 'Servir le plat',
      actorId: 'tour-a-serveur',
      phaseId: 'tour-p-service',
      order: 3,
      column: 0,
      subRow: 0,
      offsetX: 0,
      offsetY: 0,
      description: '',
      userStories: [],
      traceLinks: [],
      painPoints: [],
      kpiLinks: [],
    },
  ],
  interactions: [
    { id: 'tour-int-1', fromActivityId: 'tour-act-commander', toActivityId: 'tour-act-preparer', information: 'Commande transmise' },
    { id: 'tour-int-2', fromActivityId: 'tour-act-preparer', toActivityId: 'tour-act-servir', information: 'Plat prêt' },
  ],
  specifications: [
    {
      id: SPEC_ID,
      code: 'SYS-001',
      type: 'SystemRequirement',
      text: 'Le système doit permettre de transmettre la commande en cuisine en moins de 30 secondes.',
      rationale: "Réduit le temps d'attente perçu par le client entre la commande et le service.",
      status: 'approved',
      priority: 'Must',
    },
  ],
  testScenarios: [
    {
      id: 'tour-test-1',
      code: 'TS-001',
      title: 'Transmission rapide de la commande en cuisine',
      specificationId: SPEC_ID,
      preconditions: 'Le serveur a pris la commande du client',
      steps: [{ action: 'Le serveur valide la commande', expectedResult: 'Le cuisinier reçoit le bon de commande instantanément' }],
      status: 'approved',
    },
  ],
  target: {
    label: 'Cible',
    actors: [
      {
        id: 'tour-a-serveur',
        name: 'Serveur',
        color: '#16a34a',
        description: '',
        subLanes: 0,
        about: 'Accueille les clients et prend les commandes en salle',
        bio: '',
        goals: [{ id: 'tour-goal-1', text: 'Satisfaire un maximum de clients par service' }],
        painPoints: [],
      },
      {
        id: 'tour-a-cuisinier',
        name: 'Cuisinier',
        color: '#2563eb',
        description: '',
        subLanes: 0,
        about: 'Prépare les plats en cuisine',
        bio: '',
        goals: [],
        painPoints: [],
      },
      {
        id: 'tour-a-manager',
        name: 'Manager',
        color: '#f59e0b',
        description: '',
        subLanes: 0,
        about: 'Supervise le service et gère les imprévus',
        bio: '',
        goals: [],
        painPoints: [],
      },
    ],
    phases: [
      { id: 'tour-p-accueil', name: 'Accueil', order: 0, subColumns: 0, icon: '👋', kpiLinks: [] },
      { id: 'tour-p-commande', name: 'Commande en ligne', order: 1, subColumns: 0, icon: '📱', kpiLinks: [] },
      { id: 'tour-p-service', name: 'Service', order: 2, subColumns: 0, icon: '🍽️', kpiLinks: [] },
    ],
    activities: [
      {
        id: 'tour-act-accueillir',
        name: 'Accueillir le client',
        actorId: 'tour-a-serveur',
        phaseId: 'tour-p-accueil',
        order: 0,
        column: 0,
        subRow: 0,
        offsetX: 0,
        offsetY: 0,
        description: '',
        userStories: [],
        traceLinks: [],
        painPoints: [],
        kpiLinks: [],
      },
      {
        id: 'tour-act-commander',
        name: 'Commander depuis la table (QR code)',
        actorId: 'tour-a-serveur',
        phaseId: 'tour-p-commande',
        order: 1,
        column: 0,
        subRow: 0,
        offsetX: 0,
        offsetY: 0,
        description: '',
        userStories: [],
        traceLinks: [SPEC_ID],
        painPoints: [],
        kpiLinks: [],
      },
      {
        id: 'tour-act-preparer',
        name: 'Préparer le plat',
        actorId: 'tour-a-cuisinier',
        phaseId: 'tour-p-commande',
        order: 2,
        column: 0,
        subRow: 0,
        offsetX: 0,
        offsetY: 0,
        description: '',
        userStories: [],
        traceLinks: [SPEC_ID],
        painPoints: [],
        kpiLinks: [],
      },
      {
        id: 'tour-act-servir',
        name: 'Servir le plat',
        actorId: 'tour-a-serveur',
        phaseId: 'tour-p-service',
        order: 3,
        column: 0,
        subRow: 0,
        offsetX: 0,
        offsetY: 0,
        description: '',
        userStories: [],
        traceLinks: [],
        painPoints: [],
        kpiLinks: [],
      },
    ],
    interactions: [
      { id: 'tour-int-1', fromActivityId: 'tour-act-commander', toActivityId: 'tour-act-preparer', information: 'Commande transmise automatiquement' },
      { id: 'tour-int-2', fromActivityId: 'tour-act-preparer', toActivityId: 'tour-act-servir', information: 'Plat prêt' },
    ],
    specifications: [
      {
        id: SPEC_ID,
        code: 'SYS-001',
        type: 'SystemRequirement',
        text: 'Le client doit pouvoir commander directement depuis la table via un QR code, sans attendre le serveur.',
        rationale: "Supprime le temps d'attente pour passer commande.",
        status: 'approved',
        priority: 'Must',
      },
    ],
    testScenarios: [
      {
        id: 'tour-test-1',
        code: 'TS-001',
        title: 'Commande en ligne depuis la table',
        specificationId: SPEC_ID,
        preconditions: 'Le client est installé et scanne le QR code',
        steps: [{ action: 'Le client valide sa commande sur son téléphone', expectedResult: 'Le cuisinier reçoit le bon de commande instantanément' }],
        status: 'approved',
      },
    ],
  },
}
