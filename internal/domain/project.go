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
	// SubLanes réserve manuellement un nombre de sous-lignes pour cet
	// acteur (une "ligne" empilée par sous-ligne, partagée par toutes les
	// phases) — 0 ou 1 (la valeur par défaut, y compris pour les projets
	// enregistrés avant l'introduction de ce champ) signifie une seule
	// ligne. Permet de réserver une seconde ligne avant même d'y avoir
	// une activité (bouton "+" sur l'en-tête d'acteur du diagramme),
	// symétrique de Phase.SubColumns sur l'axe vertical.
	SubLanes int `json:"subLanes"`
}

type Phase struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Order int    `json:"order"`
	// SubColumns réserve manuellement un nombre de sous-colonnes pour
	// cette phase (partagées par tous les acteurs) — 0 ou 1 (valeur par
	// défaut) signifie une seule colonne. Complémentaire à la répartition
	// automatique déjà portée par Activity.Column : permet de réserver une
	// seconde colonne avant même d'y avoir une activité (bouton "+" sur
	// l'en-tête de phase du diagramme).
	SubColumns int `json:"subColumns"`
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
	Column int `json:"column"`
	// SubRow indique, pour les activités de cet acteur, une sous-ligne
	// explicitement choisie (glisser-déposer sur le diagramme) — 0 (la
	// valeur par défaut) est la ligne principale de l'acteur. Contrairement
	// à Column, il n'y a pas de répartition automatique par empilement :
	// une activité reste sur la ligne principale tant qu'elle n'a pas été
	// explicitement déplacée sur une autre ligne, symétrique de Column
	// mais sur l'axe vertical (partagée par toutes les phases pour cet
	// acteur, comme Actor.SubLanes).
	SubRow int `json:"subRow"`
	// OffsetX/OffsetY affinent la position de la carte À L'INTÉRIEUR de sa
	// case (acteur/phase/sous-ligne/sous-colonne ci-dessus, qui reste seule
	// à déterminer l'ACTEUR/LA PHASE affectés) — glisser-déposer sur le
	// diagramme d'une petite distance, sans traverser toute la largeur/
	// hauteur d'une case. 0 (valeur par défaut, y compris pour les projets
	// enregistrés avant l'introduction de ce champ) : position par défaut
	// dans la case, comme avant. Bornés à l'espace encore libre dans la
	// case (voir MAX_OFFSET_X/Y, layout.ts) pour ne jamais chevaucher une
	// case voisine — un décalage plus grand doit passer par un vrai
	// changement de case (voir ADR-051).
	OffsetX     float64 `json:"offsetX"`
	OffsetY     float64 `json:"offsetY"`
	Description string  `json:"description"`
	SourceText  string  `json:"sourceText,omitempty"`

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
