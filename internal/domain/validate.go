package domain

import (
	"errors"
	"fmt"
)

var ErrInvalidProject = errors.New("invalid project")

// Validate checks referential integrity between a project's collections
// (an activity must reference an existing actor/phase, an interaction must
// reference existing activities, a trace link must reference an existing
// specification). It does not mutate the project.
func (p *Project) Validate() error {
	if p.Name == "" {
		return fmt.Errorf("%w: name is required", ErrInvalidProject)
	}

	actorIDs := make(map[string]bool, len(p.Actors))
	for _, a := range p.Actors {
		actorIDs[a.ID] = true
	}
	phaseIDs := make(map[string]bool, len(p.Phases))
	for _, ph := range p.Phases {
		phaseIDs[ph.ID] = true
	}
	activityIDs := make(map[string]bool, len(p.Activities))
	for _, act := range p.Activities {
		activityIDs[act.ID] = true
	}
	specIDs := make(map[string]bool, len(p.Specifications))
	for _, s := range p.Specifications {
		specIDs[s.ID] = true
	}

	for _, act := range p.Activities {
		if !actorIDs[act.ActorID] {
			return fmt.Errorf("%w: activity %q references unknown actor %q", ErrInvalidProject, act.ID, act.ActorID)
		}
		if !phaseIDs[act.PhaseID] {
			return fmt.Errorf("%w: activity %q references unknown phase %q", ErrInvalidProject, act.ID, act.PhaseID)
		}
		for _, specID := range act.TraceLinks {
			if !specIDs[specID] {
				return fmt.Errorf("%w: activity %q references unknown specification %q", ErrInvalidProject, act.ID, specID)
			}
		}
	}

	for _, in := range p.Interactions {
		if !activityIDs[in.FromActivityID] {
			return fmt.Errorf("%w: interaction %q references unknown activity %q", ErrInvalidProject, in.ID, in.FromActivityID)
		}
		if !activityIDs[in.ToActivityID] {
			return fmt.Errorf("%w: interaction %q references unknown activity %q", ErrInvalidProject, in.ID, in.ToActivityID)
		}
	}

	for _, s := range p.Specifications {
		if s.ParentID != "" && !specIDs[s.ParentID] {
			return fmt.Errorf("%w: specification %q references unknown parent %q", ErrInvalidProject, s.ID, s.ParentID)
		}
	}

	return nil
}
