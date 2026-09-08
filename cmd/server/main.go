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

// setupGenerateService détermine la clé API à utiliser au démarrage :
// ANTHROPIC_API_KEY (variable d'environnement) est prioritaire si
// présente, sinon la clé précédemment saisie depuis l'écran Paramètres et
// persistée dans le fichier de configuration local est utilisée. Dans les
// deux cas, l'utilisateur peut ensuite configurer/changer la clé depuis
// l'interface, avec effet immédiat.
func setupGenerateService() *service.GenerateService {
	if llmClient, err := llm.NewClient(); err == nil {
		return service.NewGenerateService(llmClient, os.Getenv("MMM_LLM_MODEL"))
	} else if !errors.Is(err, llm.ErrNotConfigured) {
		log.Fatal(err)
	}

	cfg, err := config.Load()
	if err != nil {
		log.Printf("lecture de la configuration locale : %v", err)
		cfg = &config.Config{}
	}
	if cfg.AnthropicAPIKey != "" {
		log.Printf("génération assistée activée depuis la configuration locale")
		return service.NewGenerateService(llm.NewClientWithKey(cfg.AnthropicAPIKey, cfg.Model), cfg.Model)
	}

	log.Printf("génération assistée désactivée : %v (configurez une clé depuis l'écran Paramètres, ou définissez ANTHROPIC_API_KEY)", llm.ErrNotConfigured)
	return service.NewGenerateService(nil, cfg.Model)
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
