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
	repo := storage.NewRepository(t.TempDir())
	svc := NewProjectService(repo)

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

// Un acteur sans nom (ligne vide/espaces) après nettoyage ne doit pas
// produire un ActorSummary fantôme.
func TestListActors_IgnoresBlankActorNames(t *testing.T) {
	repo := storage.NewRepository(t.TempDir())
	svc := NewProjectService(repo)

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
