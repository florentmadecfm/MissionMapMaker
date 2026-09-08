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
