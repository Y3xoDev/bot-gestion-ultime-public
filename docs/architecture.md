# Architecture technique

Cette documentation décrit la structure actuelle du projet, le trajet d'une commande, les événements Discord, le stockage et les limites de responsabilité entre les modules.

## Objectifs

L'architecture impose les règles suivantes :

1. une seule connexion Discord et un seul token ;
2. un registre unique pour les commandes slash et préfixées ;
3. aucune logique métier dupliquée entre `/commande` et `+commande` ;
4. un seul fichier durable, écrit par un seul module ;
5. des contrôles de permissions effectués côté Discord et côté code ;
6. des modules isolés par domaine fonctionnel ;
7. des opérations réseau lentes qui n'empêchent pas l'acquittement d'une interaction.

## Arborescence

```text
bot-gestion-ultime/
├── index.js
├── package.json
├── .env.example
├── src/
│   ├── bot.js
│   ├── commands/
│   │   ├── index.js
│   │   ├── community.js
│   │   ├── legacy.js
│   │   └── statistics.js
│   ├── interactions/
│   │   ├── command-router.js
│   │   └── prefix-router.js
│   ├── modules/
│   │   ├── bot-presence.js
│   │   ├── bot-voice.js
│   │   ├── guild-access.js
│   │   ├── community-tools.js
│   │   ├── discord-automod.js
│   │   ├── help.js
│   │   ├── interactive-panels.js
│   │   ├── legacy-features.js
│   │   ├── modmail.js
│   │   ├── modmail-routing.js
│   │   ├── security.js
│   │   ├── server-events.js
│   │   ├── statistics-config.js
│   │   ├── statistics.js
│   │   ├── ticket-config.js
│   │   └── voice-guard.js
│   └── persistence/
│       └── guild-store.js
├── scripts/
│   └── generate-command-docs.js
├── storage/
│   ├── .gitkeep
│   └── bot-data.json
├── tests/
│   └── commands.test.js
└── docs/
    ├── COMMANDES.md
    └── architecture.md
```

## Responsabilités

### `index.js`

Point d'entrée minimal. Il charge `src/bot.js`. Aucun module fonctionnel ne doit créer son propre client Discord.

### `src/bot.js`

Responsable du cycle de vie :

- lecture des variables d'environnement ;
- construction des intents et partials ;
- création de l'unique instance `Client` ;
- connexion Discord ;
- enregistrement des commandes sur `GUILD_ID` ;
- présence du bot ;
- branchement des événements Discord ;
- restauration des tâches planifiées ;
- arrêt propre sur `SIGINT` ou `SIGTERM`.

Les événements sont délégués aux modules. `bot.js` ne conserve pas les règles métier de modération ou de configuration.

### `src/commands`

Ces fichiers décrivent les commandes envoyées à Discord : noms, descriptions, permissions par défaut, sous-commandes, options, types, choix et limites.

- `index.js` contient les commandes principales de gestion.
- `community.js` contient les commandes communautaires.
- `legacy.js` décrit les commandes complémentaires de gestion et de sécurité.
- `statistics.js` décrit les dix sous-commandes du système de salons statistiques.

Chaque `SlashCommandBuilder` est converti en JSON. Le tableau final `commands` est la source de vérité utilisée à la fois par Discord, le routeur préfixé, le panneau d'aide, les tests et le générateur de documentation.

### `src/interactions/command-router.js`

Route toutes les interactions :

- commandes slash ;
- boutons ;
- menus de sélection ;
- formulaires modaux ;
- interactions synthétiques créées par le préfixe.

Il fournit aussi les contrôles communs : permissions utilisateur, permissions du bot, hiérarchie des rôles, raisons d'audit et journalisation des sanctions.

### `src/interactions/prefix-router.js`

Transforme un message commençant par `BOT_PREFIX` en objet compatible avec le routeur principal.

Étapes :

1. détection du préfixe ;
2. découpage des arguments avec prise en charge des guillemets et échappements ;
3. résolution des alias historiques ;
4. recherche O(1) dans la table des commandes ;
5. résolution des mentions, salons, rôles, nombres et booléens ;
6. vérification des limites et choix ;
7. création d'une interaction synthétique ;
8. appel de `handleInteraction`.

La logique métier reste donc identique entre `/timeout` et `+timeout`.

### `src/modules/discord-automod.js`

Construit et synchronise les règles AutoMod natives. Le préfixe de nom `GestionBot •` et l'identifiant du créateur permettent de limiter les modifications aux règles appartenant réellement au bot.

### `src/modules/bot-presence.js`

Normalise, applique et présente le statut global du bot. Il traduit les valeurs françaises des commandes vers les statuts et types d'activité Discord, valide les URL de stream Twitch/YouTube et restaure la présence sauvegardée lors de `ClientReady`.

### `src/modules/statistics-config.js` et `statistics.js`

Le premier contient les valeurs par défaut, les types de compteurs et les règles de noms ; il est partagé par le stockage et le registre sans dépendance circulaire. Le second gère les salons vocaux verrouillés, les formulaires et la collecte des compteurs. Il ne crée pas de client Discord supplémentaire.

La tâche de maintenance est démarrée une seule fois par client. Elle vérifie les configurations chaque minute, respecte l'intervalle de chaque serveur, ne renomme que les valeurs changées et persiste les délais de renommage dans `guilds[id].statistics`. Un verrou par serveur protège les installations, modifications, actualisations et suppressions contre les opérations concurrentes. Les identifiants sont sauvegardés après chaque création pour permettre une reprise partielle.

`membres` et `humains` utilisent le même compte de membres dont `user.bot === false`, uniquement avec GuildMembers et un cache complet. Le résumé historique `/stats` utilise le même collecteur ; le chargement de ce collecteur y est différé pour éviter une dépendance circulaire avec les contrôles d'accès. Aucun total REST incluant les bots ne remplace les données manquantes.

Le compteur en ligne filtre exclusivement les humains (`user.bot === false`) ayant une présence `online`, `idle` ou `dnd`. Il exige GuildMembers, GuildPresences (`BOT_PRESENCE_INTENT=true`) et un chargement complet des membres avec `withPresences: true`. Le chargement initial reste distinct d'un simple cache de membres complet. Les présences sont ensuite maintenues par les événements Discord ; une déconnexion ou indisponibilité invalide la base et un nouveau chargement écarte les anciennes présences. L'estimation REST mélangeant humains et bots ne sert jamais de repli pour ce compteur. Les compteurs dépendant des membres refusent de transformer un cache incomplet en valeur exacte.

Les panneaux sont personnels et temporaires ; les confirmations destructrices sont à usage unique, liées au serveur, à l'auteur et aux ID de la configuration affichée. Une catégorie contenant des salons non gérés est conservée lors de la suppression.

### `src/modules/bot-voice.js`

`/join voc` et son équivalent préfixé utilisent `@discordjs/voice` et l'adaptateur du client Discord existant. Il n'y a pas de deuxième client ni de token vocal séparé. La commande vérifie Gérer le serveur, les permissions des deux parties, le type de salon, la capacité et l'exclusion des compteurs statistiques. La connexion est muette et sourde, sans lecteur ni réception audio.

Les tentatives sont sérialisées par serveur, réutilisent la connexion existante et attendent `VoiceConnectionStatus.Ready` avant confirmation. Un timeout, une erreur ou une déconnexion irrécupérable détruit la connexion ; l'arrêt du bot nettoie aussi les sessions. La dépendance vocale inclut DAVE et impose Node.js 22.12 minimum. L'invitation OAuth2 a été conservée sous `/join serveur`, avec compatibilité de `+join <ID>`.

### `src/modules/guild-access.js`

Génère les liens OAuth2 ciblés utilisés par `join`, contrôle les identifiants Discord et centralise la liste des propriétaires du bot. Celle-ci contient le propriétaire réel de l'application ainsi que les identifiants facultatifs configurés dans `BOT_OWNER_IDS`. Elle protège notamment `leave` par une vérification d'identité et une confirmation temporaire, contourne la whitelist interne et autorise la gestion des responsables sans contourner les permissions Discord du serveur. Lorsqu'un nouveau serveur autorise l'invitation, l'événement `GuildCreate` y enregistre automatiquement les commandes slash. Au prochain démarrage, tous les serveurs déjà rejoints sont également resynchronisés.

### `src/modules/server-events.js`

Regroupe :

- arrivée et départ de membres ;
- autorôle et anti-raid ;
- treize types de journaux, dont un journal ModMail séparé ;
- événements de rôles, salons, permissions, messages, bans et vocaux ;
- création et fermeture des tickets ;
- génération et envoi des transcripts.

Les logs utilisent une file par serveur. Une commande n'attend pas la requête réseau du salon de logs. La configuration est conservée dix secondes en cache et invalidée lors d'une modification.

La désactivation passe par une confirmation temporaire. Pour un type précis, le salon appartenant à la catégorie gérée est supprimé et un marqueur persistant empêche le retour vers l'ancien salon général. Sans type, tous les salons gérés sont désinstallés. Les salons externes associés manuellement ne sont jamais supprimés.

### `src/modules/ticket-config.js`

Construit le tableau de bord de tickets : embeds, sélecteurs de catégorie/rôle/salon, formulaires modaux, choix, ordre et options avancées. Les boutons et formulaires modifient la même section `tickets` du stockage.

### `src/modules/interactive-panels.js`

Gère le règlement interactif et les reaction roles. Il contient la normalisation des couleurs, emojis et ordre des boutons ainsi que les contrôles de hiérarchie avant attribution.

### `src/modules/community-tools.js`

Gère suggestions, giveaways, rappels, réponses personnalisées, boutons de rôles, commandes de détente et salons vocaux temporaires. Les tâches futures sont restaurées au démarrage à partir du stockage.

### `src/modules/modmail.js`

Gère les messages privés, les salons staff, le transfert bidirectionnel, les options de demande, le claim, les blocages, la maintenance d'inactivité et les transcripts. La sous-commande `all` prépare une configuration complète, mais ne la crée qu'après validation avec `verif`. La commande racine `unmodmail` utilise une confirmation temporaire avant de supprimer les ressources gérées et de réinitialiser la configuration, tout en préservant les catégories partagées et les rôles personnalisés. Les événements administratifs sont envoyés vers `📨・logs-modmail` sans recopier le contenu privé des conversations.

La validation utilise un code aléatoire de six chiffres conservé uniquement en mémoire sous forme de condensat SHA-256 lié à l'auteur. Le serveur cible n'est pas enregistré lors de la génération : c'est l'identifiant transmis à `verif` qui désigne le serveur recevant l'installation, indépendamment du serveur où la commande est exécutée. Le module vérifie que le bot est présent sur la destination et que l'auteur y possède la permission `ManageGuild`. Plusieurs codes peuvent attendre simultanément pour un même administrateur. Chaque code expire après cinq minutes ou cinq erreurs et il est consommé avant le démarrage de l'installation. Un redémarrage invalide donc automatiquement toutes les demandes en attente.

`src/modules/modmail-routing.js` gère le panel public et la destination explicite, persistée dans `bot.modmailRoutes[userId]` (`guildId`, `channelId`, `selectionId`, `selectedAt`). Un clic sur un panel valide associe le membre au serveur après vérification de ses accès et réussite du MP de confirmation. Un changement de serveur impose une confirmation temporaire liée au membre et à sa sélection précédente. Le module ne déduit jamais une destination à partir de `GUILD_ID` ou de l'ordre des serveurs. Les anciens échanges sont conservés mais leurs relais sont en pause tant qu'ils ne sont pas sélectionnés.

Les MP, réponses staff, changements de destination et choix de sujets utilisent une file d'opérations par membre. Les menus possèdent un nonce unique, l'identifiant du message et la révision de sélection ; un ancien menu ne peut pas envoyer un message vers le nouveau destinataire. Les sujets sont résolus par leur nom mémorisé, pas par leur indice dans une configuration mutable. Les messages en attente sont limités à dix et restent en mémoire cinq minutes. Les accès sont revérifiés avant le relais, y compris pour les conversations existantes. Une fermeture invalide seulement la route de la conversation concernée ; désactivation et désinstallation effacent les routes du serveur concerné.

Le code de vérification installe le ModMail dans le serveur désigné par `serveur_id` ; il ne choisit pas la destination personnelle d'un membre. Les commandes et panels des serveurs disponibles sont initialisés indépendamment : une destination `GUILD_ID` devenue inaccessible ne bloque plus les autres serveurs. Le panel est publié seulement si le ModMail y est activé, et sa publication est idempotente. Les tests `tests/modmail.test.js` utilisent des serveurs et un stockage simulés sans contacter Discord ni modifier les données réelles.

Pour éviter une lecture de configuration sur chaque message du serveur, le module ignore immédiatement tout salon dont le sujet ne commence pas par `modmail-user:`.

### `src/modules/security.js`

Gère le salon de sécurité, les signaux suspects à l'arrivée et les motifs de scam dans les messages. Les expressions régulières sont évaluées avant la lecture du stockage ; un message normal suit donc un chemin rapide.

### `src/modules/voice-guard.js`

Gère les verrous vocaux persistants, leur propriétaire logique, le motif et la liste des utilisateurs autorisés. Les états vocaux entrants sont contrôlés sans dupliquer la gestion des salons temporaires.

### `src/modules/legacy-features.js`

Contient les informations avancées, l'anti-invitations natif, la publication de messages, le snipe temporaire, la recréation confirmée de salon et les listes d'accès. Le filtre AutoMod ne cible que les invitations Discord ; une migration au démarrage remplace automatiquement l'ancienne règle qui bloquait toutes les URL.

### `src/modules/multi-bot-features.js`

Implémente les modules spécialisés accessibles depuis le bot principal : avis, configuration Boutique, protections, temps vocal, outils de gestion avancée et attribution automatique de rôles. Les configurations sont isolées par serveur, les opérations de rôles respectent les deux hiérarchies Discord, les actions de masse exigent une confirmation et les URL externes sont limitées à HTTPS sans identifiants intégrés.

### `src/modules/help.js`

Génère le panneau d'aide depuis le tableau `commands`. Les pages textuelles sont mises en cache. Les identifiants de composants contiennent l'auteur, la vue et la page afin de protéger la navigation sans stocker de session durable.

### `src/persistence/guild-store.js`

Seul module autorisé à lire ou écrire `storage/bot-data.json`.

Garanties :

- valeurs par défaut complètes pour un nouveau serveur ;
- migration des anciennes formes de données ;
- clone lors de chaque lecture afin qu'un appelant ne modifie pas le cache par accident ;
- file d'écriture sérialisée ;
- écriture dans un fichier temporaire ;
- remplacement atomique du fichier principal ;
- migration de `storage/guilds.json` et `data/store.json`.

## Trajet d'une commande slash

```text
Discord
  │ interactionCreate
  ▼
src/bot.js
  │ gestion commune des erreurs
  ▼
handleInteraction
  ├─ vérifie le type d'interaction
  ├─ vérifie serveur, whitelist et permissions
  ├─ appelle le gestionnaire de commande
  ├─ acquitte immédiatement les opérations longues
  └─ délègue au module fonctionnel
        ├─ lit/modifie bot-data.json si nécessaire
        ├─ exécute l'action Discord
        └─ place le log dans la file d'envoi
```

## Trajet d'une commande préfixée

```text
messageCreate
  ▼
handlePrefixMessage
  ├─ teste BOT_PREFIX
  ├─ tokenize et valide les arguments
  ├─ convertit mentions et types
  └─ crée une interaction synthétique
          ▼
      handleInteraction
          ▼
      même logique que la commande slash
```

## Événements Discord

| Événement | Consommateurs |
| --- | --- |
| `ClientReady` | enregistrement des commandes, présence, tâches persistantes, maintenance modmail |
| `InteractionCreate` | routeur de commandes, boutons, menus et formulaires |
| `MessageCreate` | préfixe, modmail et analyse de sécurité |
| `MessageDelete` | snipe temporaire et log messages |
| `MessageUpdate` | log des modifications |
| `GuildMemberAdd` | accueil, blacklist, anti-raid et sécurité |
| `GuildMemberRemove` | départ et logs bots/membres |
| `VoiceStateUpdate` | salons temporaires, protection vocale et logs |
| `GuildBanAdd/Remove` | logs bans et débans |
| `GuildRoleCreate/Delete/Update` | logs rôles et permissions |
| `ChannelCreate/Delete/Update` | logs salons et permissions |
| `GuildMemberUpdate` | logs rôles et timeouts |
| `MessageReactionAdd/Remove` | reaction roles |
| `AutoModerationActionExecution` | log des actions AutoMod natives |

## Modèle de stockage

Le document racine contient :

```json
{
  "version": 1,
  "updatedAt": "date ISO-8601",
  "bot": {
    "presence": {
      "status": "online",
      "activityEnabled": true,
      "activityType": "playing",
      "activityText": null,
      "streamUrl": null
    }
  },
  "guilds": {
    "identifiant_du_serveur": {
      "warnings": [],
      "welcome": {},
      "logs": {},
      "tickets": {},
      "antiRaid": {},
      "suggestions": {},
      "giveaways": [],
      "reminders": [],
      "customResponses": {},
      "blacklist": [],
      "access": {},
      "voiceProtection": {},
      "tempVoice": {},
      "rules": {},
      "reactionRoles": [],
      "security": {},
      "modmail": {}
    }
  }
}
```

Ce schéma est complété à la lecture. Une ancienne entrée dépourvue d'un nouveau champ reste donc utilisable après mise à jour du bot.

## Dépendances autorisées

```text
bot.js
  └─ interactions + modules

commands
  └─ aucune logique métier

interactions
  └─ commands + modules + persistence

modules
  └─ autres modules ciblés + persistence

persistence
  └─ Node.js fs/path uniquement
```

Un module ne doit jamais :

- créer un second client Discord ;
- lire `.env` directement pour récupérer le token ;
- écrire un autre fichier de configuration durable ;
- recopier une implémentation de commande préfixée ;
- contourner le routeur pour ignorer les permissions.

## Extension du projet

Pour ajouter une commande :

1. ajouter son `SlashCommandBuilder` dans le fichier de commandes adapté ;
2. ajouter le gestionnaire dans un module ;
3. relier le nom dans le routeur ;
4. ajouter la commande à une catégorie de `HELP_CATEGORIES` ;
5. compléter les tests ;
6. exécuter `npm run docs` ;
7. exécuter `npm run check` et `npm test`.

Le préfixe, le panneau d'aide et le catalogue Markdown prennent ensuite automatiquement la nouvelle définition en compte.

[Retour au README](../README.md)
