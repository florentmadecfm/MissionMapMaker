package llm

// ToolSpec décrit un outil (tool use Anthropic / function calling Mistral)
// de façon indépendante du fournisseur : chaque client LLM le traduit vers
// le format d'appel qui lui est propre (voir anthropic.go, mistral.go).
type ToolSpec struct {
	Name        string
	Description string
	Properties  map[string]any // schéma JSON des propriétés de l'objet racine
	Required    []string
}

func extractProcessToolSpec() ToolSpec {
	stringProp := map[string]any{"type": "string"}
	integerProp := map[string]any{"type": "integer"}

	actorSchema := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"name":        stringProp,
			"description": stringProp,
		},
		"required": []string{"name"},
	}
	phaseSchema := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"name":  stringProp,
			"order": integerProp,
			"icon":  stringProp,
		},
		"required": []string{"name", "order"},
	}
	activitySchema := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"name":        stringProp,
			"actorName":   stringProp,
			"phaseName":   stringProp,
			"description": stringProp,
		},
		"required": []string{"name", "actorName", "phaseName"},
	}
	interactionSchema := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"fromActivityName": stringProp,
			"fromActorName":    stringProp,
			"toActivityName":   stringProp,
			"toActorName":      stringProp,
			"information":      stringProp,
			"condition":        stringProp,
			"physicalEvidence": stringProp,
		},
		"required": []string{"fromActivityName", "fromActorName", "toActivityName", "toActorName", "information"},
	}
	activityChangeSchema := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"activityName":   stringProp,
			"actorName":      stringProp,
			"newName":        stringProp,
			"newDescription": stringProp,
			"newActorName":   stringProp,
			"newPhaseName":   stringProp,
		},
		"required": []string{"activityName", "actorName"},
	}

	return ToolSpec{
		Name:        "extract_process",
		Description: "Enregistre les acteurs, phases, activités et interactions extraits de la description du processus, ainsi que les modifications d'activités déjà existantes (mise à jour incrémentale d'un processus déjà présent).",
		Properties: map[string]any{
			"actors":          map[string]any{"type": "array", "items": actorSchema},
			"phases":          map[string]any{"type": "array", "items": phaseSchema},
			"activities":      map[string]any{"type": "array", "items": activitySchema},
			"interactions":    map[string]any{"type": "array", "items": interactionSchema},
			"activityChanges": map[string]any{"type": "array", "items": activityChangeSchema},
		},
		// Un appel qui ne modifie que les interactions (cas décrit dans
		// DefaultProcessPrompt) doit quand même renvoyer les 4 tableaux de
		// base, vides plutôt qu'omis : un champ omis par le modèle désérialise
		// en `nil` côté Go, qui se sérialise en `null` JSON, que le frontend
		// (`for (const x of draft.actors)`) ne peut pas itérer — voir ADR-047.
		Required: []string{"actors", "phases", "activities", "interactions"},
	}
}

func proposeSpecificationsToolSpec() ToolSpec {
	stringProp := map[string]any{"type": "string"}

	specSchema := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"activityName": stringProp,
			"actorName":    stringProp,
			"text":         stringProp,
			"rationale":    stringProp,
		},
		"required": []string{"activityName", "actorName", "text"},
	}

	return ToolSpec{
		Name:        "propose_specifications",
		Description: "Enregistre les besoins partie prenante (SSS) proposés pour chaque activité.",
		Properties: map[string]any{
			"specifications": map[string]any{"type": "array", "items": specSchema},
		},
		Required: []string{"specifications"},
	}
}

// painPointChangeTypes énumère les 5 natures de changement structurel
// qu'une solution de point de friction peut décrire (ADR-066) — contraint
// via "enum" plutôt que laissé en texte libre, pour que le frontend
// puisse fiablement choisir une icône/étiquette par type.
var painPointChangeTypes = []string{
	"add_interaction",
	"remove_interaction",
	"add_activity",
	"remove_activity",
	"merge_activities",
}

func proposePainPointSolutionsToolSpec() ToolSpec {
	stringProp := map[string]any{"type": "string"}

	solutionSchema := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"description": stringProp,
			"changeType":  map[string]any{"type": "string", "enum": painPointChangeTypes},
		},
		"required": []string{"description", "changeType"},
	}

	return ToolSpec{
		Name:        "propose_pain_point_solutions",
		Description: "Enregistre 5 propositions de solutions structurelles pour résoudre un point de friction.",
		Properties: map[string]any{
			"solutions": map[string]any{"type": "array", "items": solutionSchema},
		},
		Required: []string{"solutions"},
	}
}

// painPointDiagramChangeSchema décrit le changement structurel concret à
// appliquer au diagramme CIBLE (voir DraftPainPointDiagramChange, draft.go)
// — tous les champs optionnels, seuls ceux pertinents pour le changeType
// de la solution choisie sont attendus remplis.
func painPointDiagramChangeSchema() map[string]any {
	stringProp := map[string]any{"type": "string"}
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"newActivityName":                   stringProp,
			"newActivityActorName":              stringProp,
			"newActivityPhaseName":              stringProp,
			"newActivityDescription":            stringProp,
			"removeActivityName":                stringProp,
			"mergeActivityNames":                map[string]any{"type": "array", "items": stringProp},
			"mergedActivityName":                stringProp,
			"interactionFromActivityName":       stringProp,
			"interactionToActivityName":         stringProp,
			"interactionInformation":            stringProp,
			"removeInteractionFromActivityName": stringProp,
			"removeInteractionToActivityName":   stringProp,
		},
	}
}

func proposePainPointResolutionToolSpec() ToolSpec {
	stringProp := map[string]any{"type": "string"}

	stepSchema := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"action":         stringProp,
			"expectedResult": stringProp,
		},
		"required": []string{"action", "expectedResult"},
	}

	return ToolSpec{
		Name:        "propose_pain_point_resolution",
		Description: "Enregistre la SSS, le scénario de test et le changement structurel à appliquer au diagramme cible pour la solution choisie.",
		Properties: map[string]any{
			"specificationText":      stringProp,
			"specificationRationale": stringProp,
			"testTitle":              stringProp,
			"testPreconditions":      stringProp,
			"testSteps":              map[string]any{"type": "array", "items": stepSchema},
			"diagramChange":          painPointDiagramChangeSchema(),
		},
		Required: []string{"specificationText", "testTitle", "testSteps"},
	}
}

func proposeTestScenariosToolSpec() ToolSpec {
	stringProp := map[string]any{"type": "string"}

	stepSchema := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"action":         stringProp,
			"expectedResult": stringProp,
		},
		"required": []string{"action", "expectedResult"},
	}
	scenarioSchema := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"specificationCode": stringProp,
			"title":             stringProp,
			"preconditions":     stringProp,
			"steps":             map[string]any{"type": "array", "items": stepSchema},
		},
		"required": []string{"specificationCode", "title", "steps"},
	}

	return ToolSpec{
		Name:        "propose_test_scenarios",
		Description: "Enregistre les scénarios de test de vérification/validation proposés pour chaque spécification.",
		Properties: map[string]any{
			"scenarios": map[string]any{"type": "array", "items": scenarioSchema},
		},
		Required: []string{"scenarios"},
	}
}
