# Espace membres : comptes, espaces et tutos

Le site est un ensemble de pages statiques hébergées par GitHub Pages depuis le dépôt
`marechalMonin/CommandoHUBERT`. Chaque modification validée sur `main` est en ligne au bout
d'une à deux minutes. Il n'y a ni serveur ni base de données côté site : tout se passe dans le
navigateur du visiteur.

## Les fichiers

| Fichier | Rôle |
| --- | --- |
| `index.html` | Page publique : bandeau du front, présentation, règlement, grades, formations, recrutement. |
| `connexion.html` | Connexion à l'espace membres et choix de l'espace. |
| `medecin.html`, `gca.html`, `admin.html` | Les espaces protégés : dossiers médicaux RP, désamorçage IED, tutos et agenda d'administration. |
| `outil-identifiants.html` | Outil de l'état-major pour créer un compte ou changer un mot de passe. |
| `assets/auth.js`, `assets/comptes.js` | Mécanique de connexion et liste des comptes (empreintes seulement). |
| `assets/espace.css` | Style commun des pages de l'espace membres. |
| `assets/agenda.js` | Agenda des disponibilités des GM (onglet Agenda de `admin.html`), partagé via la base Firebase. |
| `assets/front.js`, `assets/front.css`, `data/front.json`, `docs/flux-front.md` | Bandeau du front dynamique, données de démonstration et documentation du flux. |
| `assets/ied-regles.js`, `assets/medecin.js` | Règles IED du GCA et logique des dossiers médicaux. |

## Gérer les comptes

Les mots de passe ne sont jamais écrits sur le site : seule une empreinte (PBKDF2-SHA256,
150 000 itérations, sel aléatoire) figure dans `assets/comptes.js`. La vérification se fait dans
le navigateur.

Ajouter un compte ou changer un mot de passe :

1. Ouvrir `outil-identifiants.html`, saisir l'identifiant, le mot de passe (12 caractères minimum
   conseillés) et cocher les accès.
2. *Générer la ligne* puis *Copier* (rien n'est envoyé : le calcul est local).
3. Sur GitHub, ouvrir `assets/comptes.js`, cliquer le crayon, coller la ligne dans la liste
   `window.COMPTES` (ou remplacer l'ancienne ligne du même identifiant), puis *Commit changes*.

À savoir :

- L'identifiant est insensible à la casse (`Admin` = `admin`) ; le mot de passe, lui, est exact.
- Rôles possibles : `medecin`, `gca`, `admin`. Un compte peut en cumuler plusieurs (ex. `etat-major`).
- Supprimer un compte = effacer sa ligne.
- La session dure 8 h et se termine à la fermeture du navigateur. Après 5 échecs, 30 s d'attente.
- **Limite** : c'est une barrière d'accès RP, pas une protection forte. Un visiteur déterminé peut
  lire le code des pages protégées. N'y mettez rien de réellement confidentiel (mot de passe admin
  du serveur, secret Firebase, données personnelles).

## Ajouter un nouvel espace

1. Dans `assets/auth.js`, ajouter une entrée dans `ESPACES` :
   `nouveau: { page: "nouveau.html", nom: "…", ico: "…", desc: "…" }`.
2. Créer `nouveau.html` sur le modèle de `gca.html` : classe `verrou` sur `<html>`, les scripts
   `comptes.js` et `auth.js` puis `Auth.exiger("nouveau")` dans le `<head>`, et
   `Auth.barre("nouveau")` en bas de page.
3. Dans `outil-identifiants.html`, ajouter la case à cocher du rôle (la case et le `roles.push`).
4. Donner le rôle aux comptes concernés via l'outil.

## Ajouter ou modifier un tuto d'administration

Chaque tuto est une `<section class="tuto panel">` dans `admin.html`. Les onglets et le sommaire
sont générés automatiquement.

1. Copier une section entière et changer `id="tuto-xxx"`, `data-titre` (nom de l'onglet),
   `data-ico` (émoji) et `data-maj` (date AAAA-MM-JJ).
2. Écrire le contenu avec des `<h2 id="xxx-yyy">` : chaque `h2` devient une entrée du sommaire et
   un lien partageable (`admin.html#xxx-yyy`).
3. Éléments disponibles : `<h3>`, listes, tableaux (dans un `<div class="defilant">`), `<kbd>` pour
   une touche, `<code>` pour une commande, `<pre><code>` pour un bloc, encadrés `note astuce` /
   `note attention` / `note chantier`, et `cartes` pour des blocs côte à côte.
4. Lien direct vers un onglet : `admin.html#xxx` (sans le préfixe `tuto-`).

## Agenda des GM

L'onglet Agenda de `admin.html` lit et écrit dans la Realtime Database du projet Firebase
`front-dynamique`, nœud `agenda` (`agenda/AAAA-MM-JJ/pseudo = "present" | "absent" | "peut-etre"`).
Les règles à publier sur la base sont affichées dans l'onglet (section « Configuration de la
base ») ; l'adresse se change via l'attribut `data-agenda` du bloc `<div id="agenda">`.

## Modifier le site sur GitHub

1. Ouvrir le fichier, cliquer le crayon *Edit*, modifier, puis *Commit changes* avec un message
   clair.
2. Attendre une à deux minutes, puis recharger la page (Ctrl+F5 pour forcer le cache).
3. L'onglet *History* d'un fichier permet de revenir à une version précédente.
4. Pour une modification lourde (nouvelle page, changement de style), passer par une branche et
   une *pull request*.
