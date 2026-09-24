package domain

import (
	"errors"
	"fmt"
	"time"
)

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
	// ParentID référence un autre ProductKpi.ID du MÊME produit (Phase 3 du
	// plan Produit/Vision/KPI) — vide (la valeur par défaut, y compris pour
	// les KPI enregistrés avant l'introduction de ce champ) signifie un KPI
	// de premier niveau. L'arbre n'est jamais stocké imbriqué, seulement
	// dérivé à l'affichage par regroupement (voir kpiTree.ts côté
	// frontend) — Kpis reste une liste plate patchable par id, comme en
	// Phase 1. Validé par Product.Validate() ci-dessous (existence +
	// absence de cycle).
	ParentID string `json:"parentId,omitempty"`
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

var ErrInvalidProduct = errors.New("invalid product")

// Validate vérifie l'intégrité référentielle de ProductKpi.ParentID (Phase
// 3 du plan Produit/Vision/KPI) : un parent doit exister parmi les KPI du
// MÊME produit, et la chaîne de parenté ne doit jamais revenir sur le
// nœud de départ (cycle). Mirroring Project.Validate (validate.go) —
// même précédent que Specification.ParentID (référence intra-liste de
// même forme), qui valide déjà l'existence mais pas l'absence de cycle :
// un angle mort déjà présent en production sur les spécifications,
// corrigé ici plutôt que reproduit à l'identique. Le sélecteur "Sous-KPI
// de" (frontend, excludeSelfAndDescendants) empêche déjà ce cas en usage
// normal ; cette vérification serveur reste la ligne de défense qui ne
// dépend pas de l'UI (ex. appel direct à l'API).
func (p *Product) Validate() error {
	kpiIDs := make(map[string]bool, len(p.Kpis))
	for _, k := range p.Kpis {
		kpiIDs[k.ID] = true
	}

	for _, k := range p.Kpis {
		if k.ParentID == "" {
			continue
		}
		if !kpiIDs[k.ParentID] {
			return fmt.Errorf("%w: kpi %q references unknown parent %q", ErrInvalidProduct, k.ID, k.ParentID)
		}
		if err := checkKpiCycle(p.Kpis, k.ID); err != nil {
			return err
		}
	}

	return nil
}

// checkKpiCycle remonte la chaîne de parenté de startID (via ParentID) et
// échoue si elle revient sur startID lui-même — une boucle for bornée par
// len(kpis) plutôt qu'un ensemble de nœuds visités suffit : toute chaîne
// plus longue que le nombre de KPI existants contient nécessairement déjà
// un cycle.
func checkKpiCycle(kpis []ProductKpi, startID string) error {
	byID := make(map[string]ProductKpi, len(kpis))
	for _, k := range kpis {
		byID[k.ID] = k
	}

	current := startID
	for range kpis {
		k, ok := byID[current]
		if !ok || k.ParentID == "" {
			return nil
		}
		if k.ParentID == startID {
			return fmt.Errorf("%w: kpi %q parentage forms a cycle", ErrInvalidProduct, startID)
		}
		current = k.ParentID
	}
	return fmt.Errorf("%w: kpi %q parentage forms a cycle", ErrInvalidProduct, startID)
}
