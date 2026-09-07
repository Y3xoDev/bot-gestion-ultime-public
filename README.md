# Bot Gestion Ultime — Édition publique

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.12-339933?logo=node.js&logoColor=white)
![Discord.js](https://img.shields.io/badge/Discord.js-14-5865F2?logo=discord&logoColor=white)
![Commandes](https://img.shields.io/badge/commandes-82-57F287)
![Licence](https://img.shields.io/badge/licence-MIT-blue)
[![Tests](https://github.com/Y3xoDev/bot-gestion-ultime-public/actions/workflows/ci.yml/badge.svg)](https://github.com/Y3xoDev/bot-gestion-ultime-public/actions/workflows/ci.yml)

**Bot Gestion Ultime** est un bot Discord tout-en-un destiné à l'administration d'un serveur : modération, véritable AutoMod Discord, sécurité, journaux séparés, tickets, modmail, rôles interactifs, accueil, anti-raid, outils communautaires et gestion vocale. Cette édition publique utilise un seul compte bot et ne contient aucune fonction d'hébergement de bots tiers.

Le projet utilise une architecture Discord.js 14 modulaire et cohérente. Il fonctionne avec un seul client principal, un registre central de commandes et un fichier de données durables par instance.

## État du projet

| Élément | Valeur |
| --- | --- |
| Commandes racines | **82** |
| Interfaces | Slash `/` et préfixe `+` |
| Bibliothèque | Discord.js `14.27.x` |
| Runtime | Node.js 22.12 ou supérieur |
| Enregistrement | Commandes de serveur via `GUILD_ID` |
| Stockage durable | `storage/bot-data.json` |
| AutoMod | Règles natives Discord |
| Tests | Registre, stockage, panneaux, tickets, préfixe et AutoMod |

Le [catalogue exhaustif des commandes](docs/COMMANDES.md) est généré depuis le registre réellement envoyé à Discord. Il détaille chaque commande, sous-commande, permission, option, type, limite et choix autorisé.

L'application conserve également `/help` comme commande globale. Discord peut ainsi afficher automatiquement le badge vert **Application Commands** sur le profil du bot ; ce badge est contrôlé par Discord et peut nécessiter un délai de propagation après le premier enregistrement global.

## Fonctionnalités

### Modération et dossiers

- Suppression de 1 à 100 messages récents avec respect de la limite Discord des 14 jours.
- Timeouts de 1 minute à 28 jours et retrait manuel d'un timeout.
- Expulsions, bannissements et débannissements avec raisons d'audit.
- Suppression facultative de 0 à 168 heures de messages lors d'un bannissement.
- Verrouillage et déverrouillage de salons par modification de l'autorisation `SendMessages` de `@everyone`.
- Mode lent configurable de 0 à 21 600 secondes.
- Avertissements persistants avec numéro de dossier, auteur, date, raison et état actif/révoqué.
- Ajout et retrait de rôles avec contrôle de la hiérarchie de l'utilisateur et du bot.
- Déplacement ou déconnexion individuelle d'un membre en vocal.
- Recréation d'un salon uniquement après confirmation explicite de l'auteur de la commande.

Chaque sanction vérifie à nouveau les permissions au moment de l'exécution. Le propriétaire du serveur, l'auteur de la commande, le bot lui-même et les rôles placés trop haut sont protégés contre les actions invalides.

### Véritable AutoMod Discord

La commande `/automod` utilise l'API Auto Moderation de Discord. Le filtrage ne dépend donc pas uniquement d'un événement `messageCreate` après publication.

Le bot peut gérer quatre types de règles :

- contenu inapproprié selon les filtres prédéfinis Discord ;
- spam natif Discord ;
- spam de mentions avec protection contre les raids de mentions ;
- mots et expressions personnalisés, avec jokers `*`.

Les actions disponibles dans la configuration sont :

- blocage du message avant sa publication ;
- message d'explication personnalisé ;
- alerte dans un salon choisi ;
- timeout automatique pour les mentions et mots personnalisés.

Les règles créées par le bot commencent par `GestionBot •`. Le bot active, désactive, modifie ou supprime uniquement ses propres règles. Une règle manuelle ou créée par un autre bot n'est jamais écrasée.

La commande rapide `/automod all` ou `+automod all` installe, met à jour et active en une seule opération :

- le filtre Discord de contenu inapproprié ;
- l'anti-spam natif ;
- l'anti-mentions avec protection contre les raids et timeout ;
- l'anti-invitations natif couvrant uniquement les liens de serveurs Discord ;
- le filtre de mots personnalisés lorsque l'option `mots_interdits` est fournie.

Sans option, le salon dans lequel la commande est exécutée reçoit les alertes, la limite est de cinq mentions et le timeout automatique dure dix minutes. `salon_alertes`, `mentions_max`, `timeout_minutes` et `mots_interdits` permettent de remplacer ces valeurs.

### Anti-invitations Discord natif

`/antilink configurer` crée une règle AutoMod Discord distincte qui détecte uniquement :

- les invitations `discord.gg` ;
- les invitations `discord.com/invite` et `discordapp.com/invite`.

Les liens ordinaires, images, vidéos et ressources Discord CDN comme `cdn.discordapp.com/emojis/...` restent autorisés. La règle bloque l'invitation, envoie une alerte et peut appliquer un timeout facultatif. Des salons ou rôles peuvent être ajoutés aux exceptions sans désactiver la protection globale. Au démarrage, le bot migre automatiquement son ancienne règle générale vers ce filtrage limité aux invitations.

### Anti-raid, blacklist et contrôle d'accès

- Seuil d'arrivées et fenêtre temporelle configurables.
- Timeout automatique des nouvelles arrivées lorsque le seuil anti-raid est dépassé.
- Bannissement automatique au retour d'un utilisateur présent dans la blacklist.
- Dossier détaillé de blacklist avec raison, modérateur et date.
- Whitelist facultative pour limiter l'utilisation des commandes.
- Le propriétaire, les responsables délégués et les administrateurs restent protégés d'un verrouillage accidentel de la whitelist.
- Les responsables supplémentaires sont gérés par le propriétaire du serveur ou par un propriétaire du bot.
- Les propriétaires supplémentaires sont facultatifs et se configurent avec `BOT_OWNER_IDS`, sans identifiant personnel inscrit dans le code. Les permissions et hiérarchies imposées par Discord restent obligatoires pour les actions de serveur.

### Journaux séparés

`/logs setup` ou `+logs setup` crée ou réutilise la catégorie privée `📋・LOGS`, crée les salons manquants et active les treize journaux en une opération.

| Type | Salon créé | Événements principaux |
| --- | --- | --- |
| Bannissements | `🔨・logs-bannissements` | bans, débans, blacklist appliquée |
| Timeouts | `🔇・logs-mutes` | ajouts et retraits de timeout |
| Expulsions | `🚪・logs-expulsions` | kicks |
| Avertissements | `⚠️・logs-warns` | création et révocation de dossiers |
| Anti-raid | `🛡️・logs-anti-raid` | arrivées, départs et déclenchements automatiques |
| Rôles | `🎭・logs-rôles` | création, suppression, modification et attribution |
| Salons | `🏠・logs-salons` | création, suppression, modification et tickets |
| Messages | `💬・logs-messages` | messages supprimés ou modifiés |
| Bots | `🤖・logs-bots` | arrivée ou départ de bots |
| Permissions | `🔐・logs-permissions` | changements importants de permissions |
| Vocaux | `🔊・logs-vocaux` | connexions, déplacements et déconnexions |
| AutoMod | `⚙️・logs-automod` | actions exécutées par les règles Discord |
| ModMail | `📨・logs-modmail` | ouvertures, réclamations, blocages, fermetures, réouvertures et configuration |

La catégorie masque les journaux à `@everyone`, autorise le bot, le propriétaire et les rôles disposant de permissions de gestion. Chaque type peut aussi être associé manuellement à un autre salon.

`/logs desactiver type:modmail` ou `+logs desactiver modmail` ouvre une confirmation puis désactive le type et supprime son salon géré avec son historique. Sans option `type`, la commande propose de supprimer les treize salons. Un salon externe associé manuellement est déconnecté de la configuration, mais jamais supprimé.

`/unlogs` ou `+unlogs` offre le même raccourci pour supprimer tous les journaux. Une fois confirmée, la commande supprime définitivement les salons de logs gérés et leur historique, vide leur configuration, puis supprime la catégorie seulement si elle ne contient plus aucun autre salon. Un salon extérieur associé manuellement n'est jamais supprimé par cette désinstallation.

### Tickets privés — configuration interactive

`/tickets configurer`, `+tickets configurer` ou simplement `+tickets` ouvre un tableau de bord avec un menu **Paramètres des tickets**, un menu **Gérer les options**, puis la sélection du choix à modifier. La configuration conserve les données existantes et ne modifie pas le ModMail. Le [guide détaillé des tickets](docs/TICKETS.md) décrit les réglages, permissions et exemples.

Le tableau de bord permet de régler :

- sélection de la catégorie de création ;
- sélection du rôle support ;
- titre, description et couleur du panneau ;
- panneau en **boutons** ou **menu déroulant**, jusqu'à 25 choix avec identifiant, label, emoji et description ;
- style des boutons : bleu, gris, vert ou rouge ;
- catégorie et rôle support différents pour chaque type de ticket ;
- ordre personnalisable des choix ;
- préfixe du nom des salons ;
- limite de tickets ouverts par utilisateur ;
- mention facultative du staff ;
- droit de fermeture accordé ou non au créateur ;
- messages d'ouverture et de fermeture personnalisables ;
- confirmation d'ouverture facultative ;
- prise en charge persistante, bouton claim facultatif et auto-claim au premier message ordinaire du support ;
- bouton de fermeture facultatif et suppression automatique facultative après archivage, avec confirmation d'activation.

Les commandes `/tickets` et `+tickets` proposent `claim`, `unclaim`, `ajouter`, `retirer`, `renommer`, `rappel`, `transcript`, `fermer`, `rouvrir`, `supprimer`, `autoclose`, `closeall`, `stars` et `noter`. Les raccourcis tels que `+claim`, `+closeall` et `+stars` sont également disponibles et documentés dans le [guide des tickets](docs/TICKETS.md).

`rappel` et `transcript` acceptent un salon de ticket facultatif avec vérification d'accès. `+tickets autoclose 2h demande résolue` programme une fermeture avec transcript et raison ; `+tickets autoclose annuler` l'annule. Les échéances et raisons sont conservées après redémarrage. `closeall` demande **Administrateur** et une confirmation avant de fermer uniquement les tickets ouverts recensés sur le serveur, sans toucher au ModMail.

La configuration demande **Gérer le serveur** ; les actions de gestion sont réservées au rôle support du ticket ou à **Gérer les salons**. Le créateur peut exporter son transcript et fermer si cette autorisation est activée. Après fermeture d'un ticket pris en charge, il peut donner une note unique de 1 à 5 étoiles par bouton en MP ou avec `/tickets noter`. `stars` affiche la moyenne réelle et, uniquement au support en réponse slash privée, les cinq derniers commentaires. Les invitations durent sept jours et les votes sont persistants.

À la fermeture, le bot récupère les messages du ticket dans l'ordre chronologique et construit un transcript texte comprenant les auteurs, dates, contenus, pièces jointes et embeds. Le transcript peut être envoyé :

- en message privé au créateur ;
- dans un salon d'archives réservé au staff ;
- aux deux destinations simultanément.

Par défaut, le salon fermé est conservé et le créateur ainsi que les participants ajoutés ne peuvent plus écrire. Le staff peut le rouvrir ou le supprimer après confirmation. Si la suppression automatique est activée, elle intervient environ 30 à 45 secondes après la fermeture, uniquement si un transcript a été livré en MP ou dans une archive privée distincte du ticket. En cas d'échec ou de transcript tronqué, le salon reste disponible. L'export porte sur les 1 000 messages les plus récents, avec un plafond de taille d'environ 7,5 Mo ; toute limite atteinte est indiquée dans le fichier.

Le bouton de publication actualise le message existant dans le même salon. Après une modification de l'apparence ou des choix, utilise **Envoyer / actualiser le panneau** pour appliquer le changement au panneau public. Les messages de contrôle des tickets déjà ouverts sont actualisés lors d'une action de prise en charge, fermeture ou réouverture, pas instantanément lors d'un changement de réglage.

### Règlement interactif

`/rules creer` publie un embed avec jusqu'à quatre actions :

- accepter le règlement et recevoir automatiquement le rôle membre ;
- refuser et ne recevoir aucun rôle ;
- relire le règlement dans une réponse privée ;
- obtenir le salon dans lequel poser une question.

Le titre, le texte, la couleur, les labels, emojis, ordre des boutons, rôle attribué et message de confirmation sont configurables.

### Rôles interactifs

Deux systèmes sont disponibles :

- `react-role` associe une réaction précise à un rôle et retire le rôle lorsque la réaction est retirée ;
- `role-bouton` publie un bouton qui ajoute ou retire le rôle au clic.

Le rôle doit être non géré, différent de `@everyone` et placé sous le rôle du bot. Les vérifications sont refaites lors de chaque interaction.

### Sécurité du serveur

`/security` crée le salon privé `🔐・sécurité`, y publie les consignes de sécurité et mémorise sa configuration.

Le module signale notamment :

- comptes plus récents que l'ancienneté minimale configurée ;
- comptes sans avatar personnalisé ;
- formulations fréquentes d'arnaques Nitro ou cadeaux ;
- raccourcisseurs de liens connus ;
- domaines internationalisés suspects ;
- faux domaines ressemblant à Discord Gift.

Une alerte est un signal destiné au staff et non une preuve automatique de malveillance. Les alertes identiques d'un même utilisateur sont limitées pour éviter le spam.

### Modmail

`/modmail all` lance une vérification en deux étapes. La commande génère un code aléatoire de six chiffres lié à l'administrateur. Aucune configuration n'est créée avant la confirmation :

```text
/modmail all
/modmail verif code:123456 serveur_id:123456789012345678
```

Le code expire après cinq minutes ou cinq essais et est supprimé avant l'installation. Il est donc impossible de l'utiliser une seconde fois. La vérification exige aussi l'identifiant du serveur destinataire : `/modmail verif code:123456 serveur_id:123456789012345678` ou `+modmail verif 123456 123456789012345678`. Le bot installe le ModMail sur le serveur correspondant à cet ID, même si la commande est exécutée depuis un autre serveur. Le bot doit être présent sur la destination et l'auteur doit y posséder la permission **Gérer le serveur**. Plusieurs codes du même administrateur peuvent attendre en même temps ; chacun reste indépendant et à usage unique. Avec `+modmail all`, le code est envoyé en message privé.

Après une vérification valide, le bot installe la configuration complète :

- catégorie privée `📨・MODMAIL` ;
- rôle `📨・Support ModMail` à attribuer aux membres du staff ;
- salon `📜・transcriptions-modmail` ;
- panel public **📨 Contacter le staff**, réutilisant `📩・contact-staff` ou créant `📨・contacter-le-staff` ;
- trois choix prêts à l'emploi avec emojis : question générale, signalement et partenariat ;
- réclamation des conversations activée ;
- fermeture automatique après 72 heures d'inactivité ;
- catégorie `📋・LOGS` et ses treize journaux, dont `📨・logs-modmail`.

Le modmail relie les messages privés d'un utilisateur à un salon privé du staff :

- destination choisie explicitement par le membre avec le bouton du serveur et mémorisée après redémarrage ;
- création automatique d'une conversation ;
- transfert bidirectionnel du texte et des pièces jointes ;
- catégories de demandes personnalisables ;
- rôles autorisés ou interdits par option ;
- réclamation d'une conversation par un membre du staff ;
- blocage et déblocage d'utilisateurs ;
- fermeture, réouverture et suppression ;
- fermeture automatique après inactivité ;
- transcription dans un salon d'archives.

Le journal ModMail ne copie pas le contenu privé des échanges. Il conserve uniquement les événements administratifs, les utilisateurs concernés, les salons et les responsables des actions.

Aucun menu de serveur n'est affiché dans les messages privés. Le membre clique d'abord sur **Contacter le staff** dans le serveur concerné, reçoit une confirmation privée indiquant le nom et l'ID du destinataire, puis écrit au bot. Sans ce choix, aucun message n'est transmis : le membre doit sélectionner un serveur puis renvoyer son message. Il n'existe plus de repli vers `GUILD_ID`, un serveur alphabétiquement prioritaire ou une ancienne conversation.

`/modmail panel salon:#contact-staff` ou `+modmail panel #contact-staff` publie ou déplace le panel dans un salon public du serveur courant (permission **Gérer le serveur**). Le panel est aussi créé lors de la configuration complète, de la configuration manuelle, de l'activation et au démarrage pour les serveurs déjà activés. Les serveurs désactivés ne sont pas activés automatiquement. Une nouvelle publication dans le même salon modifie le message existant ; un déplacement désactive l'ancien bouton sans supprimer le salon.

Une seule destination est sélectionnée par membre. Cliquer dans un autre serveur demande une confirmation valable deux minutes, réservée à ce membre. Les conversations précédentes restent enregistrées mais leurs relais sont en pause : ni les messages du membre ni les réponses du staff ne sont envoyés tant que cette conversation n'est pas sélectionnée. Le staff reçoit une indication si sa réponse n'a pas été transmise. Les MP bloqués empêchent de modifier la destination. Une fermeture efface uniquement la sélection correspondant à la conversation fermée, sans toucher à un autre serveur sélectionné.

Les menus de sujets sont liés au membre, au serveur, à la sélection active et au message exact ; ils expirent après cinq minutes et conservent au plus dix messages en attente en mémoire. Ces messages ne sont jamais transférés lors d'un changement de serveur et doivent être renvoyés après expiration ou redémarrage. Chaque envoi revérifie l'activation, le blocage, l'appartenance au serveur et l'accès au sujet. Une réponse Discord à un ancien message d'une autre conversation est refusée tant que la bonne destination n'est pas choisie.

Le code de `/modmail verif` sert uniquement à confirmer l'installation sur le serveur désigné par `serveur_id` : il ne choisit pas la destination personnelle des membres. Les destinations sont enregistrées dans `bot.modmailRoutes` de `storage/bot-data.json`, avec les identifiants du serveur et de la conversation ; aucun contenu de MP n'est enregistré dans cette table.

`/unmodmail` ou `+unmodmail` désinstalle le ModMail du serveur où la commande est exécutée après une confirmation par boutons valable deux minutes. La suppression efface les conversations, les transcriptions, le message du panel, les destinations personnelles associées à ce serveur, le journal `📨・logs-modmail`, les catégories ModMail devenues vides, le rôle automatique et toute la configuration persistante. Les autres salons de logs, le salon public du panel, les catégories encore utilisées et les rôles personnalisés sont conservés.

Le chemin rapide vérifie le sujet du salon avant de charger la configuration : un message ordinaire dans un salon non-modmail ne déclenche aucune lecture complète du stockage.

### Accueil et membres

- Message d'arrivée personnalisable avec `{user}`, `{username}`, `{server}` et `{count}`.
- Salon de départ facultatif.
- Autorôle facultatif avec contrôle de hiérarchie.
- Journalisation des arrivées, départs et bots.
- Reprise des tâches persistantes après redémarrage.

### Communauté et utilitaires

- Suggestions avec salon dédié et réactions de vote.
- Sondages de deux à quatre réponses.
- Giveaways persistants : lancement, fin, nouveau tirage, liste, pause et reprise.
- Rappels persistants avec liste et annulation.
- Réponses personnalisées enregistrées par nom.
- Pile ou face, dés configurables, choix aléatoire et boule magique.
- Avatar, informations utilisateur, serveur, bot, administrateurs, bannière et boosters.
- Statistiques générales et vocales.
- Publication de texte ou d'embed par le bot avec mentions neutralisées.
- `snipe` staff limité au dernier message supprimé du salon et à quinze minutes de mémoire.
- `/renew`, `+renew` et `/renouveler` recréent le salon choisi après une confirmation explicite, en conservant son nom, sa catégorie, ses permissions, son sujet et sa position. L'ancien salon et son historique sont ensuite supprimés.

### Salons vocaux

- Déplacement et déconnexion d'un membre.
- Salon « rejoindre pour créer » et salons vocaux temporaires supprimés lorsqu'ils deviennent vides.
- Verrouillage d'un salon vocal par son propriétaire logique.
- Liste d'utilisateurs explicitement autorisés.
- Expulsion automatique d'un utilisateur non autorisé qui tente d'entrer.

### Salons de statistiques personnalisables

`/statistiques setup` ou `+statistiques setup` installe une catégorie **📊 // Espace Statistiques** et quatre salons vocaux visibles mais non rejoignables par les membres ordinaires :

```text
📊 // Espace Statistiques
  🌍 › Membres : 430
  ⭐ › En ligne : 100
  🔊 › Vocal : 6
  🪐 › Nom du serveur
```

Ces nombres sont des exemples : le bot utilise les données du serveur où la commande est exécutée. La ligne de texte n'invente aucune invitation : remplace-la par ton vrai `.gg/code` si tu le souhaites.

**Panneau** : `/statistiques configurer` ou `+statistiques` ouvre un embed interactif personnel, valable 15 minutes. Installer/réparer, options, ajout, sélection d'un compteur, modification par formulaire, montée/descente dans la liste, pause/reprise et suppression avec confirmation sont accessibles par boutons et menus. Ouvrir le panneau ne crée aucun salon. Le panneau préfixé est visible dans le salon, mais seul son auteur peut l'utiliser ; le panneau slash est éphémère.

- Jusqu'à **20 compteurs** par serveur : `membres`, `humains`, `bots`, `enligne`, `vocal`, `boosts`, `roles`, `salons`, `role` et `texte`.
- Noms et emojis libres (1 à 100 caractères, une ligne), ordre des compteurs, nom et position de la catégorie, couleur de l'embed et fréquence d'actualisation personnalisables.
- Variables : `{compteur}` pour la valeur choisie, `{serveur}` pour le nom du serveur et `{nom_role}` pour le rôle compté. Un compteur numérique doit contenir `{compteur}`. Les noms rendus trop longs sont limités à 100 caractères.
- Visibilité publique ou réservée à un rôle choisi ; les administrateurs Discord restent capables de voir et rejoindre les salons malgré les interdictions ordinaires.
- `enligne` compte uniquement les **membres humains** dont le statut Discord est **En ligne**, **Inactif** ou **Ne pas déranger**. Tous les bots sont exclus ; les membres hors ligne ou invisibles ne sont pas comptés. L'estimation REST globale (qui mélange humains et bots) n'est jamais utilisée pour ce compteur.
- Ce compteur nécessite **Server Members Intent**, **Presence Intent** et `BOT_PRESENCE_INTENT=true` dans l'environnement. Le bot charge les membres avec leurs [présences Discord](https://docs.discord.com/developers/events/gateway-events#request-guild-members), puis utilise les mises à jour en direct. Sans intent, cache complet ou chargement initial réussi, il affiche **indisponible**, pas un faux nombre. Après déconnexion, la base de présences est rechargée ; les requêtes de chargement échouées ne sont pas répétées en boucle.
- `membres` et `humains` comptent les **humains uniquement**, hors bots, qu'ils soient connectés ou non. `/stats` et `+stats` affichent aussi les membres hors bots. Le compteur `bots` reste disponible séparément. `vocal` inclut les participants humains et bots des vocaux et stages. `roles` exclut `@everyone`. `salons` exclut catégories, threads et salons de ce système.
- Les compteurs membres/humains/bots/par rôle exigent un cache de membres complet et l'intent GuildMembers. Un chargement initial est tenté si nécessaire, sans le répéter en boucle. Sans données fiables, le nom affiche **indisponible**, pas un faux zéro ni une estimation REST mélangeant humains et bots.
- Actualisation toutes les **10 à 60 minutes**, contrôlée par une tâche interne chaque minute. Seuls les noms modifiés sont renvoyés à Discord. Un délai minimal de dix minutes entre renommages d'un même salon est conservé dans le stockage, y compris après redémarrage ; le bouton Actualiser ne contourne pas ce délai. Il s'agit d'une précaution du bot, pas d'une garantie universelle des [limites Discord](https://docs.discord.com/developers/topics/rate-limits).
- Les réglages sont enregistrés immédiatement ; un renommage peut attendre le prochain passage autorisé. La pause conserve les salons et bloque les mises à jour automatiques ; une modification explicite de visibilité reste appliquée même en pause. Les noms encore en attente seront repris à l'activation.
- `/statistiques setup` répare les salons manquants avec les ID sauvegardés, sans récupérer arbitrairement un salon qui aurait le même nom. La tâche automatique ne recrée pas un salon supprimé manuellement.
- `retirer` et `supprimer` demandent une confirmation personnelle valable 60 secondes. Seuls les salons enregistrés par le système sont supprimés ; une catégorie contenant d'autres salons est conservée. Les échecs gardent les références nécessaires pour réessayer. La suppression n'est pas récupérable automatiquement.

Exemples (les ID de compteurs sont affichés dans le panneau) :

```text
/statistiques setup
/statistiques configurer
+statistiques
+statistiques modifier membres "💜 › Membres : {compteur}" position=1
+statistiques modifier texte "🪐 › .gg/ton-code"
+statistiques ajouter boosts "🚀 › Boosts : {compteur}"
+statistiques ajouter role "🎭 › {nom_role} : {compteur}" role=@Membre
+statistiques options categorie="📊 // Les stats" intervalle=20 position=0 public=oui couleur=AA66FF
+statistiques desactiver
+statistiques activer
+statistiques retirer ID_DU_COMPTEUR
+statistiques supprimer
```

Les compteurs ajoutés reçoivent un ID propre affiché dans le panneau : utilise cet ID pour `modifier` ou `retirer`. Les quatre compteurs initiaux ont les ID `membres`, `enligne`, `vocal` et `texte`. Pour compter un rôle, sélectionne/mentionne réellement ce rôle ou fournis son ID, pas son simple nom.

Toutes les sous-commandes existent en `/` et en `+`. La configuration demande **Gérer le serveur**, avec nouveau contrôle des droits et de la liste blanche à chaque interaction. Le bot nécessite **Voir les salons**, **Gérer les salons** et **Gérer les rôles** pour définir leurs permissions. La commande historique `/stats` / `+stats` conserve son résumé instantané.

Les configurations, ID de salons et délais sont stockés par serveur dans `storage/bot-data.json`, sous `guilds[serveur].statistics`. Une seule instance du bot doit écrire ce fichier.

### Présence personnalisable

`/presence` et `+presence` permettent aux membres disposant de la permission **Gérer le serveur** de modifier immédiatement ce que Discord affiche sous le nom du bot.

- `presence afficher` montre le statut et l'activité actuellement configurés.
- `presence statut` choisit entre **En ligne**, **Inactif**, **Ne pas déranger** et **Invisible**.
- `presence activite` choisit entre **Joue à**, **Stream**, **Écoute**, **Regarde** et **Participe à**, puis définit librement le texte affiché.
- Le type **Stream** accepte une URL HTTPS Twitch ou YouTube afin que Discord reconnaisse correctement l'activité de diffusion.
- `presence effacer-activite` masque l'activité sans modifier le statut.
- `presence reinitialiser` restaure le statut en ligne et le texte défini par `BOT_ACTIVITY`.

Exemples :

```text
/presence activite type:Regarde texte:les nouveaux tickets
+presence activite regarder "les nouveaux tickets"
+presence activite stream "le live du serveur" https://www.twitch.tv/exemple
+presence statut ne_pas_deranger
```

La configuration est enregistrée dans `storage/bot-data.json` et automatiquement réappliquée à chaque redémarrage.

### Événements, niveaux et outils communautaires avancés

- `/event` et `+event` créent, listent et annulent de véritables événements programmés Discord, dans un vocal, un stage ou un lieu externe.
- `/levels` active l'XP persistante, règle les gains et le délai anti-spam, ignore des salons et attribue des rôles récompenses. `/classement` et `/profil` affichent les résultats.
- `/sondage` utilise désormais le format de sondage natif Discord avec deux à dix réponses, une durée de 1 à 768 heures et le choix multiple facultatif.
- `/annonce` envoie ou programme un embed avec couleur, image et bouton-lien. Pour `envoyer` et `programmer`, un formulaire **Paragraphe** s'ouvre afin de conserver exactement les retours à la ligne, espaces, emojis et Markdown. Avec `+annonce`, le bot affiche un bouton personnel qui ouvre le même formulaire. L'option `texte` peut préremplir ce formulaire et les annonces en attente sont restaurées au redémarrage.
- `/absence` enregistre les absences et leur date de retour.
- `/questions-anonymes` configure le salon et `/question-anonyme` publie sans révéler l'auteur. Un audit privé limité reste stocké pour pouvoir traiter les abus.
- `/suggestions traiter` ajoute les statuts acceptée, refusée, réalisée ou en étude, avec la réponse du staff et un fil de discussion facultatif.
- `/onboarding` lit, complète, active ou désactive l'Onboarding natif Discord. Le serveur doit respecter les conditions imposées par Discord.
- `/croissance setup confirmation:oui` et `+croissance setup oui` installent un programme communautaire reproductible : guide épinglé, Onboarding par jeux et centres d'intérêt, quatre invitations permanentes suivies, anti-raid, sondage du lundi, événement vocal du vendredi et rappels privés pour le staff.
- `/croissance statut`, `invitations` et `rapport` mesurent les arrivées par source, l'activité sur sept jours, la sélection de rôles comme indicateur d'Onboarding et la rétention à sept jours. `activer` et `desactiver` contrôlent uniquement le calendrier sans effacer les données.
- `/backup` conserve jusqu'à dix instantanés des rôles, salons et permissions. La restauration ne supprime rien : elle recrée seulement les éléments manquants après confirmation.

### Modules spécialisés

Cette édition publique fonctionne avec un seul bot et ne contient aucun système permettant d'héberger, lancer ou administrer d'autres bots. Elle conserve les modules utiles directement dans l'instance principale :

- `/vouch` : configuration, publication, profil et suppression des avis ;
- `/boutique` : paiements informatifs, rôles Client, vérification et salon de suggestions ;
- `/protect` : AutoMod complet, anti-mentions, anti-raid, anti-ghost-ping, anti-bot avec autorisations, temps vocal, administration XP, retrait groupé des warns, invitation et jeux légers ;
- `/crow` : informations, listes de bans/timeouts, rôles en masse confirmés, visibilité de salons, pièces jointes réversibles, anti-token, anti-@everyone, préfixe secondaire, emojis et actions vocales ;
- `/autorank` : rôle automatique à l'arrivée ou lors d'une mention du bot.

Les raccourcis utiles (`+payment`, `+setup-vouch`, `+allbots`, `+massiverole`, `+voctime`, `+level_add_xp`, `+antitoken`, `+antieveryone`, `+antiphoto`, `+autorole`, etc.) redirigent vers ces commandes modernes. Les permissions Discord, confirmations, contrôles de hiérarchie et données isolées par serveur restent appliqués.

### Rejoindre ou quitter un serveur

Discord n'autorise pas un bot à rejoindre un serveur uniquement à partir de son identifiant. `/join serveur` et `+join serveur` génèrent donc un lien OAuth2 ciblé : l'utilisateur clique sur le bouton puis autorise l'ajout dans Discord. Il faut avoir la permission **Gérer le serveur**. L'ancien raccourci `+join <ID>` reste compatible ; la syntaxe slash utilise désormais la sous-commande `serveur` pour cohabiter avec `voc`.

```text
/join serveur serveur_id:123456789012345678
+join serveur 123456789012345678
+join 123456789012345678
```

Après l'autorisation, le bot enregistre automatiquement ses 82 commandes slash dans le nouveau serveur.

### Faire rejoindre un salon vocal au bot

```text
/join voc
/join voc salon:Vocal Général
+join voc
+join voc <#IDENTIFIANT_DU_VOCAL>
```

Sans `salon`, le bot rejoint le vocal actuel de l'auteur. Avec un salon sélectionné ou son ID en préfixe, il rejoint ce salon du même serveur. Les salons vocaux classiques et les scènes sont acceptés. La commande exige **Gérer le serveur**, ainsi que **Voir le salon** et **Se connecter** pour l'auteur et pour le bot. Les compteurs statistiques ne peuvent pas être utilisés comme salons de destination.

Une seule connexion est maintenue par serveur : une commande vers le même vocal est sans effet, une autre destination déplace le bot. Le succès n'est annoncé qu'après connexion effective, avec un délai maximal de 20 secondes. Un vocal plein sans permission de dépassement, des droits manquants ou un problème réseau donnent un message d'erreur ; une tentative échouée est nettoyée.

Le bot rejoint **muet et sourd** (`selfMute: true`, `selfDeaf: true`) : il ne diffuse, n'écoute et n'enregistre aucun audio. Il n'y a pas de lecteur musical ni de fonction d'enregistrement. Le support repose sur `@discordjs/voice` 0.19.2 avec le [chiffrement vocal DAVE](https://docs.discord.com/developers/topics/voice-connections#end-to-end-encryption-dave-protocol) ; Node.js 22.12 ou supérieur est requis. Opus/FFmpeg ne sont pas nécessaires pour cette simple connexion silencieuse.

Une interruption temporaire laisse une courte fenêtre de récupération ; une déconnexion imposée par le staff n'entraîne pas de boucle de reconnexion. Pour déconnecter le bot, le staff peut utiliser la commande existante `/vocal deconnecter membre:@bot` ou les contrôles Discord. Les connexions sont fermées à l'arrêt et ne sont pas restaurées automatiquement après redémarrage : relance `/join voc` si nécessaire.

### Faire quitter un serveur au bot

`/leave` et `+leave` font réellement quitter un serveur au bot. Cette commande est réservée au propriétaire de l'application Discord et aux propriétaires supplémentaires configurés avec `BOT_OWNER_IDS` ; elle demande une confirmation avec boutons valable deux minutes.

```text
/leave serveur_id:123456789012345678
+leave 123456789012345678
```

## Panneau d'aide interactif

`/help`, `+help` et `/aide-gestion` ouvrent un panneau comprenant :

- huit catégories totalisant exactement les 82 commandes ;
- menu déroulant de catégorie ;
- bouton d'accueil ;
- affichage de toutes les commandes ;
- navigation précédent/suivant ;
- syntaxe slash et préfixée sur chaque ligne.

Le panneau est lié à son auteur. Une autre personne ne peut pas en modifier l'affichage et doit ouvrir son propre panneau.

## Répartition des commandes

| Catégorie | Nombre | Contenu |
| --- | ---: | --- |
| Modération | 17 | sanctions, dossiers, messages, salons et rôles |
| Sécurité | 9 | AutoMod, anti-invitations, anti-raid et listes |
| Configuration | 21 | accueil, logs, sauvegardes, tickets, onboarding, présence, règlement, statistiques et panneaux |
| Communauté | 12 | croissance, événements, niveaux, annonces, absences, sondages, suggestions, giveaways et rappels |
| Informations | 11 | membres, profils, serveur, bot, administration et statistiques |
| Détente et vocal | 5 | jeux rapides et gestion vocale |
| Modules spécialisés | 5 | avis, boutique, protection, outils Crow et AutoRank |
| Aide | 2 | panneaux d'aide |
| **Total** | **82** | [voir chaque commande et option](docs/COMMANDES.md) |

## Commandes slash et préfixées

Chaque commande déclarée dans le registre possède automatiquement une version `+` portant le même nom.

```text
/avertir membre:@Utilisateur raison:spam répété
+avertir @Utilisateur "spam répété"
```

Les arguments contenant des espaces doivent être placés entre guillemets avec le préfixe :

```text
+dire "Bienvenue sur le serveur"
```

Les options peuvent aussi être nommées :

```text
+timeout @Utilisateur minutes=10 raison="spam répété"
+automod configurer #logs mentions_max=5 timeout_minutes=10
```

Des alias historiques sont conservés : `+clear`, `+kick`, `+ban`, `+unban`, `+lock`, `+unlock`, `+mv`, `+say`, `+renew`, `+vc`, `+booster`, `+welcome`, `+addrole` et `+helpall`.

> Les commandes `+` nécessitent **Message Content Intent**. Sans cet intent, les commandes slash continuent de fonctionner mais Discord ne fournit pas le contenu des messages au bot.

### Texte multiligne avec /dire

Lance `/dire` : un formulaire avec un véritable champ **Paragraphe** s'ouvre désormais systématiquement. Tu peux y écrire ou coller tes paragraphes, lignes vides, espaces, emojis, listes et Markdown, y compris les blocs de code. Le bot lit ce champ avec `getTextInputValue("contenu")` et l'envoie tel quel : aucun `trim()`, découpage, remplacement des retours à la ligne ou échappement du Markdown. Les caractères littéraux `\\n` ne sont pas convertis en retours à la ligne.

Les options `salon` et `embed` restent disponibles avant l'ouverture. Si `contenu` est renseigné, sa valeur préremplit le formulaire mais le bot attend quand même sa validation : tu peux donc y remettre ou corriger les retours à la ligne avant l'envoi. Le formulaire utilise le type [Paragraph de Discord](https://docs.discord.com/developers/components/reference#text-input-text-input-styles).

La limite existante de 2 000 caractères, les permissions et la neutralisation des mentions automatiques sont conservées. Le formulaire est personnel, valable 15 minutes, à usage unique ; les accès sont revérifiés avant publication. Un formulaire ouvert avant un redémarrage doit être rouvert. La syntaxe préfixée existante `+dire "texte"` / `+say "texte"` n'est pas modifiée.

## Installation

### Prérequis

- Node.js 22.12 ou supérieur (nécessaire pour la bibliothèque vocale) ;
- une application de bot dans le portail développeur Discord ;
- un serveur Discord sur lequel tu peux inviter le bot ;
- les identifiants du bot et du serveur.

### Installation locale

```powershell
git clone https://github.com/Y3xoDev/bot-gestion-ultime.git
Set-Location bot-gestion-ultime
npm install
Copy-Item .env.example .env
```

Complète ensuite `.env` sans publier ce fichier :

```env
BOT_TOKEN=token_actuel_du_bot
GUILD_ID=identifiant_du_serveur
BOT_ACTIVITY=protège le serveur
BOT_PREFIX=+
BOT_PRIVILEGED_INTENTS=true
```

Lance le bot :

```powershell
npm start
```

Au démarrage, le bot :

1. charge l'environnement ;
2. initialise le client Discord avec les intents nécessaires ;
3. se connecte avec `BOT_TOKEN` ;
4. enregistre les 82 commandes indépendamment sur chaque serveur rejoint, même si `GUILD_ID` n'est plus accessible ;
5. démarre la maintenance et actualise les panels des serveurs où le ModMail est activé ;
6. restaure les rappels et giveaways non terminés.

## Configuration Discord

### Portées OAuth2

L'invitation doit contenir :

- `bot` ;
- `applications.commands`.

### Permissions recommandées

La permission Administrateur n'est pas obligatoire. Pour utiliser l'ensemble des modules, le bot doit pouvoir :

- voir les salons et lire leur historique ;
- envoyer des messages et intégrer des liens ;
- ajouter des réactions ;
- gérer les messages, salons et rôles ;
- modérer, expulser et bannir des membres ;
- déplacer des membres en vocal ;
- gérer le serveur et les règles AutoMod.

Le rôle du bot doit être placé au-dessus des rôles qu'il attribue et des membres qu'il modère.

### Intents privilégiés

Dans **Discord Developer Portal → Bot → Privileged Gateway Intents** :

| Intent | Nécessaire pour |
| --- | --- |
| Server Members Intent | accueil, départ, autorôle, anti-raid, blacklist au retour et informations complètes |
| Presence Intent | compteur statistiques des humains en ligne (exclusion des bots) |
| Message Content Intent | toutes les commandes `+`, analyse de sécurité et relais textuel du modmail |

Si ces intents ne sont pas activés dans le portail, utilise `BOT_PRIVILEGED_INTENTS=false` pour conserver un mode slash limité sans provoquer un échec de connexion.

Pour le compteur en ligne, active **Presence Intent** dans le portail **avant** de mettre `BOT_PRESENCE_INTENT=true`, puis redémarre le bot. L'option est désactivée par défaut dans `.env.example` afin de ne pas demander un intent non autorisé sur une nouvelle installation. `BOT_PRIVILEGED_INTENTS=false` désactive également la demande de présences.

## Variables d'environnement

| Variable | Requise | Valeur par défaut | Rôle |
| --- | --- | --- | --- |
| `BOT_TOKEN` | Oui | aucune | authentifie le compte bot ; ne doit jamais être commité |
| `GUILD_ID` | Oui | aucune | serveur sur lequel enregistrer les commandes |
| `BOT_ACTIVITY` | Non | `protège le serveur` | activité affichée dans le profil du bot |
| `BOT_PREFIX` | Non | `+` | préfixe des commandes textuelles |
| `BOT_PRIVILEGED_INTENTS` | Non | activé sauf valeur `false` | ajoute Guild Members et Message Content aux intents |
| `BOT_PRESENCE_INTENT` | Non | `false` | ajoute Guild Presences si `true` et si les intents privilégiés sont activés ; nécessite Presence Intent autorisé dans le portail |
| `BOT_OWNER_IDS` | Non | vide | identifiants des propriétaires supplémentaires, séparés par des virgules |

## Stockage

Toutes les données durables sont centralisées dans :

```text
storage/bot-data.json
```

Le fichier contient un numéro de version, la date de dernière écriture et une entrée par serveur. Il conserve notamment :

- avertissements et prochain numéro de dossier ;
- accueil, départ et autorôle ;
- catégorie et salons de logs ;
- configuration, choix, compteurs et options des tickets ;
- anti-raid et sécurité ;
- suggestions, giveaways et rappels ;
- réponses personnalisées ;
- blacklist, whitelist et responsables ;
- protections et salons vocaux temporaires ;
- règlement et reaction roles ;
- configuration et conversations modmail.

Les écritures sont sérialisées. Le bot écrit d'abord `bot-data.json.tmp`, puis remplace atomiquement le fichier principal pour réduire le risque de corruption.

Migration automatique :

- `storage/guilds.json` est déplacé vers `storage/bot-data.json` ;
- l'ancien `data/store.json` est importé s'il existe encore.

Les éléments temporaires restent volontairement en mémoire :

- caches de performances ;
- files d'envoi de logs ;
- confirmations de recréation de salon ;
- dernier message supprimé conservé pendant quinze minutes.

Ils disparaissent au redémarrage et ne contiennent pas de configuration durable.

## Architecture

```text
bot-gestion-ultime/
├── index.js
├── package.json
├── src/
│   ├── bot.js
│   ├── commands/
│   │   ├── index.js
│   │   ├── community.js
│   │   └── legacy.js
│   ├── interactions/
│   │   ├── command-router.js
│   │   └── prefix-router.js
│   ├── modules/
│   │   ├── community-tools.js
│   │   ├── discord-automod.js
│   │   ├── help.js
│   │   ├── interactive-panels.js
│   │   ├── legacy-features.js
│   │   ├── modmail.js
│   │   ├── modmail-routing.js
│   │   ├── security.js
│   │   ├── server-events.js
│   │   ├── ticket-config.js
│   │   ├── ticket-runtime.js
│   │   ├── ticket-reviews.js
│   │   └── voice-guard.js
│   └── persistence/
│       └── guild-store.js
├── scripts/
│   └── generate-command-docs.js
├── storage/
│   └── bot-data.json              # local et ignoré par Git
├── tests/
│   └── commands.test.js
└── docs/
    ├── COMMANDES.md
    └── architecture.md
```

Principes :

- `commands` décrit ce qui est enregistré auprès de Discord ;
- `interactions` analyse les entrées puis dirige vers le bon module ;
- `modules` contient la logique métier ;
- `persistence` est le seul composant autorisé à écrire les données durables ;
- `bot.js` relie les événements Discord aux modules sans contenir toute la logique.

La [documentation d'architecture](docs/architecture.md) détaille les responsabilités de chaque fichier.

## Sécurité

- `.env`, `bot-data.json` et tous les JSON de données sont ignorés par Git.
- Aucun token n'est enregistré dans les fichiers suivis par Git.
- Les mentions envoyées par `/dire` sont neutralisées par défaut.
- Les sanctions respectent les permissions et la hiérarchie Discord.
- Le bot ne modifie que les règles AutoMod qu'il a lui-même créées.
- La recréation d'un salon nécessite un bouton de confirmation lié à l'auteur.
- Les transcripts de tickets ne sont envoyés qu'aux destinations configurées.
- La whitelist ne permet jamais de contourner les permissions Discord d'une commande.
- Les self-bots, `eval`, gagnants imposés et actions destructrices de masse ont été exclus.

Un token déjà affiché dans une conversation, un ancien fichier ou une capture doit être réinitialisé dans le portail Discord, même s'il n'est pas présent sur GitHub.

## Performances et stabilité

- Les messages ordinaires évitent les lectures de stockage si le salon n'est pas un modmail ou si le contenu n'est pas suspect.
- Les journaux sont mis en file et envoyés dans l'ordre sans bloquer la réponse aux commandes.
- La configuration des journaux utilise un cache court invalidé lors d'une modification.
- Les membres, salons et commandes déjà présents dans les caches Discord sont réutilisés.
- Les pages du panneau d'aide sont pré-calculées puis réutilisées.
- Les opérations réseau longues acquittent l'interaction avant de poursuivre.
- `/logs setup` crée les salons manquants par lots de quatre pour réduire le temps d'installation tout en limitant les rafales.
- Les écritures JSON sont sérialisées pour éviter deux remplacements simultanés du fichier.

## Vérifications

```powershell
npm run check
npm test
npm audit --audit-level=high
npm run docs
```

| Script | Vérification |
| --- | --- |
| `npm run check` | syntaxe de tous les fichiers JavaScript chargés par le bot |
| `npm test` | 82 commandes uniques, sous-commandes, préfixe, présence, croissance, accès aux serveurs, panneaux, tickets, statistiques, stockage et AutoMod |
| `npm run test:statistics` | compteurs, cache incomplet, permissions, isolation, formulaires, confirmations, reprise et délais de renommage |
| `npm run test:voice` | choix du vocal, permissions, capacité, connexion silencieuse, erreurs, concurrence et nettoyage |
| `npm audit --audit-level=high` | vulnérabilités npm de gravité élevée ou critique |
| `npm run docs` | régénération de `docs/COMMANDES.md` depuis le registre réel |

## Limites connues

- Au démarrage, les commandes sont resynchronisées sur le serveur principal `GUILD_ID` et sur tous les serveurs déjà rejoints. Elles sont aussi enregistrées immédiatement dans chaque nouveau serveur ajouté avec `join`.
- Le stockage JSON est conçu pour une seule instance du bot. Plusieurs processus écrivant le même fichier ne sont pas pris en charge.
- Les messages de plus de quatorze jours ne peuvent pas être supprimés en masse par l'API Discord.
- Un MP ou transcript peut échouer si l'utilisateur bloque les messages privés du serveur.
- Les listes d'administrateurs et boosters peuvent être partielles si Server Members Intent est désactivé.
- `snipe` dépend du message reçu par le bot, expire après quinze minutes et n'est pas persistant.
- Les commandes `+` ne peuvent pas fonctionner sans Message Content Intent ; il n'existe pas de contournement sûr côté code.
- Les limites de règles AutoMod et d'exceptions sont imposées par Discord.

## Documentation

- [Catalogue exhaustif des 82 commandes](docs/COMMANDES.md)
- [Architecture technique](docs/architecture.md)
- [Conditions d’Utilisation](TERMS.md)
- [Politique de Confidentialité](PRIVACY.md)
- [Documentation officielle de l'AutoMod Discord](https://docs.discord.com/developers/resources/auto-moderation)

## Licence

Ce projet est distribué sous licence MIT. Les règles de Discord, les permissions du serveur et la sécurité du token restent sous la responsabilité de l'opérateur du bot.
