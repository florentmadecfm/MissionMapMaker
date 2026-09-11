# MissionMapMaker — Architecture

## Vue d'ensemble

Outil local (backend Go + frontend React, persistance en fichiers `.json`
sur disque) pour construire une **story map** et un **diagramme de
processus** (acteurs × phases × activités × interactions) à partir de
langage naturel assisté par LLM, tracer chaque activité vers un
**référentiel de spécifications** inspiré INCOSE et des **scénarios de
test V&V** (format Polarion), et vérifier la cohérence d'un acteur via une
vue dynamique (au sein d'un projet, et à travers plusieurs missions).

Utilisateur cible : un seul utilisateur local, pas de multi-utilisateur
temps réel. La génération assistée supporte plusieurs fournisseurs LLM
(Anthropic, Mistral AI), configurables depuis l'interface ; les prompts
envoyés au LLM sont eux-mêmes personnalisables (écran Paramètres).

## Architecture

```
Frontend React (Vite) ── REST/JSON (localhost) ──> Backend Go
                                                       api/     (handlers HTTP)
                                                       service/ (orchestration)
                                                       storage/ (fichiers .json)
                                                       llm/     (Anthropic, Mistral)
                                                       domain/  (entités, validation)
                                                       config/  (config locale persistée)
```

- **API REST locale** (Go, `net/http` stdlib, pas de framework tiers) sur
  `localhost`, consommée par le frontend React.
- **Stockage** : chaque projet = `data/<project-id>/project.json` +
  `backups/` horodatés, écriture atomique (fichier temporaire + rename).
  La fiche persona d'un acteur (voir ADR-056) est en plus répliquée dans
  un store partagé unique, `data/actor-profiles.json`, associé par nom
  d'acteur plutôt que par projet.
- **LLM** : le backend appelle l'API du fournisseur configuré côté
  serveur (la clé ne transite jamais côté navigateur). Le résultat est
  toujours renvoyé au frontend pour relecture/édition avant sauvegarde —
  jamais d'écriture automatique, y compris pour les mises à jour
  incrémentales (le processus déjà existant est fourni en contexte au LLM).
- **Packaging** : le build React est embarqué dans le binaire Go via
  `go:embed` (un seul exécutable, API + interface) ; GitHub Actions
  construit ces binaires pour Linux/Windows/macOS à chaque release.

## Modules Go (`internal/`)

```
domain/   — entités (Project, Actor, Activity, Specification...), validation, normalisation
storage/  — repository fichiers JSON (projets + store partagé des fiches acteur)
llm/      — clients multi-fournisseurs (Anthropic, Mistral), schémas d'outils, prompts par défaut
config/   — configuration locale persistée (fournisseur/clé API, prompts personnalisés)
service/  — orchestration (CRUD projet, génération assistée, index acteurs transverse)
api/      — handlers HTTP, routing
```

`cmd/server/main.go` fait le wiring de démarrage.

## Modules React (`web/src/features/`)

```
nl-input/         — capture de texte libre, appel LLM, relecture/édition avant commit
process-diagram/  — diagramme swimlane acteur × phase, interactif (React Flow)
project-shell/    — coquille applicative (liste de projets, onglets, export/import Excel)
specifications/   — arbre INCOSE + matrice de traçabilité activité ↔ spec ↔ test V&V
actor-view/       — vue dynamique par acteur au sein d'un projet, fiche persona
actor-missions/   — vue transverse d'un acteur à travers plusieurs projets
settings/         — connexion au LLM (fournisseur/clé/URL) et prompts/skills personnalisables
api/              — client REST vers le backend Go
```

## Modèle de données

Un projet (`domain.Project`) est l'objet racine, sérialisé tel quel sur
disque et via l'API (pas de DTO séparé). L'**activité** est l'entité
pivot : position dans le diagramme (acteur, phase, et sous-ligne/
sous-colonne/décalage fin pour un positionnement manuel), user stories du
story map, et liens de traçabilité vers les spécifications.

- `Actor` : couleur, réservation de sous-lignes, et fiche persona
  (about/bio/goals/painPoints — partagée entre missions par nom, voir
  ADR-056).
- `Phase` : ordre, réservation de sous-colonnes.
- `Activity` : position (acteur, phase, sous-colonne/sous-ligne explicite,
  décalage fin en pixels), user stories, liens de traçabilité, points de
  friction.
- `Interaction` : relie deux activités, porte l'information échangée
  (arête du diagramme).
- `Specification` : typée façon INCOSE (`StakeholderNeed`/SSS,
  `SystemRequirement`, `SubsystemRequirement`, `VerificationCriterion`),
  hiérarchie via `parentId`.
- `TestScenario` : scénario V&V (préconditions + étapes action/résultat
  attendu) lié à une spécification par ID.

Voir `internal/domain/project.go` pour le détail exact des champs (source
de vérité).

## Décisions

Le détail de chaque décision (contexte, alternatives écartées,
conséquences) est dans [`docs/decisions-log.md`](decisions-log.md).
