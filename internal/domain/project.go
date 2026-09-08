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
	ID          string `json:"id"`
	Name        string `json:"name"`
	ActorID     string `json:"actorId"`
	PhaseID     string `json:"phaseId"`
	Order       int    `json:"order"`
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
