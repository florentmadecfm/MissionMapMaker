package domain

import "testing"

// Normalize doit garantir des tranches non nulles pour KpiLinks (Phase 3
// du plan Produit/Vision/KPI) — un projet enregistré avant l'introduction
// de ce champ désérialise KpiLinks à nil, qui se sérialiserait en JSON
// "null", impossible à itérer côté frontend (même raisonnement qu'ADR-022
// pour les autres collections).
func TestProjectNormalize_KpiLinksNeverNil(t *testing.T) {
	p := &Project{
		Name:       "Test",
		Phases:     []Phase{{ID: "ph1"}},
		Activities: []Activity{{ID: "act1", ActorID: "a1", PhaseID: "ph1"}},
		Target: &ProjectVariant{
			Phases:     []Phase{{ID: "ph2"}},
			Activities: []Activity{{ID: "act2", ActorID: "a2", PhaseID: "ph2"}},
		},
	}

	p.Normalize()

	if p.Phases[0].KpiLinks == nil {
		t.Fatalf("Phases[0].KpiLinks devrait être une tranche vide, pas nil")
	}
	if p.Activities[0].KpiLinks == nil {
		t.Fatalf("Activities[0].KpiLinks devrait être une tranche vide, pas nil")
	}
	if p.Target.Phases[0].KpiLinks == nil {
		t.Fatalf("Target.Phases[0].KpiLinks devrait être une tranche vide, pas nil")
	}
	if p.Target.Activities[0].KpiLinks == nil {
		t.Fatalf("Target.Activities[0].KpiLinks devrait être une tranche vide, pas nil")
	}
}
