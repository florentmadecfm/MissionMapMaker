package llm

import (
	"context"
	"encoding/json"
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
		return nil, fmt.Errorf("appel API Claude : %w", err)
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
		return nil, fmt.Errorf("appel API Claude : %w", err)
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
		return nil, fmt.Errorf("appel API Claude : %w", err)
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
