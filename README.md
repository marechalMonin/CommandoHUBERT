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
| Administration (tutos Game Master, GM Tools, économie, front dynamique ; agenda des GM) | `admin.html` | `admin` |

- Comptes : `assets/comptes.js` (empreintes seulement). Créer ou modifier un compte : `outil-identifiants.html`.
- Mode d'emploi complet (comptes, nouvel espace, ajout d'un tuto, agenda) : `docs/espace-membres.md`.
