# Journal de décisions (ADR) — MissionMapMaker

Ce journal trace les décisions structurantes du projet : le contexte, les
options envisagées, le choix retenu et pourquoi. Il est complété au fil des
sessions de planification et de développement (voir aussi
`docs/architecture.md` pour la synthèse architecturale).

Ce journal ne garde que ce qui concerne vraiment l'architecture et les
décisions techniques (modèle de données, choix de technologie, protocoles,
patrons transverses). Les décisions purement visuelles/UX, les corrections
de bugs ponctuelles sans patron durable, et les notes de process ou de
dépannage ont été retirées lors d'un nettoyage — la numérotation des ADR
restants n'est donc pas continue, ce qui est normal et attendu.

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

## ADR-012 — Clé API configurable depuis l'interface

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : demande explicite utilisateur — pouvoir saisir la clé API
Anthropic depuis l'interface plutôt que par variable d'environnement
uniquement.

**Décision** :
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
propre du serveur sans variable d'environnement. Reste à faire : tester
avec une vraie clé pour valider le contenu généré (toujours bloqué par
l'absence de clé réelle dans l'environnement de développement).

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
tentatives. Diagnostic mené avec l'utilisateur via un `curl` direct vers
`api.mistral.ai` (en dehors de l'app, sans exposer la clé) : la réponse
contenait `x-ratelimit-limit-req-minute: 0`, prouvant sans ambiguïté que
le compte Mistral lui-même n'a aucun quota alloué (aucune tentative ne
pouvait résoudre ça) — probablement un compte tout juste créé sans moyen
de paiement enregistré. Pas une action corrective dans l'app, mais une
méthode de diagnostic à retenir : quand une erreur persiste malgré des
correctifs raisonnables côté client, un appel `curl` direct au
fournisseur (sans passer par notre code) isole rapidement si le problème
est chez nous ou chez le fournisseur, en s'appuyant sur les en-têtes de
réponse plutôt que sur le seul message d'erreur.

---

## ADR-015 — URL de base configurable par fournisseur

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : demande explicite utilisateur — pouvoir configurer l'URL
d'API (ex. `https://api.mistral.ai/v1/chat/completions`) plutôt que
d'être limité à l'endpoint public codé en dur. Utile pour un proxy, un
déploiement régional/entreprise, un service compatible auto-hébergé, ou
pour diagnostiquer un problème réseau/fournisseur (voir post-scriptum
ADR-014).

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

## ADR-020 — Position de colonne explicite pour une activité isolée

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : le glisser-déposer d'une activité vers une autre cellule
(acteur × phase) a révélé un cas non couvert — une activité seule d'un
acteur dans une phase que d'autres acteurs ont élargie en plusieurs
sous-colonnes (ADR-018) restait toujours coincée dans la première
sous-colonne, sans moyen de l'aligner sur une autre. En cause : la
sous-colonne d'une activité était jusqu'ici *dérivée* de son rang parmi
les activités du même acteur dans cette phase (via `order`, triée puis
comptée) — pour un acteur qui n'a qu'une seule activité dans cette
phase, ce rang vaut toujours 0, quelle que soit la position de dépose
visée : aucune valeur de `order`, seule, ne peut représenter
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
  cette pile → réordonnancement par `order`, comme pour un
  réordonnancement normal au sein d'une pile, et `column` remis à 0 (au
  cas où l'activité avait une position explicite d'un déplacement
  précédent — sinon elle resterait figée là après un glisser qui visait,
  lui, un réordonnancement normal) ; dépose au-delà → nouvelle branche,
  fixe `column` à la sous-colonne visée sans toucher à `order` ni aux
  voisins.

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
scénarios de glisser-déposer déjà couverts (réassignation d'acteur/
phase, réordonnancement au sein d'une même pile) : comportement
inchangé.

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

**Justification** : structure V&V générique plutôt qu'un export Polarion
strict, conformément à la clarification utilisateur — évite de figer un
gabarit d'export avant qu'un besoin précis (import direct dans une
instance Polarion réelle) ne soit exprimé. Corrélation par code plutôt
que par nom+texte : le texte d'une SSS peut être long et sujet à de
petites variations reformulées par le LLM, alors que son code est un
identifiant stable affiché tel quel dans le projet.

**Conséquences** : vérifié bout en bout avec Playwright et un faux
serveur Mistral local répondant aux trois outils (`extract_process`,
`propose_specifications`, `propose_test_scenarios`) : un seul clic sur
"Proposer les SSS" produit bien 2 SSS puis 2 scénarios de test liés (un
par SSS) dans la même action ; le bouton de génération à la demande se
désactive quand tout est déjà couvert et se réactive après l'ajout
manuel d'une SSS, puis génère correctement un scénario supplémentaire
pour cette seule SSS ; la suppression d'une SSS supprime bien son
scénario de test lié (cascade). Le tout confirmé persisté côté serveur
après Sauvegarder (relecture directe via l'API).

---

## ADR-022 — Correctif : normalisation des collections au chargement/écriture

**Date** : 2026-09-08
**Statut** : Retenu

**Contexte** : bug utilisateur remonté juste après ADR-021 — l'onglet
Spécifications plantait à l'ouverture pour un projet existant (créé
avant l'ajout des scénarios de test V&V). Cause : le fichier JSON d'un
projet enregistré avant ADR-021 n'a pas la clé `testScenarios`.
`encoding/json` laisse alors le slice Go correspondant à `nil` plutôt
qu'à un slice vide, et sérialise un slice `nil` en `null` (jamais `[]`).
L'API renvoyait donc `"testScenarios": null` pour tout projet antérieur
à ce champ ; côté frontend, plusieurs endroits appellent
`.filter`/`.some`/`.length` dessus en supposant toujours un tableau
(comme le déclare le type TypeScript `Project.testScenarios:
TestScenario[]`, non optionnel) — d'où le crash à l'appel sur `null`.

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
  formulé explicitement.
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
en entrée de la génération de processus ? Décision retenue : traiter
uniquement les PDF texte pour l'instant — pas d'OCR (trop lourd et peu
fiable pour un premier passage).

**Décision** :
- Ajout de `pdfjs-dist` côté frontend uniquement. Nouveau module
  `pdfText.ts` (`extractPdfText(file): Promise<string>`) qui extrait le
  texte de chaque page d'un PDF et les concatène.
- Extraction **côté client**, jamais envoyée au serveur : pas de nouvel
  endpoint, pas de nouvelle dépendance Go, le fichier ne quitte pas le
  navigateur.
- Dans `NlInput`, un bouton "Charger un PDF" extrait le texte et
  **préremplit le textarea** existant — l'utilisateur relit/édite avant
  de cliquer "Générer", exactement le même flux que la saisie manuelle
  (cohérent avec ADR-002 : toujours relire avant de committer). Le texte
  extrait est tronqué à `MAX_TEXT_LENGTH` (20000, aligné sur la limite
  serveur déjà en place, ADR-016) si besoin, avec un message explicite.
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

## ADR-031 — Frontend embarqué dans le binaire Go (`go:embed`)

**Date** : 2026-09-09
**Statut** : Retenu

**Contexte** : après des frictions répétées liées à l'installation de
Node/Go sur un second poste, la question a été posée de committer
`web/node_modules` dans git pour obtenir un « paquet autonome ». Cette
piste a été écartée : `node_modules` (~210 Mo, et croissant à chaque
dépendance) contient des binaires natifs spécifiques à l'OS/l'archi
(Vite/rolldown/oxlint via `optionalDependencies`) — un `node_modules`
généré sur une machine Linux serait inutilisable sur Windows, donc
committer l'un des deux ne résout rien pour l'autre poste. Or
`node_modules` ne sert qu'au *build*, jamais à l'exécution : une fois
buildé, le frontend n'est que des fichiers statiques (HTML/JS/CSS), et
le backend Go compile déjà en un binaire statique unique.

**Décision** : embarquer les fichiers statiques du frontend buildé
(`web/dist/`) directement dans le binaire Go via `//go:embed all:dist`
(nouveau fichier `web/embed.go`, fonction `DistFS()`), servis par
`http.FileServerFS` sur toute route non préfixée par `/api` dans
`internal/api/router.go`. `web/dist` reste un artefact de build
ignoré par git (`web/.gitignore` : `dist/*` sauf un `.gitkeep`
placeholder committé, nécessaire pour que `//go:embed` ait toujours au
moins un fichier à embarquer même sans build frontend préalable — sinon
`go build`/`go run ./cmd/server` échouerait à la compilation sur un
clone frais, cassant le flux de dev quotidien qui n'a jamais besoin de
builder le frontend).

**Justification** : c'est la vraie réponse au besoin exprimé (un
artefact à copier sur une machine sans dépendance de toolchain à
l'exécution) — plus robuste qu'un `node_modules` committé (pas de
problème multi-plateforme, l'exécutable ne dépend que de sa propre
architecture de build, gérée par `GOOS`/`GOARCH` comme n'importe quel
binaire Go), et sans le coût de repo que représenterait `node_modules`
versionné.

**Conséquences** : `cd web && npm run build && cd .. && go build -o
bin/missionmapmaker ./cmd/server` produit un exécutable unique (~19 Mo)
servant l'API et l'interface sur le même port, sans Node/npm ni Go
nécessaires sur la machine cible. Le flux de dev quotidien
(`go run ./cmd/server` + `npm run dev` séparément) est inchangé et non
impacté par ce nouveau chemin de compilation. Vérifié bout en bout :
build Go avec seulement le placeholder (`go build` réussit, `/`
répond 404 comme attendu puisque non utilisé en dev), puis avec un
frontend réellement buildé (binaire lancé isolément sur un port de
test, `/`, les assets JS et `/api/*` répondent tous correctement,
test Playwright de bout en bout confirmant l'UI fonctionnelle depuis
ce seul binaire).

---

## ADR-032 — Toolchain frontend rabaissé pour compatibilité Node 20.9

**Date** : 2026-09-09
**Statut** : Retenu

**Contexte** : malgré la documentation du prérequis Node ≥ 22.13 dans le
README, le second poste (Node v20.9.0, Windows) reste bloqué : le fait
de mettre à jour Node n'est pas immédiat pour cet utilisateur
(dépendance à un mirroir Artifactory interne, accès non résolu).
Demande explicite : rendre l'application compatible avec la
configuration existante plutôt que d'attendre une mise à jour de poste.
Or les dernières versions de Vite (8.x, et déjà 7.x indépendamment de
son bundler rolldown), `@vitejs/plugin-react` (6.x) et oxlint (≥1.17)
exigent toutes Node ≥ 20.19/22.12 ; `pdfjs-dist` (≥6.0, et même 5.2+)
exige Node ≥ 20.16 ou ≥ 22.3/22.13. Aucune de ces versions ne fonctionne
sous Node 20.9.

**Décision** : rabaisser le toolchain frontend à la dernière version de
chaque paquet encore compatible avec Node 20.9, épinglée en version
exacte (pas de `^`) pour empêcher toute dérive lors d'un futur
`npm install` sans lockfile :
- `vite` : 8.2.2 → **6.4.3** (Vite 6 = dernière branche majeure encore
  sur Rollup, engines `^18.0.0 || ^20.0.0 || >=22.0.0`)
- `@vitejs/plugin-react` : 6.1.0 → **4.3.4** (dernière version avec
  engines large `^14.18.0 || >=16.0.0`, compatible peer avec Vite 6)
- `oxlint` : 1.79.0 → **1.16.0** (dernière version avant le
  durcissement à `^20.19.0 || >=22.12.0` introduit en 1.17.0)
- `pdfjs-dist` : 6.3.289 → **5.1.91** (dernière version avec engines
  `>=20` avant le durcissement à `>=20.16.0||>=22.3.0` en 5.2.0, puis
  `>=22.13.0||>=24` à partir de 6.0.0)

`web/package.json` → `engines.node` mis à jour en
`"^20.0.0 || >=22.0.0"` (couvre Node 20.x, y compris d'anciennes patch
releases comme 20.9, et Node ≥ 22 ; exclut Node < 20 et Node 21, une
release impaire non-LTS jamais ciblée par ce projet).

**Justification** : versions exactes plutôt que des plages `^`,
délibérément, car la même mésaventure (résolution vers une version plus
récente et plus stricte lors d'un `npm install` sans lockfile — le
correctif suggéré aux deux postes lors des incidents précédents) aurait
sinon pu se reproduire silencieusement à la première réinstallation
propre. C'est un compromis assumé : ce projet reste ainsi sur des
versions plus anciennes du toolchain frontend tant que Node < 20.19
doit être supporté, au bénéfice de tourner sans changement de poste.

**Conséquences** : testé bout en bout sous Node v20.9.0 exact (installé
via nvm pour reproduire fidèlement la configuration signalée) —
`npm install` sans avertissement `EBADENGINE`, `npm run build` (tsc +
vite build) et `npm run lint` (oxlint) réussissent, `npm run dev` sert
l'application, et un test Playwright confirme que le chargement de PDF
(`pdfjs-dist`) fonctionne toujours correctement (extraction de texte
inchangée). Revérifié également sous Node 22 (build, lint identiques)
pour confirmer qu'aucune régression n'est introduite pour les postes
déjà à jour. Le binaire Go autonome (ADR-031) reconstruit avec ce
nouveau frontend fonctionne sans changement.

---

## ADR-033 — Publication automatisée des binaires (GitHub Actions)

**Date** : 2026-09-09
**Statut** : Retenu

**Contexte** : le binaire autonome (ADR-031) répond au besoin d'un
poste sans Go/Node, mais nécessite malgré tout que *quelqu'un* le
construise. Pour débloquer immédiatement le second poste (celui
concerné par ADR-032), le binaire Windows a été construit
ponctuellement dans cette session et transmis directement — solution
à usage unique, non reproductible sans repasser par une session
Claude Code à chaque nouvelle version.

**Décision** : ajout d'un workflow GitHub Actions
(`.github/workflows/release-binaries.yml`) qui construit le frontend
une fois (`npm ci && npm run build`), puis compile en parallèle
(matrice) le binaire Go autonome pour 4 cibles — `linux/amd64`,
`windows/amd64`, `darwin/amd64`, `darwin/arm64` (`CGO_ENABLED=0`,
cross-compilation standard de Go, sans dépendance native puisque
`go:embed` n'embarque que des fichiers statiques). Déclenchement : tag
`v*` poussé sur le dépôt → binaires publiés en pièces jointes de la
release GitHub correspondante (via `softprops/action-gh-release`) ;
déclenchement manuel (`workflow_dispatch`, onglet Actions) → binaires
disponibles comme artefacts du run, pour tester sans créer de tag.

**Justification** : rend la distribution de binaires autonomes
reproductible et auto-service — n'importe qui avec un accès au dépôt
peut récupérer un exécutable à jour sans repasser par une session
interactive, et sans que quiconque ait besoin d'installer Go
localement pour produire ces binaires.

**Conséquences** : les 4 cibles ont été compilées localement avec les
mêmes commandes que le workflow pour vérifier qu'elles réussissent
toutes avant de pousser (`GOOS`/`GOARCH` cross-compilation, binaires de
18-19 Mo chacun). Le fichier YAML est validé syntaxiquement
(`yaml.safe_load`). Déclenché manuellement une première fois après
coup (`workflow_dispatch` sur `main`) pour vérifier le comportement réel
sur GitHub : les 5 jobs (build frontend + 4 cibles) ont réussi en
~1 minute, les 4 binaires bien produits comme artefacts du run — seule
la publication en pièce jointe de release (chemin déclenché par un tag
`v*`) reste à vérifier au premier tag effectivement poussé.

---

## ADR-035 — Export Excel multi-onglets, côté client (`exceljs`)

**Date** : 2026-09-09
**Statut** : Retenu

**Contexte** : demande explicite utilisateur — pouvoir exporter toutes
les informations d'un projet. Clarifié via question : Excel (un onglet
par catégorie), plutôt qu'un export JSON brut ou les deux — plus lisible
sans l'application, partageable avec des non-techniques.

**Décision** :
- Nouveau module `web/src/features/project-shell/exportExcel.ts` :
  construit un classeur avec un onglet par catégorie (Acteurs, Phases,
  Activités, User stories, Interactions, Spécifications, Tests V&V,
  Traçabilité), en résolvant les identifiants internes (`actorId`,
  `phaseId`, `traceLinks`, `specificationId`) vers des libellés lisibles
  (noms, codes) plutôt que d'exporter les IDs bruts.
- Génération **côté client**, comme l'extraction de PDF (voir
  historique du projet) : aucune dépendance serveur nouvelle, le fichier
  se construit et se télécharge entièrement dans le navigateur.
- Bibliothèque `exceljs` retenue plutôt que `xlsx` (SheetJS), pourtant
  plus connue pour ce cas d'usage : `xlsx` porte une vulnérabilité haute
  sévérité non corrigée sur le registre npm (prototype pollution,
  ReDoS — `npm audit`), tandis qu'`exceljs` n'a qu'un avisory modéré
  transitif (via `uuid`, sur un chemin de code non atteint par notre
  usage). `exceljs` est importé **dynamiquement** (`import('exceljs')`)
  dans `exportProjectToExcel`, pas en haut de fichier : la bibliothèque
  pèse ~940 Ko et ne doit se charger que pour les utilisateurs cliquant
  effectivement "Exporter en Excel", pas alourdir le bundle initial de
  toute l'application (même principe et même risque déjà rencontré avec
  `pdfjs-dist`).

**Justification** : écarter une bibliothèque avec une vulnérabilité
connue et non corrigée quand une alternative maintenue existe et
couvre le besoin, plutôt que d'accepter le risque au nom de la
popularité du paquet. Onglet par catégorie (plutôt qu'une reproduction
exacte de chaque écran, ex. la matrice de traçabilité visuelle) : reste
simple à générer et à lire dans un tableur, la feuille "Traçabilité"
(liste plate activité↔spécification, avec couverture par test) porte
la même information sans les contraintes de mise en page d'une vraie
matrice.

**Conséquences** : vérifié bout en bout avec Playwright — export réel
déclenché depuis l'onglet Édition, fichier `.xlsx` téléchargé confirmé
valide (`Microsoft Excel 2007+`) et contenant les 8 onglets attendus
avec les bonnes données (acteurs, activités avec noms d'acteur/phase
résolus, etc.). Bundle principal confirmé quasi inchangé après le
passage à l'import dynamique (432 Ko avant/après, contre un chunk
`exceljs` séparé de 940 Ko chargé à la demande).

---

## ADR-036 — Interactions diagramme : glisser-lien, aperçu de dépose, consultation

**Date** : 2026-09-10
**Statut** : Retenu

**Contexte** : trois demandes explicites sur le diagramme de processus :
(1) voir où une activité glissée atterrirait avant de la lâcher (une
« ombre » sous la carte) ; (2) créer une interaction directement sur le
diagramme, sans repasser par l'onglet Édition ; (3) consulter les
spécifications et tests V&V déjà liés à une activité en cliquant
dessus.

**Décision** :
- **Aperçu de dépose** : nouvelle fonction `cellTopLeft` (layout.ts) qui
  retrouve, à partir d'un `DropTarget` (déjà calculé par
  `computeDropTarget`, voir historique du glisser-déposer) et des
  en-têtes déjà positionnés par `computeLayout`, le coin de la cellule
  visée. Rendu comme un **calque superposé** (`DropTargetPreview`,
  position CSS absolue convertie via `useViewport()` de React Flow) et
  non comme un nœud ajouté au tableau `nodes` — premier essai écarté
  après l'avoir vu geler visuellement la carte déplacée : React Flow
  resynchronise la position affichée sur le tableau `nodes` contrôlé
  reçu en prop à chaque rendu, or la position de la carte dans ce
  tableau (dérivée de `computeLayout(project)`) ne change jamais
  pendant un glisser, donc un simple changement de state ailleurs
  (même sans toucher `nodes`) republie ce tableau et fige l'affichage
  à la position statique. Le calque superposé n'a pas ce problème
  puisqu'il ne touche jamais au tableau `nodes`.
- **Créer un lien sur le diagramme** : `nodesConnectable` passe à
  `true` (poignées déjà présentes sur chaque carte, voir ADR historique
  sur les poignées multiples) ; `onConnect` crée directement une
  `Interaction` (texte par défaut "Information échangée", identique au
  bouton "+ Ajouter une interaction" de l'onglet Édition — à relire/
  préciser ensuite, cohérent avec le principe déjà établi de ne jamais
  supposer un texte final). Les poignées de départ/arrivée réellement
  utilisées lors du geste ne sont pas mémorisées : `computeLayout`
  choisit le routage (haut/bas ou gauche/droite) depuis la topologie à
  chaque rendu, comme pour toute autre interaction du projet.
- **Consultation au clic** : nouveau composant `ActivityDetailModal`,
  lecture seule (pas de champs éditables — l'édition reste dans l'onglet
  Spécifications), dérivé entièrement de l'état du projet déjà chargé
  (spécifications via `traceLinks`, tests V&V via
  `specificationId`, dédoublonnés par id comme dans la vue par acteur).

**Justification** : calque superposé plutôt que nœud React Flow pour
l'aperçu de dépose — la seule option qui n'entre pas en conflit avec le
mécanisme de glisser-déposer de carte déjà en place, sans devoir le
réécrire. Réutilisation du mécanisme de poignées déjà en place pour la
création de lien plutôt qu'un geste dédié : les poignées existent déjà
sur chaque carte (pour le rendu des flèches), il ne manquait que
`nodesConnectable` et un gestionnaire `onConnect`. Modale en lecture
seule plutôt qu'éditable : consulter et éditer sont deux besoins
différents, l'édition a déjà sa place dédiée (onglet Spécifications) —
dupliquer les champs éditables dans une modale ouverte depuis le
diagramme aurait été une synchronisation d'état supplémentaire à
maintenir pour un gain incertain.

**Conséquences** : vérifié bout en bout avec Playwright — (1) l'aperçu
de dépose apparaît à la bonne cellule pendant le glisser et disparaît
au lâcher, sans geler l'affichage (régression détectée puis corrigée
pendant cette vérification, voir Décision) ; (2) glisser d'une poignée
de sortie à une poignée d'entrée crée bien une nouvelle interaction,
persistée et affichée avec le routage/dégradé attendus ; (3) le clic
sur une activité avec spécification et test liés affiche les deux
correctement, et sur une activité sans lien affiche le message vide
approprié. Limite connue, non couverte par ce correctif : le
glisser-déposer de repositionnement d'une carte reste correctement
fonctionnel de bout en bout (position finale toujours exacte après
dépôt, vérifié via relecture API), mais son suivi visuel pendant le
geste n'a pas pu être confirmé de façon concluante dans l'environnement
de test automatisé (Playwright/CDP) — sans lien avec ce correctif,
reproductible aussi avec le glisser-déposer existant avant ces
changements.

---

## ADR-037 — Ajouter une phase/une activité directement depuis le diagramme

**Date** : 2026-09-10
**Statut** : Retenu

**Contexte** : demande explicite utilisateur — pouvoir ajouter
manuellement une colonne de phase et une activité pour un acteur donné
directement depuis le diagramme, sans repasser par l'onglet Édition
(dans la continuité d'ADR-036, qui a déjà rapproché la création de lien
du diagramme).

**Décision** : `computeLayout` ajoute une colonne supplémentaire après
la dernière phase — deux nouveaux types de nœuds React Flow, non
déplaçables/non sélectionnables comme les autres en-têtes :
- `addPhase` (`AddPhaseNode`) : une cellule en tête de colonne, même
  hauteur que les en-têtes de phase. Au clic, ajoute une phase (même
  logique que le bouton "+ Ajouter une phase" de l'onglet Édition).
- `addActivity` (`AddActivityNode`) : une cellule par ligne d'acteur,
  portant `data.actorId`. Au clic, ajoute une activité pour **cet**
  acteur précisément (contrairement au bouton équivalent de l'onglet
  Édition, qui prend toujours le premier acteur du projet par défaut —
  ici l'acteur est déjà connu du contexte du clic), dans la première
  phase du projet par défaut, à repositionner ensuite par
  glisser-déposer si besoin.

Le clic est géré de façon centralisée dans `onNodeClick`
(`ProcessDiagram.tsx`, déjà utilisé pour ouvrir la consultation d'une
activité — ADR-036), pas par un gestionnaire propre à chaque composant
de nœud : cohérent avec le reste des nœuds d'en-tête, qui restent de
purs composants de rendu.

**Justification** : réutilise le patron déjà en place (une colonne
supplémentaire dans la grille, comme les sous-colonnes d'une phase
chargée) plutôt que d'introduire un mécanisme d'ajout séparé (bouton
flottant, menu contextuel...). Pré-remplir l'acteur pour "+ Activité"
depuis le contexte du clic (plutôt que le premier acteur du projet,
comme le fait l'onglet Édition) évite une étape de correction
immédiate qui serait sinon systématique dès que l'acteur voulu n'est
pas le premier de la liste.

**Conséquences** : vérifié bout en bout avec Playwright — le clic sur
"+ Phase" ajoute bien une phase (confirmée via relecture API après
Sauvegarder), le clic sur "+ Activité" de la ligne d'un acteur donné
crée bien une activité assignée à **cet** acteur (pas le premier acteur
du projet), affichée immédiatement dans sa ligne sur le diagramme.

---

## ADR-038 — Mise à jour du diagramme en langage naturel sans changer d'onglet

**Date** : 2026-09-10
**Statut** : Retenu

**Contexte** : demande explicite utilisateur — pouvoir mettre à jour le
diagramme depuis une zone de texte en langage naturel, directement dans
l'onglet Diagramme, plutôt que de devoir retourner sur l'onglet
"Générer" pour décrire des ajouts.

**Décision** : nouvelle barre compacte (`<textarea rows={2}>` + bouton
"Mettre à jour le diagramme") entre l'en-tête et le canevas de
`ProcessDiagram.tsx`, câblée sur exactement le même pipeline que
l'onglet "Générer" (`api.generateFromText` puis `mergeDraft`) — aucune
nouvelle logique de fusion nécessaire, puisque `mergeDraft` fusionne
déjà de façon additive dans le projet ouvert (acteurs/phases/activités
déjà présents, comparés par nom, jamais dupliqués ni écrasés ; seuls
les éléments réellement nouveaux du texte décrit sont ajoutés). Gestion
d'erreur identique à `NlInput.tsx` (détection de "clé API non
configurée" pour afficher le même message d'action `.nl-warning`).
Barre compacte (2 lignes) plutôt que la grande zone de texte de l'onglet
Générer, pour ne pas trop rogner l'espace du canevas, qui reste la
priorité visuelle de cet écran.

**Justification** : réutiliser le pipeline existant tel quel, plutôt
que d'en écrire un nouveau propre au diagramme — `mergeDraft` a été
conçu dès l'origine comme une fusion additive dans un projet déjà
ouvert (pas seulement une génération initiale), donc l'ajouter comme
second point d'entrée ne demande aucun changement de logique métier,
seulement un second endroit dans l'UI pour la déclencher.

**Conséquences** : vérifié bout en bout avec Playwright — la barre
s'affiche correctement sans réduire excessivement l'espace du canevas ;
chemin "clé API non configurée" confirmé (message d'action affiché,
cohérent avec celui de l'onglet Générer). Le chemin de génération réelle
(avec une vraie clé API) n'a pas pu être testé dans cet environnement de
développement, comme pour les autres fonctionnalités de génération
assistée par LLM du projet.
