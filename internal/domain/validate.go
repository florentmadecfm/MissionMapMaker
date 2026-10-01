package domain

import (
	"errors"
	"fmt"
)

var ErrInvalidProject = errors.New("invalid project")

// Validate checks referential integrity between a project's collections
// (an activity must reference an existing actor/phase, an interaction must
// reference existing activities). It does not mutate the project.
func (p *Project) Validate() error {
	if p.Name == "" {
		return fmt.Errorf("%w: name is required", ErrInvalidProject)
	}

	if err := validateCollections(p.Actors, p.Phases, p.Activities, p.Interactions); err != nil {
		return err
	}

	// La cible est une copie indépendante complète (ADR-062bis) : ses
	// propres collections doivent être référentiellement cohérentes entre
	// elles, indépendamment de celles de l'état actuel ci-dessus.
	if p.Target != nil {
		if err := validateCollections(p.Target.Actors, p.Target.Phases, p.Target.Activities, p.Target.Interactions); err != nil {
			return fmt.Errorf("target: %w", err)
		}
	}

	return nil
}

// validateCollections applique les mêmes règles d'intégrité référentielle
// qu'un Project (activité -> acteur/phase, interaction -> activités) à
// n'importe quel jeu de 4 collections — partagé entre l'état actuel d'un
// Project et sa cible (ProjectVariant), qui ont exactement la même forme.
// Activity.TraceLinks n'est PLUS validé ici (référence un Product.
// Specification, structurellement inatteignable depuis ce package — même
// raisonnement que KpiLinks, voir le commentaire sur TraceLinks dans
// project.go) ; la cohérence des spécifications/tests eux-mêmes est
// désormais vérifiée par Product.Validate() (product.go).
func validateCollections(actors []Actor, phases []Phase, activities []Activity, interactions []Interaction) error {
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

	for _, act := range activities {
		if !actorIDs[act.ActorID] {
			return fmt.Errorf("%w: activity %q references unknown actor %q", ErrInvalidProject, act.ID, act.ActorID)
		}
		if !phaseIDs[act.PhaseID] {
			return fmt.Errorf("%w: activity %q references unknown phase %q", ErrInvalidProject, act.ID, act.PhaseID)
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

	return nil
}
