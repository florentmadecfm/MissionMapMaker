# MissionMapMaker — Dossier d'architecture (v0.1, planification)

## Vue d'ensemble

MissionMapMaker est un outil local (backend Go + frontend React, persistance en
fichiers `.json` sur disque) qui permet de :

1. Construire une **story map** et un **diagramme de processus**
   (acteurs × phases × activités × interactions/informations échangées) à
   partir de langage naturel, assisté par un LLM — le diagramme est
   directement interactif (glisser-déposer, création de lien, sous-lignes/
   sous-colonnes, mise à jour incrémentale en langage naturel).
2. Tracer chaque **activité** vers un **référentiel de spécifications**
   structuré façon INCOSE (SSS, exigences système/sous-système) et vers des
   **scénarios de test V&V** (format Polarion) vérifiant ces spécifications.
3. Offrir une **vue dynamique par acteur** pour vérifier la cohérence de ses
   activités dans le processus (chronologie, entrées/sorties, trous,
   doublons), et une **vue transverse** du même acteur à travers plusieurs
   missions (projets) différentes.

Utilisateur cible v1 : un seul utilisateur local (PO / architecte / ingénieur
systèmes), pas de multi-utilisateur temps réel dans ce périmètre. La
génération assistée par LLM supporte plusieurs fournisseurs (Anthropic,
Mistral AI), configurables depuis l'interface ; les consignes ("skills")
envoyées au LLM pour chacune des 3 capacités de génération sont elles-mêmes
personnalisables depuis l'écran Paramètres.

## Contexte et contraintes

- Équipe/temps : projet piloté par un seul développeur (assisté par Claude
  Code), à livrer par incréments testables plutôt qu'en un bloc.
- Pas d'infra serveur cible : l'app doit pouvoir tourner en local (poste de
  l'utilisateur), sans base de données à administrer.
- Les données sont sensibles au sens "propriété intellectuelle projet" mais
  pas de contrainte réglementaire connue (pas de PII) à ce stade.
- Dépendance externe assumée : appel à l'API Claude pour l'extraction NL →
  modèle (nécessite une clé API et un accès réseau au moment de la
  génération ; le reste de l'app doit rester utilisable hors ligne).

## Architecture proposée

### Vue fonctionnelle

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend React                        │
│  ┌───────────────┐ ┌────────────────┐ ┌───────────────────┐ │
│  │  Saisie NL /   │ │ Diagramme de   │ │   Story Map        │ │
│  │  assistant LLM │ │ processus      │ │   (backbone/stories)│ │
│  └───────────────┘ └────────────────┘ └───────────────────┘ │
│  ┌───────────────┐ ┌────────────────┐                       │
│  │ Traçabilité    │ │ Vue par acteur │                       │
│  │ specs (INCOSE) │ │ (cohérence)    │                       │
│  └───────────────┘ └────────────────┘                       │
└───────────────────────────┬───────────────────────────────────┘
                             │ REST/JSON (localhost)
┌───────────────────────────┴───────────────────────────────────┐
│                          Backend Go                           │
│  api/ (handlers HTTP)  →  service/ (orchestration)            │
│         ├─ storage/  (lecture/écriture fichiers .json)        │
│         ├─ llm/      (client API Claude, prompts d'extraction)│
│         └─ domain/   (entités, règles métier, validation)     │
└─────────────────────────────────────────────────────────────┘
                             │
                     fichiers .json (1 dossier = 1 projet)
```

### Vue applicative

- **API REST locale** (Go, `net/http` + routeur léger type `chi`) écoutant
  sur `localhost`, consommée par le frontend React (Vite).
- **Stockage** : chaque projet = un dossier `data/<project-id>/` contenant
  `project.json` (état courant) + `backups/` (versions horodatées).
  Écriture atomique (fichier temporaire + rename) pour éviter la corruption.
- **LLM** : le backend appelle l'API du fournisseur configuré (Anthropic ou
  Mistral AI) côté serveur (la clé API ne transite jamais côté navigateur).
  Le résultat d'extraction est toujours renvoyé au frontend **pour
  relecture/édition avant sauvegarde** — jamais d'écriture automatique sans
  validation utilisateur, y compris pour les mises à jour incrémentales du
  diagramme (le contexte du projet déjà existant est fourni au LLM pour
  qu'il puisse cibler une modification plutôt que de dupliquer).
- **Packaging** : le build React est embarqué dans le binaire Go via
  `go:embed` → un seul exécutable à distribuer, qui sert l'UI et l'API ;
  un workflow GitHub Actions construit ces binaires pour Linux/Windows/
  macOS (Intel et Apple Silicon) à chaque release.

### Vue technique

- Backend : Go ≥ 1.24, stdlib `net/http` uniquement (routage par patterns
  natifs depuis Go 1.22), pas de framework/routeur tiers.
- Frontend : React + TypeScript, Vite ; état applicatif en `useState`/props
  (pas de store global ni de couche de cache réseau dédiée — la taille de
  l'app ne le justifie pas), rendu du diagramme via **React Flow**
  (nœuds/arêtes custom, pan/zoom, swimlanes acteur × phase avec
  sous-colonnes/sous-lignes).
- Déploiement : exécutable unique local (pas de conteneur nécessaire pour
  le v1) ; Docker optionnel plus tard si besoin de partage d'équipe.

## Modèle de données (JSON)

Un projet = un objet racine. Les activités sont l'entité pivot : elles
portent à la fois la position dans le diagramme de processus (acteur +
phase), les user stories du story map, et les liens de traçabilité vers les
spécifications.

```jsonc
{
  "id": "proj_2026-09-08_mission-x",
  "name": "Mission X",
  "createdAt": "2026-09-08T09:00:00Z",
  "updatedAt": "2026-09-08T09:00:00Z",

  "actors": [
    { "id": "act_po", "name": "Product Owner", "color": "#2563eb", "description": "", "subLanes": 0 }
  ],

  "phases": [
    { "id": "ph_cadrage", "name": "Cadrage", "order": 1, "subColumns": 0 },
    { "id": "ph_execution", "name": "Exécution", "order": 2, "subColumns": 0 }
  ],

  "activities": [
    {
      "id": "act_write_vision",
      "name": "Rédiger la vision produit",
      "actorId": "act_po",
      "phaseId": "ph_cadrage",
      "order": 1,
      "column": 0,
      "subRow": 0,
      "description": "",
      "sourceText": "texte en langage naturel d'origine, si généré par LLM",
      "userStories": [
        {
          "id": "us_001",
          "title": "En tant que PO, je veux formaliser la vision...",
          "priority": "must",
          "release": "MVP",
          "status": "todo"
        }
      ],
      "traceLinks": ["spec_sss_003"]
    }
  ],

  "interactions": [
    {
      "id": "int_001",
      "fromActivityId": "act_write_vision",
      "toActivityId": "act_review_vision",
      "information": "Document de vision produit",
      "description": ""
    }
  ],

  "specifications": [
    {
      "id": "spec_sss_003",
      "code": "SSS-003",
      "type": "StakeholderNeed",
      "text": "Le système doit permettre de formaliser un besoin métier initial.",
      "rationale": "",
      "parentId": null,
      "status": "draft",
      "priority": "must"
    }
  ],

  "testScenarios": [
    {
      "id": "test_001",
      "code": "TEST-001",
      "title": "Vérifier la formalisation de la vision produit",
      "specificationId": "spec_sss_003",
      "preconditions": "",
      "steps": [{ "action": "Saisir la vision produit", "expectedResult": "La vision est enregistrée" }],
      "status": "draft"
    }
  ]
}
```

Notes de modélisation :
- `activities[].userStories` porte le découpage story-map (backbone =
  activités ordonnées par phase ; stories = lignes de priorité/release sous
  chaque activité — modèle Jeff Patton).
- `interactions` relie deux activités et nomme l'information échangée : ce
  sont les arêtes du diagramme de processus.
- `activities[].column` / `phases[].subColumns` : sous-colonne explicite
  d'une activité au sein de sa cellule (acteur, phase) et réservation
  manuelle d'une sous-colonne supplémentaire pour une phase, avant même
  d'y avoir une activité (voir ADR-018/020/039).
- `activities[].subRow` / `actors[].subLanes` : équivalent sur l'axe
  vertical — sous-ligne explicite d'une activité au sein de la ligne de
  son acteur, et réservation manuelle d'une seconde ligne pour un acteur
  (voir ADR-039).
- `traceLinks` est porté par l'activité pour simplifier la vue "par
  acteur" (une activité connaît directement ses specs), avec un miroir
  possible côté `specifications[].linkedActivityIds` si besoin de requêtes
  inverses fréquentes (à arbitrer en Lot 3 selon usage réel).
- Types de specs v1 (inspirés INCOSE, non exhaustifs) :
  `StakeholderNeed` (SSS), `SystemRequirement`, `SubsystemRequirement`,
  `VerificationCriterion`. Hiérarchie via `parentId`.

## Découpage des modules Go

```
cmd/server/main.go          — point d'entrée, wiring, config
internal/domain/            — entités (Project, Actor, Activity, Spec...), règles de validation
internal/storage/           — repository fichiers JSON (lecture/écriture atomique, backups)
internal/llm/                — clients multi-fournisseurs (Anthropic, Mistral), prompts/skills par défaut
internal/config/             — configuration locale persistée (fournisseur/clé API, skills personnalisés)
internal/service/           — orchestration (use cases : CRUD projet, génération assistée, index acteurs...)
internal/api/                — handlers HTTP, DTOs, routing
```

## Découpage des composants React

```
src/features/nl-input/         — capture de texte libre, appel LLM, écran de relecture/édition avant commit
src/features/process-diagram/  — diagramme swimlane acteur × phase, interactif (React Flow)
src/features/project-shell/    — coquille applicative (liste de projets, onglets, édition CRUD, export/import)
src/features/specifications/   — arbre INCOSE + matrice de traçabilité activité ↔ spec ↔ test V&V
src/features/actor-view/       — vue dynamique par acteur au sein d'un projet (chronologie, E/S, incohérences)
src/features/actor-missions/   — vue transverse d'un acteur à travers plusieurs projets
src/features/settings/         — connexion au LLM (fournisseur/clé/URL) et personnalisation des skills
src/api/                        — client REST vers le backend Go
```

## Décisions d'architecture (synthèse — détail dans `docs/decisions-log.md`)

| # | Décision | Justification |
|---|----------|---------------|
| 1 | Persistance en fichiers `.json` via le backend Go (pas de DB) | Simplicité, portabilité, diff-friendly, adapté à un usage local mono-utilisateur |
| 2 | Extraction NL → modèle via API Claude côté backend | Meilleure qualité d'extraction ; clé API jamais exposée au navigateur ; résultat toujours relu avant sauvegarde |
| 3 | Référentiel de specs inspiré INCOSE (pas conformité complète) | Rigueur suffisante pour la traçabilité sans le coût d'une implémentation complète du handbook |
| 4 | React Flow pour le diagramme de processus | Évite de réinventer pan/zoom/drag ; nœuds custom pour swimlanes |
| 5 | MVP = story mapping + diagramme de processus, saisie manuelle d'abord | Fondation dont dépendent les specs et la vue acteur ; permet de valider le modèle de données avant d'ajouter le LLM |
| 6 | Packaging final en binaire unique Go (`go:embed`) | Distribution simple, pas d'infra à gérer |

## Risques et mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Extraction LLM imprécise/hallucinée | Modèle de données pollué | Écran de relecture/édition obligatoire avant sauvegarde ; jamais d'auto-save |
| Dépendance à une clé API / coût | Fonction NL indisponible sans clé | Mode de saisie manuelle structurée toujours disponible en secours |
| Corruption de fichier lors de l'écriture | Perte de données projet | Écriture atomique (tmp + rename) + backups horodatés |
| Absence de DB → pas de requêtes complexes | Vue par acteur / traçabilité lentes si gros projet | Modèle dénormalisé (traceLinks sur l'activité), calculs en mémoire côté Go pour projets de taille raisonnable |
| Dérive de complexité du modèle INCOSE | Sur-ingénierie du référentiel specs | V1 limité à 4 types de specs, extensible plus tard |

## Roadmap par lots livrables

- **Lot 0 — Socle** : scaffolding Go (`cmd/server`, `internal/*`) + React
  (Vite/TS), CRUD projet, stockage JSON, écran vide fonctionnel de bout en
  bout (créer/ouvrir/sauvegarder un projet).
- **Lot 1 — MVP Story mapping + diagramme (saisie manuelle)** : CRUD
  acteurs/phases/activités/interactions, diagramme swimlane (React Flow),
  story map backbone + stories.
- **Lot 2 — Génération assistée par LLM** : intégration API Claude,
  prompt d'extraction NL → acteurs/phases/activités/interactions, écran de
  relecture/édition avant commit.
- **Lot 3 — Traçabilité specs (INCOSE-inspiré)** : modèle de
  spécifications, éditeur, liens activité ↔ spec, matrice de traçabilité.
- **Lot 4 — Vue dynamique par acteur** : chronologie des activités d'un
  acteur, entrées/sorties consommées/produites, détection d'incohérences
  (trous, activités orphelines, boucles).
- **Lot 5 — Durcissement** : backups automatiques (horodatés, à chaque
  écriture) ; export/import Excel multi-onglets (voir ADR-035) ; tests Go
  (`internal/*`) ; packaging binaire unique (`go:embed`) distribué via
  GitHub Actions.

Au-delà de ce plan initial, plusieurs capacités ont été ajoutées après le
MVP : diagramme interactif (glisser-déposer, création de lien, sous-lignes/
sous-colonnes), mise à jour du diagramme en langage naturel avec contexte
du projet existant, multi-fournisseurs LLM avec skills personnalisables,
vue transverse d'un acteur sur plusieurs missions — voir le détail de
chaque décision dans `docs/decisions-log.md`.
