package service

import (
	"context"
	"strings"
	"sync"

	"missionmapmaker/internal/llm"
)

// GenerateService encapsule le client LLM utilisé pour la génération
// assistée. Le client est mutable (protégé par un mutex) car la clé API
// peut être configurée après le démarrage du serveur, depuis l'écran
// Paramètres de l'interface (voir internal/api et internal/config).
type GenerateService struct {
	mu     sync.RWMutex
	client *llm.Client // nil si aucune clé API n'est configurée
	model  string
}

func NewGenerateService(client *llm.Client, model string) *GenerateService {
	if model == "" {
		model = llm.DefaultModel
	}
	return &GenerateService{client: client, model: model}
}

// Configured indique si une clé API est actuellement active.
func (s *GenerateService) Configured() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.client != nil
}

func (s *GenerateService) Model() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.model
}

// SetAPIKey remplace le client actif par un nouveau, construit avec la clé
// fournie. model="" conserve le modèle par défaut.
func (s *GenerateService) SetAPIKey(apiKey, model string) {
	if model == "" {
		model = llm.DefaultModel
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	s.client = llm.NewClientWithKey(apiKey, model)
	s.model = model
}

// ClearAPIKey désactive la génération assistée (retour au mode manuel).
func (s *GenerateService) ClearAPIKey() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.client = nil
}

func (s *GenerateService) currentClient() *llm.Client {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.client
}

func (s *GenerateService) Generate(ctx context.Context, text string) (*llm.DraftProcess, error) {
	if strings.TrimSpace(text) == "" {
		return nil, errEmptyText
	}
	client := s.currentClient()
	if client == nil {
		return nil, llm.ErrNotConfigured
	}
	return client.GenerateProcess(ctx, text)
}

func (s *GenerateService) GenerateSpecifications(ctx context.Context, activities []llm.ActivityRef) ([]llm.DraftSpecification, error) {
	if len(activities) == 0 {
		return nil, errNoActivities
	}
	client := s.currentClient()
	if client == nil {
		return nil, llm.ErrNotConfigured
	}
	return client.GenerateSpecifications(ctx, activities)
}

var errEmptyText = &validationError{"le texte à analyser est vide"}
var errNoActivities = &validationError{"aucune activité à traiter"}

type validationError struct{ msg string }

func (e *validationError) Error() string { return e.msg }
