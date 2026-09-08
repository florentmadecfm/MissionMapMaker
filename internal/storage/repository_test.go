package storage

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// Un projet enregistré avant l'ajout d'un champ collection (ex.
// TestScenarios, introduit après le lancement de l'app) n'a pas cette clé
// dans son fichier JSON. Load doit tout de même renvoyer un slice vide
// (jamais nil) pour ce champ : sinon l'API le sérialiserait en `null`,
// que le frontend ne sait pas traiter comme une liste vide (il plante en
// appelant .filter/.some/.length dessus) — bug réel rencontré en usage.
func TestLoad_NormalizesMissingCollectionsFromLegacyFile(t *testing.T) {
	dir := t.TempDir()
	projectDir := filepath.Join(dir, "legacy-project")
	if err := os.MkdirAll(projectDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	// Fichier JSON minimal, tel qu'un projet créé avant l'introduction de
	// TestScenarios (et sans même specifications/interactions, pour
	// couvrir aussi ces champs) l'aurait sur disque.
	legacyJSON := `{
		"id": "legacy-project",
		"name": "Projet historique",
		"createdAt": "2026-01-01T00:00:00Z",
		"updatedAt": "2026-01-01T00:00:00Z",
		"actors": [{"id": "a1", "name": "Client", "color": "#000", "description": ""}],
		"phases": [{"id": "p1", "name": "Phase 1", "order": 1}],
		"activities": [{"id": "act1", "name": "Activité", "actorId": "a1", "phaseId": "p1", "order": 1, "description": ""}]
	}`
	if err := os.WriteFile(filepath.Join(projectDir, "project.json"), []byte(legacyJSON), 0o644); err != nil {
		t.Fatalf("write legacy file: %v", err)
	}

	repo := NewRepository(dir)
	p, err := repo.Load("legacy-project")
	if err != nil {
		t.Fatalf("Load: %v", err)
	}

	if p.TestScenarios == nil {
		t.Error("TestScenarios is nil, want empty slice")
	}
	if p.Interactions == nil {
		t.Error("Interactions is nil, want empty slice")
	}
	if p.Specifications == nil {
		t.Error("Specifications is nil, want empty slice")
	}
	if len(p.Activities) != 1 {
		t.Fatalf("expected 1 activity, got %d", len(p.Activities))
	}
	if p.Activities[0].UserStories == nil {
		t.Error("Activities[0].UserStories is nil, want empty slice")
	}
	if p.Activities[0].TraceLinks == nil {
		t.Error("Activities[0].TraceLinks is nil, want empty slice")
	}

	// Le vrai symptôme du bug : une fois re-sérialisé (comme le fait l'API
	// dans sa réponse JSON), aucun champ collection ne doit apparaître en
	// tant que `null`.
	out, err := json.Marshal(p)
	if err != nil {
		t.Fatalf("Marshal: %v", err)
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(out, &raw); err != nil {
		t.Fatalf("Unmarshal raw: %v", err)
	}
	for _, field := range []string{"testScenarios", "interactions", "specifications"} {
		if string(raw[field]) == "null" {
			t.Errorf("field %q serialized as null, want []", field)
		}
	}
}
