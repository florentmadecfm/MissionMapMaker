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
	projects := service.NewProjectService(repo)

	generate := setupGenerateService()

	router := api.NewRouter(projects, generate)

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
// changer de fournisseur/clé depuis l'interface, avec effet immédiat.
func setupGenerateService() *service.GenerateService {
	if generator, err := llm.NewClientFromEnv(); err == nil {
		model := envOr("MMM_LLM_MODEL", llm.ProviderAnthropic.DefaultModel())
		return service.NewGenerateService(generator, llm.ProviderAnthropic, model, os.Getenv("ANTHROPIC_BASE_URL"))
	} else if !errors.Is(err, llm.ErrNotConfigured) {
		log.Fatal(err)
	}

	cfg, err := config.Load()
	if err != nil {
		log.Printf("lecture de la configuration locale : %v", err)
		cfg = &config.Config{}
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

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
