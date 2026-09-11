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
