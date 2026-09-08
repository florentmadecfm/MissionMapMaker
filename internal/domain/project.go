// Package domain définit le modèle métier de MissionMapMaker : un projet
// regroupe des acteurs, des phases, des activités (avec leurs user stories
// et leurs liens de traçabilité), des interactions et des spécifications.
package domain

import "time"

type Project struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`

	Actors         []Actor         `json:"actors"`
	Phases         []Phase         `json:"phases"`
	Activities     []Activity      `json:"activities"`
	Interactions   []Interaction   `json:"interactions"`
	Specifications []Specification `json:"specifications"`
	TestScenarios  []TestScenario  `json:"testScenarios"`
}

type Actor struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Color       string `json:"color"`
	Description string `json:"description"`
}

type Phase struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Order int    `json:"order"`
}

type Activity struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	ActorID string `json:"actorId"`
	PhaseID string `json:"phaseId"`
	Order   int    `json:"order"`
	// Column indique, pour les activités de cet acteur dans cette phase,
	// une sous-colonne explicitement choisie (glisser-déposer sur le
	// diagramme) plutôt que la répartition automatique habituelle. 0 (la
	// valeur par défaut, y compris pour les projets enregistrés avant
	// l'introduction de ce champ) signifie "pas de choix explicite" :
	// cette activité participe à l'empilement automatique par Order,
	// exactement comme avant. Une valeur strictement positive fige sa
	// position même si l'acteur n'a pas d'autre activité dans cette
	// phase — utile pour aligner une activité isolée sur une des
	// sous-colonnes qu'une autre acteur a fait apparaître dans la phase.
	Column      int    `json:"column"`
	Description string `json:"description"`
	SourceText  string `json:"sourceText,omitempty"`

	UserStories []UserStory `json:"userStories"`
	TraceLinks  []string    `json:"traceLinks"` // specification IDs
}

type UserStory struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Priority string `json:"priority"` // must | should | could | wont
	Release  string `json:"release"`
	Status   string `json:"status"` // todo | in_progress | done
}

type Interaction struct {
	ID             string `json:"id"`
	FromActivityID string `json:"fromActivityId"`
	ToActivityID   string `json:"toActivityId"`
	Information    string `json:"information"`
	Description    string `json:"description,omitempty"`
}

type SpecificationType string

const (
	SpecStakeholderNeed       SpecificationType = "StakeholderNeed"
	SpecSystemRequirement     SpecificationType = "SystemRequirement"
	SpecSubsystemRequirement  SpecificationType = "SubsystemRequirement"
	SpecVerificationCriterion SpecificationType = "VerificationCriterion"
)

type Specification struct {
	ID        string            `json:"id"`
	Code      string            `json:"code"`
	Type      SpecificationType `json:"type"`
	Text      string            `json:"text"`
	Rationale string            `json:"rationale,omitempty"`
	ParentID  string            `json:"parentId,omitempty"`
	Status    string            `json:"status"` // draft | approved | deprecated
	Priority  string            `json:"priority"`
}

// TestStep est une étape d'un scénario de test V&V (Vérification &
// Validation) : une action et le résultat attendu qu'elle doit produire,
// sur le modèle des tableaux d'étapes Polarion (colonnes "Step" /
// "Expected Result").
type TestStep struct {
	Action         string `json:"action"`
	ExpectedResult string `json:"expectedResult"`
}

// TestScenario est un scénario de test de vérification/validation d'une
// spécification (typiquement une SSS), au format V&V générique inspiré de
// Polarion : préconditions puis étapes numérotées action/résultat
// attendu. Comme Specification, un scénario peut être proposé par le LLM
// (voir internal/llm) ou saisi à la main ; SpecificationID est toujours
// requis (un scénario vérifie une spécification précise, jamais
// "flottant").
type TestScenario struct {
	ID              string     `json:"id"`
	Code            string     `json:"code"`
	Title           string     `json:"title"`
	SpecificationID string     `json:"specificationId"`
	Preconditions   string     `json:"preconditions,omitempty"`
	Steps           []TestStep `json:"steps"`
	Status          string     `json:"status"` // draft | approved | deprecated
}
