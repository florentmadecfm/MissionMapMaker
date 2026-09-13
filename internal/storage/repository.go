// Package storage persiste les projets sous forme de fichiers JSON sur
// disque : un dossier par projet (data/<project-id>/project.json), avec une
// sauvegarde horodatée à chaque écriture pour permettre un retour arrière.
package storage

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"time"

	"missionmapmaker/internal/domain"
)

var ErrNotFound = errors.New("project not found")

var validProjectID = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

type Repository struct {
	baseDir string
}

func NewRepository(baseDir string) *Repository {
	return &Repository{baseDir: baseDir}
}

func (r *Repository) projectFile(id string) (string, error) {
	if !validProjectID.MatchString(id) {
		return "", fmt.Errorf("invalid project id %q", id)
	}
	return filepath.Join(r.baseDir, id, "project.json"), nil
}

// List returns the id and name of every stored project, sorted by name.
func (r *Repository) List() ([]ProjectSummary, error) {
	projects, err := r.LoadAll()
	if err != nil {
		return nil, err
	}

	summaries := make([]ProjectSummary, 0, len(projects))
	for _, p := range projects {
		summaries = append(summaries, ProjectSummary{
			ID: p.ID, Name: p.Name, UpdatedAt: p.UpdatedAt,
			VariantGroupID: p.VariantGroupID, VariantLabel: p.VariantLabel,
		})
	}

	sort.Slice(summaries, func(i, j int) bool { return summaries[i].Name < summaries[j].Name })
	return summaries, nil
}

// LoadAll charge intégralement tous les projets stockés (contrairement à
// List, qui n'en garde qu'un résumé) — utilisé par les vues qui doivent
// parcourir le contenu de chaque projet plutôt que juste les lister (ex.
// index d'acteurs transverse à toutes les missions, voir
// ProjectService.ListActors). Ordre non garanti (celui de os.ReadDir).
func (r *Repository) LoadAll() ([]*domain.Project, error) {
	entries, err := os.ReadDir(r.baseDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []*domain.Project{}, nil
		}
		return nil, err
	}

	projects := make([]*domain.Project, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		p, err := r.Load(e.Name())
		if err != nil {
			continue // ignore un dossier corrompu/partiel plutôt que de faire échouer tout le listing
		}
		projects = append(projects, p)
	}
	return projects, nil
}

type ProjectSummary struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	UpdatedAt time.Time `json:"updatedAt"`
	// Voir domain.Project.VariantGroupID/VariantLabel (ADR-062) : exposés
	// ici pour que la liste de projets déjà chargée par le shell (barre
	// latérale) suffise à regrouper/afficher les variantes d'une mission
	// sans requête supplémentaire.
	VariantGroupID string `json:"variantGroupId,omitempty"`
	VariantLabel   string `json:"variantLabel,omitempty"`
}

func (r *Repository) Load(id string) (*domain.Project, error) {
	path, err := r.projectFile(id)
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	var p domain.Project
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, fmt.Errorf("parsing %s: %w", path, err)
	}
	// Un fichier enregistré avant l'ajout d'un champ collection (ex.
	// TestScenarios) ne l'a pas en JSON : Unmarshal laisse alors le slice Go
	// à nil, qui se sérialiserait en `null` côté API et ferait planter le
	// frontend. Voir domain.Project.Normalize.
	p.Normalize()
	return &p, nil
}

// Save writes the project atomically (temp file + rename) and keeps a
// timestamped backup of the previous version, if any.
func (r *Repository) Save(p *domain.Project) error {
	p.Normalize()
	if err := p.Validate(); err != nil {
		return err
	}

	path, err := r.projectFile(p.ID)
	if err != nil {
		return err
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}

	if err := r.backupExisting(path, dir); err != nil {
		return err
	}

	data, err := json.MarshalIndent(p, "", "  ")
	if err != nil {
		return err
	}

	tmp, err := os.CreateTemp(dir, "project-*.json.tmp")
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

	return os.Rename(tmpPath, path)
}

func (r *Repository) backupExisting(path, dir string) error {
	if _, err := os.Stat(path); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	backupDir := filepath.Join(dir, "backups")
	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		return err
	}

	backupPath := filepath.Join(backupDir, fmt.Sprintf("project-%s.json", time.Now().UTC().Format("20060102T150405.000000000")))

	existing, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return os.WriteFile(backupPath, existing, 0o644)
}

// ProjectVersion identifie une sauvegarde horodatée passée d'un projet
// (voir backupExisting ci-dessus) — ID est le fragment d'horodatage du nom
// de fichier (ex. "20260913T165204.123456789"), unique et triable tel
// quel, jamais un chemin de fichier exposé directement à l'API.
type ProjectVersion struct {
	ID      string    `json:"id"`
	SavedAt time.Time `json:"savedAt"`
}

var backupFilePattern = regexp.MustCompile(`^project-(\d{8}T\d{6}\.\d{9})\.json$`)
var validVersionID = regexp.MustCompile(`^\d{8}T\d{6}\.\d{9}$`)

// ListVersions renvoie l'historique des sauvegardes passées d'un projet
// (dossier "backups", alimenté à chaque Save), les plus récentes en
// premier. Une mission jamais resauvegardée depuis sa création n'a encore
// aucune sauvegarde de son état PRÉCÉDENT (la première Save ne déclenche
// pas de backup, voir backupExisting) : liste vide, pas une erreur.
func (r *Repository) ListVersions(id string) ([]ProjectVersion, error) {
	path, err := r.projectFile(id)
	if err != nil {
		return nil, err
	}
	backupDir := filepath.Join(filepath.Dir(path), "backups")

	entries, err := os.ReadDir(backupDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []ProjectVersion{}, nil
		}
		return nil, err
	}

	versions := make([]ProjectVersion, 0, len(entries))
	for _, e := range entries {
		if e.IsDir() {
			continue
		}
		m := backupFilePattern.FindStringSubmatch(e.Name())
		if m == nil {
			continue
		}
		savedAt, err := time.Parse("20060102T150405.000000000", m[1])
		if err != nil {
			continue // nom de fichier inattendu : ignoré plutôt que de faire échouer tout l'historique
		}
		versions = append(versions, ProjectVersion{ID: m[1], SavedAt: savedAt})
	}
	sort.Slice(versions, func(i, j int) bool { return versions[i].SavedAt.After(versions[j].SavedAt) })
	return versions, nil
}

func (r *Repository) versionFile(id, versionID string) (string, error) {
	path, err := r.projectFile(id) // valide aussi le format de id
	if err != nil {
		return "", err
	}
	if !validVersionID.MatchString(versionID) {
		return "", fmt.Errorf("invalid version id %q", versionID)
	}
	return filepath.Join(filepath.Dir(path), "backups", fmt.Sprintf("project-%s.json", versionID)), nil
}

// LoadVersion charge le contenu d'une sauvegarde passée, en LECTURE SEULE
// (ne modifie jamais le fichier project.json courant ni le dossier
// backups) — la restauration proprement dite passe par ProjectService,
// qui réutilise Update (donc Save, qui sauvegarde l'état courant avant de
// le remplacer : une restauration reste elle-même réversible).
func (r *Repository) LoadVersion(id, versionID string) (*domain.Project, error) {
	path, err := r.versionFile(id, versionID)
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, ErrNotFound
		}
		return nil, err
	}

	var p domain.Project
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, fmt.Errorf("parsing %s: %w", path, err)
	}
	p.Normalize()
	return &p, nil
}

func (r *Repository) Delete(id string) error {
	path, err := r.projectFile(id)
	if err != nil {
		return err
	}
	dir := filepath.Dir(path)
	if err := os.RemoveAll(dir); err != nil {
		return err
	}
	return nil
}
