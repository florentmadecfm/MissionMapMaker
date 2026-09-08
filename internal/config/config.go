// Package config persiste les réglages de l'instance locale (le
// fournisseur LLM actif et une clé API par fournisseur, saisis depuis
// l'interface) dans le répertoire de configuration de l'utilisateur,
// séparé des dossiers de projets — une clé API est un secret propre au
// poste, elle ne doit pas se retrouver mêlée aux fichiers projet qu'on
// pourrait exporter ou versionner.
package config

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// ProviderSettings regroupe la clé API et le modèle configurés pour un
// fournisseur donné. Un réglage est conservé par fournisseur (même non
// actif) pour ne pas perdre la clé Mistral quand on bascule sur
// Anthropic, et inversement.
type ProviderSettings struct {
	APIKey string `json:"apiKey,omitempty"`
	Model  string `json:"model,omitempty"`
}

type Config struct {
	// Provider est le fournisseur actif ("anthropic" | "mistral").
	// Vide = aucun fournisseur configuré.
	Provider string `json:"provider,omitempty"`

	Anthropic ProviderSettings `json:"anthropic,omitempty"`
	Mistral   ProviderSettings `json:"mistral,omitempty"`
}

// Active renvoie les réglages du fournisseur actif, ou un ProviderSettings
// vide si aucun n'est configuré.
func (c *Config) Active() ProviderSettings {
	switch c.Provider {
	case "mistral":
		return c.Mistral
	case "anthropic":
		return c.Anthropic
	default:
		return ProviderSettings{}
	}
}

func path() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "missionmapmaker", "config.json"), nil
}

// Load lit la configuration existante. Une configuration vide (aucun
// fichier trouvé) n'est pas une erreur : c'est l'état par défaut avant
// toute saisie de clé depuis l'interface.
func Load() (*Config, error) {
	p, err := path()
	if err != nil {
		return nil, err
	}

	data, err := os.ReadFile(p)
	if err != nil {
		if os.IsNotExist(err) {
			return &Config{}, nil
		}
		return nil, err
	}

	var c Config
	if err := json.Unmarshal(data, &c); err != nil {
		return nil, err
	}
	return &c, nil
}

// Save écrit la configuration avec des permissions restreintes (0600) : le
// fichier contient une clé API en clair.
func Save(c *Config) error {
	p, err := path()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o700); err != nil {
		return err
	}

	data, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(p, data, 0o600)
}
