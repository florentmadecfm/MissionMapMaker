// Package llm appelle l'API Claude pour extraire une ébauche de processus
// (acteurs, phases, activités, interactions) à partir d'une description en
// langage naturel. Le résultat est toujours une proposition : c'est à
// l'utilisateur de la relire et de l'éditer avant sauvegarde (voir
// docs/decisions-log.md, ADR-002).
package llm

// DraftProcess est la structure extraite du texte libre, référencée par nom
// (et non par ID) puisqu'elle ne connaît pas encore le projet cible : c'est
// au frontend de la fusionner avec le projet ouvert.
type DraftProcess struct {
	Actors       []DraftActor       `json:"actors"`
	Phases       []DraftPhase       `json:"phases"`
	Activities   []DraftActivity    `json:"activities"`
	Interactions []DraftInteraction `json:"interactions"`
}

type DraftActor struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
}

type DraftPhase struct {
	Name  string `json:"name"`
	Order int    `json:"order"`
}

type DraftActivity struct {
	Name        string `json:"name"`
	ActorName   string `json:"actorName"`
	PhaseName   string `json:"phaseName"`
	Description string `json:"description,omitempty"`
}

type DraftInteraction struct {
	FromActivityName string `json:"fromActivityName"`
	ToActivityName   string `json:"toActivityName"`
	Information      string `json:"information"`
}
