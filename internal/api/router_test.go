package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"pulse-missionmap/internal/api"
	"pulse-missionmap/internal/service"
	"pulse-missionmap/internal/storage"
)

// Vérifie le câblage HTTP lui-même (routage, décodage/encodage JSON,
// statuts) — jamais couvert avant ce fichier : les 8 suites de tests déjà
// présentes dans le dépôt (domain/service/storage/llm) s'arrêtent toutes
// avant ce niveau, tout le reste n'était vérifié qu'à la main (curl) ou
// via l'E2E. Pas une couverture exhaustive de chaque endpoint (l'E2E s'en
// charge à un niveau plus élevé) : juste de quoi détecter une régression
// de câblage sans dépendre du navigateur.
func newTestServer(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	repo := storage.NewRepository(dir)
	projects := service.NewProjectService(repo, storage.NewActorProfileStore(dir))
	products := service.NewProductService(storage.NewProductStore(dir))
	// generate/images nil-safe (voir Handler, router.go) : mêmes services
	// "non configurés" qu'au premier démarrage de l'app en production,
	// sans clé API (cmd/server/main.go).
	generate := service.NewGenerateService(nil, "", "", "")
	images := service.NewImageService("", "", "", "")

	router := api.NewRouter(projects, generate, images, products)
	srv := httptest.NewServer(router)
	t.Cleanup(srv.Close)
	return srv.URL
}

func TestHealth(t *testing.T) {
	base := newTestServer(t)
	res := doJSON(t, http.MethodGet, base+"/api/health", nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("statut = %d, attendu 200", res.StatusCode)
	}
	var body map[string]string
	decode(t, res, &body)
	if body["status"] != "ok" {
		t.Fatalf("status = %q, attendu \"ok\"", body["status"])
	}
}

func TestCreateGetUpdateProject(t *testing.T) {
	base := newTestServer(t)

	createRes := doJSON(t, http.MethodPost, base+"/api/projects", map[string]string{"name": "Restaurant"})
	defer createRes.Body.Close()
	if createRes.StatusCode != http.StatusCreated {
		t.Fatalf("création : statut = %d, attendu 201", createRes.StatusCode)
	}
	var created struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	decode(t, createRes, &created)
	if created.Name != "Restaurant" {
		t.Fatalf("name = %q, attendu \"Restaurant\"", created.Name)
	}

	getRes := doJSON(t, http.MethodGet, base+"/api/projects/"+created.ID, nil)
	defer getRes.Body.Close()
	if getRes.StatusCode != http.StatusOK {
		t.Fatalf("lecture : statut = %d, attendu 200", getRes.StatusCode)
	}
	var fetched map[string]any
	decode(t, getRes, &fetched)
	if fetched["id"] != created.ID {
		t.Fatalf("id relu = %v, attendu %q", fetched["id"], created.ID)
	}

	fetched["name"] = "Restaurant renommé"
	updateRes := doJSON(t, http.MethodPut, base+"/api/projects/"+created.ID, fetched)
	defer updateRes.Body.Close()
	if updateRes.StatusCode != http.StatusOK {
		t.Fatalf("mise à jour : statut = %d, attendu 200", updateRes.StatusCode)
	}
	var updated map[string]any
	decode(t, updateRes, &updated)
	if updated["name"] != "Restaurant renommé" {
		t.Fatalf("name après mise à jour = %v, attendu \"Restaurant renommé\"", updated["name"])
	}
}

func TestGetProject_NotFound(t *testing.T) {
	base := newTestServer(t)
	res := doJSON(t, http.MethodGet, base+"/api/projects/inconnu", nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("statut = %d, attendu 404", res.StatusCode)
	}
}

func TestCreateGetProduct(t *testing.T) {
	base := newTestServer(t)

	createRes := doJSON(t, http.MethodPost, base+"/api/products", map[string]string{"name": "Pulse.MissionMap"})
	defer createRes.Body.Close()
	if createRes.StatusCode != http.StatusCreated {
		t.Fatalf("création : statut = %d, attendu 201", createRes.StatusCode)
	}
	var created struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	decode(t, createRes, &created)

	getRes := doJSON(t, http.MethodGet, base+"/api/products/"+created.ID, nil)
	defer getRes.Body.Close()
	if getRes.StatusCode != http.StatusOK {
		t.Fatalf("lecture : statut = %d, attendu 200", getRes.StatusCode)
	}
	var fetched map[string]any
	decode(t, getRes, &fetched)
	if fetched["name"] != "Pulse.MissionMap" {
		t.Fatalf("name relu = %v, attendu \"Pulse.MissionMap\"", fetched["name"])
	}
}

func TestGetProduct_NotFound(t *testing.T) {
	base := newTestServer(t)
	res := doJSON(t, http.MethodGet, base+"/api/products/inconnu", nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusNotFound {
		t.Fatalf("statut = %d, attendu 404", res.StatusCode)
	}
}

// --- petites aides pour garder les tests ci-dessus lisibles ---

func doJSON(t *testing.T, method, url string, body any) *http.Response {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("encodage du corps de requête : %v", err)
		}
		reader = bytes.NewReader(b)
	} else {
		reader = bytes.NewReader(nil)
	}
	req, err := http.NewRequest(method, url, reader)
	if err != nil {
		t.Fatalf("construction de la requête : %v", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("%s %s : %v", method, url, err)
	}
	return res
}

func decode(t *testing.T, res *http.Response, v any) {
	t.Helper()
	if err := json.NewDecoder(res.Body).Decode(v); err != nil {
		t.Fatalf("décodage de la réponse : %v", err)
	}
}
