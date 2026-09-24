package domain

// Normalize garantit qu'aucune collection d'un projet chargé depuis le
// disque n'est nil : un fichier projet enregistré avant l'introduction
// d'un champ (ex. TestScenarios, ajouté après le lancement de l'app)
// n'a pas cette clé en JSON, et json.Unmarshal laisse alors le slice Go
// correspondant à nil plutôt qu'à un slice vide. encoding/json sérialise
// un slice nil en `null`, jamais `[]` : sans cette normalisation, l'API
// renverrait `"testScenarios": null` pour ces projets, et le frontend
// (qui suppose toujours un tableau, ex. `project.testScenarios.filter`)
// plante en le recevant. Appelée après chargement (storage.Repository.Load)
// et avant sauvegarde (Save), pour que ni un ancien fichier ni une requête
// PUT incomplète ne puisse réintroduire un nil.
func (p *Project) Normalize() {
	normalizeCollections(&p.Actors, &p.Phases, &p.Activities, &p.Interactions, &p.Specifications, &p.TestScenarios)
	if p.Target != nil {
		p.Target.normalize()
	}
}

// normalize applique les mêmes règles que Project.Normalize à une cible
// (ProjectVariant) — copie indépendante complète, donc sujette aux mêmes
// champs nil qu'un projet chargé depuis le disque.
func (v *ProjectVariant) normalize() {
	normalizeCollections(&v.Actors, &v.Phases, &v.Activities, &v.Interactions, &v.Specifications, &v.TestScenarios)
}

// normalizeCollections factorise la normalisation des 6 collections
// partagées par Project et ProjectVariant (même règle nil -> slice vide,
// y compris pour les sous-listes imbriquées).
func normalizeCollections(
	actors *[]Actor, phases *[]Phase, activities *[]Activity,
	interactions *[]Interaction, specifications *[]Specification, testScenarios *[]TestScenario,
) {
	if *actors == nil {
		*actors = []Actor{}
	}
	if *phases == nil {
		*phases = []Phase{}
	}
	if *activities == nil {
		*activities = []Activity{}
	}
	if *interactions == nil {
		*interactions = []Interaction{}
	}
	if *specifications == nil {
		*specifications = []Specification{}
	}
	if *testScenarios == nil {
		*testScenarios = []TestScenario{}
	}
	for i := range *actors {
		if (*actors)[i].Goals == nil {
			(*actors)[i].Goals = []ActorGoal{}
		}
		if (*actors)[i].PainPoints == nil {
			(*actors)[i].PainPoints = []ActorPainPoint{}
		}
	}
	for i := range *phases {
		if (*phases)[i].KpiLinks == nil {
			(*phases)[i].KpiLinks = []string{}
		}
	}
	for i := range *activities {
		if (*activities)[i].UserStories == nil {
			(*activities)[i].UserStories = []UserStory{}
		}
		if (*activities)[i].TraceLinks == nil {
			(*activities)[i].TraceLinks = []string{}
		}
		if (*activities)[i].PainPoints == nil {
			(*activities)[i].PainPoints = []PainPoint{}
		}
		if (*activities)[i].KpiLinks == nil {
			(*activities)[i].KpiLinks = []string{}
		}
	}
	for i := range *testScenarios {
		if (*testScenarios)[i].Steps == nil {
			(*testScenarios)[i].Steps = []TestStep{}
		}
	}
}
