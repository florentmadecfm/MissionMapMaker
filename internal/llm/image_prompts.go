package llm

import "strings"

// Prompts de GÉNÉRATION D'IMAGE (ADR-073/ADR-074) — 5e paire personnalisable
// depuis l'écran Paramètres (onglets Prompts et Skills), au même titre que
// Process/Specification/TestScenario/PainPointSolutions (prompts.go) :
// contrairement à DefaultPainPointResolutionPrompt (une tâche de rédaction
// mécanique une fois le contexte connu), le STYLE d'une illustration
// générée est un vrai choix créatif que l'utilisateur peut légitimement
// vouloir ajuster (ex. passer du sketch noir et blanc à un style couleur).
//
// Comme les 4 autres paires, DefaultImageGenerationContextPrompt (contexte
// et objectif) et DefaultImageGenerationPrompt (méthode — ici, les règles
// de style) sont concaténés au moment de l'appel (voir ImageService,
// internal/service/image_service.go) pour former l'instruction de style
// commune aux DEUX usages (portrait de persona et sketch de diagramme) —
// seule la partie DONNÉES du prompt final (nom/bio du persona, ou
// personas/phases/activités de la mission) reste fixe/générée par
// PersonaPortraitPrompt/DiagramSketchPrompt ci-dessous, car structurelle à
// chaque usage plutôt que stylistique.
const DefaultImageGenerationContextPrompt = `Contexte : ce texte n'est PAS envoyé à un assistant conversationnel — c'est directement le début du prompt transmis à un modèle de GÉNÉRATION D'IMAGE (Mistral / FLUX), auquel s'ajoutent ensuite les données concrètes (nom et fiche d'un persona pour un portrait, ou personas/phases/activités d'une mission pour un sketch de diagramme). Objectif : produire une illustration cohérente avec l'esprit épuré de l'outil, qui donne un aperçu visuel agréable sans jamais prétendre représenter fidèlement une vraie personne ni reproduire exactement la mise en page du diagramme.`

const DefaultImageGenerationPrompt = `Style : sketch dessiné à la main ("hand-drawn sketch"), noir et blanc, traits fins, minimaliste — jamais de texte incrusté dans l'image, jamais de filigrane ni de signature, jamais de rendu photoréaliste. Garde cette direction artistique quel que soit le sujet (portrait de persona ou sketch de diagramme), pour que les illustrations générées par l'outil restent reconnaissables et cohérentes entre elles.`

// PersonaPortraitPrompt construit le prompt de génération du portrait d'un
// persona à partir de sa fiche (About/Bio/Goals/PainPoints — voir
// domain.Actor) — n'inclut que les champs réellement renseignés, jamais de
// contenu inventé au-delà de ce que l'utilisateur a saisi. styleInstruction
// est le texte de style déjà résolu par l'appelant (personnalisé ou
// DefaultImageGenerationContextPrompt+DefaultImageGenerationPrompt — voir
// ImageService), un ImageService reste un simple exécutant comme les
// Generator de prompts.go.
func PersonaPortraitPrompt(styleInstruction, name, about, bio string, goals, painPoints []string) string {
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
	b.WriteString(styleInstruction)
	return b.String()
}

// DiagramSketchPrompt construit le prompt de génération d'une illustration
// "sketch" du diagramme de processus d'une mission (alternative créative à
// l'export PNG technique, voir pngExport.ts côté frontend) — un résumé du
// contenu (personas/phases/activités), jamais le diagramme exact reproduit
// trait pour trait (le modèle d'image ne peut de toute façon pas
// reproduire une mise en page précise). styleInstruction : voir
// PersonaPortraitPrompt ci-dessus.
func DiagramSketchPrompt(styleInstruction, missionName string, actorNames, phaseNames, activityNames []string) string {
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
	b.WriteString(styleInstruction)
	return b.String()
}
