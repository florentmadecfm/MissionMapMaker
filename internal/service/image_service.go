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

// ImageService encapsule la connexion de génération d'image (ADR-073/
// ADR-075) : fournisseur/clé/modèle/URL de base, indépendants de ceux
// actifs pour la génération de texte (GenerateService) — voir
// Config.ImageGeneration/ImageGenerationProvider. "mistral" est le seul
// fournisseur d'image valide aujourd'hui (validé côté API, router.go) ;
// provider reste stocké ici pour affichage (écran Paramètres) et en vue
// d'un futur second fournisseur.
type ImageService struct {
	mu       sync.RWMutex
	provider string
	apiKey   string
	model    string
	baseURL  string

	// promptImageGeneration/promptImageGenerationContext (ADR-074) : 5e
	// paire personnalisable, même patron que les 4 de GenerateService
	// (promptProcess et consorts) — surcharge le STYLE de l'illustration,
	// commun aux deux usages (portrait de persona, sketch de diagramme).
	// Réutilise PromptInfo/resolvePrompt/effectiveSystemPrompt, définis
	// dans generate_service.go (même package), pas de duplication.
	promptImageGeneration        string
	promptImageGenerationContext string
}

func NewImageService(provider, apiKey, model, baseURL string) *ImageService {
	return &ImageService{provider: provider, apiKey: apiKey, model: model, baseURL: baseURL}
}

// ImagePromptOverrides / ImagePromptSet : voir PromptOverrides/PromptSet
// (generate_service.go), même patron pour cette 5e paire.
type ImagePromptOverrides struct {
	Generation        string
	GenerationContext string
}

type ImagePromptSet struct {
	Generation        PromptInfo
	GenerationContext PromptInfo
}

// SetPrompts surcharge le style de génération d'image — une valeur vide
// revient au texte par défaut. N'affecte pas la clé API (SetAPIKey).
func (s *ImageService) SetPrompts(overrides ImagePromptOverrides) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.promptImageGeneration = overrides.Generation
	s.promptImageGenerationContext = overrides.GenerationContext
}

// Prompts renvoie l'état actuel (texte effectif + personnalisé ou non),
// pour l'écran Paramètres.
func (s *ImageService) Prompts() ImagePromptSet {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return ImagePromptSet{
		Generation:        resolvePrompt(s.promptImageGeneration, llm.DefaultImageGenerationPrompt),
		GenerationContext: resolvePrompt(s.promptImageGenerationContext, llm.DefaultImageGenerationContextPrompt),
	}
}

// styleInstruction résout le texte de style effectif (personnalisé ou par
// défaut) — passé aux deux fonctions de construction de prompt
// (PersonaPortraitPrompt/DiagramSketchPrompt, image_prompts.go).
func (s *ImageService) styleInstruction() string {
	p := s.Prompts()
	return effectiveSystemPrompt(p.GenerationContext, p.Generation)
}

func (s *ImageService) Configured() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.apiKey != ""
}

func (s *ImageService) Provider() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.provider
}

func (s *ImageService) Model() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.model
}

func (s *ImageService) BaseURL() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.baseURL
}

// SetConfig remplace la connexion de génération d'image active — mêmes
// conventions que GenerateService.SetProvider (model/baseURL vides =
// valeurs par défaut du fournisseur, résolues par le client lui-même).
func (s *ImageService) SetConfig(provider, apiKey, model, baseURL string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.provider = provider
	s.apiKey = apiKey
	s.model = model
	s.baseURL = baseURL
}

// ClearConfig retire la connexion (retour au mode manuel/désactivé).
func (s *ImageService) ClearConfig() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.provider = ""
	s.apiKey = ""
	s.model = ""
	s.baseURL = ""
}

func (s *ImageService) currentConfig() (apiKey, model, baseURL string) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.apiKey, s.model, s.baseURL
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
	apiKey, model, baseURL := s.currentConfig()
	if apiKey == "" {
		return "", llm.ErrNotConfigured
	}
	prompt := llm.PersonaPortraitPrompt(s.styleInstruction(), name, about, bio, goals, painPoints)
	ctx, cancel := context.WithTimeout(ctx, imageGenerateTimeout)
	defer cancel()
	return llm.GenerateMistralImage(ctx, apiKey, model, baseURL, prompt)
}

// GenerateDiagramSketch génère une illustration "sketch" résumant le
// diagramme de processus d'une mission.
func (s *ImageService) GenerateDiagramSketch(ctx context.Context, missionName string, actorNames, phaseNames, activityNames []string) (string, error) {
	if strings.TrimSpace(missionName) == "" && len(actorNames) == 0 && len(phaseNames) == 0 {
		return "", errEmptyDiagram
	}
	apiKey, model, baseURL := s.currentConfig()
	if apiKey == "" {
		return "", llm.ErrNotConfigured
	}
	prompt := llm.DiagramSketchPrompt(
		s.styleInstruction(),
		missionName,
		truncate(actorNames, maxSketchActors),
		truncate(phaseNames, maxSketchPhases),
		truncate(activityNames, maxSketchActivities),
	)
	ctx, cancel := context.WithTimeout(ctx, imageGenerateTimeout)
	defer cancel()
	return llm.GenerateMistralImage(ctx, apiKey, model, baseURL, prompt)
}

var errEmptyPersonaName = &validationError{"le nom du persona est vide"}
var errEmptyDiagram = &validationError{"le diagramme est vide"}
