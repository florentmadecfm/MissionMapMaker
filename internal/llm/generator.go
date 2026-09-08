package llm

import (
	"context"
	"errors"
	"fmt"
)

// Generator est le contrat commun à tous les fournisseurs LLM supportés :
// le reste de l'application (internal/service, internal/api) ne dépend
// que de cette interface, jamais d'un client de fournisseur particulier.
type Generator interface {
	GenerateProcess(ctx context.Context, text string) (*DraftProcess, error)
	GenerateSpecifications(ctx context.Context, activities []ActivityRef) ([]DraftSpecification, error)
	GenerateTestScenarios(ctx context.Context, specifications []SpecRef) ([]DraftTestScenario, error)
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
