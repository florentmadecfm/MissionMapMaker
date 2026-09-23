import { PromptEditor, type PromptFieldDef } from './PromptEditor'

// Les 7 skills correspondent exactement aux 7 capacités de génération
// assistée exposées par le backend (internal/llm/prompts.go +
// image_prompts.go, ADR-073/ADR-074 ; Phase 2 du plan Produit/Vision/KPI
// pour visionRefinement/kpiSuggestions) : ce sont des emplacements fixes —
// éditer et réinitialiser leur texte est ce que permet le mode CRUD
// demandé ici (Read : texte actuel : Update : édition + Enregistrer ;
// Delete : Réinitialiser retire la personnalisation, revient au texte par
// défaut). Un skill est la MÉTHODE détaillée d'une tâche (étapes, règles
// de rédaction, format de sortie — pour imageGeneration, les règles de
// STYLE de l'illustration) — voir PromptsPanel.tsx pour le contexte et
// l'objectif de ces mêmes tâches, concaténés au skill au moment de l'appel
// (ADR-045).
const SKILL_FIELDS: PromptFieldDef[] = [
  {
    key: 'process',
    title: 'Construire la mission map',
    description:
      "Extrait personas, phases, activités et interactions à partir d'une description en langage naturel — utilisé par l'onglet Générer et par la mise à jour du diagramme.",
  },
  {
    key: 'specification',
    title: 'Construire les SSS',
    description: 'Propose des besoins partie prenante (SSS, format INCOSE) pour les activités du diagramme.',
  },
  {
    key: 'testScenario',
    title: 'Construire les scénarios de test',
    description: 'Propose des scénarios de test de vérification/validation (V&V) pour les spécifications.',
  },
  {
    key: 'painPointSolutions',
    title: 'Résoudre un point de friction',
    description:
      "Propose 5 solutions structurelles à un point de friction (design créatif / creative problem solving) — la formalisation en SSS + test de la solution choisie, elle, n'est pas personnalisable.",
  },
  {
    key: 'imageGeneration',
    title: 'Génération d’image',
    description:
      "Règles de style de l'illustration générée (portrait de persona ou sketch de diagramme) — les données propres à chaque usage (nom/fiche du persona, contenu du diagramme) restent fixes, pas personnalisables.",
  },
  {
    key: 'visionRefinement',
    title: 'Affiner la vision produit',
    description: "Affine un brouillon informel de vision produit (énoncé, différenciateurs, piliers stratégiques).",
  },
  {
    key: 'kpiSuggestions',
    title: 'Suggérer des KPI',
    description: 'Propose des KPI pertinents à partir de la vision et des piliers stratégiques déjà définis.',
  },
]

export function SkillsPanel() {
  return (
    <PromptEditor
      fields={SKILL_FIELDS}
      hint={
        'Ces consignes ("skills") détaillent COMMENT le LLM doit accomplir chaque tâche de génération assistée ' +
        '(étapes, règles de rédaction, format de sortie) — voir l\'onglet Prompts pour le contexte et l\'objectif ' +
        'de ces mêmes tâches. Les adapter est une fonctionnalité avancée : un texte incohérent peut dégrader la ' +
        "qualité des propositions, voire empêcher la mise à jour incrémentale du diagramme de fonctionner " +
        'correctement (voir ADR-040).'
      }
    />
  )
}
