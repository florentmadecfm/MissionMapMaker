package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const MistralDefaultModel = "mistral-large-latest"

const mistralEndpoint = "https://api.mistral.ai/v1/chat/completions"

// mistralClient appelle l'API Mistral en HTTP brut (pas de SDK Go officiel
// disponible) : POST /v1/chat/completions avec function calling,
// tool_choice="any" pour forcer l'appel de l'outil fourni plutôt qu'une
// réponse en texte libre.
type mistralClient struct {
	apiKey string
	model  string
	http   *http.Client
}

func newMistralClient(apiKey, model string) *mistralClient {
	if model == "" {
		model = MistralDefaultModel
	}
	return &mistralClient{apiKey: apiKey, model: model, http: &http.Client{Timeout: 60 * time.Second}}
}

type mistralTool struct {
	Type     string              `json:"type"`
	Function mistralToolFunction `json:"function"`
}

type mistralToolFunction struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"`
}

type mistralMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type mistralRequest struct {
	Model      string           `json:"model"`
	Messages   []mistralMessage `json:"messages"`
	Tools      []mistralTool    `json:"tools"`
	ToolChoice string           `json:"tool_choice,omitempty"`
}

type mistralToolCall struct {
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

type mistralResponse struct {
	Choices []struct {
		Message struct {
			ToolCalls []mistralToolCall `json:"tool_calls"`
		} `json:"message"`
	} `json:"choices"`
}

type mistralErrorResponse struct {
	Message string `json:"message"`
	Error   *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func toMistralTool(spec ToolSpec) mistralTool {
	params := map[string]any{
		"type":       "object",
		"properties": spec.Properties,
	}
	if len(spec.Required) > 0 {
		params["required"] = spec.Required
	}
	return mistralTool{
		Type: "function",
		Function: mistralToolFunction{
			Name:        spec.Name,
			Description: spec.Description,
			Parameters:  params,
		},
	}
}

// call envoie une requête de chat avec un unique outil forcé (tool_choice
// "any") et renvoie les arguments JSON bruts de l'appel d'outil.
func (c *mistralClient) call(ctx context.Context, systemPrompt, userContent string, spec ToolSpec) (json.RawMessage, error) {
	reqBody := mistralRequest{
		Model: c.model,
		Messages: []mistralMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userContent},
		},
		Tools:      []mistralTool{toMistralTool(spec)},
		ToolChoice: "any",
	}
	body, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("sérialisation de la requête Mistral : %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, mistralEndpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("appel API Mistral : %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("lecture de la réponse Mistral : %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		msg := string(respBody)
		var errResp mistralErrorResponse
		if json.Unmarshal(respBody, &errResp) == nil {
			switch {
			case errResp.Error != nil && errResp.Error.Message != "":
				msg = errResp.Error.Message
			case errResp.Message != "":
				msg = errResp.Message
			}
		}
		return nil, fmt.Errorf("appel API Mistral : %s %s", resp.Status, msg)
	}

	var parsed mistralResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, fmt.Errorf("parsing de la réponse Mistral : %w", err)
	}

	if len(parsed.Choices) > 0 {
		for _, tc := range parsed.Choices[0].Message.ToolCalls {
			if tc.Function.Name == spec.Name {
				return json.RawMessage(tc.Function.Arguments), nil
			}
		}
	}
	return nil, fmt.Errorf("Mistral n'a pas appelé l'outil %s", spec.Name)
}

func (c *mistralClient) GenerateProcess(ctx context.Context, text string) (*DraftProcess, error) {
	spec := extractProcessToolSpec()
	raw, err := c.call(ctx, processSystemPrompt, text, spec)
	if err != nil {
		return nil, err
	}
	var draft DraftProcess
	if err := json.Unmarshal(raw, &draft); err != nil {
		return nil, fmt.Errorf("parsing des arguments de l'outil : %w", err)
	}
	return &draft, nil
}

func (c *mistralClient) GenerateSpecifications(ctx context.Context, activities []ActivityRef) ([]DraftSpecification, error) {
	input, err := json.Marshal(activities)
	if err != nil {
		return nil, fmt.Errorf("sérialisation des activités : %w", err)
	}

	spec := proposeSpecificationsToolSpec()
	raw, err := c.call(ctx, specSystemPrompt, string(input), spec)
	if err != nil {
		return nil, err
	}
	var result struct {
		Specifications []DraftSpecification `json:"specifications"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("parsing des arguments de l'outil : %w", err)
	}
	return result.Specifications, nil
}
