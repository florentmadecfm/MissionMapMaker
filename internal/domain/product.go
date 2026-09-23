package domain

import "time"

// Product représente le produit lui-même (vision, différenciateurs,
// piliers stratégiques, KPI) — distinct d'une mission (Project, un
// parcours/story map précis) : un même Produit peut justifier plusieurs
// missions dans le temps. Persisté séparément (storage.ProductStore, un
// seul fichier partagé, pas un par produit) et référencé par une mission
// via Project.ProductID — jamais fusionné/dupliqué dans un fichier
// projet, contrairement à la fiche persona partagée (ADR-056).
type Product struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`

	// VisionStatement est la formulation de la vision produit (ex. format
	// Product Vision Board : cible/besoin/catégorie/bénéfice clé), texte
	// libre — rédigée à la main ou affinée depuis un brouillon informel
	// par l'IA (voir GenerateService.GenerateVisionRefinement), toujours
	// relue/éditée avant enregistrement, comme le reste des ébauches
	// générées dans l'app.
	VisionStatement string `json:"visionStatement,omitempty"`
	// Differentiators liste ce qui distingue ce produit des alternatives
	// (texte libre par entrée, pas de structure imposée).
	Differentiators []string `json:"differentiators"`
	// Pillars liste les quelques axes stratégiques du produit (3-5
	// typiquement) — texte libre, pas d'entité séparée avec son propre
	// id : légers par nature, référencés PAR NOM depuis ProductKpi.Pillar
	// ci-dessous plutôt que par id (même philosophie que
	// DraftActivity.ActorName, llm/draft.go : une référence texte pour
	// une entité qui n'a pas besoin d'identité propre).
	Pillars []string     `json:"pillars"`
	Kpis    []ProductKpi `json:"kpis"`
}

// ProductKpi est un indicateur cible du produit — rattaché ou non à un
// pilier stratégique (Pillar, référence texte vers Product.Pillars).
// Baseline/Target restent du texte libre plutôt qu'un type numérique
// imposé (même philosophie que Phase.Duration, ADR-065) : un KPI peut
// être qualitatif ou porter une unité/échelle qui ne se prête pas à un
// simple nombre.
type ProductKpi struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Definition string `json:"definition,omitempty"`
	Unit       string `json:"unit,omitempty"`
	Baseline   string `json:"baseline,omitempty"`
	Target     string `json:"target,omitempty"`
	Pillar     string `json:"pillar,omitempty"`
}

// Normalize garantit qu'aucune liste n'est nil après chargement depuis le
// disque ou une requête PUT incomplète — même raison que
// Project.Normalize (normalize.go) : encoding/json sérialise un slice nil
// en `null`, jamais `[]`, ce qui ferait planter le frontend.
func (p *Product) Normalize() {
	if p.Differentiators == nil {
		p.Differentiators = []string{}
	}
	if p.Pillars == nil {
		p.Pillars = []string{}
	}
	if p.Kpis == nil {
		p.Kpis = []ProductKpi{}
	}
}
