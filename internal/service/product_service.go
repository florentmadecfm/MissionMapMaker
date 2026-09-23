package service

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"pulse-missionmap/internal/domain"
	"pulse-missionmap/internal/storage"
)

// ProductService orchestre storage.ProductStore — volontairement plus fin
// que ProjectService : un Produit n'a pas de mécanisme de fusion
// équivalent à mergeActorProfiles/syncActorProfiles (il est référencé par
// id, jamais fusionné par nom), donc pas de logique métier au-delà du
// CRUD.
type ProductService struct {
	products *storage.ProductStore
}

func NewProductService(products *storage.ProductStore) *ProductService {
	return &ProductService{products: products}
}

// List renvoie tous les produits, triés par nom.
func (s *ProductService) List() ([]domain.Product, error) {
	all, err := s.products.LoadAll()
	if err != nil {
		return nil, err
	}
	list := make([]domain.Product, 0, len(all))
	for _, p := range all {
		list = append(list, p)
	}
	sort.Slice(list, func(i, j int) bool { return strings.ToLower(list[i].Name) < strings.ToLower(list[j].Name) })
	return list, nil
}

func (s *ProductService) Get(id string) (domain.Product, error) {
	p, ok, err := s.products.Get(id)
	if err != nil {
		return domain.Product{}, err
	}
	if !ok {
		return domain.Product{}, storage.ErrProductNotFound
	}
	return p, nil
}

func (s *ProductService) Create(name string) (domain.Product, error) {
	if strings.TrimSpace(name) == "" {
		return domain.Product{}, fmt.Errorf("name is required")
	}
	now := time.Now().UTC()
	p := domain.Product{
		ID:              newProductID(name),
		Name:            name,
		CreatedAt:       now,
		UpdatedAt:       now,
		Differentiators: []string{},
		Pillars:         []string{},
		Kpis:            []domain.ProductKpi{},
	}
	if err := s.products.Save(p); err != nil {
		return domain.Product{}, err
	}
	return p, nil
}

// Update remplace intégralement le contenu du produit (l'UI envoie l'état
// complet après édition côté client, comme ProjectService.Update).
// L'horodatage createdAt d'origine est préservé.
func (s *ProductService) Update(id string, p domain.Product) (domain.Product, error) {
	existing, err := s.Get(id)
	if err != nil {
		return domain.Product{}, err
	}
	p.ID = id
	p.CreatedAt = existing.CreatedAt
	p.UpdatedAt = time.Now().UTC()
	if err := s.products.Save(p); err != nil {
		return domain.Product{}, err
	}
	return p, nil
}

func (s *ProductService) Delete(id string) error {
	return s.products.Delete(id)
}

func newProductID(name string) string {
	slug := strings.Trim(slugNonAlnum.ReplaceAllString(strings.ToLower(name), "-"), "-")
	if slug == "" {
		slug = "produit"
	}
	return fmt.Sprintf("%s-%s-%s", time.Now().UTC().Format("20060102"), slug, randomSuffix(4))
}
