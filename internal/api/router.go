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

	"missionmapmaker/internal/config"
	"missionmapmaker/internal/domain"
	"missionmapmaker/internal/llm"
	"missionmapmaker/internal/service"
	"missionmapmaker/internal/storage"
)

type Handler struct {
	projects *service.ProjectService
	generate *service.GenerateService
}

func NewRouter(projects *service.ProjectService, generate *service.GenerateService) http.Handler {
	h := &Handler{projects: projects, generate: generate}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/projects", h.listProjects)
	mux.HandleFunc("POST /api/projects", h.createProject)
	mux.HandleFunc("GET /api/projects/{id}", h.getProject)
	mux.HandleFunc("PUT /api/projects/{id}", h.updateProject)
	mux.HandleFunc("DELETE /api/projects/{id}", h.deleteProject)
	mux.HandleFunc("POST /api/generate", h.generateProcess)
	mux.HandleFunc("POST /api/generate-specifications", h.generateSpecifications)
	mux.HandleFunc("GET /api/settings", h.getSettings)
	mux.HandleFunc("PUT /api/settings", h.saveSettings)
	mux.HandleFunc("DELETE /api/settings", h.deleteSettings)
	mux.HandleFunc("GET /api/health", h.health)

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
		if errors.Is(err, llm.ErrNotConfigured) {
			writeError(w, http.StatusServiceUnavailable, err)
			return
		}
		writeError(w, http.StatusBadGateway, err)
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
		if errors.Is(err, llm.ErrNotConfigured) {
			writeError(w, http.StatusServiceUnavailable, err)
			return
		}
		writeError(w, http.StatusBadGateway, err)
		return
	}
	writeJSON(w, http.StatusOK, drafts)
}

func (h *Handler) getSettings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"configured": h.generate.Configured(),
		"provider":   string(h.generate.Provider()),
		"model":      h.generate.Model(),
		"baseUrl":    h.generate.BaseURL(),
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
		"configured": true,
		"provider":   string(provider),
		"model":      h.generate.Model(),
		"baseUrl":    h.generate.BaseURL(),
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
