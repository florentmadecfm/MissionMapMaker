package storage

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"pulse-missionmap/internal/domain"
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

// L'historique des versions (backlog blueprint #7, ADR-070) s'appuie
// entièrement sur les sauvegardes horodatées déjà écrites par Save
// (backupExisting) : ce test vérifie que ListVersions/LoadVersion
// exposent correctement ce mécanisme déjà en place, sans rien y changer.
func TestListVersions_TracksBackupsAcrossSaves(t *testing.T) {
	repo := NewRepository(t.TempDir())

	p := &domain.Project{ID: "proj-1", Name: "V1", CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC()}
	if err := repo.Save(p); err != nil {
		t.Fatalf("Save v1: %v", err)
	}

	// La toute première sauvegarde n'a pas d'état antérieur à archiver
	// (backupExisting ne fait rien si le fichier n'existait pas encore).
	versions, err := repo.ListVersions("proj-1")
	if err != nil {
		t.Fatalf("ListVersions after first save: %v", err)
	}
	if len(versions) != 0 {
		t.Fatalf("expected no backups after the very first save, got %d", len(versions))
	}

	time.Sleep(2 * time.Millisecond) // garantit un horodatage de backup distinct
	p.Name = "V2"
	if err := repo.Save(p); err != nil {
		t.Fatalf("Save v2: %v", err)
	}

	versions, err = repo.ListVersions("proj-1")
	if err != nil {
		t.Fatalf("ListVersions after second save: %v", err)
	}
	if len(versions) != 1 {
		t.Fatalf("expected 1 backup (the pre-v2 state), got %d", len(versions))
	}

	restored, err := repo.LoadVersion("proj-1", versions[0].ID)
	if err != nil {
		t.Fatalf("LoadVersion: %v", err)
	}
	if restored.Name != "V1" {
		t.Errorf("LoadVersion returned Name %q, want %q (the state saved before the second save)", restored.Name, "V1")
	}

	time.Sleep(2 * time.Millisecond)
	p.Name = "V3"
	if err := repo.Save(p); err != nil {
		t.Fatalf("Save v3: %v", err)
	}
	versions, err = repo.ListVersions("proj-1")
	if err != nil {
		t.Fatalf("ListVersions after third save: %v", err)
	}
	if len(versions) != 2 {
		t.Fatalf("expected 2 backups, got %d", len(versions))
	}
	if versions[0].SavedAt.Before(versions[1].SavedAt) {
		t.Error("expected versions sorted most-recent-first")
	}
}

func TestListVersions_UnknownProjectReturnsEmpty(t *testing.T) {
	repo := NewRepository(t.TempDir())
	versions, err := repo.ListVersions("no-such-project")
	if err != nil {
		t.Fatalf("ListVersions: %v", err)
	}
	if len(versions) != 0 {
		t.Errorf("expected empty history for a project with no backups directory, got %d", len(versions))
	}
}

// versionID vient de l'URL (r.PathValue côté API) : un format inattendu
// (ex. tentative de traversée de chemin) doit être rejeté avant toute
// lecture disque plutôt que silencieusement résolu ailleurs que dans le
// dossier backups attendu.
func TestLoadVersion_RejectsInvalidVersionID(t *testing.T) {
	repo := NewRepository(t.TempDir())
	if _, err := repo.LoadVersion("proj-1", "../../etc/passwd"); err == nil {
		t.Error("expected an error for a version id outside the expected timestamp format, got nil")
	}
}
