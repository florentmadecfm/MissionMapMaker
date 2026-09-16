package service

import (
	"context"
	"strings"
	"sync"
	"time"

	"missionmapmaker/internal/llm"
)

// imageGenerateTimeout : plus généreux que generateTimeout (extraction de
// texte/JSON) — un aller-retour Agents API (appel de l'outil
// image_generation PUIS téléchargement du fichier généré, deux requêtes
// HTTP successives) est structurellement plus lent qu'un simple appel de
// function calling.
const imageGenerateTimeout = 120 * time.Second

// Limites de taille des listes envoyées dans le prompt de sketch de
// diagramme — défense en profondeur (même logique que maxActivityRefs,
// generate_service.go), et surtout un prompt utile : un modèle d'image ne
// tire aucun bénéfice à recevoir des centaines de noms d'activités, mieux
// vaut se limiter aux premiers plutôt que produire un prompt illisible qui
// dégraderait le résultat.
const (
	maxSketchActors     = 12
	maxSketchPhases     = 12
	maxSketchActivities = 40
)

// ImageService encapsule le client Mistral de génération d'image (ADR-073),
// indépendant du fournisseur/de la clé actifs pour la génération de texte
// (GenerateService) — voir Config.ImageGenerationAPIKey.
type ImageService struct {
	mu     sync.RWMutex
	apiKey string
}

func NewImageService(apiKey string) *ImageService {
	return &ImageService{apiKey: apiKey}
}

func (s *ImageService) Configured() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.apiKey != ""
}

func (s *ImageService) SetAPIKey(apiKey string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.apiKey = apiKey
}

func (s *ImageService) currentAPIKey() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.apiKey
}

func truncate(items []string, max int) []string {
	if len(items) <= max {
		return items
	}
	return items[:max]
}

// GeneratePersonaPortrait génère le portrait d'un persona à partir de sa
// fiche (About/Bio/Goals/PainPoints, voir domain.Actor).
func (s *ImageService) GeneratePersonaPortrait(ctx context.Context, name, about, bio string, goals, painPoints []string) (string, error) {
	if strings.TrimSpace(name) == "" {
		return "", errEmptyPersonaName
	}
	apiKey := s.currentAPIKey()
	if apiKey == "" {
		return "", llm.ErrNotConfigured
	}
	prompt := llm.PersonaPortraitPrompt(name, about, bio, goals, painPoints)
	ctx, cancel := context.WithTimeout(ctx, imageGenerateTimeout)
	defer cancel()
	return llm.GenerateMistralImage(ctx, apiKey, prompt)
}

// GenerateDiagramSketch génère une illustration "sketch" résumant le
// diagramme de processus d'une mission.
func (s *ImageService) GenerateDiagramSketch(ctx context.Context, missionName string, actorNames, phaseNames, activityNames []string) (string, error) {
	if strings.TrimSpace(missionName) == "" && len(actorNames) == 0 && len(phaseNames) == 0 {
		return "", errEmptyDiagram
	}
	apiKey := s.currentAPIKey()
	if apiKey == "" {
		return "", llm.ErrNotConfigured
	}
	prompt := llm.DiagramSketchPrompt(
		missionName,
		truncate(actorNames, maxSketchActors),
		truncate(phaseNames, maxSketchPhases),
		truncate(activityNames, maxSketchActivities),
	)
	ctx, cancel := context.WithTimeout(ctx, imageGenerateTimeout)
	defer cancel()
	return llm.GenerateMistralImage(ctx, apiKey, prompt)
}

var errEmptyPersonaName = &validationError{"le nom du persona est vide"}
var errEmptyDiagram = &validationError{"le diagramme est vide"}
