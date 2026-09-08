// Package service orchestre le domaine et le stockage : c'est la couche
// que les handlers HTTP appellent, sans connaître les détails de
// persistance ni les règles métier internes.
package service

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"regexp"
	"strings"
	"time"

	"missionmapmaker/internal/domain"
	"missionmapmaker/internal/storage"
)

type ProjectService struct {
	repo *storage.Repository
}

func NewProjectService(repo *storage.Repository) *ProjectService {
	return &ProjectService{repo: repo}
}

func (s *ProjectService) List() ([]storage.ProjectSummary, error) {
	return s.repo.List()
}

func (s *ProjectService) Get(id string) (*domain.Project, error) {
	return s.repo.Load(id)
}

func (s *ProjectService) Create(name string) (*domain.Project, error) {
	if strings.TrimSpace(name) == "" {
		return nil, fmt.Errorf("name is required")
	}

	now := time.Now().UTC()
	p := &domain.Project{
		ID:             newProjectID(name),
		Name:           name,
		CreatedAt:      now,
		UpdatedAt:      now,
		Actors:         []domain.Actor{},
		Phases:         []domain.Phase{},
		Activities:     []domain.Activity{},
		Interactions:   []domain.Interaction{},
		Specifications: []domain.Specification{},
	}

	if err := s.repo.Save(p); err != nil {
		return nil, err
	}
	return p, nil
}

// Update remplace intégralement le contenu du projet (l'UI envoie l'état
// complet après édition côté client). L'horodatage createdAt d'origine est
// préservé.
func (s *ProjectService) Update(id string, p *domain.Project) (*domain.Project, error) {
	existing, err := s.repo.Load(id)
	if err != nil {
		return nil, err
	}

	p.ID = id
	p.CreatedAt = existing.CreatedAt
	p.UpdatedAt = time.Now().UTC()

	if err := s.repo.Save(p); err != nil {
		return nil, err
	}
	return p, nil
}

func (s *ProjectService) Delete(id string) error {
	return s.repo.Delete(id)
}

var slugNonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

func newProjectID(name string) string {
	slug := strings.Trim(slugNonAlnum.ReplaceAllString(strings.ToLower(name), "-"), "-")
	if slug == "" {
		slug = "projet"
	}
	return fmt.Sprintf("%s-%s-%s", time.Now().UTC().Format("20060102"), slug, randomSuffix(4))
}

func randomSuffix(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "0000"
	}
	return hex.EncodeToString(b)
}
