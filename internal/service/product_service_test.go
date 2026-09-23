package service

import (
	"errors"
	"testing"

	"pulse-missionmap/internal/domain"
	"pulse-missionmap/internal/storage"
)

func TestProductService_CreateGetUpdateDelete(t *testing.T) {
	dir := t.TempDir()
	svc := NewProductService(storage.NewProductStore(dir))

	created, err := svc.Create("Pulse.MissionMap")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if created.ID == "" {
		t.Fatalf("Create devrait renvoyer un id non vide")
	}
	if created.Differentiators == nil || created.Pillars == nil || created.Kpis == nil {
		t.Fatalf("Create devrait initialiser des listes vides, pas nil : %+v", created)
	}

	fetched, err := svc.Get(created.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if fetched.Name != "Pulse.MissionMap" {
		t.Fatalf("Get renvoie un nom inattendu : %q", fetched.Name)
	}

	fetched.VisionStatement = "Pour les PO, notre outil est le seul à relier vision et diagramme."
	fetched.Differentiators = []string{"Lien direct mission map <-> KPI"}
	fetched.Pillars = []string{"Adoption", "Excellence delivery"}
	fetched.Kpis = []domain.ProductKpi{{ID: "kpi1", Name: "Taux d'adoption PO", Pillar: "Adoption"}}
	updated, err := svc.Update(created.ID, fetched)
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if updated.CreatedAt != created.CreatedAt {
		t.Fatalf("Update ne devrait pas changer CreatedAt : %v != %v", updated.CreatedAt, created.CreatedAt)
	}
	if len(updated.Kpis) != 1 || updated.Kpis[0].Name != "Taux d'adoption PO" {
		t.Fatalf("Update devrait persister les KPI : %+v", updated.Kpis)
	}

	list, err := svc.List()
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("List devrait renvoyer 1 produit, obtenu %d", len(list))
	}

	if err := svc.Delete(created.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := svc.Get(created.ID); !errors.Is(err, storage.ErrProductNotFound) {
		t.Fatalf("Get après Delete devrait renvoyer ErrProductNotFound, obtenu %v", err)
	}
}

func TestProductService_CreateRequiresName(t *testing.T) {
	dir := t.TempDir()
	svc := NewProductService(storage.NewProductStore(dir))

	if _, err := svc.Create("   "); err == nil {
		t.Fatalf("Create avec un nom vide devrait échouer")
	}
}
