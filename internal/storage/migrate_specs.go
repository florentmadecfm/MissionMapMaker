package storage

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"

	"pulse-missionmap/internal/domain"
)

// specsMigrationMarker, une fois présent dans dataDir, signale que
// MigrateSpecsToProducts a déjà tourné — sans lui, chaque redémarrage du
// serveur réaccumulerait les mêmes spécifications/tests en double dans
// chaque produit concerné.
const specsMigrationMarker = ".specs-migrated-to-products"

// legacyProjectForMigration lit uniquement les champs nécessaires à la
// migration depuis le JSON BRUT d'un fichier projet — jamais via
// domain.Project/domain.ProjectVariant, dont les champs Specifications/
// TestScenarios ont été retirés au moment de ce déplacement (voir
// project.go) : json.Unmarshal ignore silencieusement les clés inconnues
// d'un struct, ce type intermédiaire est donc le seul moyen de retrouver
// cette donnée historique encore présente sur disque.
type legacyProjectForMigration struct {
	ProductID *string `json:"productId"`
	Target    *struct {
		Specifications []domain.Specification `json:"specifications"`
		TestScenarios  []domain.TestScenario  `json:"testScenarios"`
	} `json:"target"`
}

// MigrateSpecsToProducts transfère, une seule fois (voir
// specsMigrationMarker), les spécifications/scénarios de test de la
// variante CIBLE de chaque mission déjà rattachée à un produit
// (Project.ProductID) vers ce produit (Product.Specifications/
// TestScenarios, product.go) — décision utilisateur au moment de ce
// déplacement : seule la Cible participe désormais à la traçabilité d'un
// produit, l'état Actuel de chaque mission n'est jamais lu ici (voir le
// commentaire sur Activity.TraceLinks, project.go). Une mission SANS
// produit n'est jamais migrée : ses specs/tests restent orphelins sur
// disque (ni supprimés ni affichés, récupérables au besoin), exactement
// comme ceux de l'état Actuel de toute mission, qui ne sont de toute façon
// jamais repris par cette migration.
//
// Lecture seule des fichiers projet : jamais réécrits ici. Leurs champs
// specifications/testScenarios historiques (orphelins une fois le struct
// Go domain.Project/domain.ProjectVariant allégé) restent sur disque tels
// quels jusqu'à la prochaine sauvegarde normale de cette mission par
// l'application — qui ne les reportera naturellement plus, le struct ne
// les connaissant plus.
func MigrateSpecsToProducts(dataDir string) error {
	markerPath := filepath.Join(dataDir, specsMigrationMarker)
	if _, err := os.Stat(markerPath); err == nil {
		return nil // déjà migré
	} else if !os.IsNotExist(err) {
		return err
	}

	entries, err := os.ReadDir(dataDir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // dataDir pas encore créé (toute première exécution) : rien à migrer
		}
		return err
	}

	bySpecs := map[string][]domain.Specification{}
	byTests := map[string][]domain.TestScenario{}

	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dataDir, e.Name(), "project.json"))
		if err != nil {
			continue // dossier non conforme (ex. résidu) : ignoré plutôt que de faire échouer toute la migration
		}
		var legacy legacyProjectForMigration
		if err := json.Unmarshal(data, &legacy); err != nil {
			continue
		}
		if legacy.ProductID == nil || legacy.Target == nil {
			continue
		}
		if len(legacy.Target.Specifications) == 0 && len(legacy.Target.TestScenarios) == 0 {
			continue
		}
		pid := *legacy.ProductID
		bySpecs[pid] = append(bySpecs[pid], legacy.Target.Specifications...)
		byTests[pid] = append(byTests[pid], legacy.Target.TestScenarios...)
	}

	if len(bySpecs) > 0 || len(byTests) > 0 {
		store := NewProductStore(dataDir)
		touched := map[string]bool{}
		for pid := range bySpecs {
			touched[pid] = true
		}
		for pid := range byTests {
			touched[pid] = true
		}
		for pid := range touched {
			product, ok, err := store.Get(pid)
			if err != nil {
				return err
			}
			if !ok {
				continue // productId pointait vers un produit entre-temps supprimé
			}
			product.Specifications = append(product.Specifications, bySpecs[pid]...)
			product.TestScenarios = append(product.TestScenarios, byTests[pid]...)
			if err := store.Save(product); err != nil {
				return err
			}
			log.Printf(
				"migration specs/tests -> produits : %d spécification(s) et %d scénario(s) de test transférés vers le produit %s",
				len(bySpecs[pid]), len(byTests[pid]), pid,
			)
		}
	}

	return os.WriteFile(markerPath, []byte("migrated\n"), 0o644)
}
