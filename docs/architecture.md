# MissionMapMaker — Architecture

Backend Go + frontend React, persistance en fichiers `.json` locaux. Un
seul utilisateur, pas de temps réel multi-utilisateur. Construit un
diagramme de processus (acteurs × phases × activités × interactions) à
partir de langage naturel assisté par LLM (Anthropic ou Mistral,
configurable), trace chaque activité vers des spécifications façon INCOSE
et des scénarios de test V&V.

```
Frontend React (Vite) ── REST/JSON (localhost) ──> Backend Go
                                                       api/     (handlers HTTP)
                                                       service/ (orchestration)
                                                       storage/ (fichiers .json)
                                                       llm/     (Anthropic, Mistral)
                                                       domain/  (entités, validation)
                                                       config/  (config locale persistée)
```

- Chaque projet = `data/<project-id>/project.json` + `backups/`
  horodatés (écriture atomique). Les fiches persona d'acteur sont en plus
  répliquées dans `data/actor-profiles.json`, partagées par nom d'acteur
  entre projets.
- Le LLM est toujours appelé côté serveur (clé jamais exposée au
  navigateur) ; son résultat est relu/édité côté frontend avant
  sauvegarde, jamais écrit automatiquement.
- Le build React est embarqué dans le binaire Go (`go:embed`) — un seul
  exécutable.

## Modules Go (`internal/`)

```
domain/   — entités, validation, normalisation
storage/  — repository fichiers JSON
llm/      — clients multi-fournisseurs, schémas d'outils, prompts par défaut
config/   — configuration locale persistée
service/  — orchestration (CRUD projet, génération assistée)
api/      — handlers HTTP, routing
```

## Modules React (`web/src/`)

```
components/       — briques d'UI génériques réutilisées entre écrans
features/
  nl-input/         — capture de texte libre, appel LLM, relecture avant commit
  process-diagram/  — diagramme swimlane, interactif (React Flow)
  project-shell/    — coquille applicative, onglets, export/import Excel
  specifications/   — arbre INCOSE + matrice de traçabilité + tests V&V
  actor-view/       — vue dynamique par acteur, fiche persona
  actor-missions/   — vue transverse d'un acteur entre projets
  settings/         — connexion LLM, prompts personnalisables
api/              — client REST vers le backend
```

## Modèle de données

`domain.Project` est l'objet racine, sérialisé tel quel sur disque et via
l'API. L'**activité** est l'entité pivot : position dans le diagramme
(acteur, phase, sous-ligne/colonne), user stories, liens de traçabilité.
`Interaction` relie deux activités. `Specification` (typée INCOSE,
hiérarchie par `parentId`) et `TestScenario` (préconditions + étapes)
complètent la traçabilité. Détail exact des champs :
`internal/domain/project.go`.
