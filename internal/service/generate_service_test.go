package service

import (
	"context"
	"strings"
	"testing"

	"missionmapmaker/internal/llm"
)

// stubGenerator est un llm.Generator minimal pour tester GenerateService sans
// dépendre d'un fournisseur réel.
type stubGenerator struct{}

func (stubGenerator) GenerateProcess(ctx context.Context, text, systemPrompt string) (*llm.DraftProcess, error) {
	return &llm.DraftProcess{}, nil
}

func (stubGenerator) GenerateSpecifications(ctx context.Context, activities []llm.ActivityRef, systemPrompt string) ([]llm.DraftSpecification, error) {
	return nil, nil
}

func (stubGenerator) GenerateTestScenarios(ctx context.Context, specifications []llm.SpecRef, systemPrompt string) ([]llm.DraftTestScenario, error) {
	return nil, nil
}

func TestGenerate_RejectsTextTooLong(t *testing.T) {
	s := NewGenerateService(stubGenerator{}, llm.ProviderMistral, "m", "")
	_, err := s.Generate(context.Background(), strings.Repeat("a", maxTextLength+1))
	if err != errTextTooLong {
		t.Fatalf("expected errTextTooLong, got %v", err)
	}
}

func TestGenerate_AcceptsTextAtLimit(t *testing.T) {
	s := NewGenerateService(stubGenerator{}, llm.ProviderMistral, "m", "")
	_, err := s.Generate(context.Background(), strings.Repeat("a", maxTextLength))
	if err != nil {
		t.Fatalf("expected no error at the limit, got %v", err)
	}
}

func TestGenerateSpecifications_RejectsTooManyActivities(t *testing.T) {
	s := NewGenerateService(stubGenerator{}, llm.ProviderMistral, "m", "")
	refs := make([]llm.ActivityRef, maxActivityRefs+1)
	_, err := s.GenerateSpecifications(context.Background(), refs)
	if err != errTooManyActivities {
		t.Fatalf("expected errTooManyActivities, got %v", err)
	}
}

func TestGenerateSpecifications_AcceptsCountAtLimit(t *testing.T) {
	s := NewGenerateService(stubGenerator{}, llm.ProviderMistral, "m", "")
	refs := make([]llm.ActivityRef, maxActivityRefs)
	_, err := s.GenerateSpecifications(context.Background(), refs)
	if err != nil {
		t.Fatalf("expected no error at the limit, got %v", err)
	}
}

func TestGenerate_NotConfiguredWithoutGenerator(t *testing.T) {
	s := NewGenerateService(nil, "", "", "")
	_, err := s.Generate(context.Background(), "un texte valide")
	if err != llm.ErrNotConfigured {
		t.Fatalf("expected llm.ErrNotConfigured, got %v", err)
	}
}

func TestGenerateTestScenarios_RejectsEmpty(t *testing.T) {
	s := NewGenerateService(stubGenerator{}, llm.ProviderMistral, "m", "")
	_, err := s.GenerateTestScenarios(context.Background(), nil)
	if err != errNoSpecifications {
		t.Fatalf("expected errNoSpecifications, got %v", err)
	}
}

func TestGenerateTestScenarios_RejectsTooManySpecifications(t *testing.T) {
	s := NewGenerateService(stubGenerator{}, llm.ProviderMistral, "m", "")
	refs := make([]llm.SpecRef, maxSpecRefs+1)
	_, err := s.GenerateTestScenarios(context.Background(), refs)
	if err != errTooManySpecifications {
		t.Fatalf("expected errTooManySpecifications, got %v", err)
	}
}

func TestGenerateTestScenarios_AcceptsCountAtLimit(t *testing.T) {
	s := NewGenerateService(stubGenerator{}, llm.ProviderMistral, "m", "")
	refs := make([]llm.SpecRef, maxSpecRefs)
	_, err := s.GenerateTestScenarios(context.Background(), refs)
	if err != nil {
		t.Fatalf("expected no error at the limit, got %v", err)
	}
}
