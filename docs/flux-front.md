# Flux « Situation du front »

Le bandeau en haut de la page d'accueil (`index.html`, section `#front`) affiche l'état de la
campagne Front Dynamique : zones, attaques, contre-attaques et journal. Il lit un document JSON
publié par le serveur de jeu. Ce fichier décrit ce document et la façon de brancher le site dessus.

## Brancher le site

Les réglages se trouvent sur la balise `<section id="front">` de `index.html`.

| Attribut | Rôle | Par défaut |
| --- | --- | --- |
| `data-source` | Adresse du flux | `data/front.json` (démonstration) |
| `data-mode` | `auto`, `flux` (écoute continue) ou `lecture` (relecture périodique) | `auto` : écoute continue pour une base Firebase, relecture sinon |
| `data-intervalle` | Secondes entre deux relectures | `120` (2 min) |

Passage en direct avec Firebase :

```html
<section class="front" id="front" aria-labelledby="front-titre"
         data-source="https://<projet>-default-rtdb.europe-west1.firebasedatabase.app/front.json">
```

Le site affiche « En direct » tant que `maj` change, « Sans nouvelles » après 2,5 fois la période
annoncée par le serveur (`intervalle`, soit 5 min pour un envoi toutes les 2 min ; 150 s au moins) sans changement,
« Serveur arrêté » si `serveur.enLigne` vaut `false`, et garde toujours la dernière situation connue.

## Format du document (version 1)

Horodatages : secondes Unix UTC conseillées (plus simple côté Enforce Script) ; ISO 8601 accepté.
Exemple complet : `data/front.json`.

| Champ | Type | Description |
| --- | --- | --- |
| `version` | nombre | `1` |
| `demo` | booléen | `true` : données fictives ; le site l'affiche et rejoue les horaires au présent |
| `maj` | horodatage | Heure de la publication |
| `intervalle` | nombre | Période de publication prévue, en secondes |
| `serveur.enLigne` | booléen | `false` : le bandeau affiche « Serveur arrêté » |
| `serveur.joueurs`, `serveur.joueursMax` | nombres | Joueurs connectés |
| `campagne.map`, `campagne.saison`, `campagne.jour` | texte, nombres | Ligne de contexte sous le titre |
| `carte.largeur`, `carte.hauteur` | mètres | Taille du monde (sinon déduite des zones) |
| `camps.joueurs.nom`, `camps.ia.nom` | texte | Noms affichés au-dessus de la barre de rapport de force |
| `zones` | liste | Voir ci-dessous |
| `operations` | liste | Combats en cours ou annoncés |
| `journal` | liste | Événements récents ; le site montre les 6 derniers |

### Zone

| Champ | Valeurs | Description |
| --- | --- | --- |
| `id` | texte | Identifiant stable |
| `nom` | texte | Nom affiché |
| `type` | `ville`, `village`, `base`, `aerodrome`, `port`, `point` | Symbole sur la carte |
| `x`, `z` | mètres | Position dans le monde (Enfusion : x vers l'est, z vers le nord) |
| `camp` | `joueurs`, `ia`, `neutre` | Camp qui tient la zone |
| `etat` | `calme`, `assaut`, `fragile`, `contre-attaque`, `securisee`, `menacee` | Étape du cycle de vie d'une zone |
| `controle` | 0 à 100 | Niveau de contrôle du camp qui la tient |
| `fob` | booléen | FOB établie |
| `voisins` | liste d'`id` | Liaisons du front ; une liaison entre camps opposés est tracée comme ligne de front |

### Opération

| Champ | Valeurs | Description |
| --- | --- | --- |
| `id` | texte | Identifiant |
| `type` | `assaut`, `contre-attaque`, `attaque` | Nature du combat |
| `zone` | `id` de zone | Zone visée |
| `attaquant` | `joueurs`, `ia` | Camp qui attaque |
| `etat` | `annoncee`, `en-cours` | Les opérations `terminee` sont ignorées : passez-les au journal |
| `debut`, `fin` | horodatages | Chronos « début dans… », « fin dans… » |
| `vague`, `vagues` | nombres | Vague en cours et nombre total |
| `progression` | 0 à 100 | Avancement d'une capture |

### Journal

| Champ | Valeurs | Description |
| --- | --- | --- |
| `t` | horodatage | Heure de l'événement |
| `type` | `prise`, `perte`, `annonce`, `vague`, `mission`, `fob`, `defense`… | Nature de l'événement |
| `camp` | `joueurs`, `ia`, `neutre` | Couleur de la pastille |
| `zone` | `id` de zone | Zone concernée |
| `texte` | texte | Phrase affichée, en français |

## Côté mod (Enforce Script)

- Seul le serveur publie (`Replication.IsServer()`), toutes les 2 min et à chaque événement
  (prise, perte, annonce de contre-attaque), jamais plus d'une fois toutes les 10 s.
- Le document pèse quelques Ko (20 zones ≈ 8 Ko) ; l'API REST du jeu limite les envois à moins de 1 Mo.
- L'adresse et le secret sont lus dans un fichier de config du serveur
  (ex. `$profile:FrontDynamique/flux.json`), jamais écrits dans le mod publié sur le Workshop.
- Pas de pseudos de joueurs dans le journal public sans leur accord.
- Pour alléger les envois, on peut publier par morceaux : un `PUT` sur `front/operations.json`
  ou `front/journal.json` ne remplace que ce morceau, et le site applique ces mises à jour partielles.

Esquisse, à vérifier dans le Workbench (`RestContext` propose `GET`, `POST`, `PUT` et `SetHeaders`) :

```c
// Le rappel doit rester en vie tant que la requête n'est pas terminée.
class CHB_FrontFluxRappel : RestCallback
{
	override void OnError(int errorCode)
	{
		Print("[Front] envoi du flux refusé, code " + errorCode, LogLevel.WARNING);
	}
}

class CHB_FrontFlux
{
	protected RestContext m_Contexte;
	protected ref CHB_FrontFluxRappel m_Rappel = new CHB_FrontFluxRappel();
	protected string m_sSecret;

	// urlBase : https://<projet>-default-rtdb.europe-west1.firebasedatabase.app/
	void CHB_FrontFlux(string urlBase, string secret)
	{
		m_Contexte = GetGame().GetRestApi().GetContext(urlBase);
		m_sSecret = secret;
	}

	// json : le document complet, au format décrit plus haut
	void Publier(string json)
	{
		m_Contexte.PUT(m_Rappel, "front.json?print=silent&auth=" + m_sSecret, json);
	}
}
```

## Créer la base Firebase (offre gratuite)

1. Sur <https://console.firebase.google.com>, créer un projet (Google Analytics n'est pas utile).
2. Menu Realtime Database : créer une base en Europe (`europe-west1`), en mode verrouillé.
3. Onglet Règles : lecture publique du seul nœud `front`, aucune écriture publique.

   ```json
   {
     "rules": {
       ".read": false,
       ".write": false,
       "front": { ".read": true }
     }
   }
   ```

4. Secret d'écriture : Paramètres du projet, onglet Comptes de service, « Database secrets ».
   L'API REST accepte toujours ces secrets ; Google conseille à terme un compte de service
   ou un compte serveur dédié avec jeton d'identification.
5. Tester sans le mod, depuis un terminal :

   ```bash
   curl -X PUT -d @data/front.json \
     "https://<projet>-default-rtdb.europe-west1.firebasedatabase.app/front.json?auth=<SECRET>"
   ```

   Mettre `"demo": false` et `"maj"` à l'heure actuelle dans le fichier envoyé pour voir le bandeau
   passer « En direct ». Chaque nouvel envoi s'affiche en quelques secondes, sans recharger la page.
6. Mettre l'adresse de la base dans `data-source` (index.html).
