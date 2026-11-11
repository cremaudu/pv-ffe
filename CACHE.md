# PV FFE Domloup — fonctionnement du cache

11 novembre 2026

## En bref

L'appli garde les données à deux endroits pour ne presque jamais attendre le site de la FFE, qui met jusqu'à 30 secondes par page.

1. **Le téléphone** garde ce qu'il a déjà affiché. C'est ce qui rend l'ouverture instantanée, même sans réseau.
2. **Le relais** (le petit serveur Cloudflare, `pv-ffe.domloup.workers.dev`) garde une copie de chaque page FFE déjà lue. Cette copie est commune à tous les capitaines.
3. **Le site FFE** n'est interrogé que lorsque la copie du relais manque ou est trop ancienne, et lors de la recharge du lundi matin.

Le téléphone ne parle jamais directement au site FFE : il passe toujours par le relais.

## Le cache du téléphone

Le téléphone affiche d'abord ce qu'il a en mémoire, puis se met à jour en arrière-plan.

Chaque donnée reçue est rangée dans le stockage du navigateur avec sa date. À chaque affichage :

1. La donnée en mémoire est affichée tout de suite.
2. Si elle est encore récente (voir le tableau plus bas), le téléphone ne demande rien.
3. Sinon, il demande au relais sa copie, qui arrive en une fraction de seconde, et l'affichage se met à jour.
4. Pour les groupes seulement : si la copie du relais a elle-même plus de 10 minutes, le téléphone demande au relais de relire le site FFE. L'écran indique « Actualisation… » jusqu'à la réponse.

Points à connaître :

- Ce stockage est propre à chaque téléphone et à chaque adresse. Changer d'adresse (comme lors du passage à `pv-ffe.domloup.workers.dev`) ou vider les données du navigateur repart de zéro.
- Une réponse vide (page FFE en erreur) ne remplace jamais une bonne donnée déjà en mémoire.
- Les feuilles de match en cours de saisie sont rangées au même endroit, mais ce ne sont pas des copies : elles n'existent que sur le téléphone qui les a saisies, jusqu'à l'envoi.
- Les fichiers de l'appli elle-même (pages, logo) sont aussi gardés pour qu'elle s'ouvre hors ligne. Après une mise à jour, il faut fermer et rouvrir l'appli deux fois pour obtenir la nouvelle version.

## Le cache du relais

Le relais garde une copie durable de chaque page FFE et la sert toujours immédiatement quand elle existe.

Les copies sont rangées dans un espace de stockage Cloudflare (KV, nommé `pv-ffe-cache`). Elles n'expirent pas toutes seules : une copie reste jusqu'à ce qu'une lecture plus récente la remplace.

À chaque demande du téléphone :

- **Demande normale** : le relais renvoie sa copie avec son âge. S'il n'a aucune copie, il lit la page sur le site FFE, la range et la renvoie.
- **Demande de relecture** (bouton Actualiser, ou copie de groupe de plus de 10 minutes) : le relais lit la page sur le site FFE, remplace sa copie et renvoie le résultat.

Une page FFE tronquée ou en erreur ne remplace pas une bonne copie.

C'est le téléphone qui décide si une copie est trop vieille, grâce à l'âge que le relais lui indique. Le relais, lui, ne relit jamais le site FFE de sa propre initiative, sauf le lundi matin.

Le détail des parties d'une ronde suit une règle à part : une ronde entièrement jouée est gardée telle quelle ; une ronde incomplète est relue si sa copie a plus de 10 minutes.

## La recharge du lundi matin

Chaque lundi, le relais relit lui-même toutes les pages utiles sur le site FFE, pour que tout soit prêt le reste de la semaine.

- **Horaire** : un passage toutes les 5 minutes, de 3h00 à 6h55 en hiver et de 4h00 à 7h55 en été (heure de Paris). Cloudflare ne connaît que l'heure universelle : 02h00 à 05h55 UTC.
- **Rythme** : 4 pages par passage, soit jusqu'à 192 pages dans la matinée, pour environ 150 nécessaires. La recharge est étalée parce que le site FFE est lent et que Cloudflare limite la durée de chaque passage.
- **En cas d'échec** d'une page : elle est remise en fin de file et retentée, 3 essais au plus.

Ordre de traitement :

1. La fiche du club de Domloup et les 6 groupes suivis.
2. Les fiches des clubs adverses, lues dans les classements.
3. Les listes de joueurs de toutes les équipes de ces groupes (Montauban 2, par exemple, dans le groupe de Domloup 5).
4. Le détail des parties des rondes jouées. Les rondes terminées déjà copiées ne sont pas relues, sauf la dernière ronde jouée de chaque groupe, relue chaque lundi pour prendre les corrections tardives.

Les équipes d'un club adverse engagées dans un groupe non suivi ne sont pas chargées.

**Suivi** : la page <https://pv-ffe.domloup.workers.dev/api/cron> donne l'heure de début, le nombre de pages faites, le reste à faire et les échecs. Au 11 novembre 2026, cette recharge n'a encore jamais tourné chez Cloudflare : elle n'a été testée qu'en local.

## Récapitulatif par type de donnée

| Donnée | Le téléphone redemande au relais après | Relecture du site FFE à la demande | Recharge du lundi |
| --- | --- | --- | --- |
| Groupe : calendrier, scores, classement | 10 minutes | Oui, si la copie du relais a plus de 10 minutes, ou par Actualiser | Oui, les 6 groupes |
| Fiche club : liste des équipes | 6 heures | Non, sauf si le relais n'a aucune copie | Oui, Domloup et tous les clubs adverses |
| Liste des joueurs d'une équipe | 6 heures | Non, sauf si le relais n'a aucune copie | Oui, toutes les équipes des 6 groupes |
| Détail d'une ronde terminée | 1 semaine | Non, sauf si le relais n'a aucune copie | Seulement la dernière ronde jouée de chaque groupe |
| Détail d'une ronde incomplète | 10 minutes | Oui, si la copie du relais a plus de 10 minutes | Oui |

## Le bouton Actualiser et les cas particuliers

Le bouton « Actualiser » fait relire sur le site FFE les 6 pages de groupe, et rien d'autre.

- Le groupe affiché passe en premier, puis les autres un par un. Compter jusqu'à 30 secondes par groupe, soit environ 3 minutes pour tout quand le site est lent.
- Chaque page relue remplace la copie du relais : les autres capitaines en profitent.
- Il ne recharge ni les fiches de club, ni les listes de joueurs, ni le détail des rondes.

Conséquences pratiques :

- **Le dimanche soir**, les résultats du jour apparaissent sans attendre le lundi : à l'ouverture si la copie a plus de 10 minutes, ou par Actualiser.
- **Un joueur qui dispute son premier match** n'apparaît dans la liste de son équipe que le lundi suivant. D'ici là, « Autre joueur (recherche)… » permet de le saisir.
- **Une correction tardive** d'une partie par le directeur de groupe apparaît dans le détail de la ronde après la recharge du lundi, puis au plus tard une semaine après sur un téléphone qui avait déjà ouvert ce détail. Le score du match dans le calendrier, lui, suit la règle des 10 minutes.
- **Après un envoi de feuille réussi**, l'appli relit aussitôt le groupe concerné sur le site FFE.
- **Premier affichage** d'une page que le relais n'a jamais lue : il faut attendre le site FFE une fois.

## Ce qui n'est jamais mis en cache

Trois choses passent toujours en direct par le site FFE, sans copie nulle part.

- **La recherche de joueurs, de capitaines et d'arbitres** (par nom ou code FFE). Elle est rapide, environ 2 secondes.
- **Les identifiants FFE** : ils restent dans la mémoire de l'appli le temps de la session et sont redemandés à chaque ouverture. Le relais les transmet à la FFE sans les conserver.
- **L'envoi d'une feuille de match** : chaque étape du formulaire FFE est jouée en direct.

## Le changement de saison

Toutes les copies, sur le relais comme sur le téléphone, sont rangées sous la saison inscrite dans `public/config.js` (`saison: '2026-2027'`). La FFE réattribue les numéros de groupe d'une saison à l'autre : sans cela, d'anciennes données pourraient être servies sous un numéro réutilisé.

À la rentrée, il suffit de modifier dans `public/config.js` la saison et la liste des groupes, puis de redéployer :

- le relais repart de copies neuves (les anciennes restent stockées mais ne sont plus lues) ;
- chaque téléphone efface ses anciennes données à la première ouverture, y compris les feuilles de match de la saison passée.
