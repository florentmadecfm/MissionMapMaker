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

// ErrNotConfigured signale l'absence de clé API : la fonctionnalité de
// génération assistée reste indisponible mais le reste de l'application
// fonctionne sans elle (voir docs/architecture.md, mode manuel de secours).
var ErrNotConfigured = errors.New("ANTHROPIC_API_KEY non configurée")

const defaultModel = "claude-opus-5"

const systemPrompt = `Tu assistes un UX designer / Product Owner qui décrit un processus métier en langage naturel (ex. "le fonctionnement d'un restaurant"). À partir de sa description, identifie :
- les acteurs impliqués (rôles, pas des personnes nommées) ;
- les phases du processus, dans leur ordre chronologique ;
- les activités de chaque acteur, rattachées à la phase où elles se déroulent ;
- les interactions entre activités : quelle information circule de l'une à l'autre, quand le texte le mentionne explicitement ou l'implique clairement.

N'invente pas d'acteurs, de phases ou d'activités qui ne sont pas suggérés par le texte. Si une information n'est pas mentionnée, laisse le champ correspondant vide plutôt que de deviner. Réponds uniquement en appelant l'outil extract_process.`

type Client struct {
	api   anthropic.Client
	model string
}

// NewClient lit ANTHROPIC_API_KEY (et éventuellement MMM_LLM_MODEL) dans
// l'environnement. Retourne ErrNotConfigured si aucune clé n'est présente :
// à l'appelant de proposer la saisie manuelle en secours.
func NewClient() (*Client, error) {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		return nil, ErrNotConfigured
	}

	model := os.Getenv("MMM_LLM_MODEL")
	if model == "" {
		model = defaultModel
	}

	return &Client{
		api:   anthropic.NewClient(option.WithAPIKey(apiKey)),
		model: model,
	}, nil
}

func extractProcessTool() anthropic.ToolUnionParam {
	stringProp := map[string]any{"type": "string"}
	integerProp := map[string]any{"type": "integer"}

	actorSchema := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"name":        stringProp,
			"description": stringProp,
		},
		"required": []string{"name"},
	}
	phaseSchema := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"name":  stringProp,
			"order": integerProp,
		},
		"required": []string{"name", "order"},
	}
	activitySchema := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"name":        stringProp,
			"actorName":   stringProp,
			"phaseName":   stringProp,
			"description": stringProp,
		},
		"required": []string{"name", "actorName", "phaseName"},
	}
	interactionSchema := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"fromActivityName": stringProp,
			"toActivityName":   stringProp,
			"information":      stringProp,
		},
		"required": []string{"fromActivityName", "toActivityName", "information"},
	}

	tool := anthropic.ToolParam{
		Name:        "extract_process",
		Description: anthropic.String("Enregistre les acteurs, phases, activités et interactions extraits de la description du processus."),
		InputSchema: anthropic.ToolInputSchemaParam{
			Properties: map[string]any{
				"actors":       map[string]any{"type": "array", "items": actorSchema},
				"phases":       map[string]any{"type": "array", "items": phaseSchema},
				"activities":   map[string]any{"type": "array", "items": activitySchema},
				"interactions": map[string]any{"type": "array", "items": interactionSchema},
			},
		},
	}

	return anthropic.ToolUnionParam{OfTool: &tool}
}

// GenerateProcess appelle Claude pour extraire une ébauche de processus à
// partir d'une description en langage naturel.
func (c *Client) GenerateProcess(ctx context.Context, text string) (*DraftProcess, error) {
	resp, err := c.api.Messages.New(ctx, anthropic.MessageNewParams{
		Model:     anthropic.Model(c.model),
		MaxTokens: 8000,
		System: []anthropic.TextBlockParam{
			{Text: systemPrompt},
		},
		Tools: []anthropic.ToolUnionParam{extractProcessTool()},
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock(text)),
		},
	})
	if err != nil {
		return nil, fmt.Errorf("appel API Claude : %w", err)
	}

	for _, block := range resp.Content {
		if toolUse, ok := block.AsAny().(anthropic.ToolUseBlock); ok && toolUse.Name == "extract_process" {
			var draft DraftProcess
			if err := json.Unmarshal([]byte(toolUse.JSON.Input.Raw()), &draft); err != nil {
				return nil, fmt.Errorf("parsing de la réponse Claude : %w", err)
			}
			return &draft, nil
		}
	}

	return nil, fmt.Errorf("Claude n'a pas appelé l'outil extract_process (stop_reason=%s)", resp.StopReason)
}
