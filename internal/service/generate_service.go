package service

import (
	"context"
	"strings"

	"missionmapmaker/internal/llm"
)

type GenerateService struct {
	client *llm.Client // nil si ANTHROPIC_API_KEY n'est pas configurée
}

func NewGenerateService(client *llm.Client) *GenerateService {
	return &GenerateService{client: client}
}

func (s *GenerateService) Generate(ctx context.Context, text string) (*llm.DraftProcess, error) {
	if strings.TrimSpace(text) == "" {
		return nil, errEmptyText
	}
	if s.client == nil {
		return nil, llm.ErrNotConfigured
	}
	return s.client.GenerateProcess(ctx, text)
}

var errEmptyText = &validationError{"le texte à analyser est vide"}

type validationError struct{ msg string }

func (e *validationError) Error() string { return e.msg }
