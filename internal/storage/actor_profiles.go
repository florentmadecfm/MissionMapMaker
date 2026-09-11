package storage

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"missionmapmaker/internal/domain"
)

// ActorProfileStore persiste les fiches persona partagées entre missions
// (ADR-056) dans un unique fichier data/actor-profiles.json, indexé par
// nom d'acteur normalisé (voir ProfileKey — même convention que
// ProjectService.ListActors, ADR-041 : le rapprochement entre missions se
// fait par nom, pas par un identifiant partagé). Un seul fichier plutôt
// qu'un par acteur (comme les projets) : le volume attendu ne le justifie
// pas, et ça simplifie la lecture/écriture atomique. Un mutex protège les
// accès concurrents : contrairement à project.json (un fichier par
// projet, jamais touché par deux requêtes différentes), ce fichier unique
// peut être lu-modifié-écrit par la sauvegarde de N'IMPORTE QUEL projet.
type ActorProfileStore struct {
	path string
	mu   sync.Mutex
}

func NewActorProfileStore(baseDir string) *ActorProfileStore {
	return &ActorProfileStore{path: filepath.Join(baseDir, "actor-profiles.json")}
}

// ProfileKey normalise un nom d'acteur pour l'indexation dans le store
// (insensible à la casse, espaces de bord ignorés).
func ProfileKey(name string) string {
	return strings.ToLower(strings.TrimSpace(name))
}

func (s *ActorProfileStore) LoadAll() (map[string]domain.ActorProfile, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.loadAllLocked()
}

// Upsert fusionne les fiches fournies (indexées par ProfileKey) dans le
// fichier partagé, sans toucher aux entrées absentes de `updates` — un
// appel ne porte que les acteurs du projet en cours de sauvegarde, jamais
// tous les acteurs connus de toutes les missions.
func (s *ActorProfileStore) Upsert(updates map[string]domain.ActorProfile) error {
	if len(updates) == 0 {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	profiles, err := s.loadAllLocked()
	if err != nil {
		return err
	}
	for key, profile := range updates {
		profiles[key] = profile
	}
	return s.saveAllLocked(profiles)
}

func (s *ActorProfileStore) loadAllLocked() (map[string]domain.ActorProfile, error) {
	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return map[string]domain.ActorProfile{}, nil
		}
		return nil, err
	}
	var profiles map[string]domain.ActorProfile
	if err := json.Unmarshal(data, &profiles); err != nil {
		return nil, err
	}
	if profiles == nil {
		profiles = map[string]domain.ActorProfile{}
	}
	return profiles, nil
}

func (s *ActorProfileStore) saveAllLocked(profiles map[string]domain.ActorProfile) error {
	dir := filepath.Dir(s.path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(profiles, "", "  ")
	if err != nil {
		return err
	}

	tmp, err := os.CreateTemp(dir, "actor-profiles-*.json.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath) // no-op si le rename a déjà eu lieu

	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpPath, s.path)
}
