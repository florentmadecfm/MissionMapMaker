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
	repo     *storage.Repository
	profiles *storage.ActorProfileStore
}

func NewProjectService(repo *storage.Repository, profiles *storage.ActorProfileStore) *ProjectService {
	return &ProjectService{repo: repo, profiles: profiles}
}

func (s *ProjectService) List() ([]storage.ProjectSummary, error) {
	return s.repo.List()
}

func (s *ProjectService) Get(id string) (*domain.Project, error) {
	p, err := s.repo.Load(id)
	if err != nil {
		return nil, err
	}
	if err := s.mergeActorProfiles(p); err != nil {
		return nil, err
	}
	return p, nil
}

// mergeActorProfiles écrase About/Bio/Goals/PainPoints de chaque acteur du
// projet par la fiche partagée correspondante (voir storage.ActorProfileStore,
// ADR-056), quand elle existe — un acteur jamais sauvegardé depuis
// l'introduction de ce mécanisme (ou dont le nom ne correspond à aucune
// fiche partagée) garde simplement les valeurs déjà présentes dans le
// fichier du projet.
func (s *ProjectService) mergeActorProfiles(p *domain.Project) error {
	profiles, err := s.profiles.LoadAll()
	if err != nil {
		return err
	}
	for i := range p.Actors {
		key := storage.ProfileKey(p.Actors[i].Name)
		if profile, ok := profiles[key]; ok {
			p.Actors[i].About = profile.About
			p.Actors[i].Bio = profile.Bio
			p.Actors[i].Goals = profile.Goals
			p.Actors[i].PainPoints = profile.PainPoints
		}
	}
	return nil
}

// syncActorProfiles republie la fiche de chaque acteur du projet dans le
// store partagé — appelé avant Repository.Save, pour que la fiche
// modifiée soit immédiatement visible depuis les autres missions au
// prochain Get (voir ADR-056). Un nom vide (acteur en cours de saisie,
// pas encore nommé) est ignoré plutôt que de polluer le store d'une clé
// vide.
//
// Pour un acteur dont l'ID n'existait PAS déjà dans `existing` (donc
// nouvellement apparu dans cette requête), la fiche est au contraire
// ADOPTÉE depuis le store plutôt qu'écrasée : le client qui vient de
// créer cet acteur localement n'est jamais passé par Get pour ce nom, sa
// fiche locale est donc vide par construction — la publier telle quelle
// effacerait la fiche déjà partagée sous ce nom par une autre mission.
// Un acteur déjà connu (même ID côté `existing`), lui, est toujours
// republié tel quel : soit c'est une vraie modification à propager, soit
// c'est la copie déjà fusionnée reçue au dernier Get, republier ne
// change alors rien.
func (s *ProjectService) syncActorProfiles(p, existing *domain.Project) error {
	existingIDs := make(map[string]struct{}, len(existing.Actors))
	for _, a := range existing.Actors {
		existingIDs[a.ID] = struct{}{}
	}

	profiles, err := s.profiles.LoadAll()
	if err != nil {
		return err
	}

	updates := make(map[string]domain.ActorProfile, len(p.Actors))
	for i := range p.Actors {
		key := storage.ProfileKey(p.Actors[i].Name)
		if key == "" {
			continue
		}
		if _, known := existingIDs[p.Actors[i].ID]; !known {
			if profile, ok := profiles[key]; ok {
				p.Actors[i].About = profile.About
				p.Actors[i].Bio = profile.Bio
				p.Actors[i].Goals = profile.Goals
				p.Actors[i].PainPoints = profile.PainPoints
				continue
			}
		}
		updates[key] = domain.ActorProfile{
			About: p.Actors[i].About, Bio: p.Actors[i].Bio,
			Goals: p.Actors[i].Goals, PainPoints: p.Actors[i].PainPoints,
		}
	}
	return s.profiles.Upsert(updates)
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

	// Republie les fiches persona AVANT Save (ADR-056) : Save appelle
	// Project.Validate, qui peut rejeter la requête pour une tout autre
	// raison — republier après aurait laissé le store partagé et le
	// projet enregistré diverger si Save échoue.
	if err := s.syncActorProfiles(p, existing); err != nil {
		return nil, err
	}
	if err := s.repo.Save(p); err != nil {
		return nil, err
	}
	// Refusionne depuis le store partagé : si ce projet a deux acteurs du
	// même nom (edge case), les deux doivent repartir avec exactement la
	// même fiche (celle écrite en dernier), pas chacun la sienne.
	if err := s.mergeActorProfiles(p); err != nil {
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
