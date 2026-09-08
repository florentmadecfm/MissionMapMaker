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
	if p.Actors == nil {
		p.Actors = []Actor{}
	}
	if p.Phases == nil {
		p.Phases = []Phase{}
	}
	if p.Activities == nil {
		p.Activities = []Activity{}
	}
	if p.Interactions == nil {
		p.Interactions = []Interaction{}
	}
	if p.Specifications == nil {
		p.Specifications = []Specification{}
	}
	if p.TestScenarios == nil {
		p.TestScenarios = []TestScenario{}
	}
	for i := range p.Activities {
		if p.Activities[i].UserStories == nil {
			p.Activities[i].UserStories = []UserStory{}
		}
		if p.Activities[i].TraceLinks == nil {
			p.Activities[i].TraceLinks = []string{}
		}
	}
	for i := range p.TestScenarios {
		if p.TestScenarios[i].Steps == nil {
			p.TestScenarios[i].Steps = []TestStep{}
		}
	}
}
