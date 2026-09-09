# Journal de décisions (ADR) — MissionMapMaker

Ce journal trace les décisions structurantes du projet : le contexte, les
options envisagées, le choix retenu et pourquoi. Il est complété au fil des
sessions de planification et de développement (voir aussi
`docs/architecture.md` pour la synthèse architecturale).

---

## ADR-001 — Persistance en fichiers JSON via le backend Go

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : besoin de sauvegarder les projets (acteurs, activités,
diagramme, specs) quelque part. Trois options envisagées :
1. Fichiers `.json` écrits/lus par le backend Go (disque local).
2. `localStorage` navigateur uniquement (aucune persistance serveur).
3. Hybride : édition en mémoire/localStorage + export/import explicite via
   API Go.

**Décision** : option 1, fichiers `.json` gérés côté backend Go
(un dossier par projet, `project.json` + backups horodatés).

**Justification** : permet une vraie API métier côté serveur (validation,
règles de traçabilité, appel LLM sans exposer de clé côté navigateur),
facilite l'export/partage (un fichier = un projet, versionnable dans un
VCS), et prépare une éventuelle évolution multi-poste/synchro sans tout
réécrire. Le `localStorage` seul aurait limité l'app à un unique
navigateur/poste et rendu impossible l'appel LLM sécurisé côté serveur.

**Conséquences** : nécessite une gestion soigneuse de l'écriture (atomique,
backups) pour éviter la corruption ; pas de verrouillage multi-utilisateur
prévu en v1 (usage mono-utilisateur assumé).

---

## ADR-002 — Génération assistée par LLM (API Claude) côté backend

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : comment transformer une description en langage naturel en
acteurs/phases/activités/interactions ? Trois options :
1. LLM (API Claude) côté backend.
2. Saisie guidée structurée (formulaires façon "en tant que... je...").
3. Parsing local par règles/heuristiques (sans dépendance externe).

**Décision** : option 1, appel à l'API Claude depuis le backend Go, avec un
mode de saisie manuelle structurée toujours disponible en secours (utile
hors ligne ou sans clé API).

**Justification** : meilleure qualité d'extraction que des règles maison ;
en gardant l'appel côté serveur, la clé API ne transite jamais côté
navigateur. Le risque d'hallucination est mitigé par un écran de
relecture/édition systématique avant toute sauvegarde (jamais d'auto-save
du résultat LLM).

**Conséquences** : dépendance réseau + clé API au moment de la génération ;
le reste de l'application doit rester utilisable sans LLM (CRUD manuel).

---

## ADR-003 — Référentiel de spécifications inspiré INCOSE (pas conformité complète)

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : niveau de rigueur du modèle de traçabilité activités ↔
spécifications. Trois options : lien simple texte libre, modèle structuré
inspiré INCOSE, conformité complète au handbook INCOSE.

**Décision** : modèle structuré inspiré INCOSE — types de spécifications
(`StakeholderNeed`/SSS, `SystemRequirement`, `SubsystemRequirement`,
`VerificationCriterion`), ID, hiérarchie via `parentId`, liens de
traçabilité portés par l'activité.

**Justification** : offre une vraie rigueur de traçabilité (typologie,
hiérarchie, IDs) sans le coût de développement d'une conformité complète au
handbook INCOSE, qui serait disproportionnée pour ce périmètre v1. Le
modèle reste extensible si un besoin de conformité plus poussée apparaît.

**Conséquences** : la typologie des specs pourra devoir évoluer (ex.
ajout de types de vérification/validation) — prévoir une migration de
schéma légère plutôt qu'un modèle figé.

---

## ADR-004 — Périmètre du MVP : story mapping + diagramme de processus d'abord

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : trois briques à développer (story mapping + diagramme,
traçabilité specs, vue par acteur) — laquelle prioriser ?

**Décision** : démarrer par le cœur métier — saisie (manuelle puis assistée
LLM) → story map + diagramme de processus (acteurs/phases/activités/
interactions). La traçabilité specs et la vue par acteur viennent ensuite.

**Justification** : les deux autres briques dépendent structurellement du
modèle d'activités (la traçabilité s'accroche aux activités, la vue par
acteur agrège les activités d'un acteur). Les construire avant risquerait
de figer un modèle de données pas encore validé par l'usage.

**Conséquences** : voir roadmap par lots dans `docs/architecture.md`
(Lot 0 → Lot 5).

---

## ADR-005 — React Flow pour le rendu du diagramme de processus

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : comment rendre le diagramme swimlane acteur × phase avec
activités et interactions (arêtes) ?

**Décision** : utiliser la librairie React Flow (nœuds/arêtes, pan/zoom,
nœuds personnalisés) plutôt qu'un moteur de rendu SVG maison.

**Justification** : évite de réimplémenter pan/zoom, sélection, drag &
drop et rendu d'arêtes — fonctionnalités déjà robustes dans React Flow.
Les nœuds custom permettent de représenter les swimlanes acteur × phase et
les activités comme des cartes riches (nom, stories liées, specs liées).

**Conséquences** : dépendance externe supplémentaire côté frontend ;
à réévaluer seulement si des besoins de rendu très spécifiques (ex. export
print complexe) dépassent ce que la librairie permet.

---

## ADR-006 — Packaging final en binaire unique Go via `go:embed`

**Date** : 2026-09-08
**Statut** : Retenu (prévu pour le Lot 5, non bloquant pour le MVP)

**Contexte** : comment distribuer l'application en usage local ?

**Décision** : embarquer le build React dans le binaire Go via `go:embed`
pour obtenir un exécutable unique servant à la fois l'UI et l'API.

**Justification** : simplicité de distribution et d'exécution pour un
usage local mono-utilisateur, pas d'infra (conteneur, serveur web séparé)
à maintenir.

**Conséquences** : le pipeline de build doit générer le bundle React avant
la compilation Go ; à revoir si un besoin de déploiement multi-poste/
serveur partagé émerge plus tard (Docker resterait une option).

---

## ADR-007 — Modèle Claude et intégration SDK Go pour la génération NL

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : implémentation du Lot 2 (génération assistée par LLM). Deux
choix techniques : le SDK d'appel, et le modèle Claude par défaut.

**Décision** :
- SDK officiel `github.com/anthropics/anthropic-sdk-go` (pas d'appels HTTP
  bruts) pour bénéficier des types et de la gestion d'erreurs du SDK.
- Extraction structurée via un unique outil (`extract_process`, tool use)
  décrit par un schéma JSON correspondant à `DraftProcess` (acteurs,
  phases, activités, interactions référencées par nom). Pas de
  `tool_choice` forcé : un system prompt explicite demande à Claude de
  toujours répondre via cet outil, ce qui reste fiable en pratique et évite
  toute dépendance à un comportement de forçage spécifique au modèle.
- Modèle par défaut : `claude-opus-5`, configurable via la variable
  d'environnement `MMM_LLM_MODEL` (ex. `claude-sonnet-5` pour réduire le
  coût). Clé lue depuis `ANTHROPIC_API_KEY` ; en son absence, le service
  démarre normalement et renvoie une erreur `ErrNotConfigured` claire côté
  API (503) plutôt que de bloquer le reste de l'application (voir ADR-002).

**Justification** : le SDK officiel est la voie recommandée pour du Go
appelant l'API Claude. Le modèle par défaut le plus capable (`claude-opus-5`)
est retenu pour la qualité d'extraction, avec un mécanisme de configuration
explicite pour que l'utilisateur final choisisse lui-même un modèle moins
coûteux s'il le souhaite (jamais de rétrogradation silencieuse par
l'outillage).

**Conséquences** : aucune clé `ANTHROPIC_API_KEY` n'est disponible dans cet
environnement de développement (sandbox Claude Code) ; la génération n'a
donc pas pu être testée avec un vrai appel API — seul le chemin
"non configurée" (503 + message dans l'UI) a été vérifié bout en bout. À
tester avec une vraie clé dès qu'elle sera disponible côté utilisateur.

---

## ADR-008 — Proposition automatique de SSS par activité/acteur

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : demande explicite de l'utilisateur — l'outil doit "proposer
directement une liste des SSS au bon format pour chaque activité pour
chaque acteur", plutôt que de laisser la saisie des spécifications
entièrement manuelle dans l'onglet Spécifications.

**Décision** : nouveau bouton "Proposer les SSS pour toutes les activités
(IA)" dans l'onglet Spécifications. Le frontend envoie la liste des
activités (nom + nom d'acteur) au backend, qui appelle Claude (nouvel outil
`propose_specifications`, même mécanisme que `extract_process` du Lot 2)
avec un prompt imposant le format de rédaction d'exigence : phrase unique
atomique, tournure "Le système doit permettre à [acteur] de [capacité]",
vérifiable, non ambiguë. Le résultat est fusionné côté frontend
(`mergeSpecDrafts`) : une spécification `StakeholderNeed` (code `SSS-NNN`)
est créée par proposition non dupliquée et reliée à l'activité
correspondante via `traceLinks` ; les propositions dont l'activité/acteur
ne correspond à rien dans le projet ouvert sont ignorées et signalées à
l'utilisateur plutôt que silencieusement perdues. Même principe que pour
la génération de processus : jamais d'écriture automatique, tout reste
éditable/supprimable avant sauvegarde.

**Justification** : réutilise le mécanisme déjà validé du Lot 2 (tool use,
relecture avant sauvegarde) plutôt que d'introduire un nouveau paradigme ;
génère au niveau du projet entier (toutes activités de tous les acteurs en
un appel) plutôt qu'activité par activité, pour limiter le nombre d'appels
API et donner une vue d'ensemble cohérente à relire.

**Conséquences** : comme pour l'ADR-007, l'appel réel n'a pas pu être testé
faute de clé API dans cet environnement — la logique de fusion a été
vérifiée avec une réponse simulée (mock réseau côté test), y compris le
cas d'une activité non reconnue. Un bug de numérotation des codes SSS
(doublon d'incrément lors de la fusion) a été détecté et corrigé pendant
cette vérification.

---

## ADR-009 — Vue dynamique par acteur (Lot 4)

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : dernière brique du périmètre initial — permettre à un
utilisateur de vérifier la cohérence des activités d'un acteur donné dans
le processus (objectif d'origine du projet).

**Décision** : nouvel onglet "Vue par acteur". Sélection d'un acteur via
des chips colorées, puis chronologie de ses activités organisée par
colonnes de phases (toutes les phases du projet sont affichées, y compris
celles où l'acteur n'a aucune activité, pour rendre visibles les "trous").
Chaque carte d'activité affiche : description, interactions entrantes
(← information, acteur source) et sortantes (→ information, acteur
cible), spécifications liées (chips avec le texte complet en tooltip). Un
résumé en tête d'écran compte les activités sans aucune interaction
("isolées") et sans spécification liée. Vue en lecture seule (pas
d'édition ici, qui reste dans les onglets Édition/Spécifications).

**Justification** : dériver entièrement la vue du modèle existant
(activités/interactions/specs) sans nouvel état ni backend, cohérent avec
l'approche du diagramme de processus (Lot 1). Afficher les phases vides
plutôt que de les masquer est le choix clé pour la "cohérence" demandée :
un acteur absent d'une phase où on l'attendrait devient visible d'un coup
d'œil, de même qu'une activité sans interaction ou sans traçabilité.

**Conséquences** : vérifié bout en bout avec l'exemple restaurant
(acteur "Plongeur" avec une seule activité isolée dans "Repas" et une
phase "Arrivée des clients" vide pour lui — les deux avertissements
s'affichent correctement).

Par ailleurs, correction UX dans l'onglet Spécifications (retour
utilisateur) : le texte des exigences était tronqué dans un `<input>`
étroit ; passage à une disposition en carte avec `<textarea>` pleine
largeur pour le texte et la justification, afin de pouvoir relire et
éditer le texte complet des SSS proposées.

---

## ADR-010 — Refonte visuelle (design system léger)

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : retour utilisateur — "le design est horrible". Diagnostic :
`web/src/index.css` avait conservé le CSS du template Vite par défaut
(accent violet inutilisé, `#root` limité à 1126px de large et centré,
`text-align: center` hérité, grands titres 56px) jamais nettoyé au Lot 0,
en plus de styles de composants très bruts (boutons/inputs par défaut du
navigateur, pas de hiérarchie visuelle).

**Décision** : refonte du système visuel plutôt que des ajustements
ponctuels :
- `index.css` réécrit comme une base propre : tokens CSS (`--color-*`,
  `--radius-*`, `--shadow-*`), reset, layout plein écran (suppression de
  la contrainte 1126px/`text-align:center`), style par défaut des
  éléments natifs (`button`, `input`, `select`, `textarea`) pour que tout
  composant non stylé spécifiquement reste cohérent.
- Palette : neutres slate + accent indigo (`#4f46e5`) plutôt que le bleu
  générique utilisé jusque-là, jeu de couleurs sémantiques pour
  succès/erreur/avertissement.
- `App.css` réécrit intégralement en réutilisant les noms de classes déjà
  présents dans les composants (aucune classe renommée) : sections en
  cartes avec ombre légère, liste de projets avec bouton "supprimer"
  révélé au survol, onglets soulignés, matrice de traçabilité et cartes
  d'activité harmonisées avec les mêmes tokens que le diagramme de
  processus (`process-diagram.css` mis à jour en parallèle).
- Ajout ciblé de la classe `btn-primary` sur les 5 actions principales
  (Créer, Sauvegarder ×2, Générer, Proposer les SSS) — seul changement de
  JSX nécessaire, le reste de la refonte est passé par CSS seul.

**Justification** : réutiliser les classes existantes plutôt que
restructurer les composants limite le risque de régression fonctionnelle
pour un changement purement visuel, tout en donnant un résultat cohérent
sur tous les écrans en une seule passe.

**Conséquences** : vérifié visuellement sur les 5 onglets avec l'exemple
restaurant. Un bug de contraste a été détecté et corrigé pendant cette
vérification : la règle globale `button:hover` (spécificité CSS plus
élevée que `.actor-chip.active` seule) faisait passer le texte d'un chip
d'acteur actif en blanc sur fond quasi blanc au survol — corrigé en
ajoutant une règle `.actor-chip.active:hover` explicite. À surveiller :
d'autres combinaisons état-actif + survol pourraient présenter le même
type de problème de spécificité CSS si de nouveaux composants sont
ajoutés sans suivre ce pattern.

---

## ADR-011 — Lisibilité du diagramme de processus (liens et exemple enrichi)

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : retour utilisateur — le diagramme de processus devenait
illisible dès que plusieurs interactions se croisaient, et l'exemple
restaurant était trop simple pour valider un processus complexe.

**Décision** :
- **Poignées multiples réparties** (`HANDLES_PER_SIDE = 3`) sur chaque
  côté d'une carte d'activité plutôt qu'un point unique central, pour que
  plusieurs liens partageant une même activité ne partent/arrivent pas au
  même pixel.
- **Routage directionnel selon la topologie** : une interaction entre
  deux activités de la **même phase** (très fréquent - beaucoup
  d'activités de plusieurs acteurs se déroulent dans une même phase, ex.
  "Repas") est routée verticalement (poignées haut/bas) plutôt
  qu'horizontalement, pour ne pas partager le couloir gauche/droite
  utilisé par les interactions inter-phases. Une interaction entre phases
  différentes reste routée horizontalement (gauche/droite) comme avant.
- **Hauteur de ligne dynamique par acteur** : calculée à partir de
  l'empilement maximal de cet acteur sur n'importe quelle phase (au lieu
  d'une hauteur fixe), pour qu'un acteur chargé ne déborde jamais sur la
  ligne de l'acteur suivant — un vrai bug de chevauchement de cartes a été
  découvert et corrigé pendant cette itération (une ligne à hauteur fixe
  ne suffisait plus dès que l'exemple s'est étoffé).
- **Couleur par lien** = couleur de l'acteur source, **flèches
  directionnelles** (`MarkerType.ArrowClosed`), et **fond blanc sous les
  labels** pour qu'ils restent lisibles par-dessus le quadrillage et les
  autres liens.
- **Exemple restaurant étoffé** dans le bouton "Charger l'exemple" (Lot 2,
  langage naturel) : 6 acteurs, 5 phases, ~19 activités, ~13 interactions
  (gestion des allergies, réclamation, remise, etc.) au lieu de 5
  acteurs/3 phases/8 activités, pour représenter un processus réellement
  complexe.

**Justification** : le routage horizontal uniforme d'origine faisait
converger toutes les interactions dans un couloir étroit entre colonnes,
quel que soit leur trajet réel ; distinguer "même phase" (vertical) de
"inter-phases" (horizontal) reflète mieux la structure réelle du
processus et réduit fortement les croisements visuels.

**Conséquences** : vérifié avec l'exemple restaurant étoffé (6 acteurs,
19 activités, 13 interactions) — plus de chevauchement de cartes, liens
directionnels et colorés, labels lisibles. Limite connue : dans une zone
très dense (beaucoup d'acteurs interagissant dans une seule phase), les
labels de liens proches peuvent encore se rapprocher les uns des autres ;
un vrai algorithme de minimisation des croisements (réordonnancement des
acteurs façon Sugiyama) apporterait un gain supplémentaire mais dépasse
le cadre de cette itération.

---

## ADR-012 — Clé API configurable depuis l'interface + sidebar repliable

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : demande explicite utilisateur — pouvoir saisir la clé API
Anthropic depuis l'interface plutôt que par variable d'environnement
uniquement, et pouvoir replier/déplier le menu latéral.

**Décision (clé API)** :
- Nouveau package `internal/config` : lit/écrit un fichier
  `~/.config/missionmapmaker/config.json` (via `os.UserConfigDir()`,
  permissions 0600/répertoire 0700), **séparé du dossier `data/`** des
  projets — c'est un secret propre au poste, il ne doit pas se retrouver
  mêlé à des fichiers projet qu'on pourrait exporter ou versionner.
- `GenerateService` rendu mutable (client LLM protégé par un `sync.RWMutex`)
  avec `SetAPIKey`/`ClearAPIKey`/`Configured`/`Model`, pour que la clé
  puisse changer après le démarrage du serveur, avec effet immédiat.
- Endpoints `GET/PUT/DELETE /api/settings` : la clé n'est **jamais
  renvoyée** dans une réponse HTTP (seulement un booléen `configured` et
  le modèle), seulement acceptée en écriture.
- Priorité au démarrage : `ANTHROPIC_API_KEY` (variable d'environnement)
  reste prioritaire si présente ; sinon la clé du fichier de config est
  chargée. Une fois le serveur démarré, l'écran Paramètres peut toujours
  changer la clé active en mémoire (et la persiste pour le prochain
  démarrage), mais si la variable d'environnement est encore définie au
  redémarrage suivant, elle reprend la main — documenté dans l'UI pour
  éviter la confusion.

**Décision (sidebar repliable)** : état `sidebarCollapsed` dans
`ProjectShell`, persisté en `localStorage` (préférence purement visuelle,
pas de round-trip serveur nécessaire). Repliée, la sidebar se réduit à
une bande étroite avec le bouton de bascule et l'accès aux Paramètres
(icône ⚙) toujours visible.

**Justification** : conserver le fichier de config hors de `data/` évite
qu'un secret se retrouve dans un export/partage de projet. Ne jamais
renvoyer la clé en lecture suit la pratique standard pour les secrets
API. La priorité "variable d'environnement > fichier" préserve le
comportement de déploiement scripté (CI, conteneur) tout en ajoutant un
chemin simple pour l'usage local interactif.

**Conséquences** : vérifié bout en bout avec une fausse clé — la
sauvegarde déclenche un vrai appel sortant vers `api.anthropic.com` (401
"API key is invalid", confirmant que le câblage clé → génération
fonctionne réellement), la configuration persiste après un redémarrage
propre du serveur sans variable d'environnement, et le repli/dépli de la
sidebar fonctionne avec transition. Reste à faire : tester avec une
vraie clé pour valider le contenu généré (toujours bloqué par l'absence
de clé réelle dans l'environnement de développement).

---

## ADR-013 — Abstraction multi-fournisseurs LLM (Anthropic + Mistral)

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : demande explicite utilisateur — pouvoir configurer une clé
API Mistral (ou un autre fournisseur) plutôt que d'être limité à
Anthropic. Le code de génération (ADR-002, ADR-007) était jusqu'ici
directement couplé au SDK Anthropic.

**Décision** :
- Nouvelle interface `llm.Generator` (`GenerateProcess`,
  `GenerateSpecifications`) : le reste de l'application (service, API)
  ne dépend plus que de cette interface, jamais d'un client de
  fournisseur concret. Ajouter un fournisseur = une implémentation de
  cette interface + un cas dans `llm.NewGenerator`.
- Schémas d'outils (`ToolSpec` : nom, description, propriétés JSON
  Schema) et prompts système extraits dans des fichiers partagés
  (`schemas.go`, `prompts.go`), traduits vers le format propre à chaque
  fournisseur (tool use Anthropic vs function calling Mistral) au
  moment de l'appel plutôt que dupliqués.
- Client Mistral en HTTP brut (pas de SDK Go officiel disponible) :
  `POST https://api.mistral.ai/v1/chat/completions`,
  `Authorization: Bearer <clé>`, `tool_choice: "any"` pour forcer
  l'appel de l'outil plutôt qu'une réponse en texte libre. Format
  vérifié auprès de la documentation Mistral avant implémentation
  (function calling proche du format OpenAI).
- `internal/config.Config` stocke un réglage (`ProviderSettings` :
  clé + modèle) **par fournisseur**, plus un champ `Provider` pour le
  fournisseur actif — changer de fournisseur ne fait pas perdre la clé
  de l'autre.
- `GenerateService` manipule un `llm.Generator` (au lieu d'un
  `*llm.Client` concret) derrière son mutex existant ; `SetProvider`
  remplace `SetAPIKey`.
- Endpoints `/api/settings` : `GET` renvoie aussi `provider` ; `PUT`
  prend `provider` en plus de `apiKey`/`model` et valide qu'il fait
  partie des fournisseurs connus (`llm.Provider.Valid()`).
- Frontend : sélecteur de fournisseur dans l'écran Paramètres, libellés
  et placeholders adaptés (`claude-opus-5` / `mistral-large-latest`).

**Justification** : l'interface `Generator` découple complètement le
reste de l'application du fournisseur choisi, ce qui rend l'ajout d'un
troisième fournisseur (OpenAI, etc.) mécanique plutôt que structurant.
Stocker une configuration par fournisseur (plutôt qu'un seul couple
clé/modèle écrasé à chaque bascule) évite la frustration de devoir
ressaisir une clé après être passé d'un fournisseur à l'autre pour
comparer les résultats.

**Conséquences** : vérifié bout en bout avec une fausse clé Mistral —
l'appel a atteint `api.mistral.ai` (401 "Invalid API Key" plutôt qu'une
erreur de validation de format, confirmant que la requête HTTP est bien
formée), et la bascule Anthropic ↔ Mistral préserve les deux clés dans
le fichier de configuration. Comme pour les autres fonctionnalités LLM,
le contenu réellement généré par Mistral n'a pas pu être validé faute de
clé réelle dans l'environnement de développement.

---

## ADR-014 — Nouvelles tentatives sur erreurs transitoires (429/5xx) côté Mistral

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : premier retour d'usage réel — avec une vraie clé Mistral,
l'utilisateur obtient `429 Too Many Requests / Rate limit exceeded`. Le
SDK Anthropic retente automatiquement les 429/5xx par défaut (2 nouvelles
tentatives), mais le client Mistral (HTTP brut, ADR-013) n'avait aucune
logique de ce type : une limite de débit transitoire faisait
immédiatement échouer la génération.

**Décision** : `mistralClient.call` retente jusqu'à 4 tentatives au total
sur 429 et 5xx (pas sur les autres 4xx comme 401, qui ne sont pas
transitoires et doivent échouer immédiatement), avec un backoff
exponentiel (1s, 2s, 4s) sauf si l'API renvoie un en-tête `Retry-After`
numérique, auquel cas cette valeur est respectée à la place. `baseURL` et
`backoff` sont des champs du client (plutôt que des constantes globales)
pour rester substituables dans les tests — trois tests couvrent
succès-après-429, non-retry-sur-401, et abandon-après-épuisement des
tentatives.

**Justification** : aligne le comportement du client Mistral sur celui,
déjà présent, du SDK Anthropic, plutôt que de laisser un fournisseur plus
fragile aux limites de débit transitoires que l'autre. Ne pas retenter
sur 401 évite de perdre du temps sur une erreur qui ne se résoudra
jamais toute seule.

**Conséquences** : premier test automatisé du projet (`internal/llm`),
posant un patron réutilisable si un troisième fournisseur HTTP brut est
ajouté plus tard. Le palier gratuit/essai de Mistral reste probablement
strict : plusieurs génération rapprochées peuvent quand même échouer
après les 4 tentatives si le compte est durablement limité — c'est
attendu, pas un bug.

**Post-scriptum diagnostic** : le 429 a persisté malgré les nouvelles
tentatives (ADR-014). Diagnostic mené avec l'utilisateur via un `curl`
direct vers `api.mistral.ai` (en dehors de l'app, sans exposer la clé) :
la réponse contenait `x-ratelimit-limit-req-minute: 0`, prouvant sans
ambiguïté que le compte Mistral lui-même n'a aucun quota alloué (aucune
tentative ne pouvait résoudre ça) — probablement un compte tout juste
créé sans moyen de paiement enregistré. Pas une action corrective dans
l'app, mais une méthode de diagnostic à retenir : quand une erreur
persiste malgré des correctifs raisonnables côté client, un appel `curl`
direct au fournisseur (sans passer par notre code) isole rapidement si
le problème est chez nous ou chez le fournisseur, en s'appuyant sur les
en-têtes de réponse plutôt que sur le seul message d'erreur.

---

## ADR-015 — URL de base configurable par fournisseur

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : demande explicite utilisateur — pouvoir configurer l'URL
d'API (ex. `https://api.mistral.ai/v1/chat/completions`) plutôt que
d'être limité à l'endpoint public codé en dur. Utile pour un proxy, un
déploiement régional/entreprise, un service compatible auto-hébergé, ou
pour diagnostiquer un problème réseau/fournisseur (voir post-scriptum
ci-dessus).

**Décision** :
- `config.ProviderSettings` gagne un champ `BaseURL` (comme `APIKey` et
  `Model`, mémorisé par fournisseur).
- `llm.NewGenerator` prend désormais une struct `GeneratorOptions`
  (`APIKey`, `Model`, `BaseURL`) plutôt que des paramètres positionnels,
  pour rester lisible avec un troisième paramètre optionnel.
- Client Anthropic : `option.WithBaseURL(...)` du SDK si une URL est
  fournie. Client Mistral : le champ `baseURL` (déjà présent pour les
  tests, ADR-014) sert aussi de valeur configurable par l'utilisateur,
  avec `mistralEndpoint` comme valeur par défaut.
- `GenerateService.SetProvider` et `/api/settings` (GET/PUT) propagent
  `baseUrl` de bout en bout. Contrairement à la clé API, l'URL de base
  n'est pas un secret : `GET /api/settings` la renvoie telle quelle.

**Justification** : réutilise le patron déjà en place (un réglage par
fournisseur, propagé via `GeneratorOptions`) plutôt que d'introduire un
mécanisme séparé. Champ optionnel et vide par défaut : n'affecte aucun
comportement existant tant qu'il n'est pas renseigné.

**Conséquences** : vérifié bout en bout avec un faux serveur HTTP local
imitant l'API Mistral (`chat/completions` + réponse d'outil) : la
génération a bien été routée vers cette URL personnalisée plutôt que
vers `api.mistral.ai`, et le résultat fabriqué par le faux serveur s'est
retrouvé fusionné dans le projet — preuve concluante que le routage
fonctionne de bout en bout (UI → backend → URL configurée).

---

## ADR-016 — Optimisation des appels LLM (réduction + fiabilité)

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : demande explicite utilisateur (« optimise les appels à
l'API »), précisée via question de clarification : périmètre = appels
LLM (Anthropic/Mistral), objectifs = réduire le nombre d'appels **et**
améliorer la fiabilité/robustesse au-delà des retries déjà en place
(ADR-014).

**Décision — réduction du nombre d'appels** :
- `SpecificationsPanel.handleGenerateSss` ne construit plus les
  `activityRefs` envoyés au LLM qu'à partir des activités qui n'ont
  **pas** encore de `traceLinks` (donc pas déjà de SSS liée), au lieu de
  renvoyer systématiquement la totalité des activités du projet à
  chaque clic.
- Le bouton « Proposer les SSS » se désactive et affiche le nombre
  d'activités concernées ; quand ce nombre tombe à zéro (tout est déjà
  spécifié), le clic est un no-op et un message informatif l'indique —
  aucun appel réseau n'est déclenché.
- **Écarté** : fusionner l'appel « générer le processus » et l'appel
  « générer les spécifications » en un seul appel LLM. Cela romprait le
  flux de relecture volontairement séquentiel (ADR-002) — l'utilisateur
  peut renommer/supprimer des activités entre les deux étapes, donc les
  garder séparées et pilotées par l'utilisateur reste plus sûr qu'un
  gain d'un appel réseau.

**Décision — fiabilité/robustesse** :
- `GenerateService.Generate` et `GenerateSpecifications` enveloppent
  désormais le contexte reçu dans un `context.WithTimeout` commun
  (`generateTimeout = 90s`), au niveau de la couche partagée entre
  fournisseurs plutôt que dans chaque client. Sans cette borne, la
  boucle de retry Mistral (jusqu'à 4 tentatives, chacune pouvant
  attendre le timeout HTTP du client) pouvait théoriquement dépasser
  plusieurs minutes avant d'échouer.
- Ajout de garde-fous de taille en défense en profondeur, sur le même
  patron que les validations existantes (`errEmptyText`) : texte
  d'entrée limité à `maxTextLength = 20000` caractères, liste
  d'activités à `maxActivityRefs = 300` — évite d'envoyer par erreur
  (copier-coller massif, projet très volumineux) une requête
  disproportionnée à un fournisseur externe, ce qui coûte du temps, des
  tokens, et augmente le risque de nouvelles limites de débit (cf.
  incident 429 Mistral, ADR-014). Le `<textarea>` de saisie en langage
  naturel reçoit un `maxLength` HTML correspondant, pour un signal
  visuel côté utilisateur cohérent avec la limite serveur.

**Justification** : la limite de contexte est placée dans
`GenerateService` (couche provider-agnostic) plutôt que dupliquée dans
chaque client LLM, pour qu'elle protège uniformément Anthropic et
Mistral sans dépendre du comportement de retry propre à chacun. Les
limites de taille suivent le patron `validationError` déjà en place
plutôt que d'introduire un nouveau type d'erreur.

**Conséquences** : premiers tests automatisés pour `internal/service`
(`generate_service_test.go`) — texte/liste au-dessus et à la limite,
absence de générateur configuré. Vérifié bout en bout avec un faux
serveur Mistral local comptant les requêtes : après une première
génération de SSS, le bouton se désactive et un second clic ne déclenche
aucun appel HTTP supplémentaire (compteur de requêtes inchangé).

---

## ADR-017 — Couleurs des flèches et des cases : distinguer départ et arrivée

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : demande explicite utilisateur — sur le diagramme de
processus, jouer sur la couleur des flèches et des cartes pour bien
visualiser le départ et l'arrivée de chaque flèche. Avant ce changement,
une interaction était peinte d'une seule couleur (celle de l'acteur
source) du début à la fin, y compris la pointe de flèche : rien ne
distinguait visuellement le point de départ du point d'arrivée quand une
interaction traversait deux acteurs de couleurs différentes.

**Décision** :
- Chaque flèche (interaction) est maintenant tracée avec un dégradé
  linéaire allant de la couleur de l'acteur source à celle de l'acteur
  cible (`LayoutEdge.sourceColor` / `targetColor` dans `layout.ts`, un
  `<linearGradient>` par flèche dans `ProcessDiagram.tsx`), plutôt qu'une
  couleur unique.
- Point de départ marqué par un petit disque plein dans la couleur de
  l'acteur source (marqueur SVG mutualisé par couleur, pas par flèche,
  pour limiter le nombre d'éléments DOM) ; pointe d'arrivée marquée par
  une flèche plus large (18px) dans la couleur de l'acteur cible.
- Cartes d'activité (`nodes.tsx` / `process-diagram.css`) : bordure
  gauche ajoutée en plus de la bordure supérieure déjà existante, et léger
  fond teinté (`color-mix`) dans la couleur de l'acteur, pour que la carte
  elle-même soit facilement associée à la couleur des flèches qui en
  partent ou y arrivent.
- **Piège technique rencontré** : un premier essai avec
  `gradientUnits="objectBoundingBox"` (dégradé exprimé en pourcentage de
  la boîte englobante du tracé) s'est révélé invisible sur la majorité
  des flèches. Cause : les tracés `smoothstep` de React Flow sont
  composés de segments droits horizontaux ou verticaux ; sur un segment
  purement horizontal ou vertical, la boîte englobante a une largeur ou
  une hauteur nulle dans un axe, ce qui rend la transformation du
  dégradé `objectBoundingBox` singulière (le SVG ne peut pas la peindre,
  silencieusement — pas d'erreur console). Corrigé en passant à
  `gradientUnits="userSpaceOnUse"` avec des coordonnées absolues (centre
  approximatif de la carte source et de la carte cible, calculées dans
  `computeLayout`) : ce système de coordonnées est celui du `<path>` qui
  référence le dégradé (donc le même repère que les positions de nœuds
  du layout), pas celui du conteneur SVG qui définit le `<defs>`.

**Justification** : dégradé plutôt que, par exemple, une flèche à
pointillés bicolores ou deux segments de couleurs différentes, pour
rester lisible sur des tracés courts comme longs sans complexifier le
tracé SVG lui-même (on ne touche qu'au remplissage `stroke`, pas au `d`
du chemin). Marqueur de départ mutualisé par couleur (et non par flèche)
pour ne pas multiplier inutilement les `<marker>` du DOM alors que le
nombre de couleurs distinctes (une par acteur) reste petit.

**Conséquences** : vérifié bout en bout avec un projet de test couvrant
des interactions dans les deux sens (avant/arrière dans le temps, entre
phases et au sein d'une même phase) : dans tous les cas, le dégradé part
bien de la couleur de l'acteur source et arrive à celle de l'acteur
cible, quel que soit le sens géométrique réel du tracé. Limite connue,
non corrigée ici (hors périmètre de la demande) : deux interactions
réciproques entre les deux mêmes activités (aller et retour) partagent
exactement les mêmes points d'ancrage et se superposent visuellement,
seule la dernière tracée reste visible — un futur ajustement pourrait
décaler légèrement les tracés réciproques comme c'est déjà fait pour la
répartition des poignées (`HANDLES_PER_SIDE`).

---

## ADR-018 — Sous-colonnes par phase pour les activités concurrentes

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : demande explicite utilisateur — pouvoir répartir les
activités d'une phase sur plusieurs colonnes, pour clarifier les
différentes activités de plusieurs acteurs au sein d'une même phase.
Avant ce changement, une phase occupait toujours une seule colonne de
largeur fixe (`COLUMN_WIDTH`) : quand un acteur avait plusieurs activités
concurrentes dans une même phase, elles s'empilaient verticalement dans
cette colonne étroite (`CARD_STACK_OFFSET`), ce qui allongeait fortement
la ligne de cet acteur tout en laissant les autres lignes très courtes
pour la même phase — rendant la phase difficile à lire d'un coup d'œil.

**Décision** :
- `computeLayout` calcule maintenant, pour chaque phase, le nombre de
  sous-colonnes nécessaires : le plus grand nombre d'activités qu'un
  même acteur a dans cette phase (`subColumnsByPhase`). Une phase sans
  activité concurrente garde une seule sous-colonne (comportement
  inchangé) ; une phase chargée s'élargit d'autant de multiples de
  `SUBCOLUMN_WIDTH` (ex-`COLUMN_WIDTH`).
- Les activités concurrentes d'un acteur dans une phase sont placées
  côte à côte (sous-colonnes) plutôt qu'empilées verticalement. Les
  lignes d'acteur repassent à une hauteur fixe (`ROW_HEIGHT`, ex-
  `MIN_ROW_HEIGHT`) : plus de calcul dynamique par acteur
  (`maxStackByActor`/`CARD_STACK_OFFSET`, supprimés).
- L'en-tête de phase (`PhaseHeaderNode`) reçoit sa largeur via
  `data.width` (calculée par `computeLayout`) au lieu d'une largeur fixe
  importée : l'en-tête s'étire visuellement sur toute la largeur occupée
  par les sous-colonnes de la phase.
- Routage des poignées d'interaction : le critère « même phase » ne
  suffit plus à décider d'un routage vertical (haut/bas), puisque deux
  activités de la même phase peuvent maintenant être dans des
  sous-colonnes différentes (donc pas alignées verticalement). Remplacé
  par un critère plus précis : même phase **et** même sous-colonne
  (`activitySubColumn`), sinon routage horizontal (gauche/droite) comme
  pour les interactions inter-phases.

**Justification** : réutilise le patron déjà en place (une passe de
comptage par clé `actorId:phaseId`, déjà présente pour l'ancien calcul de
hauteur de ligne) en changeant simplement l'axe et la cible du calcul
(largeur de phase plutôt que hauteur de ligne), plutôt que d'introduire
un mécanisme de mise en page entièrement différent. Aucun nouveau champ
n'est nécessaire sur `Activity` : la sous-colonne d'une activité est
déterminée automatiquement par son rang d'apparition (`order`) parmi les
activités du même acteur dans la même phase, comme l'était déjà sa
position d'empilement vertical avant ce changement.

**Conséquences** : vérifié bout en bout avec un projet de test où un
acteur (le serveur) a quatre activités concurrentes dans une même phase
pendant que les deux autres acteurs n'en ont qu'une ou deux : la phase
s'élargit correctement sur quatre sous-colonnes, toutes les lignes
d'acteur restent à hauteur constante, et les interactions traversant la
phase élargie (y compris celles alignées verticalement dans la même
sous-colonne) restent correctement colorées et routées (voir ADR-017).

---

## ADR-019 — Glisser-déposer une activité pour la réassigner

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : demande explicite utilisateur — pouvoir déplacer une
carte d'activité à la souris sur le diagramme. Avant ce changement, la
seule façon de changer l'acteur ou la phase d'une activité était
l'onglet Édition (deux menus déroulants par activité) : correct mais
indirect pour un ajustement rapide pendant qu'on regarde le diagramme.

**Décision** :
- Seules les cartes d'activité deviennent déplaçables (`draggable: true`
  dans `layout.ts`) ; les en-têtes de ligne/colonne restent fixes.
- Au relâchement (`onNodeDragStop`), la position de dépose est convertie
  en cellule (acteur, phase) cible via une nouvelle fonction
  `computeDropTarget` : elle cherche, parmi les nœuds d'en-tête déjà
  calculés par `computeLayout`, la ligne d'acteur et la colonne de phase
  dont la bande contient le centre de la carte lâchée (repli sur la
  ligne/colonne la plus proche si le dépôt tombe hors de la grille,
  plutôt que d'ignorer le geste).
- La carte n'a **pas** de position libre mémorisée : `computeDropTarget`
  ne fait que déterminer `actorId`/`phaseId` (et un index d'insertion
  dans la pile de la cellule cible, pour l'ordre relatif si plusieurs
  activités s'y trouvent déjà). Au rendu suivant, `computeLayout`
  replace la carte exactement à la position de grille de sa nouvelle
  cellule — cohérent avec le reste de l'app où la disposition est
  entièrement dérivée des données, jamais stockée à part.
- Réassigner une carte à une cellule déjà occupée par d'autres activités
  déclenche naturellement l'élargissement en sous-colonnes déjà décrit en
  ADR-018 (aucune logique supplémentaire nécessaire : `computeLayout`
  recalcule le nombre de sous-colonnes de chaque phase à chaque rendu).
- Suit le même modèle d'édition que les autres onglets (Édition,
  Spécifications) : le déplacement ne modifie que l'état React local
  (`onChange`) ; un bouton « Sauvegarder » dédié (ajouté dans un nouvel
  en-tête au-dessus du canevas, avec le même statut d'enregistrement que
  les autres onglets) persiste vers l'API. Pas de sauvegarde automatique
  à chaque glisser-déposer, pour rester cohérent avec l'app et éviter de
  multiplier les écritures réseau pendant qu'on ajuste le diagramme.
- Renumérotation de `order` limitée à la cellule cible (et, implicitement
  laissée inchangée pour la cellule de départ, dont l'ordre relatif des
  activités restantes ne change pas quand l'une d'elles part) : `order`
  n'a d'effet que comparé entre activités partageant le même
  (`actorId`,`phaseId`) — vérifié qu'aucun autre écran de l'app n'utilise
  `Activity.order` en dehors de ce calcul d'empilement — donc aucun
  besoin d'unicité globale des valeurs, ni de renumérotation en cascade
  du reste du projet.

**Justification** : réutilise les nœuds d'en-tête déjà produits par
`computeLayout` (positions et largeurs déjà calculées pour l'affichage)
plutôt que de dupliquer le calcul de grille dans une fonction séparée —
`computeDropTarget` se contente de les parcourir. Pas de nouveau champ de
position libre sur `Activity` : le glisser-déposer est une manière plus
directe d'éditer les mêmes champs (`actorId`, `phaseId`, `order`) que
l'onglet Édition modifie déjà, pas un mode d'affichage parallèle avec son
propre état à synchroniser.

**Conséquences** : vérifié bout en bout avec Playwright (glisser-déposer
réel à la souris, pas une simulation d'événement React) sur deux
scénarios : (1) déplacer une carte vers un autre acteur dans la même
phase — `actorId` mis à jour, couleur de la carte et dégradé de la
flèche entrante recalculés correctement ; (2) déplacer une carte vers une
autre phase déjà occupée par une activité du même acteur — `phaseId`
mis à jour et la phase cible s'élargit automatiquement en deuxième
sous-colonne (ADR-018). Changements confirmés persistés côté serveur
après clic sur Sauvegarder (relecture directe via l'API).

---

## ADR-020 — Position de colonne explicite pour une activité isolée

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : suite à ADR-019, l'utilisateur signale un cas non couvert
— une activité seule d'un acteur dans une phase que d'autres acteurs ont
élargie en plusieurs sous-colonnes (ADR-018) restait toujours coincée
dans la première sous-colonne, sans moyen de l'aligner sur une autre. En
cause : la sous-colonne d'une activité était jusqu'ici *dérivée* de son
rang parmi les activités du même acteur dans cette phase (via `order`,
triée puis comptée) — pour un acteur qui n'a qu'une seule activité dans
cette phase, ce rang vaut toujours 0, quelle que soit la position de
dépose visée : aucune valeur de `order`, seule, ne peut représenter
« sous-colonne 2 alors que je suis la seule activité de mon acteur ici ».

**Décision** :
- `Activity` gagne un champ `Column int` (`column` en JSON). `0` (valeur
  par défaut, y compris pour tous les projets enregistrés avant ce
  changement — le zéro-valeur JSON/Go tombe naturellement dessus) signifie
  « pas de choix explicite » : l'activité participe à l'empilement
  automatique par `order`, exactement comme avant. Une valeur `> 0` fige
  sa sous-colonne, même sans activité voisine du même acteur dans cette
  phase pour justifier ce rang.
- `computeLayout` (nouvelle fonction `resolveColumns`) résout, par
  cellule (acteur, phase) : les activités à colonne explicite gardent
  leur valeur telle quelle ; les autres (colonne à 0) se répartissent
  automatiquement sur les sous-colonnes encore libres de leur acteur
  dans cette phase, dans leur ordre relatif (`order`) — en sautant celles
  déjà prises par une activité explicite du même acteur. La largeur de
  chaque phase se déduit de la plus grande sous-colonne réellement
  utilisée (explicite ou automatique), toutes activités confondues.
- Glisser-déposer (`ProcessDiagram.handleNodeDragStop`) distingue deux
  cas selon la position de dépose relative à la pile actuelle de
  l'acteur cible dans la phase cible : dépose au sein ou juste après
  cette pile → réordonnancement par `order` comme avant (ADR-019), et
  `column` remis à 0 (au cas où l'activité avait une position explicite
  d'un déplacement précédent — sinon elle resterait figée là après un
  glisser qui visait, lui, un réordonnancement normal) ; dépose au-delà
  → nouvelle branche, fixe `column` à la sous-colonne visée sans toucher
  à `order` ni aux voisins.

**Justification** : une valeur dérivée (rang parmi les activités du même
acteur) ne peut structurellement pas représenter une position
indépendante du nombre de voisins — il fallait un champ dédié plutôt
qu'une astuce sur `order`. Sentinelle à 0 (plutôt que -1 ou un pointeur
nullable) délibérément choisie pour coïncider avec le zéro-valeur
JSON/Go : les projets existants, qui n'ont jamais eu ce champ, se
comportent après migration exactement comme avant (aucune migration de
données nécessaire). Contrepartie acceptée : une position explicite à 0
est indiscernable d'une position automatique — sans conséquence
observable, puisque l'algorithme d'auto-assignation place de toute façon
la première activité disponible en position 0.

**Conséquences** : vérifié bout en bout avec Playwright — un acteur
(Cuisinier) avec une seule activité dans une phase élargie à 3
sous-colonnes par un autre acteur (Serveur, 3 activités) : avant le
correctif, l'activité du Cuisinier restait bloquée en sous-colonne 0 ;
glissée sur la 3ᵉ sous-colonne (alignée sous la 3ᵉ activité du Serveur),
elle s'y positionne et le reste après rechargement (`column: 2` confirmé
via relecture API après Sauvegarder). Non-régression vérifiée sur les
deux scénarios d'ADR-019 (réassignation d'acteur/phase, réordonnancement
au sein d'une même pile) : comportement inchangé.

---

## ADR-021 — Scénarios de test V&V (Polarion) liés aux SSS

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : demande explicite utilisateur — sur la base des SSS
générées, ajouter un sous-onglet dans l'onglet Spécifications pour les
scénarios de test de Vérification & Validation, au format Polarion.
Explicitement, la génération des SSS doit aussi générer leurs scénarios
de test dans la foulée (un seul clic). Deux questions de clarification
posées et tranchées par l'utilisateur : (1) le "format Polarion" attendu
est une structure V&V générique affichée/éditable dans l'app (titre,
préconditions, étapes numérotées action/résultat attendu), pas un export
vers un gabarit Polarion précis ; (2) la génération doit être possible
aussi bien groupée (avec les SSS) qu'à la demande pour des SSS
existantes (y compris saisies manuellement).

**Décision** :
- Nouveau domaine `TestScenario` (`ID`, `Code`, `Title`,
  `SpecificationID`, `Preconditions`, `Steps []TestStep{Action,
  ExpectedResult}`, `Status`), sur le même patron que `Specification`
  (code séquentiel `TC-NNN`, statut brouillon/approuvé/obsolète). Lien
  one-directionnel vers la spécification vérifiée (`SpecificationID`),
  comme `Interaction` référence ses activités — validé par
  `Project.Validate()` (référence vers une spécification existante).
  `Project` gagne un champ `TestScenarios`.
- Nouvelle capacité LLM `GenerateTestScenarios(specs []SpecRef)
  []DraftTestScenario`, ajoutée à l'interface `Generator` et implémentée
  par les deux fournisseurs (Anthropic, Mistral), sur le même patron que
  `GenerateSpecifications` : outil dédié (`propose_test_scenarios`),
  prompt dédié, corrélation par **code** de spécification (`SpecRef.Code`,
  ex. "SSS-001") plutôt que par nom+texte — un code est un identifiant
  plus fiable qu'un couple (nom d'activité, nom d'acteur) pour ce cas.
  `GenerateService.GenerateTestScenarios` reprend les mêmes garde-fous
  que `GenerateSpecifications` (timeout, taille max de la liste, ADR-016).
- Frontend : sous-onglet "Tests V&V" dans `SpecificationsPanel` (nav
  locale, pas un nouvel onglet principal — partage l'en-tête et le
  bouton Sauvegarder existants). `handleGenerateSss` enchaîne, après la
  fusion des SSS proposées, un appel `generateTestScenarios` pour
  uniquement les SSS **qui viennent d'être ajoutées** à cet appel (pas
  toutes les SSS du projet) puis fusionne le résultat dans le même
  `onChange` — un échec de cette seconde étape ne fait pas échouer la
  première (les SSS déjà générées restent acquises, message d'erreur
  distinct). `TestScenariosPanel` a son propre bouton "Générer... (IA)"
  filtré aux SSS sans scénario de test lié, pour l'usage à la demande.
  Suppression d'une spécification (`removeSpec`) cascade désormais vers
  ses scénarios de test liés, comme elle le fait déjà vers les
  `traceLinks` des activités.
- Corrigé au passage : la détection "clé API non configurée" dans
  `SpecificationsPanel` testait la sous-chaîne `"ANTHROPIC_API_KEY"`,
  qui n'apparaît dans aucun message d'erreur réel depuis l'introduction
  du multi-fournisseurs (ADR-013/014) — le message effectif est "clé API
  non configurée" (`llm.ErrNotConfigured`). Ce chemin ne s'était donc
  jamais déclenché correctement ; corrigé pour les deux générations (SSS
  et tests).

**Justification** : structure V&V générique plutôt qu'un export Polarion
strict, conformément à la clarification utilisateur — évite de figer un
gabarit d'export avant qu'un besoin précis (import direct dans une
instance Polarion réelle) ne soit exprimé. Corrélation par code plutôt
que par nom+texte : le texte d'une SSS peut être long et sujet à de
petites variations reformulées par le LLM, alors que son code est un
identifiant stable affiché tel quel dans le projet. Sous-onglet plutôt
que nouvel onglet principal : les scénarios de test n'ont de sens que
rapportés à des spécifications déjà là, pas un concept autonome au même
niveau que Édition/Diagramme/Spécifications.

**Conséquences** : vérifié bout en bout avec Playwright et un faux
serveur Mistral local répondant aux trois outils (`extract_process`,
`propose_specifications`, `propose_test_scenarios`) : un seul clic sur
"Proposer les SSS" produit bien 2 SSS puis 2 scénarios de test liés (un
par SSS) dans la même action ; le sous-onglet affiche le compte
("Tests V&V (2)") et chaque scénario avec sa spécification liée, ses
préconditions et son tableau d'étapes ; le bouton de génération à la
demande se désactive quand tout est déjà couvert et se réactive après
l'ajout manuel d'une SSS, puis génère correctement un scénario
supplémentaire pour cette seule SSS ; la suppression d'une SSS supprime
bien son scénario de test lié (cascade). Le tout confirmé persisté côté
serveur après Sauvegarder (relecture directe via l'API).

---

## ADR-022 — Correctif : crash sur l'onglet Spécifications (projets existants)

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : bug utilisateur remonté juste après ADR-021 — l'onglet
Spécifications plantait à l'ouverture pour un projet existant (créé
avant l'ajout des scénarios de test V&V). Cause : le fichier JSON d'un
projet enregistré avant ADR-021 n'a pas la clé `testScenarios`.
`encoding/json` laisse alors le slice Go correspondant à `nil` plutôt
qu'à un slice vide, et sérialise un slice `nil` en `null` (jamais `[]`).
L'API renvoyait donc `"testScenarios": null` pour tout projet antérieur
à ce champ ; côté frontend, plusieurs endroits (`SpecificationsPanel`,
`TestScenariosPanel`) appellent `.filter`/`.some`/`.length` dessus en
supposant toujours un tableau (comme le déclare le type TypeScript
`Project.testScenarios: TestScenario[]`, non optionnel) — d'où le crash
à l'appel sur `null`.

**Décision** :
- Nouvelle méthode `domain.Project.Normalize()` : force à `[]` tout
  champ collection resté `nil` après désérialisation (`Actors`,
  `Phases`, `Activities`, `Interactions`, `Specifications`,
  `TestScenarios`, ainsi que `Activity.UserStories`/`TraceLinks` et
  `TestScenario.Steps`) — pas seulement `TestScenarios`, pour parer
  pareillement à un futur champ collection ajouté de la même manière.
- Appelée dans `storage.Repository.Load` (juste après
  `json.Unmarshal`, avant de renvoyer le projet) et dans
  `storage.Repository.Save` (avant `Validate`, pour qu'un corps de
  requête `PUT` incomplet ne réécrive pas un `null` sur disque non plus).

**Justification** : corrigé à la source (couche stockage), pas côté
frontend avec des `?? []` défensifs à chaque site d'utilisation — l'API
REST ne doit jamais renvoyer `null` là où le contrat (type TypeScript
non optionnel) promet un tableau ; une normalisation dispersée côté
client aurait masqué le vrai problème sans le résoudre pour d'autres
consommateurs futurs de l'API. Champ par champ plutôt qu'une
normalisation générique par réflexion : reste explicite et lisible, et
le nombre de champs collection du domaine est petit et stable.

**Conséquences** : premier test pour `internal/storage`
(`TestLoad_NormalizesMissingCollectionsFromLegacyFile`) — charge un
fichier JSON minimal sans `testScenarios`/`interactions`/
`specifications`, vérifie qu'aucun de ces champs ne se résérialise en
`null`. Reproduit et vérifié bout en bout : un fichier project.json
écrit à la main sans la clé `testScenarios` (simulant un projet créé
avant ADR-021) ne fait plus planter ni l'onglet Spécifications ni son
sous-onglet Tests V&V une fois le correctif appliqué (zéro erreur JS en
console, capture d'écran de la page fonctionnelle) — alors qu'avant, la
même vérification aurait échoué avec le même fichier.

---

## ADR-023 — Filet de sécurité côté client pour les projets renvoyés par l'API

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : le crash d'ADR-022 a persisté pour l'utilisateur après le
correctif serveur, avec cette fois `Cannot read properties of undefined
(reading 'length')` — pas `null` comme prévu, mais `undefined` : la clé
`testScenarios` était totalement **absente** de la réponse JSON, pas
juste `null`. Cela ne peut arriver que si le processus serveur qui a
répondu ne connaît pas encore le champ `TestScenarios` dans sa struct Go
(donc antérieur à ADR-021) — le correctif ADR-022, lui, tourne côté
serveur : un serveur qui ne l'a pas encore ne peut pas s'auto-corriger.
Cause la plus probable : un serveur de développement local (`go run
./cmd/server`) qui n'a pas été redémarré après le `git pull` des derniers
correctifs — Vite recharge le frontend à chaud automatiquement, mais
rien ne redémarre le processus Go à sa place.

**Décision** : ajoute un filet de sécurité côté client, en écho à
`domain.Project.Normalize` côté serveur : une fonction `normalizeProject`
dans `api/client.ts`, appliquée à toute réponse `Project` (`getProject`,
`createProject`, `saveProject`), qui remplace par une valeur vide tout
champ collection absent ou `null` plutôt que de faire confiance à la
forme exacte de la réponse réseau.

**Justification** : le correctif serveur (ADR-022) reste la bonne
réparation de fond — sans lui, un fichier projet enregistré avant
ADR-021 continuerait de produire un `testScenarios: null` non désiré
dans les réponses d'un serveur à jour. Mais il suppose que le serveur
qui répond a bien le correctif déployé, ce qui n'est pas garanti à tout
instant (fenêtre de déploiement, ou ici un processus de dev non
redémarré) : un frontend qui plante purement parce que le backend qu'il
interroge est temporairement en retard est une fragilité en soi, quelle
qu'en soit la cause exacte. Normaliser au point d'entrée unique des
réponses `Project` (plutôt que des `?? []` dispersés à chaque site
d'utilisation dans les composants) garde l'invariant centralisé et
évite d'oublier un site d'utilisation futur.

**Conséquences** : vérifié bout en bout avec Playwright en interceptant
la réponse `GET /api/projects/:id` pour retirer la clé `testScenarios`
avant qu'elle n'atteigne le frontend (reproduit exactement le symptôme
signalé : champ absent, pas `null`) — le frontend affiche désormais
l'onglet Spécifications et son sous-onglet Tests V&V normalement, zéro
erreur JS en console, là où il plantait avant ce correctif. Rappel
transmis à l'utilisateur : penser à redémarrer le serveur Go local après
chaque `git pull`, Vite ne le fait pas à sa place.

---

## ADR-024 — Matrice de traçabilité en sous-onglet, avec couverture par test

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : demande explicite utilisateur — déplacer la matrice de
traçabilité (jusqu'ici une section en bas du sous-onglet Spécifications)
dans son propre sous-onglet, à droite de "Tests V&V", et y ajouter une
dimension indiquant si chaque spécification est couverte par un
scénario de test ou non.

**Décision** :
- `SpecificationsPanel` gagne un troisième sous-onglet `matrix`
  ("Matrice de traçabilité"), après "Spécifications" et "Tests V&V" —
  la section `<TraceabilityMatrix>` est sortie du sous-onglet
  "Spécifications" pour y être déplacée telle quelle.
- Le libellé du sous-onglet affiche un décompte `(N/M couvertes)`
  (spécifications ayant au moins un scénario de test lié / total), sur
  le même patron que "Tests V&V (N)".
- `TraceabilityMatrix` : chaque en-tête de colonne (une spécification)
  affiche désormais, sous son code, un badge "✓ testée" ou "✗ sans
  test" — calculé directement (`project.testScenarios.some(t =>
  t.specificationId === spec.id)`), sans nouveau champ ni état à
  synchroniser.

**Justification** : la couverture par un test est une propriété de la
**spécification** (la colonne), pas de la paire activité↔spécification
que la matrice édite déjà (les cases à cocher) — d'où un badge sur
l'en-tête de colonne plutôt qu'une ligne ou une case supplémentaire, qui
aurait mélangé deux dimensions différentes. Affiché dans l'en-tête
(toujours visible) plutôt que dans une ligne de pied de tableau, qui
serait hors champ dès que la liste d'activités s'allonge.

**Conséquences** : vérifié bout en bout avec Playwright — un projet de
test avec deux SSS (une seule liée à un scénario de test) affiche
correctement l'ordre des sous-onglets (Spécifications, Tests V&V,
Matrice de traçabilité), le décompte "1/2 couvertes" dans le libellé, et
les badges "✓ testée" / "✗ sans test" sur les bonnes colonnes.

---

## ADR-025 — Tags des tests liés dans la vue par acteur

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : demande explicite utilisateur — dans la vue par acteur,
ajouter le tag du/des scénarios de test qui vérifient chaque activité,
en écho aux puces de spécifications déjà affichées.

**Décision** :
- Pour chaque activité, calcule les scénarios de test vérifiant l'une de
  ses spécifications liées (`act.traceLinks` → spécifications → tests
  dont `specificationId` correspond), dédoublonnés par id (une
  spécification peut avoir plusieurs scénarios).
- Affiche ces tests sous forme de puces vertes (`.test-chip`, écho
  visuel du badge "✓ testée" d'ADR-024), juste sous les puces de
  spécification existantes (`.spec-chip`, bleues) — seulement quand
  l'activité a au moins une spécification (sinon le message "Aucune
  spécification liée" déjà affiché suffit, un second message "Aucun
  test lié" serait redondant).
- Étend le compteur de synthèse en tête de vue (déjà "X sans
  interaction · Y sans spécification liée") d'un "Z sans test lié" :
  une activité qui a une spécification mais dont aucune n'est vérifiée
  par un test.

**Justification** : réutilise directement les données déjà chargées
(`project.testScenarios`, liées par `specificationId`) sans recalcul
côté serveur ni nouveau champ — cohérent avec le reste de la vue par
acteur, qui est un simple regroupement/filtrage de l'état déjà présent
dans `project`. Puces vertes plutôt que bleues comme les specs : reprend
le code couleur déjà établi pour "couvert par un test" (ADR-024).

**Conséquences** : vérifié bout en bout avec un acteur ayant trois
activités aux profils différents — une entièrement couverte (2
spécifications, 2 tests, les deux puces vertes affichées), une
spécifiée mais non testée (le message "Aucun test lié" apparaît), une
sans aucune spécification (seul "Aucune spécification liée" s'affiche,
pas de message redondant sur les tests). Le compteur de synthèse reflète
correctement "1 sans spécification liée · 1 sans test lié".

---

## ADR-026 — Pastille d'alerte sur Paramètres tant qu'aucun LLM n'est configuré

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : demande explicite utilisateur — tant qu'aucune
information de connexion à un fournisseur LLM n'est renseignée, afficher
une pastille rouge sur le bouton Paramètres de la barre latérale, pour
que l'absence de configuration soit visible sans avoir à ouvrir la
modale.

**Décision** :
- `ProjectShell` charge désormais `api.getSettings()` au montage (comme
  il le fait déjà pour la liste des projets) et garde
  `llmConfigured: boolean | null` en état — `null` tant que la réponse
  n'est pas arrivée, pour ne pas afficher brièvement la pastille à
  chaque démarrage avant de savoir si un fournisseur est réellement
  configuré.
- `SettingsModal` reçoit un callback optionnel `onSettingsChange` qu'il
  appelle à chaque fois que son propre état `configured` change
  (chargement initial de la modale, après enregistrement, après retrait
  de la clé) — `ProjectShell` le branche sur `setLlmConfigured` pour que
  la pastille réagisse immédiatement, sans réinterroger l'API une
  seconde fois ni attendre la fermeture de la modale.
- Pastille (`.settings-alert-dot`, un simple point rouge) affichée
  uniquement quand `llmConfigured === false`, à côté du texte "⚙
  Paramètres" en barre latérale dépliée, ou en surimpression sur
  l'icône seule en barre repliée.

**Justification** : plutôt que de dupliquer l'appel `getSettings` dans
les deux composants sans les synchroniser, le callback fait de
`SettingsModal` la source de vérité pour tout changement pendant qu'il
est ouvert, tandis que `ProjectShell` ne fait le chargement initial
qu'une fois — évite un état incohérent où la pastille resterait affichée
après un enregistrement réussi tant que la modale n'a pas été refermée.

**Conséquences** : vérifié bout en bout avec Playwright — pastille
visible dès le chargement initial (sidebar dépliée et repliée), disparaît
immédiatement après l'enregistrement d'une clé (avant même la fermeture
de la modale), reste absente une fois la modale fermée, puis réapparaît
après le retrait de la clé.

---

## ADR-027 — Extraction du processus : méthode backbone + correction d'un bug d'homonymes

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : demande explicite utilisateur — améliorer l'analyse de la
description en langage naturel utilisée pour générer le diagramme, pour
qu'une description simple produise déjà un processus solide, en
s'appuyant si utile sur des skills. La skill `story-mapping` (méthode
backbone : acteurs → grandes étapes chronologiques → tâches par
activité → dépendances) a servi de référence pour restructurer le prompt
d'extraction (`processSystemPrompt`).

**Décision** :
- Prompt réécrit en 4 étapes explicites reprenant la méthode backbone :
  (1) acteurs, sans doublon de rôle sous deux noms ; (2) phases comme
  colonne vertébrale chronologique couvrant le parcours de bout en bout,
  chaque phase marquant une transition claire ; (3) activités à grain
  métier reconnaissable (ni trop larges/vagues, ni découpées en
  micro-étapes techniques) ; (4) interactions capturées dès qu'un
  échange est perceptible dans le texte, pas seulement quand il est
  formulé explicitement. Le garde-fou anti-invention (ADR déjà en place
  implicitement) est conservé et reformulé : inférer ce qui découle
  logiquement du texte est admis, inventer un acteur/une phase/une
  activité sans appui dans le texte ne l'est pas.
- **Bug corrigé au passage** (découvert en concevant le point 4) :
  `DraftInteraction` n'identifiait une activité que par son **nom seul**
  (`fromActivityName`/`toActivityName`), sans son acteur. Deux acteurs
  différents portant une activité de même nom (ex. "Payer" côté client
  et côté serveur, cas fréquent) étaient donc, côté frontend
  (`mergeDraft.ts`) : (a) l'un des deux silencieusement perdu au
  dédoublonnage des activités (comparaison par nom seul), et (b) même
  quand les deux étaient présentes, une interaction les visant pouvait
  se relier à la mauvaise occurrence. Corrigé en ajoutant
  `fromActorName`/`toActorName` à `DraftInteraction` (Go et TypeScript,
  schéma d'outil mis à jour), et en faisant résoudre `mergeDraft.ts`
  toute activité — au dédoublonnage comme à la résolution des
  interactions — par la paire (nom, acteur), jamais le nom seul, sur le
  même patron déjà utilisé par `mergeSpecDrafts.ts`.

**Justification** : la qualité d'un "processus solide" à partir d'un
texte simple tient autant à la méthode d'extraction (le prompt) qu'à la
fidélité du plan de données à ce que le LLM restitue — un bug qui perd
ou mélange des activités homonymes aurait continué à saboter des
extractions par ailleurs bien structurées. Les deux corrections sont
donc traitées ensemble plutôt que séparément.

**Conséquences** : vérifié bout en bout avec un faux serveur Mistral
renvoyant délibérément deux activités "Payer" (une par acteur) reliées
par une interaction : les deux activités sont bien créées (avant le
correctif, la seconde aurait été perdue), et le diagramme affiche
correctement la flèche partant du "Payer" du client vers celui du
serveur, avec le dégradé de couleur attendu (ADR-017) — confirmant que
l'interaction s'est reliée à la bonne paire.

---

## ADR-028 — Chargement d'un PDF comme point de départ (sans OCR)

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : question utilisateur — est-il possible de charger un PDF
en entrée de la génération de processus ? Clarifié avant implémentation :
la structure V&V/Polarion attendue est générique (déjà en place, hors
sujet ici) et, pour ce chantier PDF, la décision retenue est de traiter
uniquement les PDF texte pour l'instant — pas d'OCR (trop lourd et peu
fiable pour un premier passage).

**Décision** :
- Ajout de `pdfjs-dist` côté frontend uniquement. Nouveau module
  `pdfText.ts` (`extractPdfText(file): Promise<string>`) qui extrait le
  texte de chaque page d'un PDF et les concatène.
- Extraction **côté client**, jamais envoyée au serveur : pas de nouvel
  endpoint, pas de nouvelle dépendance Go, le fichier ne quitte pas le
  navigateur.
- Dans `NlInput`, un bouton "Charger un PDF" (déclenchant un `<input
  type="file" hidden>`) extrait le texte et **préremplit le textarea**
  existant — l'utilisateur relit/édite avant de cliquer "Générer",
  exactement le même flux que la saisie manuelle ou "Charger l'exemple
  restaurant" (cohérent avec ADR-002 : toujours relire avant de
  committer). Le texte extrait est tronqué à `MAX_TEXT_LENGTH` (20000,
  aligné sur la limite serveur déjà en place) si besoin, avec un message
  explicite.
- Si aucun texte n'est extrait (PDF scanné/image), message clair
  indiquant que l'OCR n'est pas pris en charge — pas de génération
  lancée sur un texte vide.
- `pdfjs-dist` et son worker sont importés **dynamiquement**
  (`import()`) dans `extractPdfText`, pas en haut de fichier : un
  premier essai avec import statique faisait passer le bundle principal
  de ~412 Ko à ~845 Ko gzippé pour tout le monde, alors que seuls les
  utilisateurs cliquant "Charger un PDF" ont besoin de cette
  bibliothèque. Avec l'import dynamique, le bundle principal reste
  inchangé et `pdfjs-dist` (+ son worker, ~1,3 Mo) ne se charge qu'à la
  demande.
- Corrigé au passage : `NlInput.tsx` avait le même bug de détection
  "clé API non configurée" que celui déjà corrigé dans
  `SpecificationsPanel.tsx` (ADR-021) — teste toujours la sous-chaîne
  obsolète `ANTHROPIC_API_KEY`.

**Justification** : extraction côté client plutôt que serveur, pour
rester dans l'esprit "aucune donnée projet ne quitte la machine sans
raison" déjà en place pour les clés API, et pour éviter d'ajouter une
dépendance Go de traitement PDF (le projet n'a que la stdlib +
`net/http` côté serveur jusqu'ici). Préremplissage du textarea plutôt
qu'un envoi direct à la génération, pour ne pas casser l'étape de
relecture qui est un principe déjà établi du projet.

**Conséquences** : vérifié bout en bout avec un vrai PDF généré pour le
test (bibliothèque municipale, 2 acteurs, 3 phases) — le texte extrait
apparaît correctement dans le textarea, prêt à être édité puis généré.
Vérifié aussi le cas PDF sans texte (page dessinée, aucun contenu
textuel) : message d'erreur explicite affiché, aucune génération
tentée. Bundle applicatif principal confirmé inchangé après le passage à
l'import dynamique (regression testée via une mesure avant/après).

---

## ADR-029 — Ordre des boutons de l'onglet Générer

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : demande explicite utilisateur — revoir l'ordre des
boutons de l'onglet Générer pour qu'il soit logique du point de vue UX.
Depuis l'ajout du chargement de PDF (ADR-028), l'ordre était "Générer",
"Charger l'exemple restaurant", "Charger un PDF" : l'action finale
(lancer la génération) apparaissait en premier, avant même les actions
qui remplissent la zone de texte dont elle dépend.

**Décision** : réordonné en "Charger un PDF", "Charger l'exemple
restaurant", "Générer" — les deux actions qui alimentent le textarea
d'abord (dans l'ordre où elles ont été ajoutées au fil des sessions),
puis l'action de génération en dernier. Le bouton "Générer" garde son
style `btn-primary` (mise en avant visuelle) malgré sa position en fin
de ligne : la hiérarchie visuelle (couleur) et l'ordre de lecture
(position) restent deux signaux distincts et cohérents avec le patron
habituel "remplir un formulaire puis valider".

**Justification** : l'ordre gauche-à-droite d'une barre d'actions se lit
naturellement comme une séquence chronologique. Un bouton d'action
finale placé avant ses prérequis est trompeur, même désactivé — l'œil le
voit et le lit en premier avant de comprendre qu'il faut faire autre
chose avant.

**Conséquences** : vérifié visuellement (Playwright) — l'ordre affiché
est désormais "Charger un PDF", "Charger l'exemple restaurant",
"Générer", conforme au flux attendu.

## ADR-030 — Prérequis de versions Node/Go documentés

**Date** : 2026-09-09
**Statut** : Retenu

**Contexte** : un second poste (Windows, Node v20.9.0, Go absent du
PATH) a échoué au premier `npm run dev` après un `git pull` : erreur
`SyntaxError: The requested module 'node:util' does not provide an
export named 'styleText'` dans rolldown (dépendance de Vite 8), plus
des warnings `EBADENGINE` sur `pdfjs-dist` (exige Node ≥ 22.13 ou ≥ 24),
`oxlint`, `@vitejs/plugin-react` et `vite` (exigent Node ≥ 20.19/22.12).
Rien dans le repo ne documentait de version minimale de Node ou de Go,
ni ne signalait l'absence de Go de façon actionnable au-delà du message
shell générique `go: command not found`.

**Décision** : ajout d'un champ `engines.node` (`>=22.13.0`, le
plancher le plus strict parmi les dépendances) dans `web/package.json`,
et d'un paragraphe « Prérequis » en tête de la section « Développement
local » du README précisant Go ≥ 1.24 et Node ≥ 22.13, avec
l'explication du symptôme (`EBADENGINE`, erreur `styleText`) pour que le
diagnostic soit immédiat la prochaine fois.

**Justification** : deux échecs distincts sur deux machines différentes
pour la même cause (prérequis non documentés) valent la peine d'être
corrigés une fois pour toutes plutôt que ré-expliqués à chaque nouvelle
installation.

**Conséquences** : `npm install` affichera un avertissement
`EBADENGINE` explicite sur le paquet `web` lui-même (pas seulement ses
dépendances transitives) si la version de Node est insuffisante ; le
README indique la version minimale de Go et de Node à installer avant
de commencer.
