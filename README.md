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
`web/package.json` → `engines`). Le toolchain frontend (Vite, oxlint,
`@vitejs/plugin-react`, `pdfjs-dist`) est volontairement fixé à des
versions exactes compatibles avec Node 20 (y compris d'anciennes
patch releases comme 20.9) plutôt que les toutes dernières versions,
qui exigent Node ≥ 20.19/22.12/22.13 selon le paquet — voir ADR-032.
Node 18 ou antérieur, ou Node 21 (release impaire non-LTS), ne sont pas
couverts.

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

### Clé API (génération assistée par LLM)

Pas besoin de variable d'environnement : ouvrez **⚙ Paramètres** en bas de
la barre latérale, choisissez un fournisseur (**Anthropic** ou
**Mistral AI**) et collez sa clé API. Elle est stockée localement
(`~/.config/missionmapmaker/config.json`, permissions restreintes), hors
des fichiers projet — une clé par fournisseur est mémorisée séparément,
basculer de l'un à l'autre ne perd pas la clé du premier.

Vous pouvez aussi définir `ANTHROPIC_API_KEY` en variable d'environnement
au lancement du serveur : elle est alors prioritaire (fournisseur
Anthropic) sur la configuration enregistrée depuis l'interface.

Le champ **URL de base** (optionnel, dans le même écran) permet de
pointer vers un proxy, un déploiement régional/entreprise ou un service
compatible auto-hébergé, plutôt que l'API publique du fournisseur.

### Charger un PDF comme point de départ

Dans l'onglet **Générer (langage naturel)**, le bouton **Charger un PDF**
extrait le texte d'un PDF et le place dans la zone de description, à
relire/compléter avant de générer. L'extraction se fait entièrement dans
le navigateur (aucun envoi du fichier au serveur) et ne fonctionne que
pour des PDF texte (créés numériquement) : un PDF scanné (image) n'a pas
de texte à extraire — l'OCR n'est pas pris en charge pour l'instant.

### Exporter un projet en Excel

Dans l'onglet **Édition**, le bouton **Exporter en Excel** télécharge un
classeur `.xlsx` avec un onglet par catégorie (Acteurs, Phases,
Activités, User stories, Interactions, Spécifications, Tests V&V,
Traçabilité) — toutes les informations du projet, lisibles sans
l'application. Génération entièrement côté navigateur (voir ADR-035).

## Empaqueter en binaire autonome

Pour distribuer l'application sans faire dépendre le poste cible de
Node/npm ni de Go — un seul exécutable, API + interface incluses :

```sh
cd web && npm install && npm run build && cd ..
go build -o bin/missionmapmaker ./cmd/server
```

`bin/missionmapmaker` sert alors le frontend buildé (embarqué dans le
binaire via `go:embed`, voir `web/embed.go`) en plus de l'API, sur le
même port (`:8080` par défaut) :

```sh
./bin/missionmapmaker
# puis ouvrir http://localhost:8080
```

Ce binaire n'a besoin que d'être copié sur la machine cible — ni Go, ni
Node/npm, ni accès à un registre de paquets n'y sont nécessaires pour
l'exécuter (seul le poste qui *construit* le binaire a besoin du
toolchain complet). Voir ADR-031.

### Récupérer un binaire déjà construit (sans Go ni Node)

Un workflow GitHub Actions (`.github/workflows/release-binaries.yml`)
construit automatiquement les binaires pour Linux, Windows et macOS
(Intel et Apple Silicon) et les publie en pièces jointes de la
[release GitHub](../../releases) correspondante, à chaque tag `v*`
poussé sur le dépôt (ou manuellement depuis l'onglet **Actions** →
*Release des binaires autonomes* → **Run workflow**, auquel cas les
binaires sont alors disponibles en tant qu'artefacts du run plutôt
qu'attachés à une release). Il n'y a donc rien à installer pour
récupérer un exécutable prêt à l'emploi : télécharger le fichier
correspondant à sa plateforme (`missionmapmaker-linux-amd64`,
`missionmapmaker-windows-amd64.exe`, `missionmapmaker-macos-amd64` ou
`missionmapmaker-macos-arm64`) et le lancer directement. Voir
ADR-033.
