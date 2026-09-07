# Système de tickets

Le système propose une configuration interactive complète sous Discord.js 14, des commandes slash et préfixées, un stockage persistant et des permissions propres à chaque serveur.

L'auto-claim, la suppression automatique sécurisée et la collecte de notes ont un comportement effectif. Aucun avis fictif n'est généré et le système de tickets reste séparé du ModMail.

## Commandes et raccourcis

| Action | Raccourci préfixé | Commande slash correspondante |
| --- | --- | --- |
| `tickets` | `+tickets` | `/tickets configurer` |
| `add` | `+add <membres/rôles>` | `/tickets ajouter cibles:…` |
| `remove` | `+remove <membres/rôles>` | `/tickets retirer cibles:…` |
| `rename` | `+rename <nom>` | `/tickets renommer nom:…` |
| `rappel` | `+rappel [#ticket]` | `/tickets rappel salon:…` |
| `transcript` | `+transcript [#ticket]` | `/tickets transcript salon:…` |
| `claim` | `+claim` | `/tickets claim` |
| `unclaim` | `+unclaim` | `/tickets unclaim` |
| `close` | `+close` | `/tickets fermer` |
| `closeall` | `+closeall [raison]` | `/tickets closeall raison:…` |
| `autoclose` | `+autoclose <durée> [raison]` | `/tickets autoclose duree:… raison:…` |
| `stars` | `+stars [@membre/ID]` | `/tickets stars utilisateur:…` |

Chaque commande slash fonctionne aussi avec le préfixe `+`, par exemple `+tickets stars @Membre`. Les commandes sont regroupées sous `/tickets`, avec les actions supplémentaires `rouvrir`, `supprimer` et `noter`. La fermeture globale ne sélectionne jamais un salon uniquement parce que son nom contient « ticket » et n'efface pas les transcripts avant leur livraison.

## Configuration rapide

1. Utilise `/tickets configurer` ou `+tickets` avec la permission **Gérer le serveur**.
2. Dans **Paramètres des tickets → Catégorie et rôle du support**, choisis la catégorie puis le rôle staff. `@everyone` est refusé.
3. Dans **Gérer les options → Ajouter une option**, indique l'identifiant, le texte, l'emoji facultatif, le message d'ouverture et la position.
4. Sélectionne l'option pour choisir sa catégorie et son rôle support particuliers. Vider une sélection rétablit le réglage par défaut. Choisis aussi la couleur du bouton.
5. Dans **Paramètres des tickets**, règle le type de panneau, son apparence, la prise en charge et les options.
6. Choisis **Envoyer / actualiser le panneau**, puis le salon public où les membres ouvriront leurs tickets.

Les réglages sont enregistrés immédiatement. Les modifications du panneau public nécessitent une nouvelle publication ; dans le même salon, le message connu est modifié au lieu d'être dupliqué. Les anciens tickets conservent leur propriétaire et le rôle support enregistré à l'ouverture. Réinitialiser les options ne supprime aucun ticket existant.

## Paramètres

| Réglage | Effet |
| --- | --- |
| Boutons / menu déroulant | Jusqu'à 25 options, classées dans l'ordre choisi. Les boutons occupent au maximum cinq lignes. |
| Apparence | Titre, description, couleur globale ; texte, emoji, ordre et couleur de chaque bouton. |
| Prise en charge | Active les commandes claim/unclaim. Un membre du support ne peut pas reprendre un ticket déjà assigné à un autre ; un responsable disposant de Gérer les salons le peut. |
| Auto-claim | Le premier message ordinaire du support prend en charge un ticket encore libre. Les bots et les commandes préfixées ne déclenchent pas l'auto-claim. Activer cette option active aussi le système de prise en charge. |
| Bouton de prise en charge | Affiche Prendre en charge / Libérer dans le message de contrôle. L'activer active aussi le système de prise en charge. |
| Bouton de fermeture | Affiche ou masque le bouton ; ne désactive pas la commande de fermeture. |
| Suppression automatique | Activation après confirmation. Conserve le salon si aucun transcript n'a été livré ou si l'export est incomplet. |
| Transcript MP | Envoi au créateur à la fermeture ; activé par défaut et conservé lors de l'intégration. |
| Salon des transcripts | Archive privée facultative. Le bot refuse un salon visible par @everyone ou le ticket lui-même. Vérifie aussi les accès des autres rôles du serveur. |
| Textes et limites | De 1 à 5 tickets ouverts par membre, préfixe des salons, texte d'ouverture et de fermeture. |
| Autres options | Mention du support, confirmation d'ouverture, droit du créateur à fermer son ticket. |

Sans option personnalisée, le panneau propose un ticket général. Un ancien bouton dont l'option a été supprimée est refusé ; il ne crée pas silencieusement un autre type de ticket.

## Commandes dans un ticket

Toutes les lignes ci-dessous existent aussi en remplaçant `+` par `/`. Pour les commandes slash, remplis les options proposées par Discord.

| Exemple préfixé | Résultat |
| --- | --- |
| `+tickets claim` | Prendre en charge le ticket. |
| `+tickets unclaim` | Libérer sa prise en charge. |
| `+tickets ajouter @Membre @Role` | Donner accès à 1 à 10 membres/rôles ; accepte aussi les IDs ou noms exacts en cache. Pour les noms contenant des espaces, séparer les cibles par des virgules. Un nom ambigu est refusé. |
| `+tickets retirer @Membre @Role` | Retirer les participants précédemment ajoutés par cette commande. |
| `+tickets renommer aide-technique` | Renommer le salon sans perdre l'identité de son créateur. |
| `+tickets rappel [#ticket]` | Mentionner le créateur pour demander une réponse, au maximum une fois par minute. Sans salon, utilise le ticket actuel. |
| `+tickets transcript [#ticket]` | Exporter le transcript en MP au demandeur, avec contrôle d'accès au ticket choisi. En cas de MP fermés, la version slash fournit le fichier dans une réponse privée ; la version préfixée l'envoie uniquement dans le ticket privé ciblé, jamais dans le salon public d'appel. |
| `+tickets fermer` | Verrouiller l'écriture du créateur et des participants ajoutés, exporter les messages et fermer le ticket. |
| `+tickets rouvrir` | Restaurer l'écriture, le nom d'ouverture et annuler toute suppression prévue. |
| `+tickets supprimer` | Demander la suppression d'un ticket déjà fermé ; confirmation valable deux minutes, réservée à son auteur. |
| `+tickets autoclose 30m demande résolue` | Programmer une fermeture avec transcript et raison facultative. Durées de 10s à 30d, suffixes s/m/h/d. |
| `+tickets autoclose annuler` | Annuler la fermeture programmée. |
| `+tickets closeall fin du support` | Demander la fermeture des tickets ouverts avec une raison facultative, puis confirmer. Permission Administrateur obligatoire. |
| `+tickets stars @Membre` | Afficher la moyenne des notes reçues par ce membre du support. Sans cible : ses propres notes. |
| `+tickets noter 5 Très bon suivi` | Le créateur note la prise en charge du ticket fermé, avec un commentaire facultatif. Préférer la version slash pour saisir un commentaire en privé. |

Raccourcis préfixés disponibles : `+claim`, `+unclaim`, `+add`, `+remove`, `+rename`, `+close`, `+closeall`, `+stars`, `+autoclose`, `+transcript`, `+ticket-config` et `+setup-ticket`. `+rappel` sans argument dans un ticket, ou suivi d'une mention/ID de salon, rappelle son créateur. `+rappel 10 texte` continue de programmer le rappel personnel existant. La commande communautaire `/rappel` n'est pas remplacée : utilise `/tickets rappel` pour un ticket.

## Fermeture globale et notation

`closeall` affiche d'abord le nombre de tickets concernés. La confirmation est réservée à l'administrateur qui l'a demandée, dans le même serveur, pendant deux minutes et pour un seul usage. Les permissions sont revérifiées au clic. Annuler ne modifie aucun salon. Un redémarrage invalide une confirmation encore en attente : relancer la commande si nécessaire.

Seuls les tickets ouverts au moment de la demande sont traités. Les tickets créés ensuite, déjà fermés ou rouverts depuis la demande sont exclus. Chaque fermeture utilise le circuit normal de transcripts et le réglage de conservation/suppression automatique ; une erreur sur un ticket n'empêche pas les autres fermetures. Le bilan indique les fermetures, les tickets ignorés et les échecs. La boucle de fermeture en cours n'est pas une file de travaux persistante : si le bot s'arrête pendant le traitement, relancer la commande pour les tickets restés ouverts.

Lorsqu'un ticket pris en charge est fermé, son créateur reçoit une invitation à noter le membre du support de 1 à 5 étoiles. Si ses MP sont fermés, les boutons sont proposés dans le ticket conservé. Seul le créateur peut voter, dans les sept jours ; le vote reste possible en MP après redémarrage ou suppression du salon. Une réouverture invalide l'invitation non utilisée. Un ticket ne peut recevoir qu'un seul avis final, même après plusieurs réouvertures. Un ticket sans prise en charge, ou pris en charge par son propre créateur, ne génère pas d'avis.

`/tickets noter` permet d'ajouter un commentaire avant d'avoir voté par bouton. Une fois le vote enregistré, il n'est pas modifiable. `stars` affiche une moyenne et un nombre d'avis réels ; les cinq derniers commentaires sont accessibles uniquement au support avec la commande slash et sa réponse privée. Les réponses préfixées et les consultations par des membres ordinaires affichent uniquement les statistiques, pas les commentaires.

## Permissions et conservation des données

- Configuration et publication : **Gérer le serveur**.
- Gestion d'un ticket : son rôle support enregistré, ou **Gérer les salons**, avec accès au salon.
- Fermeture globale : **Administrateur**, plus confirmation.
- Notes : seul le créateur note son ticket fermé ; les statistiques sont consultables, les commentaires sont réservés au support en réponse slash privée.
- Créateur : transcript et fermeture uniquement si le droit de fermeture est activé.
- Autres participants : peuvent discuter, pas gérer le ticket ni exporter via le bot.
- Le créateur, le bot, @everyone et le rôle support ne peuvent pas être retirés avec la commande de participants.
- Les commandes vérifient le marqueur de ticket et l'identité enregistrée ; un nom ressemblant à un ticket ou un simple ID dans un sujet ne suffit pas. Les salons ModMail ne sont jamais adoptés.
- Le bot doit pouvoir gérer les salons et leurs permissions, voir les salons concernés, lire l'historique, envoyer des messages, des embeds et des fichiers. Les administrateurs Discord conservent leurs accès propres à Discord.

Les réglages et entrées de tickets sont stockés sous `guilds.<serveur>.tickets` dans `storage/bot-data.json`. Chaque entrée conserve le créateur, le choix, le rôle support, les participants ajoutés, l'état, l'assignation, le message de contrôle, les échéances et les raisons de fermeture. `tickets.reviews` conserve les invitations et avis, séparément des salons pour survivre à leur suppression. Le contenu des transcripts est envoyé sur Discord, pas ajouté à ce fichier. Le fichier de données et les secrets restent ignorés par Git.

Les anciens tickets reconnus par leurs sujets `ticket-owner:…` / `ticket-closed:…` sont utilisables sans effacement ; ils sont enregistrés dans le nouveau format lors d'une action. Les limites d'ouverture sont vérifiées sous verrou local pour éviter plusieurs créations par des clics simultanés.

Une boucle de maintenance contrôle les échéances toutes les 15 secondes et dès le démarrage. Une fermeture échue pendant l'arrêt sera traitée au retour du bot. La suppression automatique arrive au premier contrôle après son délai de 30 secondes. N'exécute qu'une instance de ce bot par fichier de données : les verrous sont locaux au processus.

Le transcript texte contient les 1 000 derniers messages au maximum, les auteurs, dates, contenus, titres/descriptions des embeds et URL des pièces jointes ; les fichiers joints ne sont pas téléchargés. Le plafond est d'environ 7,5 Mo et une limite atteinte est signalée. Il ne s'agit pas d'une sauvegarde intégrale illimitée. Une suppression manuelle reste irréversible, même si un transcript existe.

## Vérification

`npm run test:tickets` teste le système sans connexion Discord et sans accès aux données réelles. `npm test` inclut aussi les tests ModMail et le registre commun slash/préfixe. Les limites de composants suivent la [référence officielle Discord](https://docs.discord.com/developers/components/reference).
