package domain

import (
	"errors"
	"fmt"
	"strings"
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

	// Specifications/TestScenarios portent les exigences et tests V&V du
	// produit — déplacés ici depuis Project/ProjectVariant (où ils
	// vivaient par mission, avec une copie indépendante par variante
	// Actuel/Cible) : une exigence qualifie le PRODUIT dans son ensemble,
	// pas une mission précise, et doit pouvoir tracer des activités
	// réparties sur PLUSIEURS missions rattachées au même produit — ce
	// qu'un stockage par mission ne permettait pas. Seule la variante
	// CIBLE de chaque mission participe désormais à la traçabilité
	// (Activity.TraceLinks, inchangé) : un produit vise l'état futur du
	// processus, pas son état actuel. Pas de copie par variante ici :
	// une seule liste, partagée par toutes les missions du produit.
	Specifications []Specification `json:"specifications"`
	TestScenarios  []TestScenario  `json:"testScenarios"`

	// PendingImpactReviewMissionIDs liste les missions récemment liées à ce
	// produit (ProductsScreen.handleLinkMission, frontend) dont l'impact sur
	// les spécifications/tests déjà existants n'a pas encore été évalué —
	// un bandeau dans l'onglet "Spécification et VV" (ProductSpecVVPanel.tsx)
	// invite alors à relancer la génération SSS/VV en tenant compte de CES
	// missions (voir GenerateSpecifications, existingSpecifications).
	// Vidé dès que l'analyse est lancée (ou explicitement ignorée) — jamais
	// revalidé après coup (un identifiant de mission supprimée/déliée y
	// reste jusqu'à la prochaine analyse ou liaison, sans conséquence :
	// seul le libellé affiché au frontend exploite cette liste, aucune
	// logique serveur n'en dépend). Référence des Project.id, jamais
	// contrôlée ici (même précédent que Activity.TraceLinks/KpiLinks :
	// structurellement inatteignable depuis ce package, voir project.go).
	PendingImpactReviewMissionIDs []string `json:"pendingImpactReviewMissionIds"`

	// PendingScopeReviewMissionIDs liste les id des missions récemment
	// DÉLIÉES de ce produit (ProductsScreen.handleUnlinkMission) —
	// symétrique de PendingImpactReviewMissionIDs ci-dessus, mais pour un
	// périmètre qui RÉTRÉCIT plutôt que s'étend. Des ID, pas des noms
	// (contrairement à la version initiale de ce champ) : le Project de la
	// mission n'est PAS supprimé par une déliaison (seul son productId est
	// retiré), reste donc consultable — le frontend s'en sert pour
	// recharger cette mission et calculer PRÉCISÉMENT quelles activités
	// (acteur + phase + nom, voir activityDelta.ts) qu'elle apportait ne
	// sont plus couvertes par aucune mission encore liée, affiché dans le
	// bandeau de ProductSpecVVPanel.tsx — jamais un nouvel appel LLM (rien
	// de nouveau à générer quand le périmètre rétrécit), une revue humaine
	// aidée d'un signalement déterministe. Vidé dès que la revue est
	// ouverte (ou explicitement ignorée) — ou jamais peuplé du tout si plus
	// aucune mission ne reste liée après ce retrait : voir
	// ProductsScreen.handleUnlinkMission, qui supprime alors directement
	// Specifications/TestScenarios (aucune mission restante pour justifier
	// une quelconque analyse).
	PendingScopeReviewMissionIDs []string `json:"pendingScopeReviewMissionIds"`
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
	if p.Specifications == nil {
		p.Specifications = []Specification{}
	}
	if p.TestScenarios == nil {
		p.TestScenarios = []TestScenario{}
	}
	if p.PendingImpactReviewMissionIDs == nil {
		p.PendingImpactReviewMissionIDs = []string{}
	}
	if p.PendingScopeReviewMissionIDs == nil {
		p.PendingScopeReviewMissionIDs = []string{}
	}
	for i := range p.TestScenarios {
		if p.TestScenarios[i].Steps == nil {
			p.TestScenarios[i].Steps = []TestStep{}
		}
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
	if strings.TrimSpace(p.Name) == "" {
		return fmt.Errorf("%w: name is required", ErrInvalidProduct)
	}

	// Intégrité référentielle des spécifications/tests — même contrôle que
	// l'ancien validateCollections (project.go/validate.go) avant leur
	// déplacement ici : un parent de spécification doit exister parmi les
	// spécifications du MÊME produit, un scénario de test doit référencer
	// une spécification existante. Contrairement à ProductKpi.ParentID
	// ci-dessous, pas de détection de cycle sur Specification.ParentID :
	// angle mort déjà présent avant ce déplacement (non corrigé ici, hors
	// périmètre de ce changement).
	specIDs := make(map[string]bool, len(p.Specifications))
	for _, s := range p.Specifications {
		specIDs[s.ID] = true
	}
	for _, s := range p.Specifications {
		if s.ParentID != "" && !specIDs[s.ParentID] {
			return fmt.Errorf("%w: specification %q references unknown parent %q", ErrInvalidProduct, s.ID, s.ParentID)
		}
	}
	for _, ts := range p.TestScenarios {
		if !specIDs[ts.SpecificationID] {
			return fmt.Errorf("%w: test scenario %q references unknown specification %q", ErrInvalidProduct, ts.ID, ts.SpecificationID)
		}
	}

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
