import { PromptEditor, type PromptFieldDef } from './PromptEditor'

// Un prompt donne au LLM le CONTEXTE et l'OBJECTIF d'une tâche (à qui elle
// s'adresse, ce qu'on cherche à produire et pourquoi) — distinct du skill
// associé à cette même tâche (voir SkillsPanel.tsx), qui détaille COMMENT
// l'accomplir. Les deux sont concaténés côté serveur au moment de l'appel
// (prompt puis skill, voir GenerateService.Generate*) — ADR-045.
const PROMPT_FIELDS: PromptFieldDef[] = [
  {
    key: 'processContext',
    title: 'Mission map — contexte & objectif',
    description: "Situe la tâche de construction de la mission map (à qui elle s'adresse, ce qu'on cherche à produire).",
  },
  {
    key: 'specificationContext',
    title: 'SSS — contexte & objectif',
    description: 'Situe la tâche de rédaction des besoins partie prenante (SSS).',
  },
  {
    key: 'testScenarioContext',
    title: 'Scénarios de test — contexte & objectif',
    description: 'Situe la tâche de rédaction des scénarios de test V&V.',
  },
]

export function PromptsPanel() {
  return (
    <PromptEditor
      fields={PROMPT_FIELDS}
      hint={
        'Ces prompts donnent au LLM le CONTEXTE et l\'OBJECTIF de chaque tâche de génération assistée — voir ' +
        "l'onglet Skills pour la méthode détaillée de ces mêmes tâches, à laquelle ce texte est concaténé au " +
        'moment de l\'appel. Les adapter est une fonctionnalité avancée : un texte incohérent peut dégrader la ' +
        'qualité des propositions (voir ADR-045).'
      }
    />
  )
}
