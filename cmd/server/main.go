// Command server démarre l'API MissionMapMaker en local (localhost).
package main

import (
	"errors"
	"log"
	"net/http"
	"os"

	"missionmapmaker/internal/api"
	"missionmapmaker/internal/config"
	"missionmapmaker/internal/llm"
	"missionmapmaker/internal/service"
	"missionmapmaker/internal/storage"
)

func main() {
	addr := envOr("MMM_ADDR", ":8080")
	dataDir := envOr("MMM_DATA_DIR", "data")

	repo := storage.NewRepository(dataDir)
	profiles := storage.NewActorProfileStore(dataDir)
	projects := service.NewProjectService(repo, profiles)

	generate := setupGenerateService()
	images := setupImageService()

	router := api.NewRouter(projects, generate, images)

	log.Printf("MissionMapMaker API sur %s (données : %s)", addr, dataDir)
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

// setupImageService (ADR-073) charge la clé API Mistral dédiée à la
// génération d'image depuis la configuration locale — indépendante du
// fournisseur de texte actif (setupGenerateService ci-dessus) : voir
// Config.ImageGenerationAPIKey. Charge aussi le style personnalisé
// (ADR-074, 5e paire prompt/skill), comme setupGenerateService le fait
// pour les 4 autres.
func setupImageService() *service.ImageService {
	cfg, err := config.Load()
	if err != nil {
		log.Printf("lecture de la configuration locale : %v", err)
		cfg = &config.Config{}
	}
	images := service.NewImageService(cfg.ImageGenerationAPIKey)
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
