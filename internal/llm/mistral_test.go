package llm

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func newTestMistralClient(t *testing.T, handler http.HandlerFunc) *mistralClient {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)

	c := newMistralClient("test-key", "", server.URL)
	c.backoff = time.Millisecond // tests rapides, pas de vraie attente
	return c
}

func toolCallResponse(t *testing.T, toolName string, args any) []byte {
	t.Helper()
	rawArgs, err := json.Marshal(args)
	if err != nil {
		t.Fatalf("marshal args: %v", err)
	}
	body, err := json.Marshal(mistralResponse{
		Choices: []struct {
			Message struct {
				ToolCalls []mistralToolCall `json:"tool_calls"`
			} `json:"message"`
		}{
			{
				Message: struct {
					ToolCalls []mistralToolCall `json:"tool_calls"`
				}{
					ToolCalls: []mistralToolCall{{
						Function: struct {
							Name      string `json:"name"`
							Arguments string `json:"arguments"`
						}{Name: toolName, Arguments: string(rawArgs)},
					}},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("marshal response: %v", err)
	}
	return body
}

// Comme toolCallResponse, mais avec des arguments JSON bruts plutôt que
// marshalés depuis une struct Go — indispensable pour simuler un modèle qui
// omet réellement des clés (marshaler une struct Go les inclurait toujours,
// au moins à leur valeur zéro).
func toolCallResponseRaw(t *testing.T, toolName, rawArgs string) []byte {
	t.Helper()
	body, err := json.Marshal(mistralResponse{
		Choices: []struct {
			Message struct {
				ToolCalls []mistralToolCall `json:"tool_calls"`
			} `json:"message"`
		}{
			{
				Message: struct {
					ToolCalls []mistralToolCall `json:"tool_calls"`
				}{
					ToolCalls: []mistralToolCall{{
						Function: struct {
							Name      string `json:"name"`
							Arguments string `json:"arguments"`
						}{Name: toolName, Arguments: rawArgs},
					}},
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("marshal response: %v", err)
	}
	return body
}

// Une 429 suivie d'un succès doit aboutir sans erreur : c'est exactement
// le cas rencontré en usage réel (compte Mistral à quota limité).
func TestMistralCall_RetriesOn429ThenSucceeds(t *testing.T) {
	var attempts int32
	client := newTestMistralClient(t, func(w http.ResponseWriter, r *http.Request) {
		n := atomic.AddInt32(&attempts, 1)
		if n < 3 {
			w.WriteHeader(http.StatusTooManyRequests)
			_, _ = w.Write([]byte(`{"message":"Rate limit exceeded"}`))
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(toolCallResponse(t, "extract_process", DraftProcess{
			Actors: []DraftActor{{Name: "Client"}},
		}))
	})

	draft, err := client.GenerateProcess(context.Background(), "un texte quelconque", DefaultProcessPrompt)
	if err != nil {
		t.Fatalf("GenerateProcess: %v", err)
	}
	if len(draft.Actors) != 1 || draft.Actors[0].Name != "Client" {
		t.Fatalf("unexpected draft: %+v", draft)
	}
	if got := atomic.LoadInt32(&attempts); got != 3 {
		t.Fatalf("expected 3 attempts, got %d", got)
	}
}

// Une erreur d'authentification (401) ne doit jamais être retentée : ce
// n'est pas transitoire, retenter ne ferait que perdre du temps.
func TestMistralCall_DoesNotRetryOn401(t *testing.T) {
	var attempts int32
	client := newTestMistralClient(t, func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&attempts, 1)
		w.WriteHeader(http.StatusUnauthorized)
		_, _ = w.Write([]byte(`{"message":"API key is invalid."}`))
	})

	_, err := client.GenerateProcess(context.Background(), "un texte quelconque", DefaultProcessPrompt)
	if err == nil {
		t.Fatal("expected an error")
	}
	if got := atomic.LoadInt32(&attempts); got != 1 {
		t.Fatalf("expected exactly 1 attempt (no retry on 401), got %d", got)
	}
}

// Après avoir épuisé toutes les tentatives sur des 429 persistantes,
// l'appel doit finir par échouer plutôt que boucler indéfiniment.
func TestMistralCall_GivesUpAfterMaxAttempts(t *testing.T) {
	var attempts int32
	client := newTestMistralClient(t, func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&attempts, 1)
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"message":"Rate limit exceeded"}`))
	})

	_, err := client.GenerateProcess(context.Background(), "un texte quelconque", DefaultProcessPrompt)
	if err == nil {
		t.Fatal("expected an error")
	}
	if got := atomic.LoadInt32(&attempts); got != mistralMaxAttempts {
		t.Fatalf("expected %d attempts, got %d", mistralMaxAttempts, got)
	}
}

// Reproduit le bug rapporté : un LLM chargé de décrire UNIQUEMENT une
// nouvelle interaction entre deux activités déjà existantes (voir
// DefaultProcessPrompt) omet entièrement les clés "actors"/"phases"/
// "activities" plutôt que de renvoyer des tableaux vides. Sans
// DraftProcess.normalize(), ces champs désérialisent en nil, qui se
// sérialise en JSON "null" — impossible à itérer côté frontend
// (`for (const x of draft.actors)`, ADR-047).
func TestMistralGenerateProcess_NormalizesOmittedArrays(t *testing.T) {
	client := newTestMistralClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(toolCallResponseRaw(t, "extract_process", `{"interactions":[
			{"fromActivityName":"Servir le plat","fromActorName":"Serveur","toActivityName":"Manger","toActorName":"Client","information":"plat servi"}
		]}`))
	})

	draft, err := client.GenerateProcess(context.Background(), "un texte quelconque", DefaultProcessPrompt)
	if err != nil {
		t.Fatalf("GenerateProcess: %v", err)
	}
	if draft.Actors == nil || draft.Phases == nil || draft.Activities == nil {
		t.Fatalf("expected non-nil empty slices for omitted fields, got: %+v", draft)
	}
	if len(draft.Interactions) != 1 {
		t.Fatalf("expected the single interaction to survive, got: %+v", draft.Interactions)
	}
}

// Un Retry-After numérique doit être respecté plutôt que le backoff par
// défaut (vérifié indirectement : le test échouerait par timeout du
// contexte si la valeur n'était pas prise en compte correctement).
func TestParseRetryAfter(t *testing.T) {
	cases := map[string]time.Duration{
		"":    0,
		"0":   0,
		"5":   5 * time.Second,
		"abc": 0,
		"-3":  0,
	}
	for header, want := range cases {
		if got := parseRetryAfter(header); got != want {
			t.Errorf("parseRetryAfter(%q) = %v, want %v", header, got, want)
		}
	}
}
