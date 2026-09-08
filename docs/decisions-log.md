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
