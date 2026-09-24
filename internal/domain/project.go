// Package domain définit le modèle métier de Pulse.MissionMap : un projet
// regroupe des acteurs, des phases, des activités (avec leurs user stories
// et leurs liens de traçabilité), des interactions et des spécifications.
package domain

import "time"

type Project struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`

	Actors         []Actor         `json:"actors"`
	Phases         []Phase         `json:"phases"`
	Activities     []Activity      `json:"activities"`
	Interactions   []Interaction   `json:"interactions"`
	Specifications []Specification `json:"specifications"`
	TestScenarios  []TestScenario  `json:"testScenarios"`

	// Target, quand renseigné, est un second état ("cible"/to-be) du
	// diagramme de cette même mission, distinct de l'état "actuel" porté
	// par les 6 collections ci-dessus — une copie indépendante complète
	// (ses propres acteurs/phases/activités/interactions/specs/tests),
	// mais qui reste PARTIE de ce projet plutôt qu'un second projet séparé
	// lié par un groupe de variantes : la cible d'une mission n'apparaît
	// jamais comme une entrée à part dans le panneau de gauche. nil tant
	// qu'aucune cible n'a été créée (bouton Actuel/Cible, ou
	// automatiquement à la première résolution de point de friction, voir
	// mergePainPointResolution.ts).
	Target *ProjectVariant `json:"target,omitempty"`

	// ProductID référence le Produit (storage.ProductStore, ID de
	// domain.Product) auquel cette mission est rattachée — nil tant
	// qu'aucun produit n'a été choisi (sélecteur "Produit associé",
	// onglet Édition), entièrement rétrocompatible. Contrairement à la
	// fiche persona partagée (Actor.About/Bio/..., ADR-056, fusionnée par
	// nom à chaque chargement), un Produit est une entité de première
	// classe choisie explicitement par id : aucune fusion automatique,
	// aucune donnée dupliquée depuis storage.ProductStore dans ce champ.
	ProductID *string `json:"productId,omitempty"`
}

// ProjectVariant est le contenu d'un second état ("cible") du diagramme
// d'un projet — mêmes 6 collections qu'un Project, plus un Label affiché
// dans le sélecteur Actuel/Cible (ex. "Cible", éditable).
type ProjectVariant struct {
	Label          string          `json:"label"`
	Actors         []Actor         `json:"actors"`
	Phases         []Phase         `json:"phases"`
	Activities     []Activity      `json:"activities"`
	Interactions   []Interaction   `json:"interactions"`
	Specifications []Specification `json:"specifications"`
	TestScenarios  []TestScenario  `json:"testScenarios"`
}

type Actor struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Color       string `json:"color"`
	Description string `json:"description"`
	// SubLanes réserve manuellement un nombre de sous-lignes pour cet
	// acteur (une "ligne" empilée par sous-ligne, partagée par toutes les
	// phases) — 0 ou 1 (la valeur par défaut, y compris pour les projets
	// enregistrés avant l'introduction de ce champ) signifie une seule
	// ligne. Permet de réserver une seconde ligne avant même d'y avoir
	// une activité (bouton "+" sur l'en-tête d'acteur du diagramme),
	// symétrique de Phase.SubColumns sur l'axe vertical.
	SubLanes int `json:"subLanes"`
	// Backstage place cet acteur derrière la ligne de visibilité (pratique
	// de service blueprint) : false (la valeur par défaut, y compris pour
	// les acteurs enregistrés avant l'introduction de ce champ) signifie
	// FRONT-STAGE, visible/en interaction directe avec le client — true
	// signifie BACK-STAGE (support interne, jamais en contact direct). Ne
	// change aucune donnée, seulement l'ordre d'affichage des lignes du
	// diagramme (front-stage groupées en haut, back-stage en bas, tri
	// stable qui conserve l'ordre relatif au sein de chaque groupe — voir
	// computeLayout, layout.ts) et l'affichage d'une ligne de séparation
	// entre les deux groupes quand ils sont tous deux non vides (ADR-064).
	Backstage bool `json:"backstage,omitempty"`
	// Fiche persona de cet acteur (ADR-055) : About/Bio en texte libre,
	// Goals/PainPoints en listes d'entrées indépendantes (même patron que
	// Activity.PainPoints, ADR-052) — PainPoints ici décrit les irritants
	// du MÉTIER de la personne en général, distincts des points de
	// friction propres à une activité précise du diagramme. Partagée entre
	// toutes les missions où un acteur de même nom apparaît (ADR-056) :
	// ProjectService les fusionne depuis storage.ActorProfileStore à
	// chaque chargement, et les réécrit dans ce store partagé à chaque
	// sauvegarde — ces 4 champs sont donc toujours écrasés par la version
	// partagée au prochain Get, ce qui n'enregistre ici qu'un instantané
	// (jamais lu directement par autre chose que ce mécanisme).
	About      string           `json:"about"`
	Bio        string           `json:"bio"`
	Goals      []ActorGoal      `json:"goals"`
	PainPoints []ActorPainPoint `json:"painPoints"`
	// PortraitImage est un portrait/sketch de ce persona généré par IA
	// (ADR-073 — génération d'image via l'Agents API Mistral, outil
	// image_generation, FLUX1.1 Pro Ultra), encodé en data URL
	// ("data:image/png;base64,...") prête à poser directement dans un
	// attribut src — pas de stockage de fichier séparé, cohérent avec le
	// reste de la persistance de l'app (fichiers JSON autonomes). Partagé
	// entre missions au même titre qu'About/Bio/Goals/PainPoints
	// ci-dessus (ADR-056) : vide tant qu'aucun portrait n'a été généré.
	PortraitImage string `json:"portraitImage,omitempty"`
}

type ActorGoal struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

type ActorPainPoint struct {
	ID   string `json:"id"`
	Text string `json:"text"`
}

// ActorProfile est la fiche persona d'un acteur (mêmes 5 champs qu'Actor
// ci-dessus), stockée une seule fois PAR NOM plutôt que par acteur — voir
// storage.ActorProfileStore et ADR-056.
type ActorProfile struct {
	About         string           `json:"about"`
	Bio           string           `json:"bio"`
	Goals         []ActorGoal      `json:"goals"`
	PainPoints    []ActorPainPoint `json:"painPoints"`
	PortraitImage string           `json:"portraitImage,omitempty"`
}

type Phase struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Order int    `json:"order"`
	// SubColumns réserve manuellement un nombre de sous-colonnes pour
	// cette phase (partagées par tous les acteurs) — 0 ou 1 (valeur par
	// défaut) signifie une seule colonne. Complémentaire à la répartition
	// automatique déjà portée par Activity.Column : permet de réserver une
	// seconde colonne avant même d'y avoir une activité (bouton "+" sur
	// l'en-tête de phase du diagramme).
	SubColumns int `json:"subColumns"`
	// Icon est un emoji unique illustrant concrètement cette phase (ex.
	// "🍽️" pour une phase de repas), affiché en grand au-dessus de son nom
	// dans l'en-tête du diagramme façon storyboard (ADR-059). Proposé par
	// le LLM à l'extraction du processus, mais éditable comme le reste
	// (onglet Édition) ; vide par défaut, y compris pour les phases créées
	// avant l'introduction de ce champ — aucun repli visuel forcé.
	Icon string `json:"icon"`
	// Duration est un texte libre indiquant la durée typique de cette
	// étape (ex. "15 min", "2-3 jours") — texte libre plutôt qu'une durée
	// structurée (unités trop variables d'une mission à l'autre : minutes,
	// jours, semaines...), même philosophie qu'Interaction.Condition
	// (ADR-060). Vide par défaut, y compris pour les phases enregistrées
	// avant l'introduction de ce champ : aucune durée affichée (ADR-065).
	Duration string `json:"duration,omitempty"`
	// SatisfactionScore note le ressenti client typique à cette étape, sur
	// une échelle de 1 (très insatisfait) à 5 (très satisfait) — pratique
	// de "courbe de satisfaction" en service blueprint. 0 (valeur par
	// défaut, y compris pour les phases enregistrées avant l'introduction
	// de ce champ) signifie NON RENSEIGNÉ, distinct d'un score neutre (qui
	// serait 3) : une phase sans score n'apparaît pas dans la courbe
	// (ADR-065).
	SatisfactionScore int `json:"satisfactionScore,omitempty"`
	// KpiLinks référence les KPI (Product.Kpis[].ID, de premier niveau ou
	// sous-KPI) du produit associé à la mission (Project.ProductID) que
	// cette phase permet de mesurer (Phase 3 du plan Produit/Vision/KPI).
	// Aucune validation référentielle ici (voir Activity.KpiLinks
	// ci-dessous, même raisonnement) : un id qui ne correspond plus à
	// aucun KPI du produit reste un lien orphelin sans conséquence côté
	// serveur, affiché explicitement comme tel côté frontend.
	KpiLinks []string `json:"kpiLinks"`
}

type Activity struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	ActorID string `json:"actorId"`
	PhaseID string `json:"phaseId"`
	Order   int    `json:"order"`
	// Column indique, pour les activités de cet acteur dans cette phase,
	// une sous-colonne explicitement choisie (glisser-déposer sur le
	// diagramme) plutôt que la répartition automatique habituelle. 0 (la
	// valeur par défaut, y compris pour les projets enregistrés avant
	// l'introduction de ce champ) signifie "pas de choix explicite" :
	// cette activité participe à l'empilement automatique par Order,
	// exactement comme avant. Une valeur strictement positive fige sa
	// position même si l'acteur n'a pas d'autre activité dans cette
	// phase — utile pour aligner une activité isolée sur une des
	// sous-colonnes qu'une autre acteur a fait apparaître dans la phase.
	Column int `json:"column"`
	// SubRow indique, pour les activités de cet acteur, une sous-ligne
	// explicitement choisie (glisser-déposer sur le diagramme) — 0 (la
	// valeur par défaut) est la ligne principale de l'acteur. Contrairement
	// à Column, il n'y a pas de répartition automatique par empilement :
	// une activité reste sur la ligne principale tant qu'elle n'a pas été
	// explicitement déplacée sur une autre ligne, symétrique de Column
	// mais sur l'axe vertical (partagée par toutes les phases pour cet
	// acteur, comme Actor.SubLanes).
	SubRow int `json:"subRow"`
	// OffsetX/OffsetY affinent la position de la carte À L'INTÉRIEUR de sa
	// case (acteur/phase/sous-ligne/sous-colonne ci-dessus, qui reste seule
	// à déterminer l'ACTEUR/LA PHASE affectés) — glisser-déposer sur le
	// diagramme d'une petite distance, sans traverser toute la largeur/
	// hauteur d'une case. 0 (valeur par défaut, y compris pour les projets
	// enregistrés avant l'introduction de ce champ) : position par défaut
	// dans la case, comme avant. Bornés à l'espace encore libre dans la
	// case (voir MAX_OFFSET_X/Y, layout.ts) pour ne jamais chevaucher une
	// case voisine — un décalage plus grand doit passer par un vrai
	// changement de case (voir ADR-051).
	OffsetX     float64 `json:"offsetX"`
	OffsetY     float64 `json:"offsetY"`
	Description string  `json:"description"`
	SourceText  string  `json:"sourceText,omitempty"`

	UserStories []UserStory `json:"userStories"`
	TraceLinks  []string    `json:"traceLinks"` // specification IDs
	// PainPoints liste les points de friction constatés pour cette
	// activité (texte libre, ex. "le client attend souvent plusieurs
	// minutes avant d'être servi") — distinct de Description (résumé de
	// l'activité elle-même) : plusieurs points de friction indépendants
	// peuvent coexister pour une même activité, ajoutés/retirés un par un
	// depuis le diagramme (voir ActivityDetailModal.tsx).
	PainPoints []PainPoint `json:"painPoints"`
	// KpiLinks référence les KPI (Product.Kpis[].ID, de premier niveau ou
	// sous-KPI) du produit associé à la mission (Project.ProductID) que
	// cette activité permet de mesurer (Phase 3 du plan Produit/Vision/
	// KPI). Pas de validation référentielle dans Project.Validate()
	// (validate.go) : Product est un magasin séparé (storage.ProductStore),
	// structurellement inatteignable depuis ici — même raisonnement déjà
	// documenté pour Project.ProductID (Phase 1). Un id qui ne correspond
	// plus à aucun KPI du produit reste un lien orphelin sans conséquence
	// côté serveur ; côté frontend, le badge de compte (layout.ts) le
	// filtre plutôt que de compter la longueur brute.
	KpiLinks []string `json:"kpiLinks"`
}

type PainPoint struct {
	ID   string `json:"id"`
	Text string `json:"text"`
	// ResolvedBySpecID référence la spécification (SSS) créée quand une
	// solution proposée par le LLM pour CE point de friction a été choisie
	// (ADR-066) — vide tant qu'aucune solution n'a été retenue. Pointe vers
	// Specification.ID, pas vers un code ("SSS-001") : reste valide même si
	// des specs sont réordonnées/renumérotées ailleurs.
	ResolvedBySpecID string `json:"resolvedBySpecId,omitempty"`
}

type UserStory struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Priority string `json:"priority"` // must | should | could | wont
	Release  string `json:"release"`
	Status   string `json:"status"` // todo | in_progress | done
}

type Interaction struct {
	ID             string `json:"id"`
	FromActivityID string `json:"fromActivityId"`
	ToActivityID   string `json:"toActivityId"`
	Information    string `json:"information"`
	Description    string `json:"description,omitempty"`
	// Condition, quand renseignée, fait de cette interaction un
	// EMBRANCHEMENT plutôt qu'un flux systématique : elle ne se produit
	// que si cette condition est vraie (ex. "paiement refusé"), au lieu de
	// toujours suivre l'activité de départ. Vide par défaut (comportement
	// inchangé, y compris pour les projets enregistrés avant
	// l'introduction de ce champ) : une interaction sans condition
	// continue de représenter un flux normal, pas un embranchement
	// (ADR-060). Volontairement un simple texte libre plutôt qu'un type de
	// porte façon BPMN (exclusive/parallèle/inclusive) : reste lisible
	// comme une étiquette de flèche, cohérent avec le reste du diagramme.
	Condition string `json:"condition,omitempty"`
	// PhysicalEvidence liste les preuves physiques perceptibles par le
	// client lors de cet échange (ex. "reçu papier", "email de
	// confirmation", "étiquette bagage") — pratique de service blueprint.
	// Texte libre plutôt qu'une liste structurée, même philosophie que
	// Condition ci-dessus et que Phase.Duration (ADR-060/065) : un
	// utilisateur qui veut plusieurs preuves les sépare lui-même (virgule,
	// retour à la ligne). Vide par défaut, y compris pour les interactions
	// enregistrées avant l'introduction de ce champ : aucune preuve
	// affichée (ADR-071). Volontairement absent des schémas de génération
	// LLM (llm/schemas.go) — manuel uniquement, comme Duration/
	// SatisfactionScore de Phase, pas comme Condition (ADR-060), qui l'est.
	PhysicalEvidence string `json:"physicalEvidence,omitempty"`
}

type SpecificationType string

const (
	SpecStakeholderNeed       SpecificationType = "StakeholderNeed"
	SpecSystemRequirement     SpecificationType = "SystemRequirement"
	SpecSubsystemRequirement  SpecificationType = "SubsystemRequirement"
	SpecVerificationCriterion SpecificationType = "VerificationCriterion"
)

type Specification struct {
	ID        string            `json:"id"`
	Code      string            `json:"code"`
	Type      SpecificationType `json:"type"`
	Text      string            `json:"text"`
	Rationale string            `json:"rationale,omitempty"`
	ParentID  string            `json:"parentId,omitempty"`
	Status    string            `json:"status"` // draft | approved | deprecated
	Priority  string            `json:"priority"`
}

// TestStep est une étape d'un scénario de test V&V (Vérification &
// Validation) : une action et le résultat attendu qu'elle doit produire,
// sur le modèle des tableaux d'étapes Polarion (colonnes "Step" /
// "Expected Result").
type TestStep struct {
	Action         string `json:"action"`
	ExpectedResult string `json:"expectedResult"`
}

// TestScenario est un scénario de test de vérification/validation d'une
// spécification (typiquement une SSS), au format V&V générique inspiré de
// Polarion : préconditions puis étapes numérotées action/résultat
// attendu. Comme Specification, un scénario peut être proposé par le LLM
// (voir internal/llm) ou saisi à la main ; SpecificationID est toujours
// requis (un scénario vérifie une spécification précise, jamais
// "flottant").
type TestScenario struct {
	ID              string     `json:"id"`
	Code            string     `json:"code"`
	Title           string     `json:"title"`
	SpecificationID string     `json:"specificationId"`
	Preconditions   string     `json:"preconditions,omitempty"`
	Steps           []TestStep `json:"steps"`
	Status          string     `json:"status"` // draft | approved | deprecated
}
