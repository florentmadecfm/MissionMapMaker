package llm

import (
	"context"
	"errors"
	"fmt"
)

// Generator est le contrat commun à tous les fournisseurs LLM supportés :
// le reste de l'application (internal/service, internal/api) ne dépend
// que de cette interface, jamais d'un client de fournisseur particulier.
//
// systemPrompt est le texte de consigne déjà résolu par l'appelant (le
// "skill" personnalisé depuis l'écran Paramètres, ou le texte par défaut —
// voir Default*Prompt dans prompts.go et GenerateService dans
// internal/service) : un Generator reste un simple exécutant, il ne connaît
// pas la notion de personnalisation.
type Generator interface {
	GenerateProcess(ctx context.Context, text, systemPrompt string) (*DraftProcess, error)
	GenerateSpecifications(ctx context.Context, activities []ActivityRef, systemPrompt string) ([]DraftSpecification, error)
	GenerateTestScenarios(ctx context.Context, specifications []SpecRef, systemPrompt string) ([]DraftTestScenario, error)
	// GeneratePainPointSolutions/GeneratePainPointResolution (ADR-066)
	// soutiennent le flux en 2 temps résolution d'un point de friction :
	// 5 propositions de solutions structurelles, puis la SSS + le
	// scénario de test correspondant à celle choisie par l'utilisateur.
	GeneratePainPointSolutions(ctx context.Context, painPoint PainPointContext, systemPrompt string) ([]DraftPainPointSolution, error)
	GeneratePainPointResolution(ctx context.Context, painPoint PainPointContext, chosen DraftPainPointSolution, systemPrompt string) (*PainPointResolution, error)
	// GenerateVisionRefinement/GenerateKpiSuggestions (Phase 2 du plan
	// Produit/Vision/KPI) affinent le brouillon de vision produit et en
	// dérivent des suggestions de KPI — voir ProductVisionContext, draft.go.
	GenerateVisionRefinement(ctx context.Context, productContext ProductVisionContext, systemPrompt string) (*DraftVisionRefinement, error)
	GenerateKpiSuggestions(ctx context.Context, productContext ProductVisionContext, systemPrompt string) ([]DraftKpiSuggestion, error)
}

// Provider identifie un fournisseur LLM supporté. Ajouter un fournisseur
// signifie : une nouvelle constante ici, un client qui implémente
// Generator (voir anthropic.go/mistral.go pour le patron à suivre), et un
// cas dans NewGenerator.
type Provider string

const (
	ProviderAnthropic Provider = "anthropic"
	ProviderMistral   Provider = "mistral"
)

func (p Provider) Valid() bool {
	switch p {
	case ProviderAnthropic, ProviderMistral:
		return true
	default:
		return false
	}
}

// DefaultModel renvoie le modèle par défaut de ce fournisseur.
func (p Provider) DefaultModel() string {
	switch p {
	case ProviderMistral:
		return MistralDefaultModel
	default:
		return AnthropicDefaultModel
	}
}

var ErrUnknownProvider = errors.New("fournisseur LLM inconnu")

// ErrNotConfigured signale l'absence de clé API pour le fournisseur actif :
// la fonctionnalité de génération assistée reste indisponible mais le
// reste de l'application fonctionne sans elle (mode manuel de secours).
var ErrNotConfigured = errors.New("clé API non configurée")

// ErrRateLimited signale que le fournisseur actif a refusé la requête pour
// cause de limite de débit (HTTP 429) — après épuisement des nouvelles
// tentatives internes du client (mistralClient.call, ou le SDK Anthropic
// lui-même). Distinct des autres erreurs d'appel : le routeur HTTP
// (internal/api/router.go) le traduit en un statut HTTP dédié (429) plutôt
// que 502, pour que le frontend puisse afficher un message explicite
// ("réessayez dans quelques instants") au lieu du texte brut renvoyé par le
// fournisseur.
var ErrRateLimited = errors.New("limite de débit atteinte auprès du fournisseur LLM")

// GeneratorOptions regroupe les paramètres de construction d'un
// Generator. Model et BaseURL vides utilisent les valeurs par défaut du
// fournisseur.
type GeneratorOptions struct {
	APIKey  string
	Model   string
	BaseURL string
}

// NewGenerator construit le client du fournisseur demandé.
func NewGenerator(provider Provider, opts GeneratorOptions) (Generator, error) {
	model := opts.Model
	if model == "" {
		model = provider.DefaultModel()
	}
	switch provider {
	case ProviderAnthropic:
		return newAnthropicClient(opts.APIKey, model, opts.BaseURL), nil
	case ProviderMistral:
		return newMistralClient(opts.APIKey, model, opts.BaseURL), nil
	default:
		return nil, fmt.Errorf("%w: %q", ErrUnknownProvider, provider)
	}
}
