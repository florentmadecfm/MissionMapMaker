package llm

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"time"
)

// Client Mistral pour la GÉNÉRATION D'IMAGE (ADR-073/ADR-075) — un produit
// Mistral séparé de la génération de texte/JSON structuré (mistralClient
// ci-dessus, POST /v1/chat/completions) : l'Agents & Conversations API,
// avec l'outil intégré "image_generation" (propulsé par FLUX1.1 [pro]
// Ultra de Black Forest Labs), un tout autre endpoint (POST /v1/
// conversations) et un schéma de requête/réponse différent — pas de
// function calling, l'image générée revient comme une référence de
// fichier ("tool_file") à télécharger séparément (GET /v1/files/
// {file_id}/content), pas inline.
//
// baseURL (l'URL de la Conversations API) est surchargeable comme pour
// mistralClient (proxy, déploiement régional/entreprise...) — l'URL de
// téléchargement du fichier généré (Files API) est alors dérivée du même
// schéma+hôte que baseURL plutôt que codée en dur, pour rester cohérente
// avec un éventuel déploiement personnalisé. Voir aussi
// Config.ImageGeneration (internal/config), distinct de Config.Mistral
// (utilisé pour la génération de texte).
const (
	mistralConversationsEndpoint = "https://api.mistral.ai/v1/conversations"
	mistralFilesContentPath      = "/v1/files/%s/content"
	// MistralImageAgentModel pilote l'APPEL DE L'OUTIL image_generation
	// (un modèle texte "orchestrateur"), pas le modèle d'image lui-même :
	// celui-ci (FLUX1.1 Pro Ultra) est fixé côté Mistral, non paramétrable
	// depuis cette API.
	MistralImageAgentModel = "mistral-medium-latest"
)

const (
	mistralImageMaxAttempts = 3
	mistralImageBaseBackoff = 2 * time.Second
)

type mistralImageClient struct {
	apiKey  string
	model   string
	baseURL string
	http    *http.Client
	backoff time.Duration // surchargeable dans les tests
}

// newMistralImageClient construit le client. model="" utilise
// MistralImageAgentModel ; baseURL="" utilise mistralConversationsEndpoint
// (api.mistral.ai) — mêmes conventions que newMistralClient (mistral.go).
func newMistralImageClient(apiKey, model, baseURL string) *mistralImageClient {
	if model == "" {
		model = MistralImageAgentModel
	}
	if baseURL == "" {
		baseURL = mistralConversationsEndpoint
	}
	return &mistralImageClient{
		apiKey:  apiKey,
		model:   model,
		baseURL: baseURL,
		http:    &http.Client{Timeout: 90 * time.Second},
		backoff: mistralImageBaseBackoff,
	}
}

type mistralConversationRequest struct {
	Model          string                     `json:"model"`
	Inputs         string                     `json:"inputs"`
	Tools          []mistralConversationTool  `json:"tools"`
	CompletionArgs mistralConversationCompArg `json:"completion_args"`
}

type mistralConversationTool struct {
	Type string `json:"type"`
}

type mistralConversationCompArg struct {
	ToolChoice string `json:"tool_choice,omitempty"`
}

type mistralConversationResponse struct {
	Outputs []struct {
		Content []struct {
			Type     string `json:"type"`
			Tool     string `json:"tool"`
			FileID   string `json:"file_id"`
			FileType string `json:"file_type"`
		} `json:"content"`
	} `json:"outputs"`
}

// GenerateMistralImage est le point d'entrée exporté utilisé par
// internal/service (ImageService) — construit un client jetable pour cet
// appel (pas de connexion persistante à gérer, cohérent avec l'usage
// ponctuel/manuel de cette fonctionnalité) et renvoie l'image générée en
// data URL ("data:image/<type>;base64,..."). model/baseURL vides utilisent
// les valeurs par défaut (voir newMistralImageClient).
func GenerateMistralImage(ctx context.Context, apiKey, model, baseURL, prompt string) (string, error) {
	return newMistralImageClient(apiKey, model, baseURL).GenerateImage(ctx, prompt)
}

// GenerateImage envoie prompt à l'outil "image_generation" — {"type":
// "image_generation"}, sans autre paramètre (voir la doc Mistral : cet
// outil n'a pas de configuration propre, contrairement à d'autres tools de
// l'Agents API) — et renvoie l'image obtenue sous forme de data URL
// ("data:image/<type>;base64,..."), prête à poser directement dans un
// attribut src côté frontend, cohérent avec le reste de la persistance de
// l'app (pas de stockage de fichier séparé).
func (c *mistralImageClient) GenerateImage(ctx context.Context, prompt string) (string, error) {
	body, err := json.Marshal(mistralConversationRequest{
		Model:          c.model,
		Inputs:         prompt,
		Tools:          []mistralConversationTool{{Type: "image_generation"}},
		CompletionArgs: mistralConversationCompArg{ToolChoice: "any"},
	})
	if err != nil {
		return "", fmt.Errorf("sérialisation de la requête de génération d'image : %w", err)
	}

	fileID, fileType, err := c.requestImageFile(ctx, body)
	if err != nil {
		return "", err
	}
	return c.downloadAsDataURL(ctx, fileID, fileType)
}

// requestImageFile appelle POST /v1/conversations avec nouvelles tentatives
// sur erreur transitoire (429/5xx), même patron que mistralClient.call.
func (c *mistralImageClient) requestImageFile(ctx context.Context, body []byte) (fileID, fileType string, err error) {
	var lastErr error
	for attempt := 1; attempt <= mistralImageMaxAttempts; attempt++ {
		fileID, fileType, retryAfter, retryable, err := c.doConversationRequest(ctx, body)
		if err == nil {
			return fileID, fileType, nil
		}
		lastErr = err
		if !retryable || attempt == mistralImageMaxAttempts {
			break
		}

		wait := retryAfter
		if wait <= 0 {
			wait = c.backoff * time.Duration(1<<(attempt-1))
		}
		log.Printf("génération d'image Mistral : tentative %d/%d échouée (%v), nouvel essai dans %s", attempt, mistralImageMaxAttempts, err, wait)

		select {
		case <-ctx.Done():
			return "", "", ctx.Err()
		case <-time.After(wait):
		}
	}
	return "", "", lastErr
}

func (c *mistralImageClient) doConversationRequest(ctx context.Context, body []byte) (fileID, fileType string, retryAfter time.Duration, retryable bool, err error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL, bytes.NewReader(body))
	if err != nil {
		return "", "", 0, false, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return "", "", 0, true, fmt.Errorf("appel API Mistral (génération d'image) : %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", "", 0, true, fmt.Errorf("lecture de la réponse Mistral (génération d'image) : %w", err)
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
		return "", "", parseRetryAfter(resp.Header.Get("Retry-After")), retryable, fmt.Errorf("appel API Mistral (génération d'image) : %s %s", resp.Status, msg)
	}

	var parsed mistralConversationResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", "", 0, false, fmt.Errorf("parsing de la réponse Mistral (génération d'image) : %w", err)
	}

	for _, output := range parsed.Outputs {
		for _, chunk := range output.Content {
			if chunk.Type == "tool_file" && chunk.Tool == "image_generation" && chunk.FileID != "" {
				fileType := chunk.FileType
				if fileType == "" {
					fileType = "png"
				}
				return chunk.FileID, fileType, 0, false, nil
			}
		}
	}
	return "", "", 0, false, fmt.Errorf("Mistral n'a renvoyé aucune image générée")
}

// downloadAsDataURL télécharge le fichier généré (GET /v1/files/{id}/content,
// contenu binaire brut) et l'encode en data URL. L'URL de téléchargement
// est dérivée du schéma+hôte de c.baseURL (pas codée en dur sur
// api.mistral.ai) pour rester cohérente avec un déploiement personnalisé.
func (c *mistralImageClient) downloadAsDataURL(ctx context.Context, fileID, fileType string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.filesContentURL(fileID), nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("téléchargement de l'image générée : %w", err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("lecture de l'image générée : %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("téléchargement de l'image générée : %s %s", resp.Status, string(data))
	}

	encoded := base64.StdEncoding.EncodeToString(data)
	return fmt.Sprintf("data:image/%s;base64,%s", fileType, encoded), nil
}

// filesContentURL construit l'URL de téléchargement du fichier généré à
// partir du schéma+hôte de c.baseURL — retombe sur l'hôte officiel
// api.mistral.ai si c.baseURL n'est pas une URL absolue valide (ne
// devrait arriver qu'avec une valeur saisie manuellement invalide, jamais
// avec la valeur par défaut).
func (c *mistralImageClient) filesContentURL(fileID string) string {
	if u, err := url.Parse(c.baseURL); err == nil && u.Scheme != "" && u.Host != "" {
		return fmt.Sprintf("%s://%s"+mistralFilesContentPath, u.Scheme, u.Host, fileID)
	}
	base, _ := url.Parse(mistralConversationsEndpoint)
	return fmt.Sprintf("%s://%s"+mistralFilesContentPath, base.Scheme, base.Host, fileID)
}
