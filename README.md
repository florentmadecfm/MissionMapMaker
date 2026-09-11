# MissionMapMaker

Application Go (backend) + React (frontend), persistance en fichiers JSON
locaux, pour construire des story maps et des diagrammes de processus
(acteurs, phases, activités, interactions) à partir de langage naturel
assisté par LLM, avec traçabilité vers un référentiel de spécifications
inspiré INCOSE et une vue de cohérence par acteur.

- Dossier d'architecture : [`docs/architecture.md`](docs/architecture.md)
- Journal de décisions (ADR) : [`docs/decisions-log.md`](docs/decisions-log.md)

## Développement local

Prérequis : **Go ≥ 1.24** et **Node.js 20.x ou ≥ 22** (voir `go.mod` et
`web/package.json` → `engines` ; le toolchain frontend est épinglé pour
rester compatible Node 20.9, voir ADR-032).

Backend (API sur `:8080`, données dans `./data`) :

```sh
go run ./cmd/server
```

Frontend (Vite sur `:5173`, proxy `/api` vers le backend) :

```sh
cd web
npm install
npm run dev
```

Ouvrir http://localhost:5173.

## Fonctionnalités principales

- **Générer** un processus à partir d'une description en langage naturel
  (ou d'un PDF texte) — toujours relu/édité avant sauvegarde.
- **Diagramme de processus** interactif : glisser-déposer, création
  d'interaction directement sur le diagramme, mise à jour incrémentale en
  langage naturel, points de friction par activité.
- **Fiche persona** par acteur (à propos, bio, objectifs, points de
  friction du métier) — partagée entre toutes les missions portant un
  acteur du même nom, consultable/éditable depuis le diagramme, l'onglet
  Vue par acteur, ou l'écran **🧑 Acteurs (toutes missions)** de la barre
  latérale.
- **Spécifications** (typées façon INCOSE) et **scénarios de test V&V**,
  génération assistée et matrice de traçabilité.
- **Export/import Excel** complet d'un projet (menu ☰ de la barre d'onglets).
- **Paramètres** : fournisseur LLM (Anthropic/Mistral) et clé API,
  prompts/skills de génération personnalisables.

## Empaqueter en binaire autonome

Pour distribuer l'application sans dépendance Node/Go sur le poste
cible — un seul exécutable, API + interface incluses (voir ADR-031) :

```sh
cd web && npm install && npm run build && cd ..
go build -o bin/missionmapmaker ./cmd/server
./bin/missionmapmaker
# puis ouvrir http://localhost:8080
```

Un binaire prêt à l'emploi (sans Go ni Node) peut aussi être récupéré
depuis les [releases GitHub](../../releases) ou l'onglet **Actions** →
*Release des binaires autonomes* (voir ADR-033).
