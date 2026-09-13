# Journal de décisions (ADR) — MissionMapMaker

Décisions structurantes du projet (modèle de données, choix de
technologie, patrons transverses) — une entrée par décision, volontairement
condensée (quoi + pourquoi). Voir `docs/architecture.md` pour la synthèse
architecturale. Les décisions purement visuelles/UX et les notes de process
ont été retirées lors de nettoyages successifs — la numérotation n'est donc
pas continue, ce qui est normal.

---

## ADR-001 — Persistance en fichiers JSON via le backend Go

Fichiers `.json` gérés côté serveur (un dossier par projet, `project.json` +
backups horodatés), plutôt que `localStorage` seul ou un hybride —
permet une vraie API métier (validation, appel LLM sans exposer de clé au
navigateur) et un fichier = un projet versionnable. Pas de verrouillage
multi-utilisateur (usage mono-utilisateur assumé).

## ADR-002 — Génération assistée par LLM (API Claude) côté backend

Extraction langage naturel → modèle via l'API Claude, appelée depuis le
backend (clé jamais exposée au navigateur), avec saisie manuelle
structurée toujours disponible en secours. Le résultat LLM est toujours
relu/édité avant sauvegarde — jamais d'auto-save.

## ADR-003 — Référentiel de spécifications inspiré INCOSE

Modèle structuré inspiré INCOSE plutôt que conformité complète au
handbook : types (`StakeholderNeed`/SSS, `SystemRequirement`,
`SubsystemRequirement`, `VerificationCriterion`), hiérarchie via
`parentId`, liens de traçabilité portés par l'activité.

## ADR-005 — React Flow pour le rendu du diagramme de processus

React Flow (nœuds/arêtes custom, pan/zoom) plutôt qu'un moteur de rendu
SVG maison, pour ne pas réimplémenter drag & drop/sélection/rendu d'arêtes.

## ADR-007 — Modèle Claude et intégration SDK Go

SDK officiel `anthropic-sdk-go`, extraction structurée via un outil unique
(`extract_process`, tool use) plutôt qu'un `tool_choice` forcé. Modèle par
défaut `claude-opus-5`, configurable via `MMM_LLM_MODEL`.

## ADR-011 — Lisibilité du diagramme (routage des liens)

Poignées multiples par côté de carte ; routage vertical pour une
interaction au sein d'une même phase (horizontal sinon) ; hauteur de ligne
dynamique par acteur ; couleur de flèche = acteur source, flèches
directionnelles, fond blanc sous les labels — réduit fortement les
croisements visuels.

## ADR-012 — Clé API configurable depuis l'interface

Nouveau package `internal/config` : fichier
`~/.config/missionmapmaker/config.json` (permissions restreintes), séparé
de `data/` pour ne jamais mélanger un secret à un export de projet. La clé
n'est jamais renvoyée en lecture par l'API (seulement `configured`/
`model`). `ANTHROPIC_API_KEY` (variable d'environnement) reste prioritaire
au démarrage sur la configuration enregistrée.

## ADR-013 — Abstraction multi-fournisseurs LLM (Anthropic + Mistral)

Interface `llm.Generator` qui découple le reste de l'app du fournisseur
choisi ; client Mistral en HTTP brut (pas de SDK officiel),
`tool_choice: "any"`. Une configuration (clé/modèle/URL) par fournisseur —
changer de fournisseur ne fait pas perdre l'autre clé.

## ADR-014 — Retries sur erreurs transitoires (429/5xx) côté Mistral

Le client Mistral retente jusqu'à 4 fois sur 429/5xx (backoff exponentiel,
ou `Retry-After` s'il est fourni), jamais sur les autres 4xx — aligné sur
le comportement déjà présent du SDK Anthropic.

## ADR-015 — URL de base configurable par fournisseur

`config.ProviderSettings` gagne `BaseURL` (par fournisseur) — utile pour
un proxy, un déploiement régional/entreprise ou un service auto-hébergé.
Pas un secret : renvoyée telle quelle par l'API.

## ADR-016 — Optimisation des appels LLM (réduction + fiabilité)

La proposition de SSS ne renvoie au LLM que les activités sans
`traceLinks` (pas tout le projet à chaque clic), le bouton se désactivant
à zéro appel utile. Timeout commun de 90s sur tous les appels de
génération, plus des limites de taille (texte 20 000 caractères, 300
activités) en défense en profondeur.

## ADR-017 — Couleurs des flèches : dégradé départ→arrivée

Chaque flèche est tracée en dégradé de la couleur de l'acteur source vers
celle de l'acteur cible (`gradientUnits="userSpaceOnUse"` — nécessaire,
`objectBoundingBox` reste invisible sur les segments purement horizontaux/
verticaux de React Flow), plus un disque de départ et une pointe
d'arrivée distincts. Limite connue : deux interactions réciproques entre
les mêmes activités se superposent encore visuellement.

## ADR-018 — Sous-colonnes par phase pour activités concurrentes

`computeLayout` élargit une phase en sous-colonnes selon le plus grand
nombre d'activités concurrentes d'un même acteur dans cette phase, plutôt
que de les empiler verticalement dans une colonne fixe. Les lignes
d'acteur repassent à une hauteur fixe.

## ADR-020 — Position de colonne explicite pour une activité isolée

`Activity.Column` (0 = automatique par `Order`, > 0 = sous-colonne figée)
permet d'aligner une activité isolée d'un acteur sur une sous-colonne
qu'un autre acteur a fait apparaître dans la même phase — une valeur
dérivée du rang ne pouvait pas représenter ce cas.

## ADR-021 — Scénarios de test V&V (Polarion) liés aux SSS

Nouveau domaine `TestScenario` (préconditions + étapes action/résultat
attendu), lié à une `Specification` par ID, générable groupé (avec les
SSS) ou à la demande, via une capacité LLM dédiée corrélée par **code** de
spécification plutôt que par nom+texte.

## ADR-022 — Normalisation des collections au chargement/écriture

`Project.Normalize()` force à `[]` tout champ collection resté `nil`
après désérialisation (sinon sérialisé en `null`, crash frontend qui
suppose toujours un tableau) — appelée au `Load` et au `Save`, corrigé à
la source plutôt que par des `?? []` dispersés côté client.

## ADR-023 — Filet de sécurité côté client pour les projets renvoyés par l'API

`normalizeProject` côté client (`api/client.ts`), en écho à ADR-022, pour
rester robuste même face à un serveur temporairement en retard sur son
propre correctif (ex. process de dev non redémarré après un pull).

## ADR-027 — Extraction du processus : méthode backbone + bug d'homonymes

Prompt d'extraction restructuré en 4 étapes explicites (méthode backbone :
acteurs → phases chronologiques → activités à grain métier → interactions
capturées dès qu'un échange est perceptible). Bug corrigé au passage :
une interaction n'identifiait une activité que par son nom, sans acteur —
deux activités homonymes portées par des acteurs différents pouvaient
être perdues ou mal reliées ; corrigé en résolvant toujours par la paire
(nom, acteur).

## ADR-028 — Chargement d'un PDF comme point de départ (sans OCR)

Extraction de texte PDF côté client uniquement (`pdfjs-dist`, chargé
dynamiquement pour ne pas alourdir le bundle principal), préremplit le
textarea de saisie — jamais envoyé au serveur ; pas d'OCR pour un PDF
scanné.

## ADR-031 — Frontend embarqué dans le binaire Go (`go:embed`)

`web/dist` embarqué dans le binaire Go via `go:embed`, servi sur toute
route hors `/api` — un seul exécutable à distribuer, sans dépendance
Node/Go à l'exécution. Préféré à committer `node_modules` (binaires
natifs spécifiques à l'OS, inutilisables d'une plateforme à l'autre).

## ADR-032 — Toolchain frontend rabaissé pour compatibilité Node 20.9

Vite/`@vitejs/plugin-react`/oxlint/`pdfjs-dist` épinglés aux dernières
versions encore compatibles Node 20.9 (versions exactes, pas de `^`, pour
éviter toute dérive au prochain install sans lockfile) — compromis assumé
tant qu'un poste cible reste sous Node < 20.19.

## ADR-033 — Publication automatisée des binaires (GitHub Actions)

Workflow `release-binaries.yml` : build frontend puis compilation croisée
(Linux/Windows/macOS Intel+ARM) sans dépendance native (`CGO_ENABLED=0`)
— déclenché par un tag `v*` (pièce jointe de release) ou manuellement
(artefacts du run).

## ADR-035 — Export Excel multi-onglets, côté client (`exceljs`)

Export d'un onglet par catégorie, entièrement côté client (aucune
dépendance serveur), résolvant les identifiants internes en libellés
lisibles. `exceljs` plutôt que `xlsx`/SheetJS (vulnérabilité connue non
corrigée sur ce dernier), chargé dynamiquement.

## ADR-036 — Interactions diagramme : glisser-lien, aperçu de dépose, consultation

Aperçu de dépose rendu en calque superposé (pas un nœud React Flow, pour
ne pas figer le rendu pendant un glisser) ; création de lien par glisser
entre poignées (`onConnect`) ; consultation en lecture seule des
spécifications/tests liés à une activité au clic (`ActivityDetailModal`).

## ADR-037 — Ajouter une phase/une activité directement depuis le diagramme

Une colonne supplémentaire après la dernière phase porte deux nœuds
cliquables non déplaçables ("+ Phase", "+ Activité" par ligne d'acteur) —
"+ Activité" préremplit l'acteur du contexte du clic, contrairement au
bouton équivalent de l'onglet Édition (premier acteur du projet par
défaut).

## ADR-038 — Mise à jour du diagramme en langage naturel sans changer d'onglet

Barre compacte dans l'onglet Diagramme, câblée sur le même pipeline que
l'onglet Générer (`mergeDraft`, déjà additif) — aucune nouvelle logique de
fusion nécessaire.

## ADR-039 — Sous-lignes d'acteur et sous-colonnes de phase réservées manuellement

`Actor.SubLanes`/`Phase.SubColumns` réservent une ligne/colonne AVANT d'y
avoir une activité (bouton "+" sur les en-têtes), résolvant le problème
d'œuf-et-poule du glisser-déposer vers un emplacement qui n'existe pas
encore visuellement — symétrique sur les deux axes de la grille.

## ADR-040 — Contexte du projet existant dans les mises à jour, skills personnalisables

`generateUpdate.ts` préfixe le texte utilisateur d'un résumé du processus
déjà existant avant tout appel à `/api/generate`, pour que le LLM puisse
exprimer une modification (`activityChanges`, champ dédié) plutôt
qu'ignorer silencieusement un texte qui ne ressemble à aucun ajout. Les 3
prompts système par défaut deviennent personnalisables depuis Paramètres
→ Skills (persistés dans le fichier de config local).

## ADR-041 — Vue transverse d'un acteur sur plusieurs missions, identité par nom

Rapprochement par nom d'acteur (insensible à la casse), calculé à
l'affichage — pas de catalogue d'acteurs global ni de migration de
données. Écran indépendant dans la barre latérale (🧑 Acteurs, toutes
missions) plutôt qu'un onglet de projet, puisque cette vue n'a pas besoin
d'un projet ouvert. Le rendu détaillé par acteur (`ActorDetail`) est
extrait et réutilisé par l'onglet Vue par acteur et cet écran.

## ADR-042 — Import Excel (round-trip complet), export enrichi, menu burger

`importExcel` relit le classeur par NOM d'en-tête (pas par index), résout
les références par nom/code comme l'export, remplace entièrement les
collections du projet ouvert (confirmation avant remplacement) — cohérent
avec l'usage "reconstruire fidèlement le fichier", pas une fusion
additive. Export/import regroupés dans un menu burger.

## ADR-043 — Recadrage automatique du diagramme, écran Acteurs plus explicite

`AutoFitOnChange` recadre la vue React Flow dès que le nombre de nœuds
change (`fitView` ne le fait sinon qu'au montage). Écran Acteurs : bandeau
explicite + bouton Actualiser — seules les missions déjà **sauvegardées**
y apparaissent, par cohérence avec le reste de l'app.

## ADR-044 — Interaction en langage naturel sur une activité existante silencieusement ignorée

Un acteur manquant/vide dans une ébauche d'interaction (le LLM omet
parfois `fromActorName`/`toActorName`, jugés redondants) faisait échouer
silencieusement toute la résolution. `mergeDraft` tolère désormais un
acteur vide et retombe sur une résolution par nom d'activité seul, comme
déjà fait pour `activityChanges` (ADR-040).

## ADR-045 — Onglet Prompts distinct des Skills : contexte/objectif vs méthode

Chaque capacité de génération gagne un second texte (contexte/objectif),
préfixé au skill existant (méthode) au moment de l'appel plutôt que de
retailler les skills déjà éprouvés — `systemPrompt = prompt + "\n\n" +
skill`. `PromptEditor.tsx` partagé entre les deux panels.

## ADR-046 — Menu export/import au niveau des onglets, écran Acteurs toujours à jour

Le menu export/import remonte au niveau de la barre d'onglets (disponible
depuis n'importe quel onglet d'un projet ouvert). L'index acteur →
missions est chargé au niveau du shell et rafraîchi après chaque
sauvegarde/suppression de projet — la fraîcheur garantie par construction
plutôt que par un effet de bord du remontage de composant.

## ADR-047 — Tableaux racine omis par le LLM désérialisés en `null`, crash frontend

Deux bugs cumulés : le schéma d'extraction ne déclarait aucun champ
racine requis, et le client Anthropic ignorait de toute façon `Required`
en construisant son schéma d'outil (bug plus large, touchant aussi
SSS/tests V&V). Corrigés ensemble, plus un filet de sécurité
(`DraftProcess.normalize()`) qui force les tableaux `nil` à vide après
désérialisation — un `required` JSON Schema n'étant pas forcément
respecté à la lettre par tous les modèles.

## ADR-048 — Onglets non remontés au changement de mission

`key={project.id}` sur les 5 composants d'onglet de `ProjectShell` :
React démonte/remonte le composant entier à chaque changement de mission,
réinitialisant tout état local (texte de saisie, messages) d'un coup
plutôt que de traquer chaque `useState` individuellement.

## ADR-049 — Glisser-déposer : une sous-ligne de plus pour son acteur ; nommer une interaction dans le diagramme

`computeDropTarget` accepte l'acteur actuel de la carte glissée : un
dépôt qui déborde d'au plus une case sous sa propre bande crée une
sous-ligne plutôt que de basculer sur l'acteur suivant (bandes
contiguës, sans cette tolérance aucun glisser modéré n'était possible).
`InteractionDetailModal` permet de nommer/supprimer une interaction
directement depuis sa flèche sur le diagramme.

## ADR-050 — Même tolérance d'une case, sur l'axe horizontal (phases)

Symétrique d'ADR-049 pour les phases : `computeDropTarget` accepte la
phase actuelle de la carte, un dépôt qui déborde d'au plus une
sous-colonne à droite reste dans sa phase plutôt que de basculer sur la
suivante.

## ADR-051 — Décalage fin (offsetX/offsetY) : nudger une carte sans changer de case

`Activity.OffsetX`/`OffsetY` mémorisent un décalage en pixels à
l'intérieur de la case déjà résolue (acteur/phase/sous-ligne/sous-colonne
inchangés), borné pour ne jamais chevaucher la case voisine — jusqu'ici,
tout ajustement fin fait pendant un glisser était perdu au relâchement.

## ADR-052 — Points de friction (texte libre) par activité

`Activity.PainPoints` (liste `{id, text}`), édités dans
`ActivityDetailModal` (devient éditable pour la première fois), affichés
en lecture seule dans Vue par acteur/écran Acteurs. Nouvelle feuille
Excel dédiée (une ligne par point, texte potentiellement long).

## ADR-053 — Badge triangle rouge sur une activité qui a un point de friction

Badge "⚠" en coin haut-droit de la carte quand `painPointCount > 0`, hors
de la zone des badges stories/specs pour rester visible même sans eux —
couleur danger, pour un signal fort distinct d'un simple compteur
informatif.

## ADR-054 — Ligne de synthèse des points de friction, tout en bas du diagramme

Ligne supplémentaire sous la dernière ligne d'acteur, une cellule par
phase, listant tous les points de friction de cette phase (acteur +
activité d'origine dans chaque entrée) — regroupement par phase plutôt
qu'une ligne par acteur, pour ne pas dupliquer l'axe déjà porté par les
lignes existantes. Cliquer une entrée ouvre l'activité d'origine.

## ADR-055 — Fiche persona par acteur (About/Bio/Goals/Pain points), CRUD complet

`Actor` gagne `about`/`bio` (texte libre) et `goals`/`painPoints`
(listes), édités dans une modale dédiée (`ActorProfileModal`) qui
réutilise `ActorDetail` pour rappeler les activités de l'acteur — ouverte
depuis le nom d'un acteur sur le diagramme ou depuis Vue par acteur.
`painPoints` ici décrit les irritants du métier de la personne en
général, distinct de ceux d'une activité précise (ADR-052).

## ADR-056 — Fiche persona partagée entre missions par nom d'acteur

Store partagé dédié (`data/actor-profiles.json`,
`storage.ActorProfileStore`) associant une fiche à un nom normalisé
plutôt qu'à un acteur précis — `ProjectService` la fusionne à chaque
chargement et la republie à chaque sauvegarde, rendant la copie dans
`project.json` un simple instantané. Un acteur nouvellement créé adopte
la fiche déjà partagée sous son nom plutôt que de l'écraser avec un
brouillon vide (bug capturé par un test avant mise en prod). Modale
élargie à 1040px.

## ADR-057 — Fiche persona lisible et éditable depuis l'écran Acteurs (toutes missions)

Réutilisation de la même `ActorProfileModal`, avec un bouton
"Sauvegarder" désormais optionnel intégré à la modale (props
`onSave`/`saving`/`saveError`/`savedAt`) pour les écrans sans barre
d'outils de sauvegarde propre — un seul bouton "Voir la fiche" par
acteur (pas par mission), la fiche étant unique et partagée (ADR-056).

## ADR-058 — Points de friction d'une activité sélectionnables depuis la fiche de l'acteur

`ActivityDetailModal` propose, en plus de la saisie libre déjà existante
(ADR-052), un sélecteur des points de friction déjà connus pour l'acteur
de l'activité (sa fiche persona, ADR-055/056), filtré pour exclure ceux
déjà repris sur cette activité — évite de retaper un texte déjà utilisé
ailleurs pour le même acteur. Un point réellement nouveau, saisi en texte
libre, continue d'être ajouté à l'activité, mais enrichit désormais aussi
la fiche de l'acteur au passage (si son texte n'y figure pas déjà,
comparaison insensible à la casse) — devient à son tour sélectionnable
pour les autres activités de cet acteur, y compris dans une autre mission
(ADR-056). Choix validé avec l'utilisateur plutôt que de garder l'ajout
strictement local à l'activité : construit un vocabulaire de points de
friction réutilisable par acteur au fil de la saisie, sans étape
séparée. Les deux listes restent des collections indépendantes (une
copie de texte, pas une référence) — aucun changement de schéma, l'ajout
au niveau de l'activité continue d'alimenter `Activity.PainPoints`,
inchangé pour l'export/import Excel et le badge du diagramme (ADR-053).

## ADR-059 — Icône illustrative par phase (mode storyboard) sur le diagramme

Aucun fournisseur LLM déjà intégré (Anthropic, Mistral) ne génère
d'images — seulement du texte. Choix validé avec l'utilisateur : plutôt
qu'ajouter un nouveau fournisseur d'images (coût, latence, clé
supplémentaire à configurer), le LLM texte déjà utilisé pour extraire le
processus propose aussi, pour chaque phase, un unique emoji représentatif
(`Phase.Icon`, nouveau champ) — affiché en grand au-dessus du nom de la
phase dans l'en-tête du diagramme (`PHASE_HEADER_HEIGHT` élargi de 60 à
112px pour l'accueillir), façon vignette de storyboard. Une phase sans
icône (créée manuellement, ou projet antérieur à ce champ) garde
simplement son nom centré dans cet en-tête plus haut — aucun repli visuel
forcé, aucune migration nécessaire. Éditable manuellement comme le reste
(onglet Édition, colonne Icône), et couvert par l'export/import Excel
(nouvelle colonne "Icône" sur la feuille Phases) au même titre que les
autres champs de phase.

**Conséquences** : `go build`/`go vet`/`go test ./...`, `tsc -b`,
`npm run lint`, `npm run build` verts. Playwright, avec un faux serveur
Mistral local renvoyant des phases avec icône (comme le ferait un vrai
LLM suivant le prompt mis à jour) : icônes reprises dans l'onglet
Édition et affichées en grand sur le diagramme, en-tête de phase mesuré
nettement plus haut, ajout manuel d'une icône sur une phase créée sans
persisté après sauvegarde, round-trip Excel de la colonne Icône
vérifié. Non-régression confirmée sur la ligne de synthèse des points de
friction et le glisser-déposer de sous-colonnes (tous deux dépendants du
layout des en-têtes de phase).

## ADR-060 — Embranchements conditionnels sur une interaction

Premier élément du backlog blueprint priorisé avec l'utilisateur (état de
l'art story mapping/service blueprint). Plutôt qu'un nouveau type de
nœud façon porte BPMN (exclusive/parallèle/inclusive), `Interaction`
gagne un simple champ optionnel `Condition` : une interaction sans
condition reste un flux normal (comportement inchangé), une interaction
avec condition devient un embranchement — elle ne se produit que si
cette condition est vraie (ex. "paiement refusé"). Reste un texte libre,
jamais une énumération de types de porte : lisible comme une étiquette
de flèche, cohérent avec le reste du diagramme, sans figer une sémantique
d'exécution que l'outil n'a de toute façon pas vocation à évaluer.

Rendu sur le diagramme : la flèche d'une interaction conditionnelle est
tracée en pointillés (`strokeDasharray`) plutôt qu'un trait plein, avec
son libellé composé "Si `<condition>` — `<information>`" ; l'activité
d'où partent une ou plusieurs interactions conditionnelles porte un badge
"🔀" en coin haut-gauche de sa carte (symétrique du badge ⚠ points de
friction en haut-droit, ADR-053) — un embranchement se repère ainsi sans
avoir à suivre chaque flèche. `DraftInteraction`/`extract_process`
gagnent le même champ optionnel : le LLM le remplit quand le texte décrit
explicitement un cas conditionnel, jamais pour reformuler l'information
échangée elle-même. Édition possible depuis la modale d'interaction du
diagramme (ADR-049) et depuis le tableau Interactions de l'onglet
Édition ; nouvelle colonne "Condition" sur la feuille Excel Interactions
(export et import).

**Conséquences** : `go build`/`go vet`/`go test ./...`, `tsc -b`,
`npm run lint`, `npm run build` verts. Playwright : badge d'embranchement
affiché sur la bonne carte (jamais sur la carte cible), trait pointillé
et libellé "Si ..." corrects sur la flèche conditionnelle uniquement,
modale d'interaction pré-remplit et persiste la condition, ajout d'une
condition depuis l'onglet Édition persisté, round-trip Excel de la
colonne Condition vérifié. Non-régression confirmée sur la fusion
d'ébauche LLM existante (`mergeDraft`) et l'export/import Excel déjà en
place.

## ADR-061 — Icônes d'interface standardisées (`lucide-react`), affordance de clic sur un acteur

**Contexte** : demande explicite — s'assurer que les icônes de
l'interface reposent sur une librairie standard, et que l'UX reste la
plus intuitive possible. Audit : aucune librairie d'icônes n'était
utilisée — tous les symboles de l'interface (⚙ Paramètres, 🧑 Acteurs,
☰ menu, ⚠ points de friction, 🔀 embranchement, ✓/✗ traçabilité)
étaient des caractères Unicode/emoji tapés directement dans le JSX. Ce
n'est pas non plus une librairie "non standard" à proprement parler
(Unicode est le standard ultime, zéro dépendance), mais le rendu d'un
émoji en couleur dépend entièrement de la police emoji installée sur le
système — inconsistant d'une plateforme à l'autre (Windows/macOS/Linux
ont chacun leur propre style graphique), et risque de "tofu" (glyphe
manquant) sur un système sans police emoji, un vrai risque pour un
binaire distribué sur les 3 plateformes (ADR-031/033).

**Décision** :
- `lucide-react` (MIT, sans dépendance de version Node particulière,
  compatible React 19) remplace les emoji utilisés comme **chrome
  d'interface** : `Settings`/`Users`/`Menu`/`TriangleAlert`/`GitBranch`/
  `Check`/`X` — un rendu SVG monochrome pixel-identique sur toutes les
  plateformes, cohérent avec la couleur du texte environnant
  (`currentColor`), sans dépendre d'aucune police système.
- L'icône de phase (ADR-059, `Phase.icon`) reste un emoji en texte
  libre, délibérément : c'est le cœur de la fonctionnalité ("mode
  storyboard", un emoji choisi librement par le LLM ou l'utilisateur
  pour illustrer concrètement une phase) — une bibliothèque d'icônes,
  même large, ne pourrait jamais égaler l'expressivité de l'ensemble
  emoji complet pour cet usage précis. Seul le chrome d'interface
  (navigation, badges, statuts) est concerné par ce changement.
- Affordance de clic ajoutée sur `.actor-header` (curseur + survol) :
  cliquer le nom d'un acteur ouvre sa fiche persona (ADR-055) sans
  qu'aucun indice visuel ne le suggère jusqu'ici — trouvé en auditant
  l'intuitivité de l'interface à cette occasion.

**Conséquences** : `tsc -b`, `npm run lint`, `npm run build` verts
(+~2 Ko gzippé, `lucide-react` étant tree-shakeable — seules les 7
icônes utilisées sont incluses dans le bundle). `go build`/`go vet`/
`go test ./...` inchangés (aucun changement backend). Playwright :
badges/menus/boutons affichent bien les icônes SVG attendues,
non-régression complète sur les suites de fiche persona, points de
friction et embranchements conditionnels déjà en place. Vérifié
visuellement (captures d'écran) sur la barre latérale, le diagramme, la
matrice de traçabilité et la Vue par acteur.

## ADR-062 — Variantes de mission (as-is/to-be)

Deuxième élément du backlog blueprint. `Project` gagne deux champs
optionnels — `VariantGroupID` (partagé par toutes les variantes d'un même
groupe) et `VariantLabel` (ce qui distingue celle-ci, ex. "État actuel",
"Cible") — plutôt qu'un champ "parent" unique : aucune hiérarchie stricte
n'est imposée, un groupe peut contenir plusieurs cibles côte à côte sans
qu'aucune ne soit "la référence". Exposés sur `ProjectSummary`
(`Repository.List`) pour que la liste de projets déjà chargée par le
shell (barre latérale) suffise à regrouper/afficher les variantes sans
requête supplémentaire.

« Créer une variante… » (menu ☰ de la barre d'onglets, aux côtés
d'Exporter/Importer Excel) ouvre une petite modale dédiée
(`CreateVariantModal.tsx`) : demande le nom de la nouvelle variante (et,
si le projet ouvert n'appartenait encore à aucun groupe, celui à donner
à CETTE mission au même moment — elle y entre alors elle-même). La
nouvelle mission est créée via le flux existant (`api.createProject`),
puis reçoit une copie du contenu de la mission source (acteurs, phases,
activités, interactions, spécifications, tests — mêmes ids internes,
sans conséquence puisqu'un projet ne référence jamais les ids d'un
autre) avant sa première sauvegarde : elle démarre donc identique, prête
à diverger.

Un projet appartenant à un groupe affiche une barre de bascule
(`VariantSwitcher.tsx`, sous la barre d'onglets) listant ses variantes en
pastilles cliquables (celle ouverte mise en évidence), plus un lien
"Détacher" pour retirer la mission du groupe sans toucher à son contenu.
La barre latérale affiche aussi l'étiquette de variante à côté du nom de
chaque mission concernée — pensée pour ne **jamais** se faire tronquer
par le nom (`.project-name-text` porte seule l'ellipsis, `.variant-badge`
reste `flex-shrink: 0`) : c'est justement elle qui distingue deux
missions au nom presque identique, trouvé et corrigé en vérifiant le
rendu avec un nom de mission long.

**Alternative écartée** : une vue de comparaison côte à côte des deux
diagrammes (repérée dans l'état de l'art comme pratique blueprint
courante) — délibérément différée plutôt qu'abandonnée : demanderait un
mode lecture seule pour `ProcessDiagram` (aujourd'hui pleinement
interactif), un chantier plus lourd que la bascule instantanée déjà
livrée, qui couvre déjà l'essentiel du besoin (comparer en quelques
clics) à bien moindre risque.

Pas de champ variant sur l'export/import Excel : c'est une relation
ENTRE projets, pas un contenu de mission — l'exporter aurait pu, à
l'import dans un projet sans rapport, créer un lien de groupe erroné.

**Conséquences** : `go build`/`go vet`/`go test ./...`, `tsc -b`,
`npm run lint`, `npm run build` verts. Playwright : modale de création
avec les bons libellés par défaut, contenu fidèlement copié dans la
nouvelle variante, barre de bascule affichant les deux variantes (la
bonne mise en évidence), bascule réellement fonctionnelle, badges visibles
dans la barre latérale, détachement du groupe persisté. Non-régression
confirmée sur les suites embranchements conditionnels et fiche persona.
Vérifié visuellement que l'étiquette de variante reste lisible même avec
un nom de mission très long.

## ADR-063 — Vue de comparaison côte à côte entre variantes

Suite d'ADR-062 : construction de la comparaison alors différée, faute
d'un mode lecture seule pour le diagramme. `ProcessDiagram.tsx` restant
pleinement interactif (glisser-déposer, modales d'édition, barre de mise
à jour en langage naturel), un second rendu dédié était nécessaire plutôt
que d'y ajouter un mode conditionnel partout : `ReadOnlyProcessDiagram.tsx`
réutilise tel quel le calcul de disposition (`computeLayout`) et les
cartes/flèches (`nodeTypes`, `toFlowEdge` — exportés de `ProcessDiagram.tsx`
pour l'occasion) dans un `<ReactFlow>` sans glisser-déposer, sans connexion,
sans sélection et sans aucun gestionnaire de clic. Les nœuds "+ Phase"/
"+ Activité" (colonne d'ajout) sont filtrés avant le rendu — ce sont des
actions d'édition sans équivalent en lecture seule ; les petits boutons
"+" en coin des en-têtes de phase/acteur, eux, restent dans le DOM
(portés par les mêmes composants que la vue interactive) mais sont
masqués en CSS (`.diagram-readonly`), tout comme le curseur "cliquable"
d'un en-tête d'acteur ou d'une carte, qui n'ouvrent ici aucune modale.

`VariantComparisonScreen.tsx` (nouvel écran, entré via un bouton
"Comparer" dans `VariantSwitcher.tsx`, nouvelle valeur `'compare'` du
`View` de `ProjectShell.tsx`) affiche deux panneaux côte à côte, chacun
avec son propre groupe de boutons radio (un par variante du groupe,
même tri que `VariantSwitcher`) pour choisir indépendamment quelle
variante y afficher — plutôt qu'un sélecteur unique ou une bascule
« avant/après », pour permettre de comparer deux cibles entre elles aussi
bien qu'un état actuel à une cible. Les projets complets des variantes
sélectionnées sont récupérés à la demande (`api.getProject`, mis en cache
en state le temps de l'écran) ; une ligne de synthèse (nombre d'acteurs,
phases, activités, points de friction) au-dessus de chaque diagramme
donne un repère rapide avant même de le lire en détail.

**Conséquences** : aucun changement backend. `tsc -b`, `npm run lint`,
`npm run build` verts. Playwright : entrée dans la vue via "Comparer",
deux diagrammes en lecture seule affichés avec le contenu de LEUR
variante respective (vérifié avec un contenu délibérément différent
entre les deux), bascule d'un panneau via son bouton radio effectivement
répercutée sur son diagramme seul, aucune affordance d'édition visible
(pas de bouton "+", pas de bouton Sauvegarder, pas de barre de mise à
jour en langage naturel) et un clic sur une carte n'ouvre aucune modale,
retour à la vue projet via "Fermer la comparaison". Aucune régression
détectée sur la bascule instantanée entre variantes (ADR-062).

## ADR-064 — Ligne de visibilité (front-stage / back-stage)

Pratique de service blueprint : séparer les acteurs en contact direct
avec le client (front-stage) de ceux qui ne le sont jamais (back-stage,
support interne), avec un repère visuel entre les deux groupes.
Modélisé au niveau de l'ACTEUR plutôt que de l'activité (`Actor.Backstage
bool`, `omitempty`, `false` par défaut — y compris pour les acteurs
enregistrés avant l'introduction du champ, donc front-stage inchangé) :
plus simple qu'une bascule par activité, et cohérent avec le fait qu'un
acteur donné (ex. « Support technique ») joue en pratique toujours le
même rôle vis-à-vis du client d'une mission à l'autre.

`computeLayout` (layout.ts) trie désormais les acteurs — tri STABLE, qui
conserve l'ordre relatif au sein de chaque groupe — pour regrouper les
front-stage avant les back-stage, puis calcule la frontière entre les
deux (premier acteur back-stage après le tri) pour y insérer un nouveau
nœud `visibilityLine` (trait pointillé pleine largeur + étiquette,
`VisibilityLineNode`, non interactif) UNIQUEMENT quand les deux groupes
sont non vides — sinon rien à séparer. Un acteur back-stage porte aussi
une étiquette discrète sur son en-tête de ligne (là encore, un acteur
front-stage n'a besoin d'aucune étiquette, c'est le comportement par
défaut). La bascule elle-même est une case à cocher dans l'onglet
Édition (liste des acteurs), pas dans la fiche persona partagée
(ADR-055/056) : c'est un choix structurel de CETTE mission (où l'acteur
se situe dans CE diagramme), pas un trait de l'acteur en général.

Réutilisé tel quel par `ReadOnlyProcessDiagram.tsx` (ADR-063) — la ligne
de visibilité apparaît donc aussi dans la vue de comparaison de
variantes sans code supplémentaire, `nodeTypes` étant partagé.

Champ ajouté aux exports/imports Excel (colonne "Back-stage", "Oui"/"Non"
— même patron que les autres champs acteur comme "Sous-lignes").

**Conséquences** : `go build`/`go vet`/`go test ./...`, `tsc -b`,
`npm run lint`, `npm run build` verts. Playwright : ligne affichée
seulement avec au moins un acteur de chaque groupe, acteurs effectivement
regroupés front-stage puis back-stage dans le diagramme, étiquette
"back-stage" affichée sur le bon en-tête, ligne disparaissant après avoir
décoché la case dans l'onglet Édition.

## ADR-065 — Durée + courbe de satisfaction par phase (fusion backlog #6/#9)

À la demande explicite de l'utilisateur, les backlog #6 (courbe de
satisfaction) et #9 (durée par étape) sont livrés ensemble plutôt qu'en
deux passes séparées : `Phase` gagne `Duration` (texte libre, ex.
"15 min" — même philosophie qu'`Interaction.Condition`, ADR-060, les
unités de durée variant trop d'une mission à l'autre pour un type
structuré) et `SatisfactionScore` (entier 1 à 5, `0`/absent = NON
RENSEIGNÉ, distinct d'un score neutre qui serait 3 — une phase sans score
n'apparaît simplement pas dans la courbe).

Rendu comme UN SEUL nouveau nœud pleine largeur, `SatisfactionRowNode`
(`computeLayout`, layout.ts), positionné en Y NÉGATIF juste au-dessus des
en-têtes de phase plutôt que d'insérer une vraie ligne (ce qui aurait
demandé de décaler tous les calculs de position existants — acteurs,
activités, ligne de visibilité...). Un seul nœud plutôt qu'une cellule
par phase (comme la ligne de points de friction, ADR-054) : la courbe
doit tracer un trait CONTINU d'une phase à l'autre, ce qu'un ensemble de
nœuds React Flow indépendants ne permet pas facilement (chacun ignore la
position des autres) — un unique `<svg>` interne au nœud, en coordonnées
locales, dessine le `<polyline>` reliant les phases qui ont un score
(les phases sans score sont simplement absentes du tracé, sans casser la
courbe). N'apparaît que si au moins une phase a une donnée renseignée,
pour ne rien changer aux diagrammes existants.

Réutilisé tel quel par `ReadOnlyProcessDiagram.tsx` (ADR-063, `nodeTypes`
partagé) : la ligne apparaît donc aussi dans la vue de comparaison de
variantes sans code supplémentaire — vérifié explicitement (création
d'une variante depuis une mission avec durées/scores déjà renseignés).

Champs ajoutés à l'onglet Édition (liste des phases : champ durée en
texte libre, menu déroulant satisfaction 1-5 avec emoji) et aux
exports/imports Excel (colonnes "Durée" et "Satisfaction (1-5)", valeur
hors 1-5 ramenée à "non renseigné" plutôt que bornée arbitrairement).

**Bug préexistant trouvé et corrigé pendant la vérification** : les
champs de largeur fixe de la liste Phases (`.phase-icon-input`, et par
extension mes nouveaux `.phase-duration-input`/`.phase-satisfaction-select`)
s'étiraient en pratique comme le champ Nom (flex: 1) malgré leur règle
CSS dédiée — `.editor li > input:not([type])`/`.editor li select`
(la règle générique qui fait s'étirer le champ Nom) l'emportait
propriété par propriété : `flex: 1` fixe flex-grow et flex-basis, qu'une
simple `width` (sans réécrire flex-grow/flex-basis) ne peut pas
contrer même en gagnant par ailleurs la cascade CSS. Corrigé en
qualifiant les sélecteurs par le type d'élément (`input.phase-icon-input`
etc., spécificité strictement supérieure) ET en remplaçant `width` +
`flex-shrink` par un raccourci `flex: 0 0 <largeur>` complet.

**Conséquences** : `go build`/`go vet`/`go test ./...`, `tsc -b`,
`npm run lint`, `npm run build` verts. Playwright : ligne durée/
satisfaction affichée avec le bon nombre de durées/points/segments de
tracé, édition (durée + satisfaction) persistée après sauvegarde et
reflétée dans le diagramme, ligne de visibilité (ADR-064) ET ligne
durée/satisfaction toutes deux présentes dans une variante nouvellement
créée (confirmant qu'aucune donnée structurelle de phase/acteur n'est
perdue lors de la création d'une variante), largeur des champs Icône/
Durée/Satisfaction vérifiée visuellement après correction du bug CSS
ci-dessus.

**Correctif additionnel (même ADR)** : l'utilisateur a signalé que les
en-têtes de colonnes "Durée"/"Satisfaction" n'étaient pas alignés
au-dessus des bons champs. Cause : la ligne d'en-têtes (`.col-headers`)
n'a pas de bouton "supprimer" contrairement à chaque ligne de données —
avec une seule colonne flex: 1 ("Nom") avant les colonnes fixes, tout
l'espace manquant se reportait sur elle, décalant les colonnes suivantes
vers la droite. Même défaut latent identifié dans Activités (en-tête
"Phase") et Interactions (en-tête "Condition"), moins visible car
partagé entre plusieurs colonnes flex: 1. Corrigé dans les 3 sections en
ajoutant, en fin de `.col-headers`, un bouton fantôme identique au vrai
(même texte/classe, `visibility: hidden`) plutôt qu'un espaceur à largeur
devinée — garantit un alignement exact même si le style du bouton change
plus tard. Vérifié par mesure de position/largeur en pixels (Playwright)
sur les 4 colonnes concernées : écart nul dans les 4 cas.

## ADR-066 — Solutions LLM pour un point de friction, puis SSS + test

Backlog #4, enrichi à la demande explicite de l'utilisateur : plutôt que
générer directement une SSS pour un point de friction, un flux en 2 temps.

**1. 5 propositions de solutions STRUCTURELLES** (`DraftPainPointSolution`,
nouvel endpoint `/api/generate-painpoint-solutions`) — chacune classée par
`changeType` (add_interaction / remove_interaction / add_activity /
remove_activity / merge_activities, contraint par enum JSON Schema) et
une description en langage naturel. Le LLM reçoit en contexte l'activité/
l'acteur/la phase concernés et un résumé du reste du processus (activités
et interactions déjà existantes), pour ancrer ses propositions dans le
diagramme réel plutôt que d'inventer. **Le diagramme n'est JAMAIS modifié
automatiquement** — la description reste une proposition à choisir,
cohérent avec le principe déjà établi (ADR-002) qu'une génération LLM est
toujours relue avant d'avoir un effet réel ; ici l'effet réel n'est même
pas une modification du diagramme mais la génération d'une exigence.

**2. Une fois une solution choisie**, un second appel
(`/api/generate-painpoint-resolution`) génère la SSS + le scénario de test
qui la formalisent, en un seul aller-retour (schéma à plat plutôt que les
types DraftSpecification/DraftTestScenario existants, qui portent des
champs de correspondance — ActivityName/SpecificationCode — inutiles ici
puisque l'activité et la future spécification sont déjà connues de
l'appelant). `mergePainPointResolution.ts` (nouveau, `features/
specifications/`, même patron de numérotation SSS-.../TC-... que
`mergeSpecDrafts.ts`/`mergeTestScenarioDrafts.ts`) les transforme en une
vraie `Specification` + un vrai `TestScenario` ajoutés au projet, reliés à
l'activité (`traceLinks`, comme toute SSS) ET au point de friction
lui-même via le nouveau champ `PainPoint.ResolvedBySpecID` — qui n'est
alors plus proposé en résolution (bouton "💡 Solutions" remplacé par un
badge "✓ résolu (SSS-00X)" dans `ActivityDetailModal.tsx`).

**Generator étendu** : `GeneratePainPointSolutions`/
`GeneratePainPointResolution` ajoutées à l'interface `llm.Generator`,
implémentées côté Anthropic ET Mistral (comme les 3 capacités
existantes). Contrairement à Generate/GenerateSpecifications/
GenerateTestScenarios, **pas de couche prompt/skill personnalisable**
dans l'écran Paramètres pour ces 2 nouvelles capacités : doubler la
surface de configuration (2 couches de plus × 2 capacités) n'a pas semblé
justifié pour une fonctionnalité plus récente et de portée plus étroite
(une seule activité/un seul point de friction à la fois) — à reconsidérer
si le besoin se manifeste.

Export/import Excel : colonne "Résolu (SSS)" ajoutée à la feuille "Points
de friction" (code de la spécification, résolu vers son id via la même
map `specIdByCode` déjà construite pour les colonnes "Parent"/
"Spécifications liées" — les spécifications sont toujours lues avant les
points de friction dans le fichier).

**Conséquences** : `go build`/`go vet`/`go test ./...`, `tsc -b`,
`npm run lint`, `npm run build` verts. Vérifié en conditions quasi
réelles : un petit serveur HTTP local imitant l'API Mistral (function
calling) a été mis en place le temps du test, pour exercer le VRAI
chemin backend (marshaling JSON, appel HTTP, parsing de la réponse) sans
dépendre d'une clé API réelle — les deux endpoints ont d'abord été
vérifiés directement (curl), puis tout le parcours interface : 5
solutions affichées avec des types variés, choix d'une solution générant
bien une SSS + un test ajoutés au projet, badge "résolu" affiché et
bouton "Solutions" alors masqué, spécification et test visibles dans
"Spécifications liées"/"Tests V&V liés", et persistance confirmée après
sauvegarde + rechargement (point de friction, spécification, test,
traceLink, tous retrouvés).

## ADR-067 — Prompt/skill personnalisable + posture creative problem solving

Suite d'ADR-066, à la demande explicite de l'utilisateur : la 1re étape
(proposer 5 solutions) devient la **4e paire prompt/skill** personnalisable
depuis l'écran Paramètres, au même titre que process/specification/
testScenario (`PainPointSolutions`/`PainPointSolutionsContext` — mêmes
champs traversant `GenerateService` → `internal/api/router.go` → `internal/
config` → `PromptsPanel.tsx`/`SkillsPanel.tsx`, qui sont génériques : une
entrée `PromptFieldDef` de plus a suffi côté frontend). La 2e étape
(formaliser la solution choisie en SSS + test) reste volontairement fixe —
c'est une tâche de rédaction mécanique une fois la solution actée, pas un
choix créatif, contrairement à la recherche de LA solution elle-même.

Le skill par défaut (`DefaultPainPointSolutionsPrompt`) est réécrit pour
incarner une posture explicite de **design créatif / creative problem
solving** plutôt qu'une simple liste de correctifs : un temps DIAGNOSTIC
(identifier la cause probable du point de friction, pas seulement son
symptôme, avant de proposer quoi que ce soit) suivi d'une IDÉATION
DIVERGENTE guidée (explorer des angles vraiment différents — remplacer,
éliminer, réorganiser, automatiser, changer qui fait quoi — plutôt que de
s'arrêter à la première idée par angle), avec une consigne explicite
contre 5 propositions qui ne seraient que des reformulations l'une de
l'autre. La classification en 5 `changeType` (ADR-066) est conservée telle
quelle : la créativité porte sur LE CONTENU des propositions, pas sur leur
structure de sortie.

**Conséquences** : `go build`/`go vet`/`go test ./...`, `tsc -b`,
`npm run lint`, `npm run build` verts. Playwright (avec le mock Mistral
local d'ADR-066) : 4e sous-onglet "Résoudre un point de friction" présent
dans Skills ET dans Prompts, texte par défaut contenant bien la posture
creative problem solving, personnalisation → "Personnalisé" → persistée
côté serveur (`GET /api/settings/prompts`) → Réinitialiser → retour au
texte par défaut, sans régression sur le flux complet de résolution d'un
point de friction (5 solutions → SSS + test → badge résolu → persistance).

## ADR-068 — Audit UX/UI de bout en bout

À la demande explicite de l'utilisateur ("audit UX/UI sur l'ensemble des
fonctionnalités... puis optimise"). Un jeu de données réaliste (acteurs
front/back-stage, durées/satisfaction, embranchement, point de friction
résolu et non résolu, variante) a permis de capturer par Playwright un
parcours complet — état vide, les 5 onglets d'un projet ouvert, les 6
modales (activité, interaction, fiche persona, création de variante,
solutions de point de friction, Paramètres), l'écran transverse Acteurs,
la comparaison de variantes, la sidebar repliée — plutôt que d'auditer sur
la seule apparence du code. Deux vrais bugs et plusieurs irritants déjà
identifiés lors de l'audit ADR-061 mais jamais traités ont été trouvés et
corrigés :

**Bugs** :
- **Menu ☰ coupé par le bord de l'écran** — `.header-menu-dropdown`
  s'ancrait à `left: 0` de son déclencheur ; celui-ci étant en haut à
  droite de l'écran, le menu s'étendait hors de la fenêtre et rendait
  "Exporter"/"Importer"/"Créer une variante…" illisibles. Corrigé en
  `right: 0`.
- **Champs tronqués dans Spécifications/Tests V&V** — le select Type
  (ex. "Besoin partie prenante (SSS)") et le champ Titre d'un scénario de
  test se réduisaient bien en-deçà de leur contenu. Même cause racine que
  le bug déjà corrigé en ADR-065 (une règle générique ".editor li input,
  .editor li select { min-width: 0 }" l'emportait sur un correctif à
  spécificité insuffisante) — corrigé cette fois avec des sélecteurs à 2
  classes (".editor .spec-card-meta select", ".editor .test-title"),
  plus robustes qu'une simple qualification par type d'élément puisqu'ils
  dépassent la spécificité concurrente sans dépendre de l'ordre dans la
  feuille.

**Irritants identifiés en ADR-061 (jamais traités depuis)** :
- Bandeau d'instructions du diagramme, dense et **toujours affiché** —
  remplacé par un bouton "Comment utiliser ce diagramme" replié par
  défaut (`ProcessDiagram.tsx`, état `hintOpen`).
- Petits boutons "+" en coin des en-têtes (sous-colonne/sous-ligne),
  16px et peu contrastés — passés à 22px avec une bordure plus marquée.
- Notation "←"/"→" cryptique dans Vue par acteur / fiche persona —
  remplacée par une icône directionnelle + le mot "Reçoit"/"Envoie" en
  toutes lettres (`ActorDetail.tsx`), sur les mêmes couleurs déjà en
  place (bleu entrant, vert sortant).

**Nouveaux constats** :
- **Écran vide** (aucun projet créé ni ouvert) réduit à une phrase isolée
  dans un grand espace blanc, sans repère ni indication d'action —
  remplacé par un état vide centré (icône, titre, ce que fait l'outil, et
  un indice pointant explicitement vers le champ "Nom du nouveau projet"
  de la barre latérale, seul vrai point d'entrée de cet écran).
- **Boutons "supprimer" rouges répétés** sur chaque ligne de l'onglet
  Édition (Acteurs/Phases/Activités/Interactions/Spécifications/Tests) —
  une dizaine visibles en permanence créaient un bruit visuel et une
  fatigue d'alerte sans rapport avec une vraie alerte. Repris du patron
  déjà utilisé par `.project-list` (barre latérale) : masqués par défaut
  (`opacity: 0`), révélés au survol OU au focus clavier de leur ligne
  (`:hover`, `:focus-within` — jamais seulement `:hover`, pour rester
  utilisable au clavier). Portée volontairement limitée à `.editor li` :
  les boutons "Supprimer" autonomes d'une modale ou d'un panneau restent
  toujours visibles.

**Délibérément hors scope** (notés pour un futur backlog, pas un oubli) :
recherche/filtre ou pagination pour de longues listes dans l'onglet
Édition, réordonnancement par glisser-déposer des phases/activités,
navigation clavier complète du menu ☰ (Échap, flèches) — des chantiers
plus structurants que ce qu'un audit-puis-correctifs peut raisonnablement
couvrir en une passe, qui mériteraient chacun leur propre décision.

**Conséquences** : `go build`/`go vet`/`go test ./...` (aucun changement
backend), `tsc -b`, `npm run lint`, `npm run build` verts. Playwright :
chaque correctif vérifié individuellement (position du menu dans le
viewport, largeur calculée des champs avant/après, opacity 0→1 au survol/
focus, replié par défaut puis dépliable) sur les captures du parcours
complet, sans régression constatée sur les fonctionnalités déjà
couvertes par les suites précédentes (variantes, comparaison, points de
friction).
