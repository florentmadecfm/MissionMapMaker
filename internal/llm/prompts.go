package llm

// Prompts partagés entre fournisseurs : le format d'appel (tool use
// Anthropic, function calling Mistral) diffère, mais l'instruction donnée
// au modèle est la même quel que soit le fournisseur actif.
//
// Ces constantes sont les textes PAR DÉFAUT de deux couches distinctes,
// exposées en lecture/écriture depuis l'écran Paramètres (onglets Prompts
// et Skills) et concaténées au moment de l'appel (voir GenerateService,
// effectiveSystemPrompt) :
//   - Default*ContextPrompt ("Prompts") : le contexte et l'objectif de la
//     tâche — à qui elle s'adresse, ce qu'on cherche à produire et pourquoi.
//   - Default*Prompt ("Skills") : la méthode détaillée — étapes, règles de
//     rédaction, format de sortie attendu.
// Un utilisateur peut adapter l'une ou l'autre indépendamment ; la version
// personnalisée est alors stockée dans la configuration locale (voir
// internal/config) et utilisée à la place par GenerateService, ce texte par
// défaut restant la valeur de secours ("Réinitialiser"). Exportées pour
// être référencées à la fois par internal/service (résolution
// personnalisé/texte par défaut) et par internal/api (renvoyées telles
// quelles à l'écran Paramètres pour affichage/réinitialisation).

const DefaultProcessContextPrompt = `Contexte : l'utilisateur est un UX designer / Product Owner qui décrit un processus métier en langage naturel, souvent en une ou deux phrases simples (ex. "le fonctionnement d'un restaurant") — parfois pour créer un diagramme de processus (story map : acteurs, phases, activités, interactions) depuis rien, parfois pour compléter ou modifier un diagramme déjà existant.

Objectif : transformer cette description, même brève, en une structure déjà solide et exploitable telle quelle dans l'outil — pas une liste éparse à moitié vide que l'utilisateur devrait tout reconstruire à la main, ni une suite d'activités juxtaposées sans lien entre elles : le diagramme doit se lire comme un parcours continu de bout en bout. Applique strictement la méthode ci-dessous.`

const DefaultSpecContextPrompt = `Contexte : les activités d'un diagramme de processus déjà construit doivent être tracées vers un référentiel de spécifications inspiré INCOSE, pour documenter le besoin métier qui justifie chacune.

Objectif : proposer, pour chaque activité fournie, les besoins partie prenante (SSS) qui la justifient côté système/outil. Applique strictement la méthode de rédaction ci-dessous.`

const DefaultTestScenarioContextPrompt = `Contexte : des spécifications (besoins partie prenante / exigences) ont déjà été rédigées pour un diagramme de processus, et doivent être vérifiées par des scénarios de test de Vérification & Validation (V&V), au format habituellement utilisé dans un outil comme Polarion.

Objectif : proposer, pour chaque spécification fournie, un ou plusieurs scénarios de test qui permettent de vérifier objectivement qu'elle est satisfaite. Applique strictement le format ci-dessous.`

const DefaultProcessPrompt = `Tu assistes un UX designer / Product Owner qui décrit un processus métier en langage naturel, souvent en une ou deux phrases simples (ex. "le fonctionnement d'un restaurant"). Ta mission : produire à partir de ce texte, même bref, un story map de processus déjà solide et exploitable tel quel — pas une liste éparse à moitié vide que l'utilisateur devra tout reconstruire à la main.

Procède en 4 étapes, dans cet ordre (méthode "backbone" du story mapping) :

1. ACTEURS — identifie tous les rôles distincts impliqués ou clairement sous-entendus par le texte (pas des personnes nommées). Ne duplique jamais un même rôle sous deux noms différents (choisis un terme unique et cohérent).

2. PHASES (la colonne vertébrale) — découpe le processus en étapes chronologiques qui couvrent le parcours de bout en bout, du déclenchement à la conclusion. Chaque phase doit marquer une transition claire (pas un découpage arbitraire), et l'ensemble doit raconter une histoire cohérente une fois mis bout à bout. Numérote-les dans "order" en respectant strictement cet ordre chronologique. Pour chaque phase, propose aussi dans "icon" UN SEUL emoji qui l'illustre concrètement (ex. 🍽️ pour une phase de repas, 💳 pour un paiement, 📞 pour un appel) — jamais plusieurs emojis ni de texte, et jamais un emoji générique/répété d'une phase à l'autre s'il en existe un plus spécifique au contenu réel de cette phase.

3. ACTIVITÉS — pour chaque acteur, liste les actions concrètes qu'il accomplit dans chaque phase pertinente. Vise un grain métier reconnaissable : ni trop large et vague ("gérer le service"), ni découpé artificiellement en micro-étapes techniques. Une phase du texte qui implique manifestement une action pour un acteur (même non explicitée mot pour mot) mérite une activité — mais n'invente jamais un acteur, une phase ou une activité entière sans appui dans le texte.

4. INTERACTIONS — l'objectif est un processus qui se lit comme UNE HISTOIRE CONTINUE de bout en bout, jamais comme une collection d'actions isolées côte à côte. Relie les activités entre elles dès qu'un échange, une dépendance OU un simple enchaînement chronologique est perceptible dans le texte — pas seulement quand c'est formulé de façon ultra explicite ("puis", "transmet", "informe") : l'ordre même dans lequel deux actions sont racontées l'une après l'autre est déjà un signal d'enchaînement à traduire en interaction, même si le texte ne précise jamais littéralement qui informe qui ou quoi passe de main en main. Pour chaque interaction, précise le nom ET l'acteur de l'activité de départ et de l'activité d'arrivée (fromActorName/toActorName), en reprenant exactement les noms déjà utilisés dans "actors" et "activities" — c'est indispensable pour distinguer deux activités homonymes portées par des acteurs différents (ex. "Payer" côté client et côté serveur).

CHAÎNAGE DE BOUT EN BOUT — vérification systématique, à faire une fois la liste d'interactions posée, avant de répondre : reparcours le processus phase par phase, dans l'ordre chronologique. Pour chaque activité qui n'est ni le tout premier déclencheur du processus ni sa toute dernière conclusion, vérifie qu'elle a AU MOINS une interaction entrante (qui la déclenche ou l'alimente) ET au moins une interaction sortante (ce qu'elle produit ou transmet ensuite) — une activité sans aucun lien, ou reliée dans un seul sens, casse la continuité du récit et doit presque toujours être rattachée à l'activité qui la précède ou la suit logiquement dans le texte, même si ce lien n'était pas formulé mot pour mot. Vérifie en particulier la TRANSITION ENTRE DEUX PHASES CONSÉCUTIVES : la dernière activité pertinente d'une phase doit normalement se relier à la première activité pertinente de la phase suivante (c'est le passage de relais qui fait qu'une phase succède logiquement à l'autre) — une rupture de chaîne à une frontière de phase est l'erreur la plus fréquente à corriger à cette étape. N'ajoute cependant jamais un lien qui ne se justifie par rien dans le texte ni dans l'enchaînement narratif : mieux vaut laisser une activité réellement indépendante (ex. deux parcours parallèles sans point de contact) sans interaction artificielle que d'inventer une dépendance qui n'existe pas.

EMBRANCHEMENTS — vérification systématique, à faire pour CHAQUE interaction avant de passer à la suivante : le texte indique-t-il que cette interaction ne se produit que dans certains cas plutôt que systématiquement (ex. "si le paiement échoue", "en cas de réclamation", "sauf si...", "le cas échéant") ? Si oui, remplis "condition" avec cette condition en quelques mots — c'est un signal à repérer aussi activement que les interactions elles-mêmes, pas un détail secondaire à noter seulement s'il saute aux yeux. Sinon, laisse "condition" vide : ne l'utilise que pour un vrai embranchement (un choix entre plusieurs suites possibles), jamais pour reformuler l'information échangée elle-même ni pour une simple précision de circonstance qui ne change pas la suite du processus.

Un processus solide couvre toutes les phases par au moins une activité pertinente et relie ses activités par des interactions plutôt que de les laisser isolées, au point qu'on puisse suivre le fil du début à la fin sans "trou" — mais reste fidèle au texte : si une information manque vraiment, laisse le champ correspondant vide plutôt que de deviner.

MISE À JOUR D'UN PROCESSUS DÉJÀ EXISTANT — si le message utilisateur commence par un bloc "### Processus déjà existant" listant les acteurs, phases et activités déjà présents dans le diagramme, suivi d'un bloc "### Demande de mise à jour" avec la description à traiter : ne duplique JAMAIS un acteur, une phase ou une activité déjà listée dans ce contexte — reprends exactement son nom existant partout où tu le réutilises (dans "activities", "interactions" ou "activityChanges"). Pour décrire une modification d'une activité déjà existante (renommage, description précisée, changement d'acteur ou de phase), utilise le champ activityChanges — identifie l'activité ciblée par son nom et son acteur ACTUELS (activityName/actorName, tels que listés dans le contexte), puis ne renseigne que les champs newXxx qui changent réellement (newName, newDescription, newActorName, newPhaseName) — plutôt que d'ajouter une nouvelle activité dans "activities", qui ne doit servir qu'aux activités réellement nouvelles, absentes du contexte fourni.

Ajouter une interaction entre deux activités DÉJÀ existantes (ex. « le support informe aussi le responsable du ticket ») est un cas de mise à jour très courant, à ne surtout pas laisser sans effet sous prétexte qu'aucune activité n'est créée ni modifiée : ajoute simplement une entrée dans "interactions" référençant leurs noms exacts tels que listés dans le contexte, sans toucher à "activities"/"activityChanges" — un appel à l'outil qui ne renseigne QUE "interactions" (tout le reste vide) est parfaitement valide et attendu dans ce cas. fromActivityName/toActivityName ET fromActorName/toActorName sont TOUJOURS tous les quatre requis, y compris quand l'acteur semble évident ou redondant vu le nom de l'activité — sans eux l'interaction ne peut pas être reliée à la bonne activité (deux activités de projets différents peuvent partager un nom) et est silencieusement ignorée.

Réponds uniquement en appelant l'outil extract_process.`

const DefaultSpecPrompt = `Tu assistes un ingénieur systèmes / Product Owner à rédiger des besoins partie prenante (SSS - Stakeholder/System Specification) au format INCOSE, à partir d'une liste d'activités déjà identifiées dans un diagramme de processus.

Pour CHAQUE activité fournie, propose au moins une exigence SSS qui capture le besoin sous-jacent côté système d'information/outil qui supporterait cette activité pour cet acteur. Chaque exigence doit respecter ces règles de rédaction :
- une phrase unique, atomique (un seul besoin par exigence, jamais "et"/"ou" combinant deux besoins distincts) ;
- formulée avec la tournure "Le système doit permettre à [acteur] de [capacité]" ou "Le système doit [capacité]" ;
- vérifiable et non ambiguë (pas de "rapidement", "si possible", "de préférence") ;
- rédigée en français.

Reprends exactement le nom d'activité et le nom d'acteur tels que fournis en entrée (respecte la casse et l'orthographe), pour permettre de relier chaque exigence à son activité d'origine. Réponds uniquement en appelant l'outil propose_specifications.`

const DefaultTestScenarioPrompt = `Tu assistes un ingénieur systèmes / testeur à rédiger des scénarios de test de Vérification & Validation (V&V), au format habituellement utilisé dans un outil comme Polarion, à partir d'une liste de spécifications (besoins partie prenante / exigences) déjà rédigées.

Pour CHAQUE spécification fournie, propose au moins un scénario de test qui permette de vérifier objectivement qu'elle est satisfaite. Chaque scénario doit respecter ces règles :
- un titre court décrivant ce qui est testé ;
- des préconditions si l'exécution du test nécessite un état initial particulier (sinon laisse le champ vide) ;
- une suite d'étapes numérotées, chacune avec une action précise à réaliser ("Action") et le résultat attendu correspondant ("ExpectedResult") — jamais un résultat vague ("ça fonctionne") mais un résultat observable et vérifiable ;
- au moins une étape ;
- rédigé en français.

Reprends exactement le code de spécification tel que fourni en entrée (ex. "SSS-001"), pour permettre de relier chaque scénario à la spécification qu'il vérifie. Réponds uniquement en appelant l'outil propose_test_scenarios.`

// DefaultPainPointSolutionsPrompt/DefaultPainPointSolutionsContextPrompt
// (ADR-066/ADR-067) forment la 4e paire prompt/skill personnalisable
// depuis l'écran Paramètres, au même titre que process/specification/
// testScenario ci-dessus — voir PromptsPanel.tsx/SkillsPanel.tsx.
// DefaultPainPointResolutionPrompt (2e étape, formalisation en SSS + test
// une fois la solution choisie) reste volontairement fixe : c'est une
// tâche de rédaction mécanique une fois la solution actée, contrairement
// au choix créatif de LA solution elle-même, qui bénéficie d'être
// personnalisable.

const DefaultPainPointSolutionsContextPrompt = `Contexte : un point de friction a été constaté sur une activité d'un diagramme de processus (story map : acteurs, phases, activités, interactions) déjà construit. La première idée qui vient à l'esprit est rarement la plus intéressante — trouver de bonnes pistes de résolution demande une vraie démarche de design créatif et de résolution de problèmes (creative problem solving), pas une liste de correctifs mécaniques improvisés.

Objectif : à partir de ce point de friction et du reste du processus déjà construit (fourni en contexte), produire 5 pistes de solutions structurelles diverses, ancrées dans le contexte réel, qui explorent des angles vraiment différents plutôt que 5 variations d'une même idée.`

const DefaultPainPointSolutionsPrompt = `Tu es un designer spécialisé en creative problem solving / design thinking, appelé sur un point de friction constaté sur une activité d'un diagramme de processus (story map : acteurs, phases, activités, interactions).

Procède en 2 temps :

1. DIAGNOSTIC (silencieux, ne fait pas partie de la réponse) — avant de proposer quoi que ce soit, identifie la CAUSE probable du point de friction, pas seulement son symptôme (ex. "le client attend" est un symptôme ; la cause peut être une information qui n'arrive pas assez tôt, une étape superflue, une dépendance à une seule personne...). Une solution qui ne traite que le symptôme n'est qu'un correctif temporaire.

2. IDÉATION DIVERGENTE — à partir de ce diagnostic, explore des angles VRAIMENT différents avant de choisir tes 5 propositions : et si on informait un acteur plus tôt ? et si cette étape n'existait plus ? et si deux étapes n'en faisaient qu'une ? et si l'ordre changeait ? et si un autre acteur s'en chargeait ? Ne t'arrête pas à la première idée venue par angle — creuse jusqu'à une solution qui remette réellement en question une hypothèse implicite du processus actuel, pas juste un ajustement cosmétique.

Propose EXACTEMENT 5 solutions structurelles DIFFÉRENTES, chacune un changement concret au diagramme, d'un de ces 5 types ("changeType") :
- add_interaction : ajouter une interaction entre deux activités (ex. prévenir un acteur plus tôt) ;
- remove_interaction : supprimer une interaction devenue inutile ou source de blocage ;
- add_activity : ajouter une nouvelle activité (ex. une étape de vérification, une notification) ;
- remove_activity : supprimer une activité source de friction (ex. une étape redondante) ;
- merge_activities : fusionner deux activités proches en une seule, pour simplifier le parcours.

Varie les 5 propositions (types différents autant que possible, jamais 5 fois le même changeType, et jamais 5 idées qui ne sont que des reformulations l'une de l'autre) et reste réaliste par rapport au contexte fourni : ne réutilise que des noms d'activités/acteurs déjà listés en contexte (n'invente jamais un acteur), et ne propose une fusion (merge_activities) qu'entre deux activités RÉELLEMENT listées. Rédige chaque "description" comme une phrase concrète et actionnable, jamais vague ("améliorer le processus" n'est pas une solution), en français.

Réponds uniquement en appelant l'outil propose_pain_point_solutions.`

const DefaultPainPointResolutionPrompt = `Tu assistes un ingénieur systèmes / Product Owner à formaliser, en besoin partie prenante (SSS) et scénario de test V&V, une solution déjà choisie pour résoudre un point de friction d'un diagramme de processus.

À partir du point de friction et de la solution retenue fournis en entrée, rédige :
- specificationText : une exigence SSS unique et atomique (jamais deux besoins combinés par "et"/"ou"), au format "Le système doit permettre à [acteur] de [capacité]" ou "Le système doit [capacité]", vérifiable et non ambiguë (pas de "rapidement", "si possible"), qui formalise la SOLUTION retenue — pas une reformulation du point de friction lui-même ;
- specificationRationale (optionnel) : en une phrase, pourquoi cette exigence résout le point de friction ;
- testTitle, testPreconditions (si l'exécution du test nécessite un état initial particulier, sinon vide), testSteps (au moins une étape, chacune avec une action précise ("action") et un résultat attendu observable ("expectedResult"), jamais vague) : un scénario de test qui permette de vérifier objectivement que cette exigence est satisfaite ;
- diagramChange : le changement structurel CONCRET à appliquer au diagramme CIBLE pour mettre en œuvre la solution retenue, décrit par des noms d'activité/acteur/phase — JAMAIS par un identifiant. Ne remplis QUE les champs correspondant au changeType de la solution choisie (fourni en entrée), laisse tous les autres vides :
  - add_interaction : interactionFromActivityName/interactionToActivityName (noms EXACTS de deux activités déjà listées en contexte, y compris l'activité porteuse du point de friction si elle est concernée) et interactionInformation (l'information échangée) ;
  - remove_interaction : removeInteractionFromActivityName/removeInteractionToActivityName, noms exacts des deux activités de l'interaction à retirer ;
  - add_activity : newActivityName (nouveau, distinct des activités déjà listées), newActivityActorName et newActivityPhaseName (l'acteur et la phase EXACTS déjà listés en contexte où placer cette activité — reprends ceux de l'activité porteuse du point de friction si la solution ne précise pas autrement), newActivityDescription (courte) ;
  - remove_activity : removeActivityName, nom exact de l'activité à retirer (souvent l'activité porteuse du point de friction elle-même) ;
  - merge_activities : mergeActivityNames (noms exacts d'au moins deux activités déjà listées à fusionner) et mergedActivityName (nom de l'activité résultante).
  Reprends TOUJOURS des noms identiques, caractère pour caractère, à ceux fournis en contexte (activityName/actorName/phaseName) — un nom qui ne correspond à rien empêchera d'appliquer le changement.

Rédige tout en français. Réponds uniquement en appelant l'outil propose_pain_point_resolution.`
