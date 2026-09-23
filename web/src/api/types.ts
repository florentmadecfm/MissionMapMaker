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
  // Portrait/sketch de ce persona généré par IA (ADR-073), en data URL
  // ("data:image/png;base64,...") — vide tant qu'aucun n'a été généré
  // depuis la fiche persona (ActorProfileModal.tsx).
  portraitImage?: string
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

// DraftPainPointDiagramChange décrit le changement structurel concret à
// appliquer au diagramme CIBLE pour la solution choisie (jamais à l'état
// actuel) — seuls les champs pertinents pour le changeType de la solution
// sont renseignés par le LLM, toujours par NOM (activité/acteur/phase),
// jamais par ID : ces noms sont résolus au sein des collections de la
// cible (mergePainPointResolution.ts), best-effort — si un nom ne
// correspond à rien, le changement structurel est simplement ignoré (la
// SSS/le test, eux, sont toujours ajoutés).
export interface DraftPainPointDiagramChange {
  newActivityName?: string
  newActivityActorName?: string
  newActivityPhaseName?: string
  newActivityDescription?: string
  removeActivityName?: string
  mergeActivityNames?: string[]
  mergedActivityName?: string
  interactionFromActivityName?: string
  interactionToActivityName?: string
  interactionInformation?: string
  removeInteractionFromActivityName?: string
  removeInteractionToActivityName?: string
}

export interface PainPointResolution {
  specificationText: string
  specificationRationale?: string
  testTitle: string
  testPreconditions?: string
  testSteps: DraftTestStep[]
  diagramChange: DraftPainPointDiagramChange
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
  // Second état ("cible"/to-be) du diagramme de CETTE mission, distinct de
  // l'état "actuel" ci-dessus (une copie indépendante complète : ses
  // propres acteurs/phases/activités/interactions/specs/tests) — jamais
  // une mission séparée dans le panneau de gauche. Absent tant qu'aucune
  // cible n'a été créée (bouton Actuel/Cible, ou automatiquement à la
  // première résolution de point de friction, voir mergePainPointResolution.ts).
  target?: ProjectVariant
  // Produit (vision, différenciateurs, piliers, KPI) auquel cette mission
  // est rattachée — absent tant qu'aucun produit n'a été choisi
  // (sélecteur "Produit associé", onglet Édition). Référence par id vers
  // un Product (voir api/client.ts, listProducts) — jamais dupliqué ici.
  productId?: string
}

// ProjectVariant est le contenu de la cible d'un projet — mêmes 6
// collections qu'un Project, plus un label affiché dans le sélecteur
// Actuel/Cible (ex. "Cible", éditable).
export interface ProjectVariant {
  label: string
  actors: Actor[]
  phases: Phase[]
  activities: Activity[]
  interactions: Interaction[]
  specifications: Specification[]
  testScenarios: TestScenario[]
}

export interface ProjectSummary {
  id: string
  name: string
  updatedAt: string
  productId?: string
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

// Product représente le produit lui-même (vision, différenciateurs,
// piliers stratégiques, KPI) — distinct d'une mission (Project, un
// parcours/story map précis) : un même Produit peut justifier plusieurs
// missions dans le temps. Une mission s'y rattache via Project.productId
// (référence par id, jamais fusionné/dupliqué dans le projet).
export interface Product {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  // Formulation de la vision produit (ex. format Product Vision Board :
  // cible/besoin/catégorie/bénéfice clé) — texte libre, rédigée à la main
  // ou affinée depuis un brouillon informel par l'IA (voir
  // VisionRefinementModal.tsx), toujours relue/éditée avant enregistrement.
  visionStatement?: string
  differentiators: string[]
  // Piliers stratégiques (3-5 typiquement) — texte libre, pas d'entité
  // séparée avec son propre id : référencés PAR NOM depuis
  // ProductKpi.pillar ci-dessous.
  pillars: string[]
  kpis: ProductKpi[]
}

export interface ProductKpi {
  id: string
  name: string
  definition?: string
  unit?: string
  // Texte libre plutôt qu'un type numérique imposé (même philosophie que
  // Phase.duration) : un KPI peut être qualitatif.
  baseline?: string
  target?: string
  // Référence Product.pillars PAR NOM (pas un id) — un nom qui ne
  // correspond plus à aucun pilier reste un simple libellé orphelin sans
  // conséquence (pas de lookup cassé).
  pillar?: string
}

// ProductVisionContext fournit à l'IA le brouillon actuel de la vision
// produit (voir buildProductContext.ts) — utilisé à la fois pour l'affiner
// (generateVisionRefinement) et pour en dériver des suggestions de KPI
// (generateKpiSuggestions), Phase 2 du plan Produit/Vision/KPI.
export interface ProductVisionContext {
  productName: string
  visionStatement: string
  differentiators: string[]
  pillars: string[]
}

// DraftVisionRefinement est la vision affinée proposée par l'IA à partir
// d'un ProductVisionContext — une proposition à relire dans
// VisionRefinementModal.tsx, jamais appliquée automatiquement au produit.
export interface DraftVisionRefinement {
  visionStatement: string
  differentiators: string[]
  pillars: string[]
}

// DraftKpiSuggestion est un KPI proposé par l'IA à partir de la vision et
// des piliers du produit — même forme que ProductKpi sans id ni parentId
// (attribués à l'acceptation, voir VisionRefinementModal.tsx).
export interface DraftKpiSuggestion {
  name: string
  definition?: string
  unit?: string
  baseline?: string
  target?: string
  pillar?: string
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
  physicalEvidence?: string
}

export type Provider = 'anthropic' | 'mistral'

export interface Settings {
  configured: boolean
  provider: Provider | ''
  model: string
  baseUrl: string
  // Génération d'image (ADR-073/ADR-075, portrait de persona / sketch de
  // diagramme) — connexion (fournisseur/clé/modèle/URL de base)
  // INDÉPENDANTE de celle utilisée ci-dessus pour la génération de texte,
  // voir SettingsModal.tsx. "mistral" est le seul fournisseur valide
  // aujourd'hui.
  imageGenerationConfigured: boolean
  imageGenerationProvider: Provider | ''
  imageGenerationModel: string
  imageGenerationBaseUrl: string
}

// Deux couches distinctes par capacité de génération assistée, concaténées
// côté serveur au moment de l'appel (voir GenerateService.Prompts/
// ImageService.Prompts, internal/service/generate_service.go et
// image_service.go) :
// - process/specification/testScenario/painPointSolutions/imageGeneration :
//   le "skill" (onglet Skills), la méthode détaillée (étapes, règles de
//   rédaction, format de sortie — pour imageGeneration, les règles de
//   STYLE de l'illustration générée).
// - *Context : le "prompt" (onglet Prompts), le contexte et l'objectif de
//   la tâche — voir PromptEditor.tsx (partagé par SkillsPanel.tsx et
//   PromptsPanel.tsx) / internal/llm/prompts.go + image_prompts.go côté
//   serveur.
// painPointSolutions* couvre uniquement la 1re étape (proposer des
// solutions) de la résolution d'un point de friction (ADR-066/ADR-067) —
// la 2e étape (formaliser la solution choisie en SSS + test) reste fixe,
// pas de champs correspondants ici. imageGeneration* (ADR-073/ADR-074)
// régit le style COMMUN aux deux usages de la génération d'image (portrait
// de persona, sketch de diagramme) — les données propres à chaque usage
// restent générées côté serveur, jamais personnalisables.
export interface PromptSettings {
  process: string
  processContext: string
  specification: string
  specificationContext: string
  testScenario: string
  testScenarioContext: string
  painPointSolutions: string
  painPointSolutionsContext: string
  imageGeneration: string
  imageGenerationContext: string
  // visionRefinement/kpiSuggestions (Phase 2 du plan Produit/Vision/KPI) :
  // 6e et 7e paires personnalisables, même patron que les précédentes.
  visionRefinement: string
  visionRefinementContext: string
  kpiSuggestions: string
  kpiSuggestionsContext: string
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
    imageGeneration: boolean
    imageGenerationContext: boolean
    visionRefinement: boolean
    visionRefinementContext: boolean
    kpiSuggestions: boolean
    kpiSuggestionsContext: boolean
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
