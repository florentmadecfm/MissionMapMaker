# Pulse.MissionMap

Application Go (backend) + React (frontend), persistance en fichiers JSON
locaux, pour construire des story maps et des diagrammes de processus
(personas, phases, activités, interactions) à partir de langage naturel
assisté par LLM, avec traçabilité vers un référentiel de spécifications
inspiré INCOSE et une vue de cohérence par persona.

- Dossier d'architecture : [`docs/architecture.md`](docs/architecture.md)

## Développement local

Prérequis : **Go ≥ 1.24** et **Node.js 20.x ou ≥ 22** (voir `go.mod` et
`web/package.json` → `engines`).

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
  langage naturel, points de friction par activité, icône illustrative par
  phase façon storyboard (proposée par le LLM à la génération, éditable).
  Une interaction peut être conditionnelle (embranchement, ex. "si
  paiement refusé") — tracée en pointillés, avec un badge 🔀 sur
  l'activité d'où elle part. Un persona peut être marqué **back-stage**
  (onglet Édition) : regroupé sous une **ligne de visibilité**, séparé des
  personas en contact direct avec le client. Chaque phase peut aussi porter
  une **durée** libre et un **score de satisfaction** (1-5) : affichés
  au-dessus du diagramme sous forme de courbe. L'ordre chronologique des
  phases (le "backbone" du processus) se réordonne avec les boutons ‹/›
  de l'onglet Édition. Une interaction peut aussi porter une **preuve
  physique** (service blueprint, ex. "reçu papier"), affichée derrière une
  icône 🧾 sur sa flèche. Le diagramme s'exporte en **image PNG** (bouton
  "Exporter en PNG" au-dessus du canevas) à une résolution qui suit
  automatiquement le niveau de zoom : un diagramme à beaucoup de
  phases/personas, davantage zoomé pour tenir à l'écran, est exporté avec
  une image proportionnellement plus grande plutôt qu'un texte illisible.
- **Fiche persona** (à propos, bio, objectifs, points de friction du
  métier) — partagée entre toutes les missions portant un persona du même
  nom, consultable/éditable depuis le diagramme, l'onglet Vue par persona,
  ou l'écran **🧑 Personas (toutes missions)** de la barre latérale.
- **Spécifications** (typées façon INCOSE) et **scénarios de test V&V**,
  génération assistée et matrice de traçabilité. Depuis un point de
  friction, "💡 Solutions" propose 5 pistes de résolution structurelles
  (interactions/activités) ; en choisir une génère la SSS et le test
  correspondants (tracés vers le point de friction) ET intègre le
  changement structurel décrit dans le **diagramme cible** de la mission
  (créée automatiquement si c'est la première résolution).
- **Export/import Excel** complet d'un projet (menu ☰ de la barre d'onglets).
- **Historique des versions** (même menu ☰) : une version enregistrée à
  chaque sauvegarde automatique, consultable (aperçu du diagramme en
  lecture seule) et restaurable — l'état remplacé reste lui-même dans
  l'historique.
- **Diagramme cible** (état actuel / cible d'une même mission) : le
  sélecteur Actuel/Cible au-dessus des onglets bascule entre les deux
  (créée à la demande, ou automatiquement par la résolution d'un point de
  friction ci-dessus) — la cible reste toujours PARTIE de la mission
  ouverte, jamais une entrée séparée dans le panneau de gauche. Les deux
  se **comparent côte à côte** (bouton "Comparer", diagrammes en lecture
  seule, largeur des deux panneaux ajustable par glisser-déposer).
- **Sauvegarde automatique** : chaque modification (Édition, Diagramme,
  Spécifications, Vue par persona) est enregistrée après un court délai
  d'inactivité, sans bouton "Sauvegarder" à cliquer — un indicateur
  discret au-dessus des onglets confirme l'état de la sauvegarde.
- **Paramètres** : fournisseur LLM (Anthropic/Mistral) et clé API,
  prompts/skills de génération personnalisables — dont le skill dédié aux
  solutions de points de friction, en posture design créatif / creative
  problem solving.
- Interface auditée de bout en bout : état vide guidé, boutons de
  suppression révélés au survol/focus dans l'onglet Édition, astuces du
  diagramme repliables, notation "Reçoit/Envoie" explicite en Vue par
  persona. Les longues listes de l'onglet Édition et des Spécifications
  (au-delà d'une poignée d'éléments) affichent un champ de recherche pour
  filtrer par nom/contenu.

## Design system

Le dossier `design-system/` documente les jetons visuels (couleurs,
typographie, espacement, rayons, ombres) et les patrons de composants
(boutons, badges, alertes, cartes, formulaires, nav) appliqués à
l'interface — `design-system/styles.css` en est la seule source, et
`design-system/preview/gallery.html` en donne un aperçu interactif (ouvrir
ce fichier directement dans un navigateur, aucun serveur nécessaire). Les
jetons de `web/src/index.css` (`--color-*`, `--radius-*`, `--shadow-*`)
reprennent ces valeurs.

## Empaqueter en binaire autonome

Pour distribuer l'application sans dépendance Node/Go sur le poste
cible — un seul exécutable, API + interface incluses :

```sh
cd web && npm install && npm run build && cd ..
go build -o bin/pulse-missionmap ./cmd/server
./bin/pulse-missionmap
# puis ouvrir http://localhost:8080
```

Un binaire prêt à l'emploi (sans Go ni Node) peut aussi être récupéré
depuis les [releases GitHub](../../releases) ou l'onglet **Actions** →
*Release des binaires autonomes*.
