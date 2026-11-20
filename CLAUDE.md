# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Projet

Application web mobile (PWA) pour les capitaines d'équipes d'échecs d'un club : consulter les résultats des équipes du club, préparer la feuille de match (PV) et l'envoyer au site de la FFE (echecs.asso.fr), très lent les soirs de match. Écrite pour l'Échiquier Domloupéen, elle doit rester utilisable par n'importe quel club : tout ce qui est propre au club vit dans `public/config.js`, rien en dur ailleurs. L'interface et les échanges avec l'utilisateur sont en français.

## Commandes

- `node dev.mjs [port]` — serveur local (sert `public/` et exécute le worker dans Node). À préférer en local : `wrangler dev` démarre mais ses requêtes sortantes vers la FFE échouent sur ce poste (« internal error »).
- `node dev.mjs 8788 calendrier` — idem pour le calendrier (`calendrier/public/` et `calendrier/worker.js`).
- `npx wrangler deploy` — déploiement Cloudflare Workers (après `npx wrangler login`). Calendrier : `npx wrangler deploy -c calendrier/wrangler.jsonc`.
- `node --check public/app.js` puis `node --check src/worker.js` (et `calendrier/worker.js`, `calendrier/public/app.js`) — vérification de syntaxe. Il n'y a ni tests ni linter.

## Architecture

- `src/worker.js` — relais Cloudflare Worker. Lit les pages publiques FFE, les analyse par expressions régulières et renvoie du JSON :
  - `/api/groupe/:id` → calendrier + classement (`Equipes.aspx?Groupe=`), le classement donne le `clubRef` de chaque équipe ;
  - `/api/groupe/:id/ronde/:n` → détail des parties d'une ronde (postback public `LinkCmdRonde` sur la page du groupe) ;
  - `/api/equipe/:id/joueurs` → joueurs ayant déjà joué (`ListeJoueurs.aspx?Action=EQUIPE`), **sans** code FFE ;
  - `/api/club/:ref/equipes` → équipes d'un club avec leur id d'équipe et leur groupe (`ListeEquipes.aspx?ClubRef=`) ; sert à retrouver l'id d'une équipe (la sienne ou l'adversaire) à partir du `clubRef` du classement ;
  - `/api/recherche?action=j1|jr|ar&club=&q=` → `AutoComplete.ashx` de la FFE (public, rapide). `j1` = joueur (`CODE - NOM Prénom Elo`), `jr` = capitaine, `ar` = arbitre (sans `club`) ;
  - `POST /api/connexion` `{login, password}` → tente la connexion sur `Connect.aspx` et renvoie `{ok}` (succès = redirection ou absence du champ mot de passe ; confirmé avec de vrais identifiants, bons et mauvais) ;
  - `GET /manifest.webmanifest` → manifeste PWA généré à partir de `config.js` (nom de l'appli, couleur).
- `public/` — interface sans framework ni build. `config.js` est le seul fichier propre au club : saison, nom de l'appli, club (`nom`, `nomComplet`, `ref`, `logo`), couleurs, groupes suivis ; équipes, ids et adversaires sont déduits des pages FFE. `app.js` applique titre, en-tête et couleurs au démarrage ; le worker lit le même fichier par expressions régulières (`config()`), d'où des clés au nom unique et des valeurs littérales simples. `app.js` contient les vues Résultats (par équipe ou compilation par ronde), Connexion capitaine et Feuille de match.
- La session capitaine (équipe + identifiants FFE) vit en mémoire uniquement, jamais dans `localStorage`.
- Cache : `localStorage` côté téléphone (`c:<chemin>` pour les données, `feuille:<idEquipe>:<ronde>` pour les feuilles) ; affichage immédiat depuis le cache puis rafraîchissement. Côté relais, chaque page FFE est copiée dans KV (`env.CACHE`, clés `p:<chemin FFE>` et `r:<groupe>:<ronde>`) et servie telle quelle avec son âge (`X-Age`) ; l'appli redemande `?fresh` quand la copie d'un groupe dépasse 10 min. Fiches clubs et listes de joueurs ne sont jamais relues à la demande de l'appli : seulement le lundi (ou si le relais n'en a aucune copie).
- Tâche planifiée (`scheduled` → `recharger()`), le lundi de 02h00 à 05h55 UTC toutes les 5 min : file d'attente dans KV (`cron:etat`), 4 pages par passage — fiche club, groupes, puis clubs adverses, listes de joueurs et détails des rondes jouées. `GET /api/cron` en donne l'état. En local, `GET /api/dev-cron` exécute un passage (faux KV en mémoire dans `dev.mjs`).
- Score du match : repris de `inc_equipe.js` de la FFE — seules les victoires (forfaits compris) comptent, une nulle vaut 0 (sauf règles « Criterium » et « Jeune », non gérées).

## Calendrier des tournois (second Worker)

- `calendrier/` — Worker indépendant `calendrier-ffe` (`calendrier/wrangler.jsonc`, son propre KV et son cron) : tournois à cadence lente annoncés dans les ligues de `calendrier/public/config.js` (`ligues: ['BRE', 'PDL', 'NOR']`), avec le détail de leur fiche. Lecture seule, aucune page authentifiée. Il importe `decode`, `cells` et `parseForm` de `src/worker.js`.
- Source : `ListeTournois.aspx?Action=ANNONCE&Level=1` (bouton « Cadence lente » de `Tournois.aspx`), liste **nationale** des tournois à venir, 40 par page (5 pages, 194 tournois en novembre 2026). Pages suivantes : postback `PagerFooter` avec le numéro de page en `__EVENTARGUMENT`, possible directement depuis le formulaire de la page 1 ; la flèche `PagerFooter','d'` manque sur la dernière page. Les dates « 21 nov. » prennent l'année des lignes `RowRupture` (« novembre 2026 »).
- La FFE ne filtre pas ces annonces par ligue (`Ligue=` est ignoré ; les listes `TOURNOICOMITE` mélangent cadences et tournois passés) : tri sur la colonne département, table `LIGUES` dans `calendrier/worker.js` (codes à deux caractères : `01`, `2A`).
- Fiche `FicheTournoi.aspx?Ref=` (sans formulaire `aspnetForm` : une page complète se reconnaît à `id="ctl00_divfooter"`) : `LabelDates`, puis des lignes `Row<Champ>` libellé / valeur (cadence `1h30 + [30'']`, rondes, prix, inscriptions, contact…), parfois un lien relatif (`RowPdf` : annonce de l'organisateur en PDF, règlement intérieur), et `RowAnnonce` (HTML libre : liens d'inscription, emojis `&#x1F3C6;`).
- Rien n'est lu à la demande : `/api/tournois` sert la clé KV `calendrier` (liste + fiches assemblées par `publier()`). Cron toutes les 5 min, mais un seul cycle par nuit (00h00-01h55 UTC) et un premier dès le déploiement : pages de la liste, puis fiches nouvelles ou de plus de 7 jours (clés `f:<ref>`, expiration 120 jours). Une liste incomplète ne remplace pas la précédente (clé `liste`). `GET /api/cron` donne l'état ; en local `GET /api/dev-cron`.
- Tournois jeunes (environ un tiers des annonces) : repérés côté client par leur nom (`JEUNES` dans `calendrier/public/app.js` : catégorie `U10`, `U18-U20`… ou mot « jeunes », comme « Open Jeunes » ; les départements ne mettent pas tous « Jeunes » dans le nom, et `U1600` ne compte pas). Ils sont masqués par défaut (`jeunes: false` dans `config.js`), et une case les affiche (choix gardé dans `localStorage`, clé `jeunes`).

## Changement de saison

Les numéros de groupe FFE sont réattribués chaque saison. Toutes les copies sont donc rangées sous `saison` de `public/config.js` : préfixe `<saison>:` des clés KV (`parSaison()` dans le worker) et `<saison>|` des clés `localStorage` (les clés d'une autre saison sont effacées au démarrage de l'appli). À la rentrée : mettre à jour `saison` et `groupes` dans `config.js`, redéployer. Le reste (équipes, ids, adversaires) est déduit des pages FFE à partir de `club.ref`.

## Particularités du site FFE

- Chaque page ASP.NET met ~30 s ; charger les groupes un par un, jamais en parallèle.
- `AutoComplete.ashx` ne cherche que sur le **début du nom de famille** ou le code FFE (« PIHAN Daniel » ne renvoie rien, « PIHAN » oui).
- Formulaire `SaisiePV.aspx` (authentifié, postbacks ASP.NET avec `__VIEWSTATE`), champs préfixés `ctl00$ContentPlaceHolderMain$` :
  `SelectCompetition` → `SelectDivision` → `SelectGroupe` (postback à chaque sélection), `DropDownEquipeBlanc/Noir` (postback), `DropPtsBl/Nr$DropDownDecimal`, `DropPtsMatchBl/Nr$DropDownNumeric`, `RepeaterBoards$ctl00..ctl04$TextNrFFEBl | DropDownResult | TextNrFFENr`, `TextClubBlId/NrId`, `TextCapitaineBl/Nr`, `TextArbitre`, `TextCommentaire`, liens `LinkCmdSave` / `LinkCmdUndo`.
  Valeurs de `DropDownResult` : `None, Nulle, GainBlanc, GainNoir, DoubleDefaite, GainBlancForfait, GainNoirForfait, NonAttribue, Ajourne`.
- « Blanc » = l'équipe de **gauche**, celle qui a les Blancs au 1er échiquier ; `GainBlanc` = gain du joueur de gauche quel que soit l'échiquier. L'appli parle donc de gauche/droite.

## Règle impérative

Ne **jamais** déclencher `LinkCmdSave` sur `SaisiePV.aspx` pendant le développement ou les tests : une feuille de match partirait au directeur de groupe. L'envoi réel ne doit partir que sur confirmation explicite de l'utilisateur dans l'appli.

## Envoi du PV (étape 3)

- Worker : `POST /api/pv/ouvrir` (connexion + GET `SaisiePV.aspx`) et `POST /api/pv/etape` (un postback ; cibles en liste blanche ; `LinkCmdSave` exige `confirme: true`). Le worker est sans état : le client renvoie à chaque étape le cookie de session et tous les champs du formulaire (`parseForm`).
- Client (`envoyer()` dans `app.js`) : compétition → division → groupe → équipe gauche → équipe droite (un postback chacun, ~30 s), contrôle du nombre d'échiquiers et du barème (`CalculerPoints(n,'Adulte')` lu dans la page), puis soit arrêt (« Tester sans enregistrer »), soit postback `LinkCmdSave`. L'enregistrement n'est jamais retenté automatiquement.
- Champs joueurs/capitaines/arbitre : on envoie la ligne complète de l'autocomplétion (`CODE - NOM Prénom Elo`). Points : `DropPtsBl/Nr` = nombre de victoires (`"2.0"`), `DropPtsMatch` = 3 victoire / 2 nul / 1 défaite.
- Envoi bloqué (`manques()`) tant qu'il manque un résultat, un code FFE, un capitaine, ou un commentaire quand aucun arbitre FFE n'est choisi (l'arbitre est facultatif : certaines divisions acceptent un arbitre sans titre, nommé alors dans le commentaire) ; « Tester sans enregistrer » reste possible.
- **Jamais validé en réel** : format exact attendu par le serveur pour les champs texte, et texte de confirmation après enregistrement (on cherche « enregistr »).

## État d'avancement

Étapes 1 à 3 écrites ; « Tester sans enregistrer » validé sur le site FFE. L'enregistrement réel reste à valider sur un vrai match. La recharge planifiée a tourné chez Cloudflare le 15 novembre 2026 (95 pages, aucun échec), mais un dimanche : dans les crons Cloudflare, `1` = dimanche ; d'où `MON` dans `wrangler.jsonc`.
