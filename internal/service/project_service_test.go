package service

import (
	"testing"

	"missionmapmaker/internal/domain"
	"missionmapmaker/internal/storage"
)

// Deux projets différents peuvent avoir un acteur du même nom (à la casse
// et aux espaces de bord près) : ListActors doit les regrouper sous un
// seul ActorSummary, avec une mission par projet où ce nom apparaît,
// triées par récence (le projet mis à jour le plus récemment en premier).
func TestListActors_GroupsByNameCaseInsensitiveAndSortsByRecency(t *testing.T) {
	dir := t.TempDir()
	repo := storage.NewRepository(dir)
	svc := NewProjectService(repo, storage.NewActorProfileStore(dir))

	restaurant, err := svc.Create("Restaurant")
	if err != nil {
		t.Fatalf("Create restaurant: %v", err)
	}
	restaurant.Actors = []domain.Actor{{ID: "act1", Name: "Serveur", Color: "#111", Description: "Accueille les clients"}}
	if _, err := svc.Update(restaurant.ID, restaurant); err != nil {
		t.Fatalf("Update restaurant: %v", err)
	}

	hotel, err := svc.Create("Hôtel de luxe")
	if err != nil {
		t.Fatalf("Create hotel: %v", err)
	}
	// Casse et espaces différents : doit tout de même se regrouper avec
	// "Serveur" du restaurant.
	hotel.Actors = []domain.Actor{{ID: "act2", Name: " serveur ", Color: "#222", Description: "Sert les clients en chambre"}}
	if _, err := svc.Update(hotel.ID, hotel); err != nil {
		t.Fatalf("Update hotel: %v", err)
	}

	summaries, err := svc.ListActors()
	if err != nil {
		t.Fatalf("ListActors: %v", err)
	}
	if len(summaries) != 1 {
		t.Fatalf("expected 1 grouped actor, got %d: %+v", len(summaries), summaries)
	}

	serveur := summaries[0]
	if len(serveur.Projects) != 2 {
		t.Fatalf("expected 2 missions for Serveur, got %d", len(serveur.Projects))
	}
	// hotel a été mis à jour après restaurant : doit être en premier (le plus récent).
	if serveur.Projects[0].ProjectID != hotel.ID {
		t.Errorf("expected hotel first (most recent), got %q then %q", serveur.Projects[0].ProjectID, serveur.Projects[1].ProjectID)
	}
	if serveur.Projects[1].ProjectID != restaurant.ID {
		t.Errorf("expected restaurant second, got %q", serveur.Projects[1].ProjectID)
	}
	if serveur.Projects[0].Description != "Sert les clients en chambre" {
		t.Errorf("expected hotel-specific description preserved, got %q", serveur.Projects[0].Description)
	}
}

// La fiche persona (About/Bio/Goals/PainPoints, ADR-055) d'un acteur doit
// être partagée entre missions par nom (ADR-056) : modifiée dans une
// mission, elle doit apparaître à l'identique dans une autre mission
// portant un acteur du même nom — y compris pour un acteur qui n'avait
// encore aucune fiche avant cette modification.
func TestGet_SharesActorProfileAcrossMissionsByName(t *testing.T) {
	dir := t.TempDir()
	repo := storage.NewRepository(dir)
	svc := NewProjectService(repo, storage.NewActorProfileStore(dir))

	restaurant, err := svc.Create("Restaurant")
	if err != nil {
		t.Fatalf("Create restaurant: %v", err)
	}
	restaurant.Actors = []domain.Actor{{
		ID: "act1", Name: "Serveur", Color: "#111",
		About:      "Gère le service en salle",
		Bio:        "10 ans d'expérience",
		Goals:      []domain.ActorGoal{{ID: "g1", Text: "Satisfaire les clients"}},
		PainPoints: []domain.ActorPainPoint{{ID: "p1", Text: "Trop de tables en simultané"}},
	}}
	if _, err := svc.Update(restaurant.ID, restaurant); err != nil {
		t.Fatalf("Update restaurant: %v", err)
	}

	hotel, err := svc.Create("Hôtel de luxe")
	if err != nil {
		t.Fatalf("Create hotel: %v", err)
	}
	// Un acteur du même nom (casse différente), sans aucune fiche saisie
	// dans CETTE mission — doit tout de même récupérer la fiche partagée.
	hotel.Actors = []domain.Actor{{ID: "act2", Name: " serveur ", Color: "#222"}}
	if _, err := svc.Update(hotel.ID, hotel); err != nil {
		t.Fatalf("Update hotel: %v", err)
	}

	got, err := svc.Get(hotel.ID)
	if err != nil {
		t.Fatalf("Get hotel: %v", err)
	}
	actor := got.Actors[0]
	if actor.About != "Gère le service en salle" {
		t.Errorf("expected shared About, got %q", actor.About)
	}
	if actor.Bio != "10 ans d'expérience" {
		t.Errorf("expected shared Bio, got %q", actor.Bio)
	}
	if len(actor.Goals) != 1 || actor.Goals[0].Text != "Satisfaire les clients" {
		t.Errorf("expected shared Goals, got %+v", actor.Goals)
	}
	if len(actor.PainPoints) != 1 || actor.PainPoints[0].Text != "Trop de tables en simultané" {
		t.Errorf("expected shared PainPoints, got %+v", actor.PainPoints)
	}
	// La couleur, elle, reste propre à chaque mission (pas de fusion).
	if actor.Color != "#222" {
		t.Errorf("expected mission-specific color preserved, got %q", actor.Color)
	}

	// Modifier la fiche depuis l'HÔTEL doit se répercuter sur le RESTAURANT
	// au prochain Get — le partage n'est pas à sens unique.
	got.Actors[0].About = "Gère aussi le service en chambre"
	if _, err := svc.Update(hotel.ID, got); err != nil {
		t.Fatalf("Update hotel (2): %v", err)
	}
	backToRestaurant, err := svc.Get(restaurant.ID)
	if err != nil {
		t.Fatalf("Get restaurant (2): %v", err)
	}
	if backToRestaurant.Actors[0].About != "Gère aussi le service en chambre" {
		t.Errorf("expected profile update from hotel to propagate back to restaurant, got %q", backToRestaurant.Actors[0].About)
	}
}

// Un acteur nouvellement créé dans une mission (jamais passé par Get,
// donc localement vierge) ne doit PAS écraser la fiche déjà partagée
// sous ce nom par une autre mission — il doit au contraire l'adopter
// (voir ProjectService.syncActorProfiles, ADR-056). Sans ce garde-fou,
// ajouter un acteur "Serveur" fraîchement créé dans une nouvelle mission
// effacerait la fiche déjà remplie pour "Serveur" ailleurs.
func TestGet_NewActorAdoptsExistingSharedProfileInstead(t *testing.T) {
	dir := t.TempDir()
	repo := storage.NewRepository(dir)
	svc := NewProjectService(repo, storage.NewActorProfileStore(dir))

	restaurant, err := svc.Create("Restaurant")
	if err != nil {
		t.Fatalf("Create restaurant: %v", err)
	}
	restaurant.Actors = []domain.Actor{{
		ID: "act1", Name: "Serveur", Color: "#111",
		About: "Gère le service en salle",
		Goals: []domain.ActorGoal{{ID: "g1", Text: "Satisfaire les clients"}},
	}}
	if _, err := svc.Update(restaurant.ID, restaurant); err != nil {
		t.Fatalf("Update restaurant: %v", err)
	}

	hotel, err := svc.Create("Hôtel de luxe")
	if err != nil {
		t.Fatalf("Create hotel: %v", err)
	}
	// Acteur fraîchement créé côté client (jamais fusionné via Get) : les
	// champs de fiche sont vides par construction, comme le ferait
	// ProjectEditor.addActor() côté frontend.
	hotel.Actors = []domain.Actor{{ID: "act2", Name: "Serveur", Color: "#222"}}
	saved, err := svc.Update(hotel.ID, hotel)
	if err != nil {
		t.Fatalf("Update hotel: %v", err)
	}

	if saved.Actors[0].About != "Gère le service en salle" {
		t.Errorf("expected the new actor to adopt the existing shared profile, got About=%q", saved.Actors[0].About)
	}
	if len(saved.Actors[0].Goals) != 1 || saved.Actors[0].Goals[0].Text != "Satisfaire les clients" {
		t.Errorf("expected the new actor to adopt the existing shared Goals, got %+v", saved.Actors[0].Goals)
	}

	// La fiche du restaurant ne doit pas non plus avoir été effacée.
	backToRestaurant, err := svc.Get(restaurant.ID)
	if err != nil {
		t.Fatalf("Get restaurant: %v", err)
	}
	if backToRestaurant.Actors[0].About != "Gère le service en salle" {
		t.Errorf("expected restaurant's shared profile untouched, got About=%q", backToRestaurant.Actors[0].About)
	}
}

// Un acteur sans nom (ligne vide/espaces) après nettoyage ne doit pas
// produire un ActorSummary fantôme.
func TestListActors_IgnoresBlankActorNames(t *testing.T) {
	dir := t.TempDir()
	repo := storage.NewRepository(dir)
	svc := NewProjectService(repo, storage.NewActorProfileStore(dir))

	p, err := svc.Create("Projet test")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	p.Actors = []domain.Actor{{ID: "act1", Name: "   ", Color: "#111"}}
	if _, err := svc.Update(p.ID, p); err != nil {
		t.Fatalf("Update: %v", err)
	}

	summaries, err := svc.ListActors()
	if err != nil {
		t.Fatalf("ListActors: %v", err)
	}
	if len(summaries) != 0 {
		t.Fatalf("expected no actor summaries for a blank name, got %+v", summaries)
	}
}
