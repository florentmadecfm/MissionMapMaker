package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"
)

const MistralDefaultModel = "mistral-large-latest"

const mistralEndpoint = "https://api.mistral.ai/v1/chat/completions"

// Nouvelles tentatives sur 429/5xx (erreurs transitoires) : l'API Mistral
// n'a pas de SDK Go officiel qui s'en chargerait pour nous, contrairement
// au SDK Anthropic qui retente automatiquement ces mêmes statuts.
const (
	mistralMaxAttempts = 4 // tentative initiale + 3 nouvelles tentatives
	mistralBaseBackoff = time.Second
)

// mistralClient appelle l'API Mistral en HTTP brut (pas de SDK Go officiel
// disponible) : POST /v1/chat/completions avec function calling,
// tool_choice="any" pour forcer l'appel de l'outil fourni plutôt qu'une
// réponse en texte libre.
type mistralClient struct {
	apiKey  string
	model   string
	http    *http.Client
	baseURL string        // surchargeable dans les tests, mistralEndpoint en usage normal
	backoff time.Duration // surchargeable dans les tests, mistralBaseBackoff en usage normal
}

func newMistralClient(apiKey, model string) *mistralClient {
	if model == "" {
		model = MistralDefaultModel
	}
	return &mistralClient{
		apiKey:  apiKey,
		model:   model,
		http:    &http.Client{Timeout: 60 * time.Second},
		baseURL: mistralEndpoint,
		backoff: mistralBaseBackoff,
	}
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
// "any") et renvoie les arguments JSON bruts de l'appel d'outil. Les
// erreurs transitoires (429, 5xx) sont retentées avec un backoff
// exponentiel, en respectant l'en-tête Retry-After si l'API le fournit.
func (c *mistralClient) call(ctx context.Context, systemPrompt, userContent string, spec ToolSpec) (json.RawMessage, error) {
	body, err := json.Marshal(mistralRequest{
		Model: c.model,
		Messages: []mistralMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userContent},
		},
		Tools:      []mistralTool{toMistralTool(spec)},
		ToolChoice: "any",
	})
	if err != nil {
		return nil, fmt.Errorf("sérialisation de la requête Mistral : %w", err)
	}

	var lastErr error
	for attempt := 1; attempt <= mistralMaxAttempts; attempt++ {
		raw, retryAfter, retryable, err := c.doRequest(ctx, body, spec)
		if err == nil {
			return raw, nil
		}
		lastErr = err
		if !retryable || attempt == mistralMaxAttempts {
			break
		}

		wait := retryAfter
		if wait <= 0 {
			wait = c.backoff * time.Duration(1<<(attempt-1)) // base, 2x, 4x...
		}
		log.Printf("appel API Mistral : tentative %d/%d échouée (%v), nouvel essai dans %s", attempt, mistralMaxAttempts, err, wait)

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(wait):
		}
	}
	return nil, lastErr
}

// doRequest effectue une unique tentative d'appel. retryable indique si
// l'erreur (le cas échéant) justifie une nouvelle tentative ; retryAfter
// est la durée d'attente suggérée par l'API (en-tête Retry-After), 0 si
// absente ou non applicable.
func (c *mistralClient) doRequest(ctx context.Context, body []byte, spec ToolSpec) (raw json.RawMessage, retryAfter time.Duration, retryable bool, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL, bytes.NewReader(body))
	if err != nil {
		return nil, 0, false, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, 0, true, fmt.Errorf("appel API Mistral : %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, 0, true, fmt.Errorf("lecture de la réponse Mistral : %w", err)
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
		retryable := resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500
		return nil, parseRetryAfter(resp.Header.Get("Retry-After")), retryable, fmt.Errorf("appel API Mistral : %s %s", resp.Status, msg)
	}

	var parsed mistralResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, 0, false, fmt.Errorf("parsing de la réponse Mistral : %w", err)
	}

	if len(parsed.Choices) > 0 {
		for _, tc := range parsed.Choices[0].Message.ToolCalls {
			if tc.Function.Name == spec.Name {
				return json.RawMessage(tc.Function.Arguments), 0, false, nil
			}
		}
	}
	return nil, 0, false, fmt.Errorf("Mistral n'a pas appelé l'outil %s", spec.Name)
}

func parseRetryAfter(header string) time.Duration {
	if header == "" {
		return 0
	}
	if seconds, err := strconv.Atoi(header); err == nil && seconds > 0 {
		return time.Duration(seconds) * time.Second
	}
	return 0
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
