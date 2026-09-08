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
			"toActivityName":   stringProp,
			"information":      stringProp,
		},
		"required": []string{"fromActivityName", "toActivityName", "information"},
	}

	return ToolSpec{
		Name:        "extract_process",
		Description: "Enregistre les acteurs, phases, activités et interactions extraits de la description du processus.",
		Properties: map[string]any{
			"actors":       map[string]any{"type": "array", "items": actorSchema},
			"phases":       map[string]any{"type": "array", "items": phaseSchema},
			"activities":   map[string]any{"type": "array", "items": activitySchema},
			"interactions": map[string]any{"type": "array", "items": interactionSchema},
		},
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
