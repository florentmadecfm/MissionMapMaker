import { PromptEditor, type PromptFieldDef } from './PromptEditor'

// Les 3 skills correspondent exactement aux 3 capacités de génération
// assistée exposées par le backend (internal/llm/prompts.go) : pas de
// "création" d'un 4e skill arbitraire, ce sont des emplacements fixes —
// éditer et réinitialiser leur texte est ce que permet le mode CRUD
// demandé ici (Read : texte actuel : Update : édition + Enregistrer ;
// Delete : Réinitialiser retire la personnalisation, revient au texte par
// défaut). Un skill est la MÉTHODE détaillée d'une tâche (étapes, règles
// de rédaction, format de sortie) — voir PromptsPanel.tsx pour le contexte
// et l'objectif de ces mêmes tâches, concaténés au skill au moment de
// l'appel (ADR-045).
const SKILL_FIELDS: PromptFieldDef[] = [
  {
    key: 'process',
    title: 'Construire la mission map',
    description:
      "Extrait acteurs, phases, activités et interactions à partir d'une description en langage naturel — utilisé par l'onglet Générer et par la mise à jour du diagramme.",
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
