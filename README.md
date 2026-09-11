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

### Diagramme de processus interactif

L'onglet **Diagramme de processus** ne se contente pas d'afficher le
diagramme, il permet de le modifier directement :

- **Glisser-déposer** une carte d'activité la réassigne à l'acteur/la
  phase visés (une ombre en pointillés prévisualise l'emplacement de
  dépose). Un dépôt qui déborde d'au plus une case sous la ligne déjà
  occupée par SON acteur (ou à droite de la colonne déjà occupée par SA
  phase) crée une sous-ligne/sous-colonne de plus pour cet acteur/cette
  phase plutôt que de basculer sur l'acteur/la phase suivant(e) — un
  dépôt plus franc continue de réassigner comme avant (ADR-049, ADR-050).
  Un dépôt qui reste dans la même case nudge légèrement la carte à
  l'intérieur de celle-ci (mémorisé par activité, borné pour ne jamais
  chevaucher une case voisine) plutôt que de toujours retomber
  exactement au même coin (ADR-051).
- **Glisser depuis le bord d'une carte vers une autre** crée une
  interaction entre les deux activités — cliquer ensuite sur la flèche
  permet de la nommer directement, sans passer par l'onglet Édition
  (ADR-049).
- **Cliquer sur une carte** ouvre la consultation de ses spécifications
  et tests V&V liés (une fois générés), et permet d'ajouter/retirer des
  **points de friction** en texte libre pour cette activité (ADR-052) —
  une carte qui en a au moins un affiche un badge ⚠ rouge en coin
  haut-droit, visible sans avoir à l'ouvrir (ADR-053). Une ligne "⚠ Points
  de friction" tout en bas du diagramme récapitule, phase par phase, tous
  les points de friction du processus (avec l'acteur et l'activité
  d'origine de chacun) — cliquer une entrée ouvre directement l'activité
  concernée (ADR-054).
- **Cliquer sur le nom d'un acteur** ouvre sa fiche persona (à propos,
  bio, objectifs, points de friction du métier — distincts des points de
  friction d'une activité précise — et rappel des activités du
  processus) en mode CRUD : ajout/suppression d'objectifs et de points de
  friction, texte libre pour à propos/bio. Même fiche accessible depuis
  l'onglet **Vue par acteur** (bouton "Voir la fiche") (ADR-055).
- Les boutons **"+"** après la dernière phase ajoutent une phase ou une
  activité pour un acteur donné, sans repasser par l'onglet Édition.
- Le petit **"+"** en coin d'un en-tête de phase ou d'acteur réserve
  une colonne (phase) ou une ligne (acteur) supplémentaire — utile pour
  faire de la place à une seconde ligne d'activités concurrentes avant
  même d'y avoir déposé quoi que ce soit.
- Une zone de texte en langage naturel, en haut de l'onglet, permet de
  décrire des ajouts ou modifications sans changer d'écran (même
  génération assistée que l'onglet "Générer") — le processus déjà présent
  dans le diagramme est fourni en contexte au LLM, qui peut donc aussi
  bien ajouter que modifier une activité déjà existante (renommage,
  description précisée, changement d'acteur/de phase) plutôt que se
  limiter à des ajouts.

### Acteurs (toutes missions)

Le bouton **🧑 Acteurs (toutes missions)** de la barre latérale (au-dessus
de Paramètres) ouvre un écran indépendant de tout projet ouvert : les
acteurs de toutes les missions sont regroupés par nom (ex. "Serveur"
apparaissant à la fois dans un projet "Restaurant" et un projet "Hôtel de
luxe"), et pour l'acteur sélectionné, chaque mission où il apparaît est
rappelée côte à côte (mêmes informations que l'onglet Vue par acteur —
activités par phase, interactions, spécifications et tests liés). Le
bouton **Ouvrir cette mission** d'une section bascule directement sur ce
projet, à l'onglet Vue par acteur, avec l'acteur déjà présélectionné.

Le rapprochement se fait par nom (insensible à la casse) : deux acteurs
de projets différents doivent porter exactement le même nom pour être
regroupés — voir ADR-041. Les données affichées sont toujours celles
déjà **sauvegardées** de chaque mission (pas besoin de rafraîchir
manuellement : rechargées automatiquement après chaque sauvegarde d'un
projet — voir ADR-046).

### Paramètres

L'écran **⚙ Paramètres** (bas de la barre latérale) a trois onglets :

- **Connexion au modèle** — voir "Clé API" ci-dessous.
- **Prompts** — pour chacune des 3 capacités de génération assistée
  (mission map, SSS, scénarios de test), le texte de CONTEXTE et
  D'OBJECTIF de la tâche (à qui elle s'adresse, ce qu'on cherche à
  produire) est visible et éditable, indépendamment du skill correspondant
  (les deux sont concaténés au moment de l'appel au LLM).
- **Skills** — le texte de MÉTHODE (étapes, règles de rédaction, format
  de sortie) des 3 mêmes capacités est visible et éditable.

Dans les deux onglets, chaque texte peut être personnalisé
(**Enregistrer**) ou remis au texte par défaut (**Réinitialiser**).
Réglage avancé — un texte incohérent peut dégrader la qualité des
propositions, voire empêcher la mise à jour incrémentale du diagramme de
fonctionner correctement (voir ADR-040, ADR-045).

### Clé API (génération assistée par LLM)

Dans l'onglet **Connexion au modèle** des Paramètres, choisissez un
fournisseur (**Anthropic** ou **Mistral AI**) et collez sa clé API — pas
besoin de variable d'environnement. Elle est stockée localement
(`~/.config/missionmapmaker/config.json`, permissions restreintes), hors
des fichiers projet — une clé par fournisseur est mémorisée séparément,
basculer de l'un à l'autre ne perd pas la clé du premier.

Vous pouvez aussi définir `ANTHROPIC_API_KEY` en variable d'environnement
au lancement du serveur : elle est alors prioritaire (fournisseur
Anthropic) sur la configuration enregistrée depuis l'interface.

Le champ **URL de base** (optionnel, dans le même onglet) permet de
pointer vers un proxy, un déploiement régional/entreprise ou un service
compatible auto-hébergé, plutôt que l'API publique du fournisseur.

### Charger un PDF comme point de départ

Dans l'onglet **Générer (langage naturel)**, le bouton **Charger un PDF**
extrait le texte d'un PDF et le place dans la zone de description, à
relire/compléter avant de générer. L'extraction se fait entièrement dans
le navigateur (aucun envoi du fichier au serveur) et ne fonctionne que
pour des PDF texte (créés numériquement) : un PDF scanné (image) n'a pas
de texte à extraire — l'OCR n'est pas pris en charge pour l'instant.

### Exporter/importer un projet en Excel

Le menu **☰**, au niveau de la barre d'onglets d'un projet ouvert
(disponible depuis n'importe quel onglet, pas seulement Édition), donne
accès à :

- **Exporter en Excel** : télécharge un classeur `.xlsx` avec un onglet
  par catégorie (Acteurs, Objectifs acteur, Points de friction acteur,
  Phases, Activités, User stories, Points de friction, Interactions,
  Spécifications, Tests V&V, Traçabilité) — toutes les informations du
  projet, lisibles sans l'application. Génération entièrement côté
  navigateur (voir ADR-035).
- **Importer depuis Excel** : recharge un classeur exporté par l'app (le
  même format, éventuellement retouché à la main) — remplace les
  acteurs/phases/activités/interactions/spécifications/tests du projet
  ouvert par le contenu du fichier, à relire et **Sauvegarder** pour
  confirmer (rien n'est écrit tant que ce n'est pas fait). Voir ADR-042.

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
`missionmapmaker-macos-arm64`) et le lancer directement, puis ouvrir
http://localhost:8080/. Voir ADR-033.
