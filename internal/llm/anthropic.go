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

func newAnthropicClient(apiKey, model string) *anthropicClient {
	if model == "" {
		model = AnthropicDefaultModel
	}
	return &anthropicClient{
		api:   anthropic.NewClient(option.WithAPIKey(apiKey)),
		model: model,
	}
}

// NewClientFromEnv lit ANTHROPIC_API_KEY (et éventuellement MMM_LLM_MODEL)
// dans l'environnement. Retourne ErrNotConfigured si aucune clé n'est
// présente : à l'appelant de proposer la saisie manuelle en secours, ou de
// configurer une clé (n'importe quel fournisseur) depuis l'interface.
func NewClientFromEnv() (Generator, error) {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		return nil, ErrNotConfigured
	}
	return newAnthropicClient(apiKey, os.Getenv("MMM_LLM_MODEL")), nil
}

func toAnthropicTool(spec ToolSpec) anthropic.ToolUnionParam {
	tool := anthropic.ToolParam{
		Name:        spec.Name,
		Description: anthropic.String(spec.Description),
		InputSchema: anthropic.ToolInputSchemaParam{Properties: spec.Properties},
	}
	return anthropic.ToolUnionParam{OfTool: &tool}
}

func (c *anthropicClient) GenerateProcess(ctx context.Context, text string) (*DraftProcess, error) {
	spec := extractProcessToolSpec()
	resp, err := c.api.Messages.New(ctx, anthropic.MessageNewParams{
		Model:     anthropic.Model(c.model),
		MaxTokens: 8000,
		System: []anthropic.TextBlockParam{
			{Text: processSystemPrompt},
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
			return &draft, nil
		}
	}

	return nil, fmt.Errorf("Claude n'a pas appelé l'outil %s (stop_reason=%s)", spec.Name, resp.StopReason)
}

func (c *anthropicClient) GenerateSpecifications(ctx context.Context, activities []ActivityRef) ([]DraftSpecification, error) {
	input, err := json.Marshal(activities)
	if err != nil {
		return nil, fmt.Errorf("sérialisation des activités : %w", err)
	}

	spec := proposeSpecificationsToolSpec()
	resp, err := c.api.Messages.New(ctx, anthropic.MessageNewParams{
		Model:     anthropic.Model(c.model),
		MaxTokens: 8000,
		System: []anthropic.TextBlockParam{
			{Text: specSystemPrompt},
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
			return result.Specifications, nil
		}
	}

	return nil, fmt.Errorf("Claude n'a pas appelé l'outil %s (stop_reason=%s)", spec.Name, resp.StopReason)
}
