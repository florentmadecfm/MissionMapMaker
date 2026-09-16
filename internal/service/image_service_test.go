package service

import (
	"testing"

	"missionmapmaker/internal/llm"
)

// Le style de génération d'image (5e paire prompt/skill personnalisable,
// ADR-074) doit se résoudre comme les 4 autres capacités : texte par
// défaut tant que non personnalisé, composition contexte + skill une fois
// personnalisé — même logique que TestGenerate_ComposesContextAndSkillPrompts
// (generate_service_test.go), en boîte blanche ici (styleInstruction n'est
// pas exporté) puisque ImageService n'a pas d'interface injectable pour
// intercepter l'appel réseau comme stubGenerator/recordingGenerator le
// font pour GenerateService.
func TestImageService_Prompts_DefaultsWhenNotCustomized(t *testing.T) {
	s := NewImageService("mistral", "fake-key", "", "")
	p := s.Prompts()
	if p.Generation.Customized || p.Generation.Value != llm.DefaultImageGenerationPrompt {
		t.Fatalf("expected default, non-customized skill, got customized=%v value=%q", p.Generation.Customized, p.Generation.Value)
	}
	if p.GenerationContext.Customized || p.GenerationContext.Value != llm.DefaultImageGenerationContextPrompt {
		t.Fatalf("expected default, non-customized context, got customized=%v value=%q", p.GenerationContext.Customized, p.GenerationContext.Value)
	}

	want := llm.DefaultImageGenerationContextPrompt + "\n\n" + llm.DefaultImageGenerationPrompt
	if got := s.styleInstruction(); got != want {
		t.Fatalf("expected default composed style %q, got %q", want, got)
	}
}

func TestImageService_Prompts_ComposesCustomizedStyle(t *testing.T) {
	s := NewImageService("mistral", "fake-key", "", "")
	s.SetPrompts(ImagePromptOverrides{Generation: "Style personnalisé : illustration couleur."})

	p := s.Prompts()
	if !p.Generation.Customized || p.Generation.Value != "Style personnalisé : illustration couleur." {
		t.Fatalf("expected customized skill, got customized=%v value=%q", p.Generation.Customized, p.Generation.Value)
	}
	if p.GenerationContext.Customized {
		t.Fatalf("expected context to remain non-customized")
	}

	want := llm.DefaultImageGenerationContextPrompt + "\n\nStyle personnalisé : illustration couleur."
	if got := s.styleInstruction(); got != want {
		t.Fatalf("expected composed style %q, got %q", want, got)
	}
}
