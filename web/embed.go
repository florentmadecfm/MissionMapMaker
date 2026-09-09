// Package web embarque les fichiers statiques du frontend buildé
// (web/dist, généré par "npm run build") dans le binaire Go, pour
// produire un exécutable autonome (API + interface) sans dépendance à
// Node/npm à l'exécution. Voir ADR-031.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var distFS embed.FS

// DistFS retourne le contenu de dist/ (fichiers statiques du frontend
// buildé), racine à la racine du FS renvoyé, prêt à être servi par
// http.FileServerFS. Tant que le frontend n'a pas été buildé (dist ne
// contient alors que le .gitkeep de placeholder, cas du dev quotidien
// via "npm run dev" sur :5173), ce FS ne contient pas d'index.html : les
// requêtes sur "/" renvoient simplement 404, ce qui est sans
// conséquence puisque ce chemin n'est pas utilisé en dev.
func DistFS() fs.FS {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic(err) // ne peut arriver : "dist" est le chemin embarqué ci-dessus
	}
	return sub
}
