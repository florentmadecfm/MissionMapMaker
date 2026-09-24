package domain

import (
	"errors"
	"testing"
)

func TestProductValidate_AcceptsEmptyParent(t *testing.T) {
	p := &Product{Kpis: []ProductKpi{{ID: "a", Name: "A"}}}
	if err := p.Validate(); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
}

func TestProductValidate_AcceptsValidParent(t *testing.T) {
	p := &Product{Kpis: []ProductKpi{
		{ID: "parent", Name: "Parent"},
		{ID: "child", Name: "Child", ParentID: "parent"},
	}}
	if err := p.Validate(); err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
}

func TestProductValidate_RejectsUnknownParent(t *testing.T) {
	p := &Product{Kpis: []ProductKpi{{ID: "a", Name: "A", ParentID: "inconnu"}}}
	err := p.Validate()
	if !errors.Is(err, ErrInvalidProduct) {
		t.Fatalf("expected ErrInvalidProduct, got %v", err)
	}
}

func TestProductValidate_RejectsSelfParent(t *testing.T) {
	p := &Product{Kpis: []ProductKpi{{ID: "a", Name: "A", ParentID: "a"}}}
	err := p.Validate()
	if !errors.Is(err, ErrInvalidProduct) {
		t.Fatalf("expected ErrInvalidProduct (self-cycle), got %v", err)
	}
}

// Reproduit un cycle indirect (a -> b -> a), au-delà d'un simple
// auto-parentage — la vérification doit détecter le cycle depuis
// N'IMPORTE LEQUEL de ses membres, pas seulement depuis le nœud modifié en
// dernier.
func TestProductValidate_RejectsIndirectCycle(t *testing.T) {
	p := &Product{Kpis: []ProductKpi{
		{ID: "a", Name: "A", ParentID: "b"},
		{ID: "b", Name: "B", ParentID: "a"},
	}}
	err := p.Validate()
	if !errors.Is(err, ErrInvalidProduct) {
		t.Fatalf("expected ErrInvalidProduct (indirect cycle), got %v", err)
	}
}

func TestProductValidate_AcceptsMultiLevelTree(t *testing.T) {
	p := &Product{Kpis: []ProductKpi{
		{ID: "root", Name: "Root"},
		{ID: "mid", Name: "Mid", ParentID: "root"},
		{ID: "leaf", Name: "Leaf", ParentID: "mid"},
	}}
	if err := p.Validate(); err != nil {
		t.Fatalf("expected no error for a valid 3-level tree, got %v", err)
	}
}
