// Command server démarre l'API MissionMapMaker en local (localhost).
package main

import (
	"errors"
	"log"
	"net/http"
	"os"

	"missionmapmaker/internal/api"
	"missionmapmaker/internal/llm"
	"missionmapmaker/internal/service"
	"missionmapmaker/internal/storage"
)

func main() {
	addr := envOr("MMM_ADDR", ":8080")
	dataDir := envOr("MMM_DATA_DIR", "data")

	repo := storage.NewRepository(dataDir)
	projects := service.NewProjectService(repo)

	llmClient, err := llm.NewClient()
	if err != nil {
		if !errors.Is(err, llm.ErrNotConfigured) {
			log.Fatal(err)
		}
		log.Printf("génération assistée désactivée : %v (saisie manuelle toujours disponible)", err)
		llmClient = nil
	}
	generate := service.NewGenerateService(llmClient)

	router := api.NewRouter(projects, generate)

	log.Printf("MissionMapMaker API sur %s (données : %s)", addr, dataDir)
	if err := http.ListenAndServe(addr, router); err != nil {
		log.Fatal(err)
	}
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
