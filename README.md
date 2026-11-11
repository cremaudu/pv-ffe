# PV FFE

Appli mobile pour les capitaines d'équipes d'échecs : consulter les résultats interclubs de son club et envoyer rapidement les feuilles de match, sans attendre le site de la FFE (echecs.asso.fr), très lent les soirs de match.

Le projet a été écrit pour l'Échiquier Domloupéen. Il s'adapte à un autre club en modifiant un seul fichier de configuration (voir [Adapter à un autre club](#adapter-à-un-autre-club)).

> Projet indépendant, sans lien avec la Fédération Française des Échecs. Il lit les pages publiques du site fédéral et remplit le formulaire de saisie à la place du capitaine, avec ses propres identifiants.

## Ce que fait l'appli

- **Résultats** : classement et calendrier de chaque équipe du club, vue de toutes les équipes pour une ronde, détail des parties d'une ronde jouée.
- **Feuille de match** : saisie hors ligne des joueurs, résultats, capitaines et arbitre, avec les joueurs de chaque équipe proposés d'office et une recherche par nom ou code FFE.
- **Envoi à la FFE** : l'appli remplit le formulaire fédéral étape par étape. Un bouton « Tester sans enregistrer » va jusqu'au bout sans rien enregistrer ; l'envoi réel demande une confirmation.
- **Mode démo** : toute la saisie sans identifiants, envoi désactivé.

Les identifiants FFE du capitaine sont demandés à chaque ouverture et ne sont jamais conservés, ni sur le téléphone ni sur le relais.

## État du projet

- L'affichage des résultats et la saisie sont utilisés en conditions réelles.
- Le test sans enregistrement a été validé sur le site FFE.
- **L'enregistrement réel d'une feuille n'a encore jamais été exécuté.** Lors d'un premier envoi, garder le site FFE en secours.
- Seul le barème « Adulte » est géré (seules les victoires comptent dans le score du match). Les barèmes « Criterium » et « Jeune » ne le sont pas : l'appli refuse alors l'envoi.

## Fonctionnement

Le projet tient en deux parties, sans framework ni étape de construction :

- `public/` : l'appli (PWA en JavaScript simple), installable sur l'écran d'accueil du téléphone.
- `src/worker.js` : un relais hébergé sur Cloudflare Workers. Il lit les pages FFE, en garde une copie et renvoie des données légères au téléphone. C'est aussi lui qui transmet la feuille de match au site FFE.

Le relais recharge toutes ses copies chaque lundi matin. Le détail est décrit dans [CACHE.md](CACHE.md).

## Installation

Il faut [Node.js](https://nodejs.org) et un compte [Cloudflare](https://dash.cloudflare.com/sign-up) (l'offre gratuite suffit).

```sh
npm install
npx wrangler login
npx wrangler deploy
```

Le premier déploiement crée l'espace de stockage des copies et affiche l'adresse de l'appli, du type `https://pv-ffe.<votre-compte>.workers.dev`.

Pour travailler en local :

```sh
node dev.mjs          # http://localhost:8787
```

## Adapter à un autre club

Tout se règle dans `public/config.js` :

| Réglage | Rôle |
| --- | --- |
| `saison` | saison en cours, à changer chaque rentrée |
| `appli` | nom de l'appli (titre et nom une fois installée) |
| `club.nom` | début du nom des équipes dans les classements FFE, affiché dans l'en-tête |
| `club.nomComplet` | nom complet du club |
| `club.ref` | numéro du club à la FFE |
| `club.logo` | image de l'en-tête, à déposer dans `public/` |
| `couleurs` | bandeau du haut, couleur d'accent, boutons |
| `groupes` | numéros des groupes où jouent les équipes du club |
| `echiquiers` | nombre d'échiquiers proposé par défaut |

Deux éléments restent hors de ce fichier : l'icône de l'appli (`public/icon.svg`, à remplacer) et le nom du déploiement (`name` dans `wrangler.jsonc`), qui donne le début de l'adresse.

Où trouver les valeurs de `config.js` sur le site FFE :

- **`ref`** : le nombre après `ClubRef=` dans l'adresse de la fiche du club (`FicheClub.aspx?Ref=…` ou `ListeEquipes.aspx?ClubRef=…`).
- **`groupes`** : le nombre après `Groupe=` dans l'adresse de la page de chaque groupe où joue une équipe du club (`Equipes.aspx?Groupe=…`).

Les équipes, leurs identifiants et leurs adversaires sont ensuite déduits des pages FFE.

## Changement de saison

La FFE réattribue les numéros de groupe chaque saison. À la rentrée, mettre à jour `saison` et `groupes` dans `public/config.js`, puis redéployer. Les anciennes copies sont alors ignorées par le relais et effacées des téléphones.

## Limites connues

- Le site FFE met jusqu'à 30 secondes par page : le premier affichage d'une page jamais lue est lent, et un envoi de feuille prend 4 à 5 minutes.
- L'appli lit le site FFE en analysant ses pages : une refonte du site fédéral la casserait.
- Un joueur qui dispute son premier match n'apparaît dans la liste de son équipe que le lundi suivant ; la recherche permet de le saisir d'ici là.
- L'envoi est bloqué tant que les deux capitaines et un arbitre licencié FFE ne sont pas renseignés.
