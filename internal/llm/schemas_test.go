package llm

import "testing"

// Vérifie que les 4 tableaux racine toujours sérialisés par DraftProcess
// (Actors/Phases/Activities/Interactions, sans omitempty côté Go) sont
// aussi déclarés "required" dans le schéma envoyé au LLM — sans quoi un
// modèle peut légitimement omettre l'un d'eux, ce qui désérialise en nil
// puis en JSON "null" (voir DraftProcess.normalize, ADR-047).
func TestExtractProcessToolSpec_RequiresBaseArrays(t *testing.T) {
	spec := extractProcessToolSpec()
	want := []string{"actors", "phases", "activities", "interactions"}
	for _, field := range want {
		found := false
		for _, r := range spec.Required {
			if r == field {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("extractProcessToolSpec().Required ne contient pas %q (got %v)", field, spec.Required)
		}
	}
}

// toAnthropicTool a longtemps ignoré spec.Required (seul toMistralTool le
// transmettait) : le schéma envoyé à Claude ne rendait donc jamais aucun
// champ racine obligatoire, y compris "specifications"/"scenarios" déclarés
// requis par proposeSpecificationsToolSpec/proposeTestScenariosToolSpec.
func TestToAnthropicTool_ForwardsRequired(t *testing.T) {
	spec := ToolSpec{Name: "t", Required: []string{"foo", "bar"}}
	tool := toAnthropicTool(spec)
	if tool.OfTool == nil {
		t.Fatal("expected OfTool to be set")
	}
	got := tool.OfTool.InputSchema.Required
	if len(got) != 2 || got[0] != "foo" || got[1] != "bar" {
		t.Errorf("InputSchema.Required = %v, want [foo bar]", got)
	}
}
