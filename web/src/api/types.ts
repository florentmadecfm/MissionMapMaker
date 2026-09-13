export interface Actor {
  id: string
  name: string
  color: string
  description: string
  // Nombre de sous-lignes réservées pour cet acteur (0/1 = une seule
  // ligne). Voir layout.ts (computeLayout) pour l'algorithme de
  // placement ; symétrique de Phase.subColumns sur l'axe vertical.
  subLanes: number
  // Fiche persona de cet acteur (ActorProfileModal.tsx, ADR-055) : about
  // (résumé court) et bio (texte plus long) libres, goals et painPoints
  // en listes d'entrées indépendantes. painPoints ici décrit les
  // irritants du MÉTIER de la personne en général, distincts de
  // Activity.painPoints (une activité précise du diagramme, ADR-052).
  about: string
  bio: string
  goals: ActorGoal[]
  painPoints: ActorPainPoint[]
  // Place cet acteur derrière la ligne de visibilité (service blueprint) :
  // false/absent (front-stage, visible du client) par défaut — true =
  // back-stage (support interne). Voir layout.ts (computeLayout) pour le
  // regroupement des lignes et la ligne de séparation, ADR-064.
  backstage?: boolean
}

export interface ActorGoal {
  id: string
  text: string
}

export interface ActorPainPoint {
  id: string
  text: string
}

export interface Phase {
  id: string
  name: string
  order: number
  // Nombre de sous-colonnes réservées pour cette phase (0/1 = une seule
  // colonne), en plus de la répartition automatique portée par
  // Activity.column. Voir layout.ts (computeLayout).
  subColumns: number
  // Emoji illustrant concrètement cette phase, affiché en grand au-dessus
  // de son nom dans l'en-tête du diagramme (mode storyboard, ADR-059) —
  // vide par défaut, aucun repli visuel forcé.
  icon: string
  // Durée typique de cette étape, texte libre (ex. "15 min") — absente
  // par défaut. Voir SatisfactionRowNode (ADR-065).
  duration?: string
  // Ressenti client typique à cette étape, de 1 (très insatisfait) à 5
  // (très satisfait) — 0/absent = non renseigné, distinct d'un score
  // neutre (3) : n'apparaît alors pas dans la courbe de satisfaction
  // (ADR-065).
  satisfactionScore?: number
}

export interface UserStory {
  id: string
  title: string
  priority: 'must' | 'should' | 'could' | 'wont'
  release: string
  status: 'todo' | 'in_progress' | 'done'
}

export interface Activity {
  id: string
  name: string
  actorId: string
  phaseId: string
  order: number
  // Sous-colonne explicitement choisie (glisser-déposer sur le
  // diagramme) au sein de la cellule (actorId, phaseId) ; 0 = pas de
  // choix explicite, empilement automatique par `order` comme avant.
  // Voir layout.ts (computeLayout) pour l'algorithme de placement.
  column: number
  // Sous-ligne explicitement choisie (glisser-déposer sur le diagramme)
  // au sein de la ligne de cet acteur ; 0 = ligne principale. Symétrique
  // de `column` mais sur l'axe vertical, partagée par toutes les phases
  // de cet acteur (voir Actor.subLanes).
  subRow: number
  // Décalage fin (pixels internes du canevas) à l'intérieur de la case
  // ci-dessus — 0 = position par défaut, comme avant. Ne change jamais
  // actorId/phaseId/subRow/column : borné à l'espace encore libre dans
  // la case pour ne jamais chevaucher une case voisine (voir
  // MAX_OFFSET_X/Y, layout.ts, ADR-051).
  offsetX: number
  offsetY: number
  description: string
  sourceText?: string
  userStories: UserStory[]
  traceLinks: string[]
  // Points de friction constatés pour cette activité (texte libre,
  // indépendants les uns des autres) — distinct de `description` (résumé
  // de l'activité elle-même). Ajoutés/retirés depuis le diagramme
  // (ActivityDetailModal.tsx).
  painPoints: PainPoint[]
}

export interface PainPoint {
  id: string
  text: string
  // Référence la spécification (SSS) créée quand une solution proposée
  // par le LLM pour CE point de friction a été choisie (ADR-066) — absent
  // tant qu'aucune solution n'a été retenue.
  resolvedBySpecId?: string
}

// ChangeType d'une DraftPainPointSolution — sert uniquement à choisir une
// icône/étiquette d'affichage (voir PainPointSolutionsModal.tsx), jamais à
// appliquer automatiquement un changement au diagramme (ADR-066).
export type PainPointChangeType =
  | 'add_interaction'
  | 'remove_interaction'
  | 'add_activity'
  | 'remove_activity'
  | 'merge_activities'

export interface DraftPainPointSolution {
  description: string
  changeType: PainPointChangeType
}

export interface PainPointContext {
  activityName: string
  actorName: string
  phaseName: string
  painPointText: string
  activities: ActivityRef[]
  interactions: DraftInteraction[]
}

export interface PainPointResolution {
  specificationText: string
  specificationRationale?: string
  testTitle: string
  testPreconditions?: string
  testSteps: DraftTestStep[]
}

export interface Interaction {
  id: string
  fromActivityId: string
  toActivityId: string
  information: string
  description?: string
  // Quand renseignée, cette interaction devient un embranchement : elle ne
  // se produit que si cette condition est vraie (ex. "paiement refusé"),
  // au lieu de toujours suivre l'activité de départ (ADR-060).
  condition?: string
  // Preuve(s) physique(s) perceptibles par le client lors de cet échange
  // (ex. "reçu papier", "email de confirmation") — service blueprint,
  // texte libre (ADR-071).
  physicalEvidence?: string
}

export type SpecificationType =
  | 'StakeholderNeed'
  | 'SystemRequirement'
  | 'SubsystemRequirement'
  | 'VerificationCriterion'

export interface Specification {
  id: string
  code: string
  type: SpecificationType
  text: string
  rationale?: string
  parentId?: string
  status: 'draft' | 'approved' | 'deprecated'
  priority: string
}

export interface TestStep {
  action: string
  expectedResult: string
}

export interface TestScenario {
  id: string
  code: string
  title: string
  specificationId: string
  preconditions?: string
  steps: TestStep[]
  status: 'draft' | 'approved' | 'deprecated'
}

export interface Project {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  actors: Actor[]
  phases: Phase[]
  activities: Activity[]
  interactions: Interaction[]
  specifications: Specification[]
  testScenarios: TestScenario[]
  // Voir ADR-062 : relie cette mission à d'autres variantes (état actuel /
  // cible...) partageant le même variantGroupId. Absent tant qu'aucune
  // variante n'a été créée depuis (ou vers) ce projet.
  variantGroupId?: string
  variantLabel?: string
}

export interface ProjectSummary {
  id: string
  name: string
  updatedAt: string
  variantGroupId?: string
  variantLabel?: string
}

// Une sauvegarde horodatée passée du projet (voir Repository.backupExisting
// côté backend, exposée pour consultation par ADR-070) — id est le
// fragment d'horodatage du nom de fichier, opaque côté frontend, à
// repasser tel quel à getVersion/restoreVersion.
export interface ProjectVersion {
  id: string
  savedAt: string
}

// ActorProjectRef identifie une mission (projet) où un acteur d'un nom
// donné apparaît (voir ActorSummary) — couleur/description propres à
// cette mission, un même nom d'acteur pouvant être décrit différemment
// d'une mission à l'autre.
export interface ActorProjectRef {
  projectId: string
  projectName: string
  actorId: string
  color: string
  description: string
  updatedAt: string
}

// ActorSummary regroupe par NOM (insensible à la casse) les acteurs de
// toutes les missions — voir ADR-041. Pas d'identifiant partagé : deux
// acteurs de projets différents portant le même nom sont donc considérés
// comme "le même acteur" pour cette vue transverse.
export interface ActorSummary {
  name: string
  projects: ActorProjectRef[]
}

export interface DraftActor {
  name: string
  description?: string
}

export interface DraftPhase {
  name: string
  order: number
  icon?: string
}

export interface DraftActivity {
  name: string
  actorName: string
  phaseName: string
  description?: string
}

export interface DraftInteraction {
  fromActivityName: string
  fromActorName: string
  toActivityName: string
  toActorName: string
  information: string
  condition?: string
}

export type Provider = 'anthropic' | 'mistral'

export interface Settings {
  configured: boolean
  provider: Provider | ''
  model: string
  baseUrl: string
}

// Deux couches distinctes par capacité de génération assistée, concaténées
// côté serveur au moment de l'appel (voir GenerateService.Prompts,
// internal/service/generate_service.go) :
// - process/specification/testScenario/painPointSolutions : le "skill"
//   (onglet Skills), la méthode détaillée (étapes, règles de rédaction,
//   format de sortie).
// - *Context : le "prompt" (onglet Prompts), le contexte et l'objectif de
//   la tâche — voir PromptEditor.tsx (partagé par SkillsPanel.tsx et
//   PromptsPanel.tsx) / internal/llm/prompts.go côté serveur.
// painPointSolutions* couvre uniquement la 1re étape (proposer des
// solutions) de la résolution d'un point de friction (ADR-066/ADR-067) —
// la 2e étape (formaliser la solution choisie en SSS + test) reste fixe,
// pas de champs correspondants ici.
export interface PromptSettings {
  process: string
  processContext: string
  specification: string
  specificationContext: string
  testScenario: string
  testScenarioContext: string
  painPointSolutions: string
  painPointSolutionsContext: string
}

export interface PromptSettingsResponse extends PromptSettings {
  customized: {
    process: boolean
    processContext: boolean
    specification: boolean
    specificationContext: boolean
    testScenario: boolean
    testScenarioContext: boolean
    painPointSolutions: boolean
    painPointSolutionsContext: boolean
  }
  defaults: PromptSettings
}

// DraftActivityChange cible une activité déjà existante par son nom et son
// acteur ACTUELS (activityName/actorName), pour lui appliquer une
// modification (renommage, nouvelle description, réaffectation d'acteur/de
// phase) plutôt que d'en créer une nouvelle — utilisé quand le texte envoyé
// au LLM contenait le processus déjà existant en contexte (mise à jour
// incrémentale, voir mergeDraft.ts).
export interface DraftActivityChange {
  activityName: string
  actorName: string
  newName?: string
  newDescription?: string
  newActorName?: string
  newPhaseName?: string
}

export interface DraftProcess {
  actors: DraftActor[]
  phases: DraftPhase[]
  activities: DraftActivity[]
  interactions: DraftInteraction[]
  activityChanges?: DraftActivityChange[]
}

export interface ActivityRef {
  name: string
  actorName: string
}

export interface DraftSpecification {
  activityName: string
  actorName: string
  text: string
  rationale?: string
}

export interface SpecRef {
  code: string
  text: string
}

export interface DraftTestStep {
  action: string
  expectedResult: string
}

export interface DraftTestScenario {
  specificationCode: string
  title: string
  preconditions?: string
  steps: DraftTestStep[]
}
