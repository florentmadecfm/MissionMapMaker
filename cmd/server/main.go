// Command server démarre l'API Pulse.MissionMap en local (localhost).
package main

import (
	"errors"
	"log"
	"net/http"
	"os"

	"pulse-missionmap/internal/api"
	"pulse-missionmap/internal/config"
	"pulse-missionmap/internal/llm"
	"pulse-missionmap/internal/service"
	"pulse-missionmap/internal/storage"
)

func main() {
	addr := envOr("MMM_ADDR", ":8080")
	dataDir := envOr("MMM_DATA_DIR", "data")

	repo := storage.NewRepository(dataDir)
	profiles := storage.NewActorProfileStore(dataDir)
	projects := service.NewProjectService(repo, profiles)
	products := service.NewProductService(storage.NewProductStore(dataDir))

	generate := setupGenerateService()
	images := setupImageService()

	router := api.NewRouter(projects, generate, images, products)

	log.Printf("Pulse.MissionMap API sur %s (données : %s)", addr, dataDir)
	if err := http.ListenAndServe(addr, router); err != nil {
		log.Fatal(err)
	}
}

// setupGenerateService détermine le fournisseur/la clé à utiliser au
// démarrage : ANTHROPIC_API_KEY (variable d'environnement) est
// prioritaire si présente, sinon le fournisseur précédemment configuré
// depuis l'écran Paramètres (persisté dans le fichier de configuration
// local) est utilisé. Dans les deux cas, l'utilisateur peut ensuite
// changer de fournisseur/clé depuis l'interface, avec effet immédiat. Les
// skills personnalisés (cfg.Prompts), indépendants du fournisseur, sont
// chargés dans tous les cas.
func setupGenerateService() *service.GenerateService {
	cfg, err := config.Load()
	if err != nil {
		log.Printf("lecture de la configuration locale : %v", err)
		cfg = &config.Config{}
	}

	gs := buildGenerateService(cfg)
	gs.SetPrompts(service.PromptOverrides{
		Process:                   cfg.Prompts.Process,
		ProcessContext:            cfg.Prompts.ProcessContext,
		Specification:             cfg.Prompts.Specification,
		SpecificationContext:      cfg.Prompts.SpecificationContext,
		TestScenario:              cfg.Prompts.TestScenario,
		TestScenarioContext:       cfg.Prompts.TestScenarioContext,
		PainPointSolutions:        cfg.Prompts.PainPointSolutions,
		PainPointSolutionsContext: cfg.Prompts.PainPointSolutionsContext,
		VisionRefinement:          cfg.Prompts.VisionRefinement,
		VisionRefinementContext:   cfg.Prompts.VisionRefinementContext,
		KpiSuggestions:            cfg.Prompts.KpiSuggestions,
		KpiSuggestionsContext:     cfg.Prompts.KpiSuggestionsContext,
	})
	return gs
}

func buildGenerateService(cfg *config.Config) *service.GenerateService {
	if generator, err := llm.NewClientFromEnv(); err == nil {
		model := envOr("MMM_LLM_MODEL", llm.ProviderAnthropic.DefaultModel())
		return service.NewGenerateService(generator, llm.ProviderAnthropic, model, os.Getenv("ANTHROPIC_BASE_URL"))
	} else if !errors.Is(err, llm.ErrNotConfigured) {
		log.Fatal(err)
	}

	if settings := cfg.Active(); settings.APIKey != "" {
		provider := llm.Provider(cfg.Provider)
		generator, err := llm.NewGenerator(provider, llm.GeneratorOptions{
			APIKey:  settings.APIKey,
			Model:   settings.Model,
			BaseURL: settings.BaseURL,
		})
		if err != nil {
			log.Printf("configuration locale invalide (%v) : génération assistée désactivée", err)
			return service.NewGenerateService(nil, "", "", "")
		}
		log.Printf("génération assistée activée depuis la configuration locale (fournisseur : %s)", provider)
		return service.NewGenerateService(generator, provider, settings.Model, settings.BaseURL)
	}

	log.Printf("génération assistée désactivée : %v (configurez un fournisseur depuis l'écran Paramètres, ou définissez ANTHROPIC_API_KEY)", llm.ErrNotConfigured)
	return service.NewGenerateService(nil, "", "", "")
}

// setupImageService (ADR-073/ADR-075) charge la connexion de génération
// d'image (fournisseur/clé/modèle/URL de base) depuis la configuration
// locale — indépendante du fournisseur de texte actif
// (setupGenerateService ci-dessus) : voir Config.ImageGenerationProvider/
// ImageGeneration. Charge aussi le style personnalisé (ADR-074, 5e paire
// prompt/skill), comme setupGenerateService le fait pour les 4 autres.
func setupImageService() *service.ImageService {
	cfg, err := config.Load()
	if err != nil {
		log.Printf("lecture de la configuration locale : %v", err)
		cfg = &config.Config{}
	}
	images := service.NewImageService(cfg.ImageGenerationProvider, cfg.ImageGeneration.APIKey, cfg.ImageGeneration.Model, cfg.ImageGeneration.BaseURL)
	images.SetPrompts(service.ImagePromptOverrides{
		Generation:        cfg.Prompts.ImageGeneration,
		GenerationContext: cfg.Prompts.ImageGenerationContext,
	})
	return images
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
