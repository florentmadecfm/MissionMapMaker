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

func (s *GenerateService) GenerateSpecifications(ctx context.Context, activities []llm.ActivityRef) ([]llm.DraftSpecification, error) {
	if len(activities) == 0 {
		return nil, errNoActivities
	}
	if s.client == nil {
		return nil, llm.ErrNotConfigured
	}
	return s.client.GenerateSpecifications(ctx, activities)
}

var errEmptyText = &validationError{"le texte à analyser est vide"}
var errNoActivities = &validationError{"aucune activité à traiter"}

type validationError struct{ msg string }

func (e *validationError) Error() string { return e.msg }
