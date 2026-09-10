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
// clé API, l'URL de base et les prompts ("skills") peuvent être configurés
// après le démarrage du serveur, depuis l'écran Paramètres de l'interface
// (voir internal/api et internal/config).
type GenerateService struct {
	mu        sync.RWMutex
	generator llm.Generator // nil si aucun fournisseur n'est configuré
	provider  llm.Provider
	model     string
	baseURL   string

	// promptProcess/promptSpec/promptTestScenario ("Skills" — la méthode
	// détaillée) et promptProcessContext/promptSpecContext/
	// promptTestScenarioContext ("Prompts" — contexte et objectif de la
	// tâche) surchargent chacun un texte par défaut (llm.Default*Prompt /
	// llm.Default*ContextPrompt) — vide = texte par défaut. Le système
	// final envoyé au LLM concatène les deux (voir effectiveSystemPrompt).
	// Ni le modèle ni le fournisseur ne les mettent à zéro : contrairement
	// à la clé API, ce ne sont pas des secrets propres à une session, ils
	// restent actifs quel que soit le fournisseur choisi.
	promptProcess             string
	promptProcessContext      string
	promptSpec                string
	promptSpecContext         string
	promptTestScenario        string
	promptTestScenarioContext string
}

// PromptInfo est le texte actuellement utilisé pour un skill ou un prompt
// donné (le texte personnalisé s'il existe, sinon le texte par défaut) et
// son état "personnalisé" — pour affichage dans l'écran Paramètres.
type PromptInfo struct {
	Value      string
	Customized bool
}

func resolvePrompt(override, def string) PromptInfo {
	if override != "" {
		return PromptInfo{Value: override, Customized: true}
	}
	return PromptInfo{Value: def, Customized: false}
}

// PromptOverrides regroupe les 6 champs personnalisables passés à
// SetPrompts — un struct plutôt que 6 paramètres positionnels, pour rester
// lisible côté appelants (router.go, main.go).
type PromptOverrides struct {
	Process              string
	ProcessContext       string
	Specification        string
	SpecificationContext string
	TestScenario         string
	TestScenarioContext  string
}

// PromptSet est l'état actuel (texte effectif + personnalisé ou non) des 3
// paires prompt/skill, pour l'écran Paramètres.
type PromptSet struct {
	Process              PromptInfo
	ProcessContext       PromptInfo
	Specification        PromptInfo
	SpecificationContext PromptInfo
	TestScenario         PromptInfo
	TestScenarioContext  PromptInfo
}

// effectiveSystemPrompt concatène la couche "Prompt" (contexte + objectif)
// et la couche "Skill" (méthode) d'une même tâche : c'est ce texte, et non
// le skill seul, qui est envoyé comme message système au LLM.
func effectiveSystemPrompt(context, skill PromptInfo) string {
	return context.Value + "\n\n" + skill.Value
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

// SetPrompts surcharge le texte des 3 skills et des 3 prompts (contexte)
// de génération assistée — une valeur vide revient au texte par défaut
// correspondant. N'affecte pas le générateur actif (contrairement à
// SetProvider) : prompts et skills sont indépendants du fournisseur/de la
// clé configurés.
func (s *GenerateService) SetPrompts(overrides PromptOverrides) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.promptProcess = overrides.Process
	s.promptProcessContext = overrides.ProcessContext
	s.promptSpec = overrides.Specification
	s.promptSpecContext = overrides.SpecificationContext
	s.promptTestScenario = overrides.TestScenario
	s.promptTestScenarioContext = overrides.TestScenarioContext
}

// Prompts renvoie l'état actuel (texte effectif + personnalisé ou non) des
// 3 skills et des 3 prompts, pour l'écran Paramètres.
func (s *GenerateService) Prompts() PromptSet {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return PromptSet{
		Process:              resolvePrompt(s.promptProcess, llm.DefaultProcessPrompt),
		ProcessContext:       resolvePrompt(s.promptProcessContext, llm.DefaultProcessContextPrompt),
		Specification:        resolvePrompt(s.promptSpec, llm.DefaultSpecPrompt),
		SpecificationContext: resolvePrompt(s.promptSpecContext, llm.DefaultSpecContextPrompt),
		TestScenario:         resolvePrompt(s.promptTestScenario, llm.DefaultTestScenarioPrompt),
		TestScenarioContext:  resolvePrompt(s.promptTestScenarioContext, llm.DefaultTestScenarioContextPrompt),
	}
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
	prompts := s.Prompts()
	ctx, cancel := context.WithTimeout(ctx, generateTimeout)
	defer cancel()
	return generator.GenerateProcess(ctx, text, effectiveSystemPrompt(prompts.ProcessContext, prompts.Process))
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
	prompts := s.Prompts()
	ctx, cancel := context.WithTimeout(ctx, generateTimeout)
	defer cancel()
	return generator.GenerateSpecifications(ctx, activities, effectiveSystemPrompt(prompts.SpecificationContext, prompts.Specification))
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
	prompts := s.Prompts()
	ctx, cancel := context.WithTimeout(ctx, generateTimeout)
	defer cancel()
	return generator.GenerateTestScenarios(ctx, specifications, effectiveSystemPrompt(prompts.TestScenarioContext, prompts.TestScenario))
}

var errEmptyText = &validationError{"le texte à analyser est vide"}
var errNoActivities = &validationError{"aucune activité à traiter"}
var errNoSpecifications = &validationError{"aucune spécification à traiter"}
var errTextTooLong = &validationError{fmt.Sprintf("le texte dépasse la longueur maximale autorisée (%d caractères)", maxTextLength)}
var errTooManyActivities = &validationError{fmt.Sprintf("trop d'activités à traiter en une seule fois (maximum %d)", maxActivityRefs)}
var errTooManySpecifications = &validationError{fmt.Sprintf("trop de spécifications à traiter en une seule fois (maximum %d)", maxSpecRefs)}

type validationError struct{ msg string }

func (e *validationError) Error() string { return e.msg }
