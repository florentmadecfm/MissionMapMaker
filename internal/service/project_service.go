// Package service orchestre le domaine et le stockage : c'est la couche
// que les handlers HTTP appellent, sans connaître les détails de
// persistance ni les règles métier internes.
package service

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"regexp"
	"sort"
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
		TestScenarios:  []domain.TestScenario{},
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

// ActorProjectRef identifie une mission (projet) où un acteur donné (par
// son nom, voir ActorSummary) apparaît, avec les informations propres à
// cette mission (couleur/description peuvent différer d'une mission à
// l'autre pour le "même" acteur).
type ActorProjectRef struct {
	ProjectID   string    `json:"projectId"`
	ProjectName string    `json:"projectName"`
	ActorID     string    `json:"actorId"`
	Color       string    `json:"color"`
	Description string    `json:"description"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// ActorSummary regroupe, pour un nom d'acteur donné, toutes les missions
// (projets) où un acteur de ce nom apparaît — rapprochement par nom
// (insensible à la casse, espaces de bord ignorés), pas par un identifiant
// partagé : il n'existe pas de catalogue d'acteurs global, deux acteurs de
// projets différents portant le même nom sont donc considérés comme "le
// même acteur" pour cette vue transverse (ADR-041).
type ActorSummary struct {
	Name     string            `json:"name"`
	Projects []ActorProjectRef `json:"projects"`
}

// ListActors construit l'index transverse acteur -> missions, à partir de
// tous les projets stockés (LoadAll). Les acteurs sont triés par nom, et au
// sein d'un acteur les missions par récence (UpdatedAt décroissant) —
// les plus pertinentes en premier.
func (s *ProjectService) ListActors() ([]ActorSummary, error) {
	projects, err := s.repo.LoadAll()
	if err != nil {
		return nil, err
	}

	byKey := make(map[string]*ActorSummary)
	for _, p := range projects {
		for _, a := range p.Actors {
			key := strings.ToLower(strings.TrimSpace(a.Name))
			if key == "" {
				continue
			}
			summary, ok := byKey[key]
			if !ok {
				summary = &ActorSummary{Name: a.Name}
				byKey[key] = summary
			}
			summary.Projects = append(summary.Projects, ActorProjectRef{
				ProjectID:   p.ID,
				ProjectName: p.Name,
				ActorID:     a.ID,
				Color:       a.Color,
				Description: a.Description,
				UpdatedAt:   p.UpdatedAt,
			})
		}
	}

	summaries := make([]ActorSummary, 0, len(byKey))
	for _, summary := range byKey {
		sort.Slice(summary.Projects, func(i, j int) bool {
			return summary.Projects[i].UpdatedAt.After(summary.Projects[j].UpdatedAt)
		})
		summaries = append(summaries, *summary)
	}
	sort.Slice(summaries, func(i, j int) bool {
		return strings.ToLower(summaries[i].Name) < strings.ToLower(summaries[j].Name)
	})
	return summaries, nil
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
