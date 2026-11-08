# CommandoHUBERT
Site Commando HUBERT

## Situation du front

La page d'accueil affiche en haut l'état de la campagne « Front Dynamique » : zones, attaques,
contre-attaques et journal, mis à jour automatiquement.

- Code : `assets/front.js` et `assets/front.css`
- Données de démonstration : `data/front.json`
- Format du flux et passage en direct : `docs/flux-front.md`

## Espace membres

Accès par compte depuis `connexion.html` (vérification dans le navigateur, voir `assets/auth.js`).

| Espace | Page | Rôle |
| --- | --- | --- |
| Régiment médical | `medecin.html` | `medecin` |
| GCA (désamorçage IED) | `gca.html` | `gca` |
| Administration (tutos Game Master, économie, front dynamique, site) | `admin.html` | `admin` |

- Comptes : `assets/comptes.js` (empreintes seulement). Créer ou modifier un compte : `outil-identifiants.html`.
- Ajouter un tuto d'administration : copier une `<section class="tuto">` dans `admin.html`
  (onglets et sommaire sont générés automatiquement ; mode d'emploi dans l'onglet « Site & accès »).
