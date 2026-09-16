package llm

import "strings"

// Prompts de GÉNÉRATION D'IMAGE (ADR-073) — contrairement à Default*Prompt/
// Default*ContextPrompt (prompts.go), volontairement FIXES, non exposés à
// la personnalisation depuis l'écran Paramètres : une tâche de rédaction
// d'un prompt image mécanique une fois le contexte connu (nom, description,
// contenu du diagramme...), pas un choix créatif ouvert qui bénéficierait
// d'un réglage utilisateur — même logique que DefaultPainPointResolutionPrompt
// (voir prompts.go).
//
// Rédigés en anglais malgré une interface et des données en français :
// c'est la langue sur laquelle les modèles de génération d'image (dont
// FLUX, ici) sont le plus largement documentés/entraînés pour les
// instructions de STYLE ("line art", "sketch", "no text") — un choix de
// fiabilité du résultat, pas une préférence linguistique. Les données
// injectées (noms, descriptions) restent telles que saisies par
// l'utilisateur, quelle que soit leur langue.

const imageStyleInstruction = "Style: clean hand-drawn sketch, black and white line art, minimalist, no text, no watermark, no signature."

// PersonaPortraitPrompt construit le prompt de génération du portrait d'un
// persona à partir de sa fiche (About/Bio/Goals/PainPoints — voir
// domain.Actor) — n'inclut que les champs réellement renseignés, jamais de
// contenu inventé au-delà de ce que l'utilisateur a saisi.
func PersonaPortraitPrompt(name, about, bio string, goals, painPoints []string) string {
	var b strings.Builder
	b.WriteString("Portrait sketch illustration of a persona")
	if name != "" {
		b.WriteString(" named \"" + name + "\"")
	}
	b.WriteString(". ")
	if about != "" {
		b.WriteString("Role: " + about + ". ")
	}
	if bio != "" {
		b.WriteString("Background: " + bio + ". ")
	}
	if len(goals) > 0 {
		b.WriteString("Goals: " + strings.Join(goals, "; ") + ". ")
	}
	if len(painPoints) > 0 {
		b.WriteString("Frustrations: " + strings.Join(painPoints, "; ") + ". ")
	}
	b.WriteString("Bust portrait framing, expressive but simple facial features, conveys their role and personality. ")
	b.WriteString(imageStyleInstruction)
	return b.String()
}

// DiagramSketchPrompt construit le prompt de génération d'une illustration
// "sketch" du diagramme de processus d'une mission (alternative créative à
// l'export PNG technique, voir pngExport.ts côté frontend) — un résumé du
// contenu (personas/phases/activités), jamais le diagramme exact reproduit
// trait pour trait (le modèle d'image ne peut de toute façon pas
// reproduire une mise en page précise).
func DiagramSketchPrompt(missionName string, actorNames, phaseNames, activityNames []string) string {
	var b strings.Builder
	b.WriteString("Storyboard-style sketch illustration representing a business process")
	if missionName != "" {
		b.WriteString(" called \"" + missionName + "\"")
	}
	b.WriteString(". ")
	if len(actorNames) > 0 {
		b.WriteString("People involved: " + strings.Join(actorNames, ", ") + ". ")
	}
	if len(phaseNames) > 0 {
		b.WriteString("Main stages, in order: " + strings.Join(phaseNames, " → ") + ". ")
	}
	if len(activityNames) > 0 {
		b.WriteString("Key actions: " + strings.Join(activityNames, "; ") + ". ")
	}
	b.WriteString("Depict it as a single wide storyboard panel with small sketched vignettes for the key moments. ")
	b.WriteString(imageStyleInstruction)
	return b.String()
}
