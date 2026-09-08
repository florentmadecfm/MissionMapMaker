# MissionMapMaker

Application Go (backend) + React (frontend), persistance en fichiers JSON
locaux, pour construire des story maps et des diagrammes de processus
(acteurs, phases, activités, interactions) à partir de langage naturel
assisté par LLM, avec traçabilité vers un référentiel de spécifications
inspiré INCOSE et une vue de cohérence par acteur.

- Dossier d'architecture : [`docs/architecture.md`](docs/architecture.md)
- Journal de décisions (ADR) : [`docs/decisions-log.md`](docs/decisions-log.md)

## Développement local

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
