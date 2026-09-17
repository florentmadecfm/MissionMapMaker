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

	"pulse-missionmap/internal/domain"
	"pulse-missionmap/internal/storage"
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

// mergeActorProfiles écrase About/Bio/Goals/PainPoints/PortraitImage de
// chaque acteur du projet — Actuel ET Cible (Target), quand elle en a une —
// par la fiche partagée correspondante (voir storage.ActorProfileStore,
// ADR-056), quand elle existe. Un acteur jamais sauvegardé depuis
// l'introduction de ce mécanisme (ou dont le nom ne correspond à aucune
// fiche partagée) garde simplement les valeurs déjà présentes dans le
// fichier du projet.
func (s *ProjectService) mergeActorProfiles(p *domain.Project) error {
	profiles, err := s.profiles.LoadAll()
	if err != nil {
		return err
	}
	applyActorProfiles(p.Actors, profiles)
	if p.Target != nil {
		applyActorProfiles(p.Target.Actors, profiles)
	}
	return nil
}

func applyActorProfiles(actors []domain.Actor, profiles map[string]domain.ActorProfile) {
	for i := range actors {
		key := storage.ProfileKey(actors[i].Name)
		if profile, ok := profiles[key]; ok {
			actors[i].About = profile.About
			actors[i].Bio = profile.Bio
			actors[i].Goals = profile.Goals
			actors[i].PainPoints = profile.PainPoints
			actors[i].PortraitImage = profile.PortraitImage
		}
	}
}

// syncActorProfiles republie la fiche de chaque acteur du projet — Actuel
// ET Cible (Target), quand elle en a une — dans le store partagé, appelé
// avant Repository.Save, pour que la fiche modifiée soit immédiatement
// visible depuis les autres missions au prochain Get (voir ADR-056). Un
// nom vide (acteur en cours de saisie, pas encore nommé) est ignoré plutôt
// que de polluer le store d'une clé vide.
//
// Pour un acteur dont l'ID n'existait PAS déjà côté `existing` (donc
// nouvellement apparu dans cette requête), la fiche est au contraire
// ADOPTÉE depuis le store plutôt qu'écrasée : le client qui vient de
// créer cet acteur localement n'est jamais passé par Get pour ce nom, sa
// fiche locale est donc vide par construction — la publier telle quelle
// effacerait la fiche déjà partagée sous ce nom par une autre mission. Un
// acteur déjà connu (même ID côté `existing`), lui, est toujours republié
// tel quel : soit c'est une vraie modification à propager, soit c'est la
// copie déjà fusionnée reçue au dernier Get, republier ne change alors
// rien. Le Cible est comparé à la Cible EXISTANTE (jamais à l'Actuel
// existant) : un acteur de la cible qui partage l'id d'un acteur actuel
// (copié tel quel par createTargetFromCurrent, activeVariant.ts) est
// "déjà connu" dès la création de la cible, pas seulement après un
// premier aller-retour Get propre à la cible.
//
// Avant ce correctif, seul p.Actors était traité ici et dans
// mergeActorProfiles ci-dessus : les 4 champs de fiche d'un acteur de la
// cible restaient ceux, souvent vides, écrits tels quels dans le fichier
// du projet, jamais fusionnés avec le store partagé — un persona du même
// nom des deux côtés (le cas courant : la cible copie l'Actuel) ressortait
// alors à tort comme "modifié" dans la comparaison Actuel/Cible dès que ce
// nom avait une fiche partagée non vide (missionDiff.ts, actorChangedFields).
func (s *ProjectService) syncActorProfiles(p, existing *domain.Project) error {
	profiles, err := s.profiles.LoadAll()
	if err != nil {
		return err
	}

	updates := make(map[string]domain.ActorProfile)
	syncActorProfilesInto(p.Actors, existingActorIDs(existing.Actors), profiles, updates)
	if p.Target != nil {
		var existingTargetActors []domain.Actor
		if existing.Target != nil {
			existingTargetActors = existing.Target.Actors
		}
		syncActorProfilesInto(p.Target.Actors, existingActorIDs(existingTargetActors), profiles, updates)
	}
	return s.profiles.Upsert(updates)
}

func existingActorIDs(actors []domain.Actor) map[string]struct{} {
	ids := make(map[string]struct{}, len(actors))
	for _, a := range actors {
		ids[a.ID] = struct{}{}
	}
	return ids
}

// syncActorProfilesInto traite une seule collection d'acteurs (Actuel ou
// Cible) : adopte la fiche partagée pour un acteur nouvellement apparu
// (voir syncActorProfiles ci-dessus), sinon programme la republication de
// sa fiche locale dans `updates` — partagé entre les deux appels
// (Actuel/Cible) pour qu'un même nom présent des deux côtés ne s'écrive
// qu'une fois, avec la valeur du dernier traité.
func syncActorProfilesInto(actors []domain.Actor, existingIDs map[string]struct{}, profiles, updates map[string]domain.ActorProfile) {
	for i := range actors {
		key := storage.ProfileKey(actors[i].Name)
		if key == "" {
			continue
		}
		if _, known := existingIDs[actors[i].ID]; !known {
			if profile, ok := profiles[key]; ok {
				actors[i].About = profile.About
				actors[i].Bio = profile.Bio
				actors[i].Goals = profile.Goals
				actors[i].PainPoints = profile.PainPoints
				actors[i].PortraitImage = profile.PortraitImage
				continue
			}
		}
		updates[key] = domain.ActorProfile{
			About: actors[i].About, Bio: actors[i].Bio,
			Goals: actors[i].Goals, PainPoints: actors[i].PainPoints,
			PortraitImage: actors[i].PortraitImage,
		}
	}
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

// ListVersions renvoie l'historique consultable des sauvegardes passées
// d'un projet (backlog blueprint #7, ADR-070).
func (s *ProjectService) ListVersions(id string) ([]storage.ProjectVersion, error) {
	return s.repo.ListVersions(id)
}

// GetVersion charge le contenu d'une sauvegarde passée, en lecture seule
// (pour prévisualisation) — n'affecte jamais l'état courant du projet.
func (s *ProjectService) GetVersion(id, versionID string) (*domain.Project, error) {
	return s.repo.LoadVersion(id, versionID)
}

// RestoreVersion remplace l'état courant du projet par celui d'une
// sauvegarde passée — réutilise intégralement Update (mêmes règles :
// CreatedAt préservé, UpdatedAt rafraîchi, fiches persona resynchronisées,
// validation), ce qui a pour effet que Save sauvegarde d'abord l'état
// courant (celui remplacé) comme une nouvelle version de l'historique
// avant d'écrire la version restaurée : une restauration reste donc
// elle-même réversible, sans logique dédiée.
func (s *ProjectService) RestoreVersion(id, versionID string) (*domain.Project, error) {
	version, err := s.repo.LoadVersion(id, versionID)
	if err != nil {
		return nil, err
	}
	return s.Update(id, version)
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
