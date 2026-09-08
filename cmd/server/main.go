// Command server démarre l'API MissionMapMaker en local (localhost).
package main

import (
	"log"
	"net/http"
	"os"

	"missionmapmaker/internal/api"
	"missionmapmaker/internal/service"
	"missionmapmaker/internal/storage"
)

func main() {
	addr := envOr("MMM_ADDR", ":8080")
	dataDir := envOr("MMM_DATA_DIR", "data")

	repo := storage.NewRepository(dataDir)
	projects := service.NewProjectService(repo)
	router := api.NewRouter(projects)

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
