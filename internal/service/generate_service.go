package service

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"missionmapmaker/internal/llm"
)

// generateTimeout borne la durée totale d'un appel de génération (y compris
// les tentatives de retry du client LLM sous-jacent), indépendamment du
// fournisseur actif. Sans cette limite, une boucle de retry (ex. Mistral :
// jusqu'à 4 tentatives) combinée à un timeout HTTP client de 60s par
// tentative pourrait bloquer la requête plusieurs minutes.
const generateTimeout = 90 * time.Second

// Limites de taille des entrées envoyées au LLM : défense en profondeur pour
// éviter d'envoyer par erreur (ou par abus) une requête disproportionnée à
// un fournisseur externe, ce qui coûte du temps, des tokens et augmente le
// risque de nouvelles limites de débit (cf. incident 429 Mistral).
const (
	maxTextLength   = 20000
	maxActivityRefs = 300
	maxSpecRefs     = 300
)

// GenerateService encapsule le générateur LLM utilisé pour la génération
// assistée. Il est mutable (protégé par un mutex) car le fournisseur, la
// clé API et l'URL de base peuvent être configurés après le démarrage du
// serveur, depuis l'écran Paramètres de l'interface (voir internal/api et
// internal/config).
type GenerateService struct {
	mu        sync.RWMutex
	generator llm.Generator // nil si aucun fournisseur n'est configuré
	provider  llm.Provider
	model     string
	baseURL   string
}

func NewGenerateService(generator llm.Generator, provider llm.Provider, model, baseURL string) *GenerateService {
	return &GenerateService{generator: generator, provider: provider, model: model, baseURL: baseURL}
}

// Configured indique si un fournisseur est actuellement actif.
func (s *GenerateService) Configured() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.generator != nil
}

func (s *GenerateService) Provider() llm.Provider {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.provider
}

func (s *GenerateService) Model() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.model
}

func (s *GenerateService) BaseURL() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.baseURL
}

// SetProvider remplace le générateur actif par un nouveau, construit pour
// le fournisseur, la clé et l'URL de base fournis. model="" utilise le
// modèle par défaut du fournisseur ; baseURL="" utilise l'URL par défaut.
func (s *GenerateService) SetProvider(provider llm.Provider, apiKey, model, baseURL string) error {
	generator, err := llm.NewGenerator(provider, llm.GeneratorOptions{APIKey: apiKey, Model: model, BaseURL: baseURL})
	if err != nil {
		return err
	}
	if model == "" {
		model = provider.DefaultModel()
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.generator = generator
	s.provider = provider
	s.model = model
	s.baseURL = baseURL
	return nil
}

// ClearProvider désactive la génération assistée (retour au mode manuel).
func (s *GenerateService) ClearProvider() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.generator = nil
	s.baseURL = ""
}

func (s *GenerateService) currentGenerator() llm.Generator {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.generator
}

func (s *GenerateService) Generate(ctx context.Context, text string) (*llm.DraftProcess, error) {
	if strings.TrimSpace(text) == "" {
		return nil, errEmptyText
	}
	if len(text) > maxTextLength {
		return nil, errTextTooLong
	}
	generator := s.currentGenerator()
	if generator == nil {
		return nil, llm.ErrNotConfigured
	}
	ctx, cancel := context.WithTimeout(ctx, generateTimeout)
	defer cancel()
	return generator.GenerateProcess(ctx, text)
}

func (s *GenerateService) GenerateSpecifications(ctx context.Context, activities []llm.ActivityRef) ([]llm.DraftSpecification, error) {
	if len(activities) == 0 {
		return nil, errNoActivities
	}
	if len(activities) > maxActivityRefs {
		return nil, errTooManyActivities
	}
	generator := s.currentGenerator()
	if generator == nil {
		return nil, llm.ErrNotConfigured
	}
	ctx, cancel := context.WithTimeout(ctx, generateTimeout)
	defer cancel()
	return generator.GenerateSpecifications(ctx, activities)
}

func (s *GenerateService) GenerateTestScenarios(ctx context.Context, specifications []llm.SpecRef) ([]llm.DraftTestScenario, error) {
	if len(specifications) == 0 {
		return nil, errNoSpecifications
	}
	if len(specifications) > maxSpecRefs {
		return nil, errTooManySpecifications
	}
	generator := s.currentGenerator()
	if generator == nil {
		return nil, llm.ErrNotConfigured
	}
	ctx, cancel := context.WithTimeout(ctx, generateTimeout)
	defer cancel()
	return generator.GenerateTestScenarios(ctx, specifications)
}

var errEmptyText = &validationError{"le texte à analyser est vide"}
var errNoActivities = &validationError{"aucune activité à traiter"}
var errNoSpecifications = &validationError{"aucune spécification à traiter"}
var errTextTooLong = &validationError{fmt.Sprintf("le texte dépasse la longueur maximale autorisée (%d caractères)", maxTextLength)}
var errTooManyActivities = &validationError{fmt.Sprintf("trop d'activités à traiter en une seule fois (maximum %d)", maxActivityRefs)}
var errTooManySpecifications = &validationError{fmt.Sprintf("trop de spécifications à traiter en une seule fois (maximum %d)", maxSpecRefs)}

type validationError struct{ msg string }

func (e *validationError) Error() string { return e.msg }
