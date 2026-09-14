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

	if err := validateCollections(p.Actors, p.Phases, p.Activities, p.Interactions, p.Specifications, p.TestScenarios); err != nil {
		return err
	}

	// La cible est une copie indépendante complète (ADR-062bis) : ses
	// propres collections doivent être référentiellement cohérentes entre
	// elles, indépendamment de celles de l'état actuel ci-dessus.
	if p.Target != nil {
		if err := validateCollections(p.Target.Actors, p.Target.Phases, p.Target.Activities, p.Target.Interactions, p.Target.Specifications, p.Target.TestScenarios); err != nil {
			return fmt.Errorf("target: %w", err)
		}
	}

	return nil
}

// validateCollections applique les mêmes règles d'intégrité référentielle
// qu'un Project (activité -> acteur/phase, interaction -> activités, lien
// de traçabilité -> spécification, parent de spécification, scénario de
// test -> spécification) à n'importe quel jeu de 6 collections — partagé
// entre l'état actuel d'un Project et sa cible (ProjectVariant), qui ont
// exactement la même forme.
func validateCollections(
	actors []Actor, phases []Phase, activities []Activity,
	interactions []Interaction, specifications []Specification, testScenarios []TestScenario,
) error {
	actorIDs := make(map[string]bool, len(actors))
	for _, a := range actors {
		actorIDs[a.ID] = true
	}
	phaseIDs := make(map[string]bool, len(phases))
	for _, ph := range phases {
		phaseIDs[ph.ID] = true
	}
	activityIDs := make(map[string]bool, len(activities))
	for _, act := range activities {
		activityIDs[act.ID] = true
	}
	specIDs := make(map[string]bool, len(specifications))
	for _, s := range specifications {
		specIDs[s.ID] = true
	}

	for _, act := range activities {
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

	for _, in := range interactions {
		if !activityIDs[in.FromActivityID] {
			return fmt.Errorf("%w: interaction %q references unknown activity %q", ErrInvalidProject, in.ID, in.FromActivityID)
		}
		if !activityIDs[in.ToActivityID] {
			return fmt.Errorf("%w: interaction %q references unknown activity %q", ErrInvalidProject, in.ID, in.ToActivityID)
		}
	}

	for _, s := range specifications {
		if s.ParentID != "" && !specIDs[s.ParentID] {
			return fmt.Errorf("%w: specification %q references unknown parent %q", ErrInvalidProject, s.ID, s.ParentID)
		}
	}

	for _, ts := range testScenarios {
		if !specIDs[ts.SpecificationID] {
			return fmt.Errorf("%w: test scenario %q references unknown specification %q", ErrInvalidProject, ts.ID, ts.SpecificationID)
		}
	}

	return nil
}
