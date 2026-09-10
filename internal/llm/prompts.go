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

Objectif : transformer cette description, même brève, en une structure déjà solide et exploitable telle quelle dans l'outil — pas une liste éparse à moitié vide que l'utilisateur devrait tout reconstruire à la main. Applique strictement la méthode ci-dessous.`

const DefaultSpecContextPrompt = `Contexte : les activités d'un diagramme de processus déjà construit doivent être tracées vers un référentiel de spécifications inspiré INCOSE, pour documenter le besoin métier qui justifie chacune.

Objectif : proposer, pour chaque activité fournie, les besoins partie prenante (SSS) qui la justifient côté système/outil. Applique strictement la méthode de rédaction ci-dessous.`

const DefaultTestScenarioContextPrompt = `Contexte : des spécifications (besoins partie prenante / exigences) ont déjà été rédigées pour un diagramme de processus, et doivent être vérifiées par des scénarios de test de Vérification & Validation (V&V), au format habituellement utilisé dans un outil comme Polarion.

Objectif : proposer, pour chaque spécification fournie, un ou plusieurs scénarios de test qui permettent de vérifier objectivement qu'elle est satisfaite. Applique strictement le format ci-dessous.`

const DefaultProcessPrompt = `Tu assistes un UX designer / Product Owner qui décrit un processus métier en langage naturel, souvent en une ou deux phrases simples (ex. "le fonctionnement d'un restaurant"). Ta mission : produire à partir de ce texte, même bref, un story map de processus déjà solide et exploitable tel quel — pas une liste éparse à moitié vide que l'utilisateur devra tout reconstruire à la main.

Procède en 4 étapes, dans cet ordre (méthode "backbone" du story mapping) :

1. ACTEURS — identifie tous les rôles distincts impliqués ou clairement sous-entendus par le texte (pas des personnes nommées). Ne duplique jamais un même rôle sous deux noms différents (choisis un terme unique et cohérent).

2. PHASES (la colonne vertébrale) — découpe le processus en étapes chronologiques qui couvrent le parcours de bout en bout, du déclenchement à la conclusion. Chaque phase doit marquer une transition claire (pas un découpage arbitraire), et l'ensemble doit raconter une histoire cohérente une fois mis bout à bout. Numérote-les dans "order" en respectant strictement cet ordre chronologique.

3. ACTIVITÉS — pour chaque acteur, liste les actions concrètes qu'il accomplit dans chaque phase pertinente. Vise un grain métier reconnaissable : ni trop large et vague ("gérer le service"), ni découpé artificiellement en micro-étapes techniques. Une phase du texte qui implique manifestement une action pour un acteur (même non explicitée mot pour mot) mérite une activité — mais n'invente jamais un acteur, une phase ou une activité entière sans appui dans le texte.

4. INTERACTIONS — relie les activités entre elles dès qu'un échange ou une dépendance est perceptible dans le texte, pas seulement quand il est formulé de façon ultra explicite : c'est ce qui transforme une liste d'actions isolées en un vrai processus. Pour chaque interaction, précise le nom ET l'acteur de l'activité de départ et de l'activité d'arrivée (fromActorName/toActorName), en reprenant exactement les noms déjà utilisés dans "actors" et "activities" — c'est indispensable pour distinguer deux activités homonymes portées par des acteurs différents (ex. "Payer" côté client et côté serveur).

Un processus solide couvre toutes les phases par au moins une activité pertinente et relie ses activités par des interactions plutôt que de les laisser isolées — mais reste fidèle au texte : si une information manque vraiment, laisse le champ correspondant vide plutôt que de deviner.

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
