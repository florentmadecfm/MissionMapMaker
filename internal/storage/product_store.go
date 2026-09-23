package storage

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sync"

	"pulse-missionmap/internal/domain"
)

// ErrProductNotFound est renvoyée par ProductStore.Get quand aucun produit
// n'existe sous l'id demandé — distincte de ErrNotFound (projets) pour
// que les messages d'erreur restent précis.
var ErrProductNotFound = errors.New("product not found")

// ProductStore persiste les Produits (vision, différenciateurs, piliers,
// KPI) dans un unique fichier data/products.json, indexé par id de
// produit — même patron que ActorProfileStore (actor_profiles.go), avec
// une clé par id plutôt que par nom normalisé : un Produit est une entité
// de première classe choisie explicitement par id, pas un rapprochement
// approximatif par texte comme les fiches persona partagées. Un seul
// fichier plutôt qu'un par produit (comme les projets) : le volume
// attendu ne le justifie pas pour une v1, et ça simplifie la lecture/
// écriture atomique — voir le plan associé pour la discussion sur
// l'absence d'historique de versions. Un mutex protège les accès
// concurrents, comme ActorProfileStore.
type ProductStore struct {
	path string
	mu   sync.Mutex
}

func NewProductStore(baseDir string) *ProductStore {
	return &ProductStore{path: filepath.Join(baseDir, "products.json")}
}

func (s *ProductStore) LoadAll() (map[string]domain.Product, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.loadAllLocked()
}

func (s *ProductStore) Get(id string) (domain.Product, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	products, err := s.loadAllLocked()
	if err != nil {
		return domain.Product{}, false, err
	}
	p, ok := products[id]
	return p, ok, nil
}

// Save enregistre (crée ou remplace intégralement) un produit — l'appelant
// est responsable de renseigner ID/CreatedAt/UpdatedAt.
func (s *ProductStore) Save(p domain.Product) error {
	p.Normalize()
	s.mu.Lock()
	defer s.mu.Unlock()

	products, err := s.loadAllLocked()
	if err != nil {
		return err
	}
	products[p.ID] = p
	return s.saveAllLocked(products)
}

func (s *ProductStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	products, err := s.loadAllLocked()
	if err != nil {
		return err
	}
	delete(products, id)
	return s.saveAllLocked(products)
}

func (s *ProductStore) loadAllLocked() (map[string]domain.Product, error) {
	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return map[string]domain.Product{}, nil
		}
		return nil, err
	}
	var products map[string]domain.Product
	if err := json.Unmarshal(data, &products); err != nil {
		return nil, err
	}
	if products == nil {
		products = map[string]domain.Product{}
	}
	return products, nil
}

func (s *ProductStore) saveAllLocked(products map[string]domain.Product) error {
	dir := filepath.Dir(s.path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(products, "", "  ")
	if err != nil {
		return err
	}

	tmp, err := os.CreateTemp(dir, "products-*.json.tmp")
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
