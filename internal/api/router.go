// Package api expose le service applicatif via une API REST/JSON en
// utilisant uniquement la stdlib (net/http, routage par patterns Go 1.22+).
package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"

	"pulse-missionmap/internal/config"
	"pulse-missionmap/internal/domain"
	"pulse-missionmap/internal/llm"
	"pulse-missionmap/internal/service"
	"pulse-missionmap/internal/storage"
	"pulse-missionmap/web"
)

type Handler struct {
	projects *service.ProjectService
	generate *service.GenerateService
	// images (ADR-073) : génération d'image (portrait de persona, sketch
	// de diagramme) — voir service.ImageService. Nil-safe comme generate :
	// h.images.Configured() renvoie false, les handlers concernés
	// répondent alors llm.ErrNotConfigured, jamais de panique.
	images *service.ImageService
	// products : produits (vision, différenciateurs, piliers, KPI) —
	// entité indépendante des missions, voir service.ProductService.
	products *service.ProductService
}

func NewRouter(projects *service.ProjectService, generate *service.GenerateService, images *service.ImageService, products *service.ProductService) http.Handler {
	h := &Handler{projects: projects, generate: generate, images: images, products: products}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/projects", h.listProjects)
	mux.HandleFunc("GET /api/actors", h.listActors)
	mux.HandleFunc("POST /api/projects", h.createProject)
	mux.HandleFunc("GET /api/products", h.listProducts)
	mux.HandleFunc("POST /api/products", h.createProduct)
	mux.HandleFunc("GET /api/products/{id}", h.getProduct)
	mux.HandleFunc("PUT /api/products/{id}", h.updateProduct)
	mux.HandleFunc("DELETE /api/products/{id}", h.deleteProduct)
	mux.HandleFunc("GET /api/projects/{id}", h.getProject)
	mux.HandleFunc("PUT /api/projects/{id}", h.updateProject)
	mux.HandleFunc("DELETE /api/projects/{id}", h.deleteProject)
	mux.HandleFunc("GET /api/projects/{id}/versions", h.listVersions)
	mux.HandleFunc("GET /api/projects/{id}/versions/{versionId}", h.getVersion)
	mux.HandleFunc("POST /api/projects/{id}/versions/{versionId}/restore", h.restoreVersion)
	mux.HandleFunc("POST /api/generate", h.generateProcess)
	mux.HandleFunc("POST /api/generate-specifications", h.generateSpecifications)
	mux.HandleFunc("POST /api/generate-test-scenarios", h.generateTestScenarios)
	mux.HandleFunc("POST /api/generate-painpoint-solutions", h.generatePainPointSolutions)
	mux.HandleFunc("POST /api/generate-painpoint-resolution", h.generatePainPointResolution)
	mux.HandleFunc("POST /api/generate-persona-portrait", h.generatePersonaPortrait)
	mux.HandleFunc("POST /api/generate-diagram-sketch", h.generateDiagramSketch)
	mux.HandleFunc("POST /api/generate-vision", h.generateVisionRefinement)
	mux.HandleFunc("POST /api/generate-kpi-suggestions", h.generateKpiSuggestions)
	mux.HandleFunc("GET /api/settings", h.getSettings)
	mux.HandleFunc("PUT /api/settings", h.saveSettings)
	mux.HandleFunc("DELETE /api/settings", h.deleteSettings)
	mux.HandleFunc("PUT /api/settings/image-generation", h.saveImageGenerationSettings)
	mux.HandleFunc("DELETE /api/settings/image-generation", h.deleteImageGenerationSettings)
	mux.HandleFunc("GET /api/settings/prompts", h.getPrompts)
	mux.HandleFunc("PUT /api/settings/prompts", h.savePrompts)
	mux.HandleFunc("GET /api/health", h.health)

	// Sert le frontend buildé (web/dist, embarqué dans le binaire) pour
	// tout chemin non préfixé par /api — n'a d'effet qu'une fois "npm
	// run build" exécuté (binaire packagé) ; en dev quotidien, le
	// frontend est servi séparément par "npm run dev" sur :5173.
	mux.Handle("/", http.FileServerFS(web.DistFS()))

	return withCORS(mux)
}

func (h *Handler) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) listProjects(w http.ResponseWriter, r *http.Request) {
	summaries, err := h.projects.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, summaries)
}

// listActors renvoie l'index transverse acteur -> missions (voir
// ProjectService.ListActors), consommé par le nouvel écran "Acteurs"
// (indépendant de tout projet ouvert).
func (h *Handler) listActors(w http.ResponseWriter, r *http.Request) {
	actors, err := h.projects.ListActors()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, actors)
}

func (h *Handler) createProject(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	p, err := h.projects.Create(body.Name)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusCreated, p)
}

func (h *Handler) getProject(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	p, err := h.projects.Get(id)
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			writeError(w, http.StatusNotFound, err)
			return
		}
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (h *Handler) updateProject(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	var p domain.Project
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	updated, err := h.projects.Update(id, &p)
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			writeError(w, http.StatusNotFound, err)
			return
		}
		if errors.Is(err, domain.ErrInvalidProject) {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

// listProducts renvoie tous les produits (vision, différenciateurs,
// piliers, KPI), consommé par l'écran Produits (indépendant de tout
// projet ouvert).
func (h *Handler) listProducts(w http.ResponseWriter, r *http.Request) {
	products, err := h.products.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, products)
}

func (h *Handler) createProduct(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	p, err := h.products.Create(body.Name)
	if err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	writeJSON(w, http.StatusCreated, p)
}

func (h *Handler) getProduct(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	p, err := h.products.Get(id)
	if err != nil {
		if errors.Is(err, storage.ErrProductNotFound) {
			writeError(w, http.StatusNotFound, err)
			return
		}
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (h *Handler) updateProduct(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")

	var p domain.Product
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	updated, err := h.products.Update(id, p)
	if err != nil {
		if errors.Is(err, storage.ErrProductNotFound) {
			writeError(w, http.StatusNotFound, err)
			return
		}
		if errors.Is(err, domain.ErrInvalidProduct) {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (h *Handler) deleteProduct(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.products.Delete(id); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// listVersions expose l'historique consultable des sauvegardes passées
// d'un projet (backlog blueprint #7, ADR-070), consommé par
// VersionHistoryModal.tsx.
func (h *Handler) listVersions(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	versions, err := h.projects.ListVersions(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, versions)
}

func (h *Handler) getVersion(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	versionID := r.PathValue("versionId")
	p, err := h.projects.GetVersion(id, versionID)
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			writeError(w, http.StatusNotFound, err)
			return
		}
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (h *Handler) restoreVersion(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	versionID := r.PathValue("versionId")
	p, err := h.projects.RestoreVersion(id, versionID)
	if err != nil {
		if errors.Is(err, storage.ErrNotFound) {
			writeError(w, http.StatusNotFound, err)
			return
		}
		if errors.Is(err, domain.ErrInvalidProject) {
			writeError(w, http.StatusBadRequest, err)
			return
		}
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (h *Handler) generateProcess(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	draft, err := h.generate.Generate(r.Context(), body.Text)
	if err != nil {
		writeGenerateError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, draft)
}

func (h *Handler) generateSpecifications(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Activities []llm.ActivityRef `json:"activities"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	drafts, err := h.generate.GenerateSpecifications(r.Context(), body.Activities)
	if err != nil {
		writeGenerateError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, drafts)
}

func (h *Handler) generateTestScenarios(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Specifications []llm.SpecRef `json:"specifications"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	drafts, err := h.generate.GenerateTestScenarios(r.Context(), body.Specifications)
	if err != nil {
		writeGenerateError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, drafts)
}

// generatePainPointSolutions (ADR-066) : 1re étape du flux de résolution
// d'un point de friction — 5 propositions de solutions structurelles.
func (h *Handler) generatePainPointSolutions(w http.ResponseWriter, r *http.Request) {
	var body llm.PainPointContext
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	solutions, err := h.generate.GeneratePainPointSolutions(r.Context(), body)
	if err != nil {
		writeGenerateError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, solutions)
}

// generatePainPointResolution (ADR-066) : 2e étape — une fois une solution
// choisie côté frontend, génère la SSS + le scénario de test correspondant.
func (h *Handler) generatePainPointResolution(w http.ResponseWriter, r *http.Request) {
	var body struct {
		llm.PainPointContext
		ChosenSolution llm.DraftPainPointSolution `json:"chosenSolution"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	resolution, err := h.generate.GeneratePainPointResolution(r.Context(), body.PainPointContext, body.ChosenSolution)
	if err != nil {
		writeGenerateError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, resolution)
}

// generatePersonaPortrait (ADR-073) génère le portrait d'un persona à
// partir de sa fiche (About/Bio/Goals/PainPoints) — jamais persisté ici :
// c'est au frontend d'enregistrer l'image renvoyée sur l'acteur concerné
// (PUT /api/projects/{id}, comme tout autre champ de la fiche persona).
func (h *Handler) generatePersonaPortrait(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name       string   `json:"name"`
		About      string   `json:"about"`
		Bio        string   `json:"bio"`
		Goals      []string `json:"goals"`
		PainPoints []string `json:"painPoints"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	imageDataURL, err := h.images.GeneratePersonaPortrait(r.Context(), body.Name, body.About, body.Bio, body.Goals, body.PainPoints)
	if err != nil {
		writeGenerateError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"imageDataUrl": imageDataURL})
}

// generateDiagramSketch (ADR-073) génère une illustration "sketch"
// résumant le diagramme de processus d'une mission — jamais persisté,
// simplement renvoyé pour téléchargement immédiat côté frontend (comme
// l'export PNG technique existant, voir pngExport.ts).
func (h *Handler) generateDiagramSketch(w http.ResponseWriter, r *http.Request) {
	var body struct {
		MissionName   string   `json:"missionName"`
		ActorNames    []string `json:"actorNames"`
		PhaseNames    []string `json:"phaseNames"`
		ActivityNames []string `json:"activityNames"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	imageDataURL, err := h.images.GenerateDiagramSketch(r.Context(), body.MissionName, body.ActorNames, body.PhaseNames, body.ActivityNames)
	if err != nil {
		writeGenerateError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"imageDataUrl": imageDataURL})
}

// generateVisionRefinement (Phase 2 du plan Produit/Vision/KPI) affine le
// brouillon de vision produit (vision, différenciateurs, piliers) —
// renvoyé tel quel au frontend, jamais persisté ici : à l'utilisateur de
// relire et d'appliquer (VisionRefinementModal.tsx) avant "Enregistrer".
func (h *Handler) generateVisionRefinement(w http.ResponseWriter, r *http.Request) {
	var body llm.ProductVisionContext
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	draft, err := h.generate.GenerateVisionRefinement(r.Context(), body)
	if err != nil {
		writeGenerateError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, draft)
}

// generateKpiSuggestions (Phase 2 du plan Produit/Vision/KPI) propose des
// KPI à partir de la vision/des piliers déjà définis.
func (h *Handler) generateKpiSuggestions(w http.ResponseWriter, r *http.Request) {
	var body llm.ProductVisionContext
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	suggestions, err := h.generate.GenerateKpiSuggestions(r.Context(), body)
	if err != nil {
		writeGenerateError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, suggestions)
}

func (h *Handler) getSettings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"configured":                h.generate.Configured(),
		"provider":                  string(h.generate.Provider()),
		"model":                     h.generate.Model(),
		"baseUrl":                   h.generate.BaseURL(),
		"imageGenerationConfigured": h.images.Configured(),
		"imageGenerationProvider":   h.images.Provider(),
		"imageGenerationModel":      h.images.Model(),
		"imageGenerationBaseUrl":    h.images.BaseURL(),
	})
}

// saveSettings enregistre le fournisseur, la clé API et l'URL de base
// saisis dans l'interface : effet immédiat (générateur en mémoire) et
// persistance dans le fichier de configuration local pour les prochains
// démarrages. La clé n'est jamais renvoyée dans une réponse HTTP,
// seulement son statut. Le réglage de l'autre fournisseur (non actif) est
// préservé. baseUrl n'est pas un secret (contrairement à apiKey) : elle
// est donc renvoyée telle quelle par getSettings.
func (h *Handler) saveSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Provider string `json:"provider"`
		APIKey   string `json:"apiKey"`
		Model    string `json:"model"`
		BaseURL  string `json:"baseUrl"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if strings.TrimSpace(body.APIKey) == "" {
		writeError(w, http.StatusBadRequest, errors.New("la clé API ne peut pas être vide"))
		return
	}

	provider := llm.Provider(body.Provider)
	if !provider.Valid() {
		writeError(w, http.StatusBadRequest, fmt.Errorf("%w : %q", llm.ErrUnknownProvider, body.Provider))
		return
	}

	if err := h.generate.SetProvider(provider, body.APIKey, body.Model, body.BaseURL); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	cfg, err := config.Load()
	if err != nil {
		log.Printf("lecture de la configuration existante : %v", err)
		cfg = &config.Config{}
	}
	cfg.Provider = string(provider)
	settings := config.ProviderSettings{APIKey: body.APIKey, Model: body.Model, BaseURL: body.BaseURL}
	switch provider {
	case llm.ProviderAnthropic:
		cfg.Anthropic = settings
	case llm.ProviderMistral:
		cfg.Mistral = settings
	}
	if err := config.Save(cfg); err != nil {
		log.Printf("sauvegarde de la configuration : %v", err)
		// la clé reste active en mémoire pour cette session même si l'écriture échoue
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"configured":                true,
		"provider":                  string(provider),
		"model":                     h.generate.Model(),
		"baseUrl":                   h.generate.BaseURL(),
		"imageGenerationConfigured": h.images.Configured(),
		"imageGenerationProvider":   h.images.Provider(),
		"imageGenerationModel":      h.images.Model(),
		"imageGenerationBaseUrl":    h.images.BaseURL(),
	})
}

// deleteSettings retire la clé du fournisseur actuellement actif (le
// réglage de l'autre fournisseur, s'il existe, n'est pas touché).
func (h *Handler) deleteSettings(w http.ResponseWriter, r *http.Request) {
	provider := h.generate.Provider()
	h.generate.ClearProvider()

	cfg, err := config.Load()
	if err != nil {
		cfg = &config.Config{}
	}
	switch provider {
	case llm.ProviderAnthropic:
		cfg.Anthropic = config.ProviderSettings{}
	case llm.ProviderMistral:
		cfg.Mistral = config.ProviderSettings{}
	}
	cfg.Provider = ""
	if err := config.Save(cfg); err != nil {
		log.Printf("suppression de la configuration : %v", err)
	}
	w.WriteHeader(http.StatusNoContent)
}

// saveImageGenerationSettings (ADR-073/ADR-075) enregistre la connexion
// dédiée à la génération d'image (fournisseur/clé/modèle/URL de base) —
// indépendante de celle utilisée pour la génération de texte (saveSettings
// ci-dessus) : voir Config.ImageGenerationProvider/ImageGeneration. Seul
// "mistral" est un fournisseur d'image valide aujourd'hui.
func (h *Handler) saveImageGenerationSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Provider string `json:"provider"`
		APIKey   string `json:"apiKey"`
		Model    string `json:"model"`
		BaseURL  string `json:"baseUrl"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}
	if strings.TrimSpace(body.APIKey) == "" {
		writeError(w, http.StatusBadRequest, errors.New("la clé API ne peut pas être vide"))
		return
	}
	if body.Provider != "mistral" {
		writeError(w, http.StatusBadRequest, fmt.Errorf("%w : %q", llm.ErrUnknownProvider, body.Provider))
		return
	}

	h.images.SetConfig(body.Provider, body.APIKey, body.Model, body.BaseURL)

	cfg, err := config.Load()
	if err != nil {
		log.Printf("lecture de la configuration existante : %v", err)
		cfg = &config.Config{}
	}
	cfg.ImageGenerationProvider = body.Provider
	cfg.ImageGeneration = config.ProviderSettings{APIKey: body.APIKey, Model: body.Model, BaseURL: body.BaseURL}
	if err := config.Save(cfg); err != nil {
		log.Printf("sauvegarde de la configuration : %v", err)
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"imageGenerationConfigured": true,
		"imageGenerationProvider":   h.images.Provider(),
		"imageGenerationModel":      h.images.Model(),
		"imageGenerationBaseUrl":    h.images.BaseURL(),
	})
}

// deleteImageGenerationSettings retire la connexion de génération d'image.
func (h *Handler) deleteImageGenerationSettings(w http.ResponseWriter, r *http.Request) {
	h.images.ClearConfig()

	cfg, err := config.Load()
	if err != nil {
		cfg = &config.Config{}
	}
	cfg.ImageGenerationProvider = ""
	cfg.ImageGeneration = config.ProviderSettings{}
	if err := config.Save(cfg); err != nil {
		log.Printf("suppression de la configuration : %v", err)
	}
	w.WriteHeader(http.StatusNoContent)
}

// getPrompts renvoie l'état actuel des 5 skills et des 5 prompts (contexte)
// de génération assistée (texte effectif — personnalisé ou par défaut — et
// indicateur "personnalisé"), ainsi que le texte par défaut de chacun pour
// permettre une réinitialisation côté interface.
func (h *Handler) getPrompts(w http.ResponseWriter, r *http.Request) {
	writePromptsResponse(w, h.generate, h.images)
}

// savePrompts enregistre le texte des 5 skills et des 5 prompts (les 10
// sont toujours envoyés ensemble par l'écran Paramètres, qui les charge
// tous au montage) : effet immédiat (GenerateService/ImageService en
// mémoire) et persistance locale. Un champ vide (ou dont le contenu, une
// fois retiré des espaces, est vide, ou égal au texte par défaut) revient
// au texte par défaut correspondant — c'est ainsi que l'écran Paramètres
// implémente "Réinitialiser".
func (h *Handler) savePrompts(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Process                   string `json:"process"`
		ProcessContext            string `json:"processContext"`
		Specification             string `json:"specification"`
		SpecificationContext      string `json:"specificationContext"`
		TestScenario              string `json:"testScenario"`
		TestScenarioContext       string `json:"testScenarioContext"`
		PainPointSolutions        string `json:"painPointSolutions"`
		PainPointSolutionsContext string `json:"painPointSolutionsContext"`
		ImageGeneration           string `json:"imageGeneration"`
		ImageGenerationContext    string `json:"imageGenerationContext"`
		VisionRefinement          string `json:"visionRefinement"`
		VisionRefinementContext   string `json:"visionRefinementContext"`
		KpiSuggestions            string `json:"kpiSuggestions"`
		KpiSuggestionsContext     string `json:"kpiSuggestionsContext"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, err)
		return
	}

	overrides := service.PromptOverrides{
		Process:                   normalizePromptOverride(body.Process, llm.DefaultProcessPrompt),
		ProcessContext:            normalizePromptOverride(body.ProcessContext, llm.DefaultProcessContextPrompt),
		Specification:             normalizePromptOverride(body.Specification, llm.DefaultSpecPrompt),
		SpecificationContext:      normalizePromptOverride(body.SpecificationContext, llm.DefaultSpecContextPrompt),
		TestScenario:              normalizePromptOverride(body.TestScenario, llm.DefaultTestScenarioPrompt),
		TestScenarioContext:       normalizePromptOverride(body.TestScenarioContext, llm.DefaultTestScenarioContextPrompt),
		PainPointSolutions:        normalizePromptOverride(body.PainPointSolutions, llm.DefaultPainPointSolutionsPrompt),
		PainPointSolutionsContext: normalizePromptOverride(body.PainPointSolutionsContext, llm.DefaultPainPointSolutionsContextPrompt),
		VisionRefinement:          normalizePromptOverride(body.VisionRefinement, llm.DefaultVisionRefinementPrompt),
		VisionRefinementContext:   normalizePromptOverride(body.VisionRefinementContext, llm.DefaultVisionRefinementContextPrompt),
		KpiSuggestions:            normalizePromptOverride(body.KpiSuggestions, llm.DefaultKpiSuggestionsPrompt),
		KpiSuggestionsContext:     normalizePromptOverride(body.KpiSuggestionsContext, llm.DefaultKpiSuggestionsContextPrompt),
	}
	h.generate.SetPrompts(overrides)

	imageOverrides := service.ImagePromptOverrides{
		Generation:        normalizePromptOverride(body.ImageGeneration, llm.DefaultImageGenerationPrompt),
		GenerationContext: normalizePromptOverride(body.ImageGenerationContext, llm.DefaultImageGenerationContextPrompt),
	}
	h.images.SetPrompts(imageOverrides)

	cfg, err := config.Load()
	if err != nil {
		log.Printf("lecture de la configuration existante : %v", err)
		cfg = &config.Config{}
	}
	cfg.Prompts = config.PromptSettings{
		Process:                   overrides.Process,
		ProcessContext:            overrides.ProcessContext,
		Specification:             overrides.Specification,
		SpecificationContext:      overrides.SpecificationContext,
		TestScenario:              overrides.TestScenario,
		TestScenarioContext:       overrides.TestScenarioContext,
		PainPointSolutions:        overrides.PainPointSolutions,
		PainPointSolutionsContext: overrides.PainPointSolutionsContext,
		ImageGeneration:           imageOverrides.Generation,
		ImageGenerationContext:    imageOverrides.GenerationContext,
		VisionRefinement:          overrides.VisionRefinement,
		VisionRefinementContext:   overrides.VisionRefinementContext,
		KpiSuggestions:            overrides.KpiSuggestions,
		KpiSuggestionsContext:     overrides.KpiSuggestionsContext,
	}
	if err := config.Save(cfg); err != nil {
		log.Printf("sauvegarde de la configuration : %v", err)
		// les prompts restent actifs en mémoire pour cette session même si l'écriture échoue
	}

	writePromptsResponse(w, h.generate, h.images)
}

func normalizePromptOverride(value, def string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == def {
		return ""
	}
	return trimmed
}

func writePromptsResponse(w http.ResponseWriter, generate *service.GenerateService, images *service.ImageService) {
	p := generate.Prompts()
	ip := images.Prompts()
	writeJSON(w, http.StatusOK, map[string]any{
		"process":                   p.Process.Value,
		"processContext":            p.ProcessContext.Value,
		"specification":             p.Specification.Value,
		"specificationContext":      p.SpecificationContext.Value,
		"testScenario":              p.TestScenario.Value,
		"testScenarioContext":       p.TestScenarioContext.Value,
		"painPointSolutions":        p.PainPointSolutions.Value,
		"painPointSolutionsContext": p.PainPointSolutionsContext.Value,
		"imageGeneration":           ip.Generation.Value,
		"imageGenerationContext":    ip.GenerationContext.Value,
		"visionRefinement":          p.VisionRefinement.Value,
		"visionRefinementContext":   p.VisionRefinementContext.Value,
		"kpiSuggestions":            p.KpiSuggestions.Value,
		"kpiSuggestionsContext":     p.KpiSuggestionsContext.Value,
		"customized": map[string]bool{
			"process":                   p.Process.Customized,
			"processContext":            p.ProcessContext.Customized,
			"specification":             p.Specification.Customized,
			"specificationContext":      p.SpecificationContext.Customized,
			"testScenario":              p.TestScenario.Customized,
			"testScenarioContext":       p.TestScenarioContext.Customized,
			"painPointSolutions":        p.PainPointSolutions.Customized,
			"painPointSolutionsContext": p.PainPointSolutionsContext.Customized,
			"imageGeneration":           ip.Generation.Customized,
			"imageGenerationContext":    ip.GenerationContext.Customized,
			"visionRefinement":          p.VisionRefinement.Customized,
			"visionRefinementContext":   p.VisionRefinementContext.Customized,
			"kpiSuggestions":            p.KpiSuggestions.Customized,
			"kpiSuggestionsContext":     p.KpiSuggestionsContext.Customized,
		},
		"defaults": map[string]string{
			"process":                   llm.DefaultProcessPrompt,
			"processContext":            llm.DefaultProcessContextPrompt,
			"specification":             llm.DefaultSpecPrompt,
			"specificationContext":      llm.DefaultSpecContextPrompt,
			"testScenario":              llm.DefaultTestScenarioPrompt,
			"testScenarioContext":       llm.DefaultTestScenarioContextPrompt,
			"painPointSolutions":        llm.DefaultPainPointSolutionsPrompt,
			"painPointSolutionsContext": llm.DefaultPainPointSolutionsContextPrompt,
			"imageGeneration":           llm.DefaultImageGenerationPrompt,
			"imageGenerationContext":    llm.DefaultImageGenerationContextPrompt,
			"visionRefinement":          llm.DefaultVisionRefinementPrompt,
			"visionRefinementContext":   llm.DefaultVisionRefinementContextPrompt,
			"kpiSuggestions":            llm.DefaultKpiSuggestionsPrompt,
			"kpiSuggestionsContext":     llm.DefaultKpiSuggestionsContextPrompt,
		},
	})
}

func (h *Handler) deleteProject(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if err := h.projects.Delete(id); err != nil {
		writeError(w, http.StatusInternalServerError, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("encoding response: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, err error) {
	writeJSON(w, status, map[string]string{"error": err.Error()})
}

// writeGenerateError traduit une erreur renvoyée par GenerateService (tous
// les handlers "generate*") en statut HTTP — factorisé ici plutôt que
// répété dans chacun des 7 handlers : llm.ErrNotConfigured (aucune clé
// API) -> 503, llm.ErrRateLimited (429 persistant chez le fournisseur,
// Mistral ou Claude, après épuisement des nouvelles tentatives internes,
// voir internal/llm) -> 429, pour que le frontend puisse distinguer ce cas
// et afficher un message explicite plutôt que le texte brut du
// fournisseur ; toute autre erreur d'appel -> 502 (échec en amont).
func writeGenerateError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, llm.ErrNotConfigured):
		writeError(w, http.StatusServiceUnavailable, err)
	case errors.Is(err, llm.ErrRateLimited):
		writeError(w, http.StatusTooManyRequests, err)
	default:
		writeError(w, http.StatusBadGateway, err)
	}
}

// withCORS autorise le frontend Vite (localhost:5173) à appeler l'API en
// dev. En usage packagé (binaire unique servant l'UI), ce n'est plus
// nécessaire mais reste inoffensif en local.
func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
