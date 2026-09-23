package llm

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
)

const AnthropicDefaultModel = "claude-opus-5"

type anthropicClient struct {
	api   anthropic.Client
	model string
}

// newAnthropicClient construit le client. baseURL="" utilise l'URL par
// défaut du SDK (api.anthropic.com) ; une valeur permet de pointer vers un
// proxy, un déploiement régional/entreprise, etc.
func newAnthropicClient(apiKey, model, baseURL string) *anthropicClient {
	if model == "" {
		model = AnthropicDefaultModel
	}
	opts := []option.RequestOption{option.WithAPIKey(apiKey)}
	if baseURL != "" {
		opts = append(opts, option.WithBaseURL(baseURL))
	}
	return &anthropicClient{
		api:   anthropic.NewClient(opts...),
		model: model,
	}
}

// NewClientFromEnv lit ANTHROPIC_API_KEY (et éventuellement MMM_LLM_MODEL /
// ANTHROPIC_BASE_URL) dans l'environnement. Retourne ErrNotConfigured si
// aucune clé n'est présente : à l'appelant de proposer la saisie manuelle
// en secours, ou de configurer une clé (n'importe quel fournisseur) depuis
// l'interface.
func NewClientFromEnv() (Generator, error) {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		return nil, ErrNotConfigured
	}
	return newAnthropicClient(apiKey, os.Getenv("MMM_LLM_MODEL"), os.Getenv("ANTHROPIC_BASE_URL")), nil
}

func toAnthropicTool(spec ToolSpec) anthropic.ToolUnionParam {
	tool := anthropic.ToolParam{
		Name:        spec.Name,
		Description: anthropic.String(spec.Description),
		// spec.Required était jusqu'ici perdu (seul toMistralTool le
		// transmettait) : le schéma envoyé à Claude ne rendait donc aucun
		// champ racine obligatoire, y compris "specifications"/"scenarios"
		// pourtant déclarés requis côté ToolSpec — voir ADR-047.
		InputSchema: anthropic.ToolInputSchemaParam{Properties: spec.Properties, Required: spec.Required},
	}
	return anthropic.ToolUnionParam{OfTool: &tool}
}

// wrapAnthropicErr enveloppe une erreur d'appel à l'API Claude — le SDK
// Anthropic retente déjà automatiquement 429/5xx en interne (contrairement
// à Mistral, sans SDK Go officiel, voir mistral.go), donc une erreur reçue
// ici a déjà survécu à ces tentatives : si c'est encore un 429 à ce stade,
// l'envelopper avec ErrRateLimited (même sentinelle que Mistral) permet au
// routeur HTTP (router.go) de répondre un statut 429 dédié plutôt que 502,
// pour que le frontend affiche un message explicite plutôt que le texte
// brut renvoyé par le fournisseur.
func wrapAnthropicErr(err error) error {
	var apiErr *anthropic.Error
	if errors.As(err, &apiErr) && apiErr.StatusCode == 429 {
		return fmt.Errorf("appel API Claude : %w : %v", ErrRateLimited, err)
	}
	return fmt.Errorf("appel API Claude : %w", err)
}

func (c *anthropicClient) GenerateProcess(ctx context.Context, text, systemPrompt string) (*DraftProcess, error) {
	spec := extractProcessToolSpec()
	resp, err := c.api.Messages.New(ctx, anthropic.MessageNewParams{
		Model:     anthropic.Model(c.model),
		MaxTokens: 8000,
		System: []anthropic.TextBlockParam{
			{Text: systemPrompt},
		},
		Tools: []anthropic.ToolUnionParam{toAnthropicTool(spec)},
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock(text)),
		},
	})
	if err != nil {
		return nil, wrapAnthropicErr(err)
	}

	for _, block := range resp.Content {
		if toolUse, ok := block.AsAny().(anthropic.ToolUseBlock); ok && toolUse.Name == spec.Name {
			var draft DraftProcess
			if err := json.Unmarshal([]byte(toolUse.JSON.Input.Raw()), &draft); err != nil {
				return nil, fmt.Errorf("parsing de la réponse Claude : %w", err)
			}
			draft.normalize()
			return &draft, nil
		}
	}

	return nil, fmt.Errorf("Claude n'a pas appelé l'outil %s (stop_reason=%s)", spec.Name, resp.StopReason)
}

func (c *anthropicClient) GenerateSpecifications(ctx context.Context, activities []ActivityRef, systemPrompt string) ([]DraftSpecification, error) {
	input, err := json.Marshal(activities)
	if err != nil {
		return nil, fmt.Errorf("sérialisation des activités : %w", err)
	}

	spec := proposeSpecificationsToolSpec()
	resp, err := c.api.Messages.New(ctx, anthropic.MessageNewParams{
		Model:     anthropic.Model(c.model),
		MaxTokens: 8000,
		System: []anthropic.TextBlockParam{
			{Text: systemPrompt},
		},
		Tools: []anthropic.ToolUnionParam{toAnthropicTool(spec)},
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock(string(input))),
		},
	})
	if err != nil {
		return nil, wrapAnthropicErr(err)
	}

	for _, block := range resp.Content {
		if toolUse, ok := block.AsAny().(anthropic.ToolUseBlock); ok && toolUse.Name == spec.Name {
			var result struct {
				Specifications []DraftSpecification `json:"specifications"`
			}
			if err := json.Unmarshal([]byte(toolUse.JSON.Input.Raw()), &result); err != nil {
				return nil, fmt.Errorf("parsing de la réponse Claude : %w", err)
			}
			if result.Specifications == nil {
				result.Specifications = []DraftSpecification{}
			}
			return result.Specifications, nil
		}
	}

	return nil, fmt.Errorf("Claude n'a pas appelé l'outil %s (stop_reason=%s)", spec.Name, resp.StopReason)
}

func (c *anthropicClient) GeneratePainPointSolutions(ctx context.Context, painPoint PainPointContext, systemPrompt string) ([]DraftPainPointSolution, error) {
	input, err := json.Marshal(painPoint)
	if err != nil {
		return nil, fmt.Errorf("sérialisation du point de friction : %w", err)
	}

	spec := proposePainPointSolutionsToolSpec()
	resp, err := c.api.Messages.New(ctx, anthropic.MessageNewParams{
		Model:     anthropic.Model(c.model),
		MaxTokens: 4000,
		System: []anthropic.TextBlockParam{
			{Text: systemPrompt},
		},
		Tools: []anthropic.ToolUnionParam{toAnthropicTool(spec)},
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock(string(input))),
		},
	})
	if err != nil {
		return nil, wrapAnthropicErr(err)
	}

	for _, block := range resp.Content {
		if toolUse, ok := block.AsAny().(anthropic.ToolUseBlock); ok && toolUse.Name == spec.Name {
			var result struct {
				Solutions []DraftPainPointSolution `json:"solutions"`
			}
			if err := json.Unmarshal([]byte(toolUse.JSON.Input.Raw()), &result); err != nil {
				return nil, fmt.Errorf("parsing de la réponse Claude : %w", err)
			}
			if result.Solutions == nil {
				result.Solutions = []DraftPainPointSolution{}
			}
			return result.Solutions, nil
		}
	}

	return nil, fmt.Errorf("Claude n'a pas appelé l'outil %s (stop_reason=%s)", spec.Name, resp.StopReason)
}

func (c *anthropicClient) GeneratePainPointResolution(ctx context.Context, painPoint PainPointContext, chosen DraftPainPointSolution, systemPrompt string) (*PainPointResolution, error) {
	input, err := json.Marshal(struct {
		PainPoint PainPointContext       `json:"painPoint"`
		Solution  DraftPainPointSolution `json:"chosenSolution"`
	}{painPoint, chosen})
	if err != nil {
		return nil, fmt.Errorf("sérialisation de la solution choisie : %w", err)
	}

	spec := proposePainPointResolutionToolSpec()
	resp, err := c.api.Messages.New(ctx, anthropic.MessageNewParams{
		Model:     anthropic.Model(c.model),
		MaxTokens: 4000,
		System: []anthropic.TextBlockParam{
			{Text: systemPrompt},
		},
		Tools: []anthropic.ToolUnionParam{toAnthropicTool(spec)},
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock(string(input))),
		},
	})
	if err != nil {
		return nil, wrapAnthropicErr(err)
	}

	for _, block := range resp.Content {
		if toolUse, ok := block.AsAny().(anthropic.ToolUseBlock); ok && toolUse.Name == spec.Name {
			var result PainPointResolution
			if err := json.Unmarshal([]byte(toolUse.JSON.Input.Raw()), &result); err != nil {
				return nil, fmt.Errorf("parsing de la réponse Claude : %w", err)
			}
			if result.TestSteps == nil {
				result.TestSteps = []DraftTestStep{}
			}
			return &result, nil
		}
	}

	return nil, fmt.Errorf("Claude n'a pas appelé l'outil %s (stop_reason=%s)", spec.Name, resp.StopReason)
}

func (c *anthropicClient) GenerateTestScenarios(ctx context.Context, specifications []SpecRef, systemPrompt string) ([]DraftTestScenario, error) {
	input, err := json.Marshal(specifications)
	if err != nil {
		return nil, fmt.Errorf("sérialisation des spécifications : %w", err)
	}

	spec := proposeTestScenariosToolSpec()
	resp, err := c.api.Messages.New(ctx, anthropic.MessageNewParams{
		Model:     anthropic.Model(c.model),
		MaxTokens: 8000,
		System: []anthropic.TextBlockParam{
			{Text: systemPrompt},
		},
		Tools: []anthropic.ToolUnionParam{toAnthropicTool(spec)},
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock(string(input))),
		},
	})
	if err != nil {
		return nil, wrapAnthropicErr(err)
	}

	for _, block := range resp.Content {
		if toolUse, ok := block.AsAny().(anthropic.ToolUseBlock); ok && toolUse.Name == spec.Name {
			var result struct {
				Scenarios []DraftTestScenario `json:"scenarios"`
			}
			if err := json.Unmarshal([]byte(toolUse.JSON.Input.Raw()), &result); err != nil {
				return nil, fmt.Errorf("parsing de la réponse Claude : %w", err)
			}
			if result.Scenarios == nil {
				result.Scenarios = []DraftTestScenario{}
			}
			return result.Scenarios, nil
		}
	}

	return nil, fmt.Errorf("Claude n'a pas appelé l'outil %s (stop_reason=%s)", spec.Name, resp.StopReason)
}
