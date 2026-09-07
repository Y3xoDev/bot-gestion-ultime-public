# Catalogue exhaustif des commandes

> Documentation générée automatiquement depuis le registre utilisé par Discord. Elle décrit exactement la version actuelle du code.

- Nombre de commandes racines : **82**
- Interfaces : commandes slash `/` et commandes préfixées `+`
- Préfixe par défaut : `+`, modifiable avec `BOT_PREFIX`
- Serveur : les commandes sont enregistrées sur le serveur défini par `GUILD_ID`
- Arguments préfixés : les textes avec espaces doivent être placés entre guillemets
- Options préfixées nommées : `option=valeur` ou `--option valeur`

Exemples :

`/timeout membre:@Utilisateur minutes:10 raison:spam`

`+timeout @Utilisateur minutes=10 raison="spam répété"`

Les permissions indiquées sont celles définies dans Discord pour afficher la commande. Le code refait également les contrôles au moment de l'exécution, vérifie les permissions du bot et respecte la hiérarchie des rôles.

[Retour au README](../README.md)

## 🔨 Modération (17)

Sanctions, messages, salons et avertissements

### `/avertir` · `+avertir`

Ajoute un avertissement permanent au dossier d'un membre.

- Permission utilisateur : **Exclure temporairement des membres**
- Utilisable en message privé : **non**

Syntaxes : `/avertir <membre> <raison>` et `+avertir <membre> <raison>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `membre` | Utilisateur | Oui | Membre à avertir. | — |
| `raison` | Texte | Oui | Raison de l'avertissement. | au plus 500 caractères |

### `/avertissement-retirer` · `+avertissement-retirer`

Retire un avertissement avec son numéro de dossier.

- Permission utilisateur : **Exclure temporairement des membres**
- Utilisable en message privé : **non**

Syntaxes : `/avertissement-retirer <numero> [raison]` et `+avertissement-retirer <numero> [raison]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `numero` | Nombre entier | Oui | Numéro du dossier d'avertissement. | minimum 1 |
| `raison` | Texte | Non | Raison du retrait. | au plus 400 caractères |

### `/avertissements` · `+avertissements`

Affiche les avertissements actifs d'un membre.

- Permission utilisateur : **Exclure temporairement des membres**
- Utilisable en message privé : **non**

Syntaxes : `/avertissements <membre>` et `+avertissements <membre>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `membre` | Utilisateur | Oui | Membre à consulter. | — |

### `/bannir` · `+bannir`

Bannit un utilisateur du serveur.

- Permission utilisateur : **Bannir des membres**
- Utilisable en message privé : **non**

Syntaxes : `/bannir <utilisateur> [heures_messages] [raison]` et `+bannir <utilisateur> [heures_messages] [raison]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `utilisateur` | Utilisateur | Oui | Utilisateur à bannir. | — |
| `heures_messages` | Nombre entier | Non | Heures de messages à supprimer, de 0 à 168. | minimum 0 ; maximum 168 |
| `raison` | Texte | Non | Raison du bannissement. | au plus 400 caractères |

### `/debannir` · `+debannir`

Retire le bannissement d'un utilisateur avec son identifiant.

- Permission utilisateur : **Bannir des membres**
- Utilisable en message privé : **non**

Syntaxes : `/debannir <identifiant> [raison]` et `+debannir <identifiant> [raison]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `identifiant` | Texte | Oui | Identifiant numérique Discord de l'utilisateur. | au moins 17 caractères ; au plus 20 caractères |
| `raison` | Texte | Non | Raison du débannissement. | au plus 400 caractères |

### `/deverrouiller` · `+deverrouiller`

Rétablit l'autorisation d'envoi héritée de @everyone.

- Permission utilisateur : **Gérer les salons**
- Utilisable en message privé : **non**

Syntaxes : `/deverrouiller [salon]` et `+deverrouiller [salon]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Non | Salon à déverrouiller, ou le salon actuel. | types : textuel, annonces |

### `/dire` · `+dire`

Ouvre un formulaire multiligne puis envoie le texte ou l'embed sans mentions.

- Permission utilisateur : **Gérer les messages**
- Utilisable en message privé : **non**

Syntaxes : `/dire [contenu] [salon] [embed]` et `+dire [contenu] [salon] [embed]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `contenu` | Texte | Non | Préremplit le formulaire multiligne ; tu pourras encore modifier le texte. | au moins 1 caractères ; au plus 2000 caractères |
| `salon` | Salon | Non | Salon de destination, ou le salon actuel. | types : textuel, annonces |
| `embed` | Oui/non | Non | Envoie le texte dans un embed. | — |

### `/expulser` · `+expulser`

Expulse un membre du serveur.

- Permission utilisateur : **Expulser des membres**
- Utilisable en message privé : **non**

Syntaxes : `/expulser <membre> [raison]` et `+expulser <membre> [raison]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `membre` | Utilisateur | Oui | Membre à expulser. | — |
| `raison` | Texte | Non | Raison de l'expulsion. | au plus 400 caractères |

### `/purger` · `+purger`

Supprime plusieurs messages récents du salon.

- Permission utilisateur : **Gérer les messages**
- Utilisable en message privé : **non**

Syntaxes : `/purger <nombre>` et `+purger <nombre>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `nombre` | Nombre entier | Oui | Nombre de messages à supprimer, entre 1 et 100. | minimum 1 ; maximum 100 |

### `/renew` · `+renew`

Supprime et recrée un salon après une confirmation explicite.

- Permission utilisateur : **Gérer les salons**
- Utilisable en message privé : **non**

Syntaxes : `/renew [salon]` et `+renew [salon]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Non | Salon à recréer, ou le salon actuel. | types : textuel, annonces |

### `/renouveler` · `+renouveler`

Recrée un salon après une confirmation explicite.

- Permission utilisateur : **Gérer les salons**
- Utilisable en message privé : **non**

Syntaxes : `/renouveler [salon]` et `+renouveler [salon]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Non | Salon à recréer, ou le salon actuel. | types : textuel, annonces |

### `/role` · `+role`

Ajoute ou retire un rôle en respectant la hiérarchie.

- Permission utilisateur : **Gérer les rôles**
- Utilisable en message privé : **non**

Sous-commandes : **2**

#### `ajouter`

Ajoute un rôle à un membre.

Syntaxes : `/role ajouter <membre> <role>` et `+role ajouter <membre> <role>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `membre` | Utilisateur | Oui | Membre concerné. | — |
| `role` | Rôle | Oui | Rôle à ajouter. | — |

#### `retirer`

Retire un rôle à un membre.

Syntaxes : `/role retirer <membre> <role>` et `+role retirer <membre> <role>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `membre` | Utilisateur | Oui | Membre concerné. | — |
| `role` | Rôle | Oui | Rôle à retirer. | — |

### `/slowmode` · `+slowmode`

Configure le mode lent d'un salon textuel.

- Permission utilisateur : **Gérer les salons**
- Utilisable en message privé : **non**

Syntaxes : `/slowmode <secondes> [salon]` et `+slowmode <secondes> [salon]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `secondes` | Nombre entier | Oui | De 0 (désactivé) à 21600 secondes. | minimum 0 ; maximum 21600 |
| `salon` | Salon | Non | Salon concerné, ou le salon actuel. | types : textuel |

### `/snipe` · `+snipe`

Affiche le dernier message supprimé récemment dans un salon.

- Permission utilisateur : **Gérer les messages**
- Utilisable en message privé : **non**

Syntaxes : `/snipe [salon]` et `+snipe [salon]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Non | Salon à consulter, ou le salon actuel. | types : textuel, annonces |

### `/timeout` · `+timeout`

Place temporairement un membre en timeout.

- Permission utilisateur : **Exclure temporairement des membres**
- Utilisable en message privé : **non**

Syntaxes : `/timeout <membre> <minutes> [raison]` et `+timeout <membre> <minutes> [raison]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `membre` | Utilisateur | Oui | Membre concerné. | — |
| `minutes` | Nombre entier | Oui | Durée entre 1 minute et 28 jours. | minimum 1 ; maximum 40320 |
| `raison` | Texte | Non | Raison du timeout. | au plus 400 caractères |

### `/untimeout` · `+untimeout`

Retire le timeout d'un membre.

- Permission utilisateur : **Exclure temporairement des membres**
- Utilisable en message privé : **non**

Syntaxes : `/untimeout <membre> [raison]` et `+untimeout <membre> [raison]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `membre` | Utilisateur | Oui | Membre concerné. | — |
| `raison` | Texte | Non | Raison du retrait. | au plus 400 caractères |

### `/verrouiller` · `+verrouiller`

Empêche @everyone d'envoyer des messages dans un salon.

- Permission utilisateur : **Gérer les salons**
- Utilisable en message privé : **non**

Syntaxes : `/verrouiller [salon]` et `+verrouiller [salon]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Non | Salon à verrouiller, ou le salon actuel. | types : textuel, annonces |

## 🛡️ Sécurité (9)

AutoMod, anti-invitations, anti-raid et listes d'accès

### `/antilink` · `+antilink`

Bloque les invitations de serveurs avec l'AutoMod natif de Discord.

- Permission utilisateur : **Gérer le serveur**
- Utilisable en message privé : **non**

Sous-commandes : **7**

#### `configurer`

Crée ou met à jour la règle anti-invitations native.

Syntaxes : `/antilink configurer <salon_alertes> [timeout_minutes]` et `+antilink configurer <salon_alertes> [timeout_minutes]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon_alertes` | Salon | Oui | Salon recevant les alertes de liens bloqués. | types : textuel, annonces |
| `timeout_minutes` | Nombre entier | Non | Timeout appliqué, ou 0 pour bloquer sans timeout. | minimum 0 ; maximum 40320 |

#### `exception-ajouter`

Autorise un salon et/ou un rôle à publier des liens.

Syntaxes : `/antilink exception-ajouter [salon] [role]` et `+antilink exception-ajouter [salon] [role]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Non | Salon à autoriser. | types : textuel, annonces |
| `role` | Rôle | Non | Rôle à autoriser. | — |

#### `exception-retirer`

Retire un salon et/ou un rôle des exceptions.

Syntaxes : `/antilink exception-retirer [salon] [role]` et `+antilink exception-retirer [salon] [role]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Non | Salon à retirer. | types : textuel, annonces |
| `role` | Rôle | Non | Rôle à retirer. | — |

#### `statut`

Affiche l'état et les exceptions de l'anti-invitations.

Syntaxes : `/antilink statut` et `+antilink statut`

Aucune option.

#### `activer`

Active la règle anti-invitations du bot.

Syntaxes : `/antilink activer` et `+antilink activer`

Aucune option.

#### `desactiver`

Désactive la règle anti-invitations du bot.

Syntaxes : `/antilink desactiver` et `+antilink desactiver`

Aucune option.

#### `desinstaller`

Supprime la règle anti-invitations créée par le bot.

Syntaxes : `/antilink desinstaller` et `+antilink desinstaller`

Aucune option.

### `/antiraid` · `+antiraid`

Configure la protection contre les arrivées massives.

- Permission utilisateur : **Gérer le serveur**
- Utilisable en message privé : **non**

Sous-commandes : **3**

#### `configurer`

Active et règle la détection d'arrivées massives.

Syntaxes : `/antiraid configurer <arrivees_max> <secondes> <timeout_minutes>` et `+antiraid configurer <arrivees_max> <secondes> <timeout_minutes>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `arrivees_max` | Nombre entier | Oui | Nombre maximal d'arrivées dans la fenêtre. | minimum 3 ; maximum 100 |
| `secondes` | Nombre entier | Oui | Fenêtre de détection, entre 5 et 300 secondes. | minimum 5 ; maximum 300 |
| `timeout_minutes` | Nombre entier | Oui | Timeout appliqué aux nouvelles arrivées détectées. | minimum 1 ; maximum 1440 |

#### `statut`

Affiche la configuration anti-raid.

Syntaxes : `/antiraid statut` et `+antiraid statut`

Aucune option.

#### `desactiver`

Désactive la détection anti-raid.

Syntaxes : `/antiraid desactiver` et `+antiraid desactiver`

Aucune option.

### `/automod` · `+automod`

Configure le véritable AutoMod natif de Discord.

- Permission utilisateur : **Gérer le serveur**
- Utilisable en message privé : **non**

Sous-commandes : **6**

#### `all`

Installe et active toutes les protections, anti-invitations comprise.

Syntaxes : `/automod all [salon_alertes] [mots_interdits] [mentions_max] [timeout_minutes]` et `+automod all [salon_alertes] [mots_interdits] [mentions_max] [timeout_minutes]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon_alertes` | Salon | Non | Salon d'alertes, ou le salon actuel par défaut. | types : textuel, annonces |
| `mots_interdits` | Texte | Non | Mots supplémentaires séparés par des virgules. | au plus 2000 caractères |
| `mentions_max` | Nombre entier | Non | Nombre maximal de mentions (5 par défaut). | minimum 3 ; maximum 50 |
| `timeout_minutes` | Nombre entier | Non | Timeout automatique (10 minutes par défaut). | minimum 1 ; maximum 40320 |

#### `configurer`

Crée ou met à jour les règles AutoMod du bot.

Syntaxes : `/automod configurer <salon_alertes> [mots_interdits] [mentions_max] [timeout_minutes]` et `+automod configurer <salon_alertes> [mots_interdits] [mentions_max] [timeout_minutes]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon_alertes` | Salon | Oui | Salon recevant les alertes AutoMod. | types : textuel, annonces |
| `mots_interdits` | Texte | Non | Mots ou phrases séparés par des virgules. Les * sont acceptés. | au plus 2000 caractères |
| `mentions_max` | Nombre entier | Non | Nombre maximal de mentions dans un message (5 par défaut). | minimum 3 ; maximum 50 |
| `timeout_minutes` | Nombre entier | Non | Durée du timeout anti-mentions (10 minutes par défaut). | minimum 1 ; maximum 40320 |

#### `statut`

Affiche les règles AutoMod et leur état.

Syntaxes : `/automod statut` et `+automod statut`

Aucune option.

#### `activer`

Active toutes les règles créées par ce bot.

Syntaxes : `/automod activer` et `+automod activer`

Aucune option.

#### `desactiver`

Désactive toutes les règles créées par ce bot.

Syntaxes : `/automod desactiver` et `+automod desactiver`

Aucune option.

#### `desinstaller`

Supprime uniquement les règles AutoMod créées par ce bot.

Syntaxes : `/automod desinstaller` et `+automod desinstaller`

Aucune option.

### `/blacklist` · `+blacklist`

Gère la liste noire persistante du serveur.

- Permission utilisateur : **Bannir des membres**
- Utilisable en message privé : **non**

Sous-commandes : **5**

#### `ajouter`

Ajoute un utilisateur à la liste noire.

Syntaxes : `/blacklist ajouter <utilisateur> <raison>` et `+blacklist ajouter <utilisateur> <raison>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `utilisateur` | Utilisateur | Oui | Utilisateur à bloquer. | — |
| `raison` | Texte | Oui | Raison de la liste noire. | au plus 500 caractères |

#### `retirer`

Retire un identifiant de la liste noire.

Syntaxes : `/blacklist retirer <identifiant>` et `+blacklist retirer <identifiant>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `identifiant` | Texte | Oui | Identifiant Discord à retirer. | au moins 17 caractères ; au plus 20 caractères |

#### `liste`

Affiche la liste noire du serveur.

Syntaxes : `/blacklist liste` et `+blacklist liste`

Aucune option.

#### `info`

Affiche le dossier d'un utilisateur blacklisté.

Syntaxes : `/blacklist info <identifiant>` et `+blacklist info <identifiant>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `identifiant` | Texte | Oui | Identifiant Discord de l'utilisateur. | au moins 17 caractères ; au plus 20 caractères |

#### `retablir`

Retire de la liste noire et débannit cet utilisateur.

Syntaxes : `/blacklist retablir <identifiant>` et `+blacklist retablir <identifiant>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `identifiant` | Texte | Oui | Identifiant Discord à rétablir. | au moins 17 caractères ; au plus 20 caractères |

### `/listes` · `+listes`

Affiche un résumé des blacklist, whitelist et responsables du bot.

- Permission utilisateur : **Gérer le serveur**
- Utilisable en message privé : **non**

Syntaxes : `/listes` et `+listes`

Aucune option.

### `/owners` · `+owners`

Gère les responsables délégués du bot pour ce serveur.

- Permission utilisateur : **Gérer le serveur**
- Utilisable en message privé : **non**

Sous-commandes : **3**

#### `ajouter`

Ajoute un responsable délégué; seul le propriétaire du serveur peut le faire.

Syntaxes : `/owners ajouter <utilisateur>` et `+owners ajouter <utilisateur>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `utilisateur` | Utilisateur | Oui | Utilisateur à déléguer. | — |

#### `retirer`

Retire un responsable délégué.

Syntaxes : `/owners retirer <identifiant>` et `+owners retirer <identifiant>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `identifiant` | Texte | Oui | Identifiant Discord à retirer. | au moins 17 caractères ; au plus 20 caractères |

#### `liste`

Affiche les responsables délégués.

Syntaxes : `/owners liste` et `+owners liste`

Aucune option.

### `/protection-vocale` · `+protection-vocale`

Protège des salons vocaux avec une liste d'accès.

- Permission utilisateur : **Gérer les salons**
- Utilisable en message privé : **non**

Sous-commandes : **5**

#### `verrouiller`

Protège un salon vocal.

Syntaxes : `/protection-vocale verrouiller <salon> [raison]` et `+protection-vocale verrouiller <salon> [raison]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Oui | Salon vocal à protéger. | types : vocal |
| `raison` | Texte | Non | Motif affiché aux membres refusés. | au plus 500 caractères |

#### `deverrouiller`

Retire la protection d'un salon vocal.

Syntaxes : `/protection-vocale deverrouiller <salon>` et `+protection-vocale deverrouiller <salon>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Oui | Salon vocal concerné. | types : vocal |

#### `autoriser`

Autorise un membre dans un salon protégé.

Syntaxes : `/protection-vocale autoriser <salon> <membre>` et `+protection-vocale autoriser <salon> <membre>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Oui | Salon vocal concerné. | types : vocal |
| `membre` | Utilisateur | Oui | Membre à autoriser. | — |

#### `retirer`

Retire l'accès d'un membre.

Syntaxes : `/protection-vocale retirer <salon> <membre>` et `+protection-vocale retirer <salon> <membre>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Oui | Salon vocal concerné. | types : vocal |
| `membre` | Utilisateur | Oui | Membre à retirer. | — |

#### `statut`

Affiche les salons protégés ou le détail d'un salon.

Syntaxes : `/protection-vocale statut [salon]` et `+protection-vocale statut [salon]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Non | Salon vocal facultatif. | types : vocal |

### `/security` · `+security`

Crée automatiquement le salon de sécurité et ses alertes.

- Permission utilisateur : **Gérer le serveur**
- Utilisable en message privé : **non**

Syntaxes : `/security [categorie] [role_staff] [anciennete_jours]` et `+security [categorie] [role_staff] [anciennete_jours]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `categorie` | Salon | Non | Catégorie facultative du salon. | types : catégorie |
| `role_staff` | Rôle | Non | Rôle autorisé à voir les alertes. | — |
| `anciennete_jours` | Nombre entier | Non | Âge minimal d'un compte avant alerte. | minimum 1 ; maximum 365 |

### `/whitelist` · `+whitelist`

Gère la liste des utilisateurs autorisés à utiliser les commandes.

- Permission utilisateur : **Gérer le serveur**
- Utilisable en message privé : **non**

Sous-commandes : **5**

#### `ajouter`

Ajoute un utilisateur à la liste blanche.

Syntaxes : `/whitelist ajouter <utilisateur>` et `+whitelist ajouter <utilisateur>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `utilisateur` | Utilisateur | Oui | Utilisateur à autoriser. | — |

#### `retirer`

Retire un utilisateur de la liste blanche.

Syntaxes : `/whitelist retirer <identifiant>` et `+whitelist retirer <identifiant>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `identifiant` | Texte | Oui | Identifiant Discord à retirer. | au moins 17 caractères ; au plus 20 caractères |

#### `activer`

Réserve les commandes aux utilisateurs autorisés.

Syntaxes : `/whitelist activer` et `+whitelist activer`

Aucune option.

#### `desactiver`

Rend les commandes de nouveau accessibles normalement.

Syntaxes : `/whitelist desactiver` et `+whitelist desactiver`

Aucune option.

#### `liste`

Affiche la liste blanche et son état.

Syntaxes : `/whitelist liste` et `+whitelist liste`

Aucune option.

## ⚙️ Configuration (21)

Logs, accueil, tickets et panneaux interactifs

### `/accueil` · `+accueil`

Configure les arrivées, départs et l'autorôle.

- Permission utilisateur : **Gérer le serveur**
- Utilisable en message privé : **non**

Sous-commandes : **3**

#### `configurer`

Active et configure le système d'accueil.

Syntaxes : `/accueil configurer <salon_arrivees> [salon_departs] [autorole] [message]` et `+accueil configurer <salon_arrivees> [salon_departs] [autorole] [message]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon_arrivees` | Salon | Oui | Salon des messages de bienvenue. | types : textuel, annonces |
| `salon_departs` | Salon | Non | Salon facultatif des messages de départ. | types : textuel, annonces |
| `autorole` | Rôle | Non | Rôle facultatif donné aux nouveaux membres. | — |
| `message` | Texte | Non | Variables : {user}, {username}, {server}, {count}. | au plus 1500 caractères |

#### `statut`

Affiche la configuration d'accueil.

Syntaxes : `/accueil statut` et `+accueil statut`

Aucune option.

#### `desactiver`

Désactive les messages d'accueil.

Syntaxes : `/accueil desactiver` et `+accueil desactiver`

Aucune option.

### `/annonce` · `+annonce`

Envoie ou programme une annonce personnalisée.

- Permission utilisateur : **Gérer les messages**
- Utilisable en message privé : **non**

Sous-commandes : **4**

#### `envoyer`

Envoie immédiatement l'annonce.

Syntaxes : `/annonce envoyer <salon> [texte] [titre] [couleur] [image] [bouton_label] [bouton_url]` et `+annonce envoyer <salon> [texte] [titre] [couleur] [image] [bouton_label] [bouton_url]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Oui | Salon de destination. | types : textuel, annonces |
| `texte` | Texte | Non | Préremplit le formulaire multiligne facultatif. | au plus 4000 caractères |
| `titre` | Texte | Non | Titre facultatif de l'embed. | au plus 256 caractères |
| `couleur` | Texte | Non | Couleur hexadécimale, par exemple 5865F2. | au plus 7 caractères |
| `image` | Texte | Non | URL HTTPS d'une image. | au plus 500 caractères |
| `bouton_label` | Texte | Non | Texte d'un bouton-lien. | au plus 80 caractères |
| `bouton_url` | Texte | Non | URL HTTPS du bouton. | au plus 500 caractères |

#### `programmer`

Programme l'annonce pour plus tard.

Syntaxes : `/annonce programmer <salon> <minutes> [texte] [titre] [couleur] [image] [bouton_label] [bouton_url]` et `+annonce programmer <salon> <minutes> [texte] [titre] [couleur] [image] [bouton_label] [bouton_url]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Oui | Salon de destination. | types : textuel, annonces |
| `minutes` | Nombre entier | Oui | Délai avant l'envoi. | minimum 1 ; maximum 525600 |
| `texte` | Texte | Non | Préremplit le formulaire multiligne facultatif. | au plus 4000 caractères |
| `titre` | Texte | Non | Titre facultatif de l'embed. | au plus 256 caractères |
| `couleur` | Texte | Non | Couleur hexadécimale, par exemple 5865F2. | au plus 7 caractères |
| `image` | Texte | Non | URL HTTPS d'une image. | au plus 500 caractères |
| `bouton_label` | Texte | Non | Texte d'un bouton-lien. | au plus 80 caractères |
| `bouton_url` | Texte | Non | URL HTTPS du bouton. | au plus 500 caractères |

#### `liste`

Liste les annonces programmées.

Syntaxes : `/annonce liste` et `+annonce liste`

Aucune option.

#### `annuler`

Annule une annonce programmée.

Syntaxes : `/annonce annuler <numero>` et `+annonce annuler <numero>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `numero` | Nombre entier | Oui | Numéro de l'annonce. | minimum 1 |

### `/backup` · `+backup`

Sauvegarde et restaure la structure du serveur sans supprimer l'existant.

- Permission utilisateur : **Administrateur**
- Utilisable en message privé : **non**

Sous-commandes : **4**

#### `creer`

Sauvegarde les rôles, catégories, salons et permissions.

Syntaxes : `/backup creer <nom>` et `+backup creer <nom>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `nom` | Texte | Oui | Nom de la sauvegarde. | au plus 50 caractères |

#### `liste`

Liste les sauvegardes disponibles.

Syntaxes : `/backup liste` et `+backup liste`

Aucune option.

#### `restaurer`

Recrée les éléments manquants de la sauvegarde.

Syntaxes : `/backup restaurer <nom> <confirmation>` et `+backup restaurer <nom> <confirmation>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `nom` | Texte | Oui | Nom de la sauvegarde. | — |
| `confirmation` | Oui/non | Oui | Doit être réglé sur Oui. | — |

#### `supprimer`

Supprime une sauvegarde enregistrée.

Syntaxes : `/backup supprimer <nom>` et `+backup supprimer <nom>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `nom` | Texte | Oui | Nom de la sauvegarde. | — |

### `/join` · `+join`

Fait rejoindre un vocal au bot ou génère son invitation sur un serveur.

- Permission utilisateur : **Gérer le serveur**
- Utilisable en message privé : **non**

Sous-commandes : **2**

#### `voc`

Rejoint ton vocal ou un salon choisi, sans écouter ni diffuser d'audio.

Syntaxes : `/join voc [salon]` et `+join voc [salon]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Non | Salon vocal à rejoindre ; par défaut, ton vocal actuel. | types : vocal, stage |

#### `serveur`

Génère le lien Discord pour inviter le bot sur un serveur précis.

Syntaxes : `/join serveur <serveur_id>` et `+join serveur <serveur_id>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `serveur_id` | Texte | Oui | Identifiant du serveur sur lequel inviter le bot. | au moins 17 caractères ; au plus 20 caractères |

### `/leave` · `+leave`

Fait quitter au bot un serveur avec son identifiant, après confirmation.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **non**

Syntaxes : `/leave <serveur_id>` et `+leave <serveur_id>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `serveur_id` | Texte | Oui | Identifiant du serveur que le bot doit quitter. | au moins 17 caractères ; au plus 20 caractères |

### `/levels` · `+levels`

Configure le système d'XP et de niveaux du serveur.

- Permission utilisateur : **Gérer le serveur**
- Utilisable en message privé : **non**

Sous-commandes : **4**

#### `activer`

Active les gains d'XP.

Syntaxes : `/levels activer` et `+levels activer`

Aucune option.

#### `desactiver`

Désactive les gains d'XP sans effacer les niveaux.

Syntaxes : `/levels desactiver` et `+levels desactiver`

Aucune option.

#### `configurer`

Règle les gains, le délai et une récompense de niveau.

Syntaxes : `/levels configurer [xp_min] [xp_max] [cooldown] [salon_ignore] [role] [niveau]` et `+levels configurer [xp_min] [xp_max] [cooldown] [salon_ignore] [role] [niveau]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `xp_min` | Nombre entier | Non | XP minimale par message. | minimum 1 ; maximum 100 |
| `xp_max` | Nombre entier | Non | XP maximale par message. | minimum 1 ; maximum 200 |
| `cooldown` | Nombre entier | Non | Délai entre deux gains, en secondes. | minimum 10 ; maximum 3600 |
| `salon_ignore` | Salon | Non | Ajoute ou retire ce salon de la liste ignorée. | types : textuel, annonces, forum |
| `role` | Rôle | Non | Rôle récompense à enregistrer. | — |
| `niveau` | Nombre entier | Non | Niveau du rôle récompense. | minimum 1 ; maximum 1000 |

#### `statut`

Affiche la configuration des niveaux.

Syntaxes : `/levels statut` et `+levels statut`

Aucune option.

### `/logs` · `+logs`

Configure les journaux séparés du bot.

- Permission utilisateur : **Gérer le serveur**
- Utilisable en message privé : **non**

Sous-commandes : **5**

#### `installer`

Crée automatiquement la catégorie et les 13 salons de logs.

Syntaxes : `/logs installer [categorie]` et `+logs installer [categorie]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `categorie` | Salon | Non | Catégorie existante facultative. | types : catégorie |

#### `setup`

Crée la catégorie Logs, ses 13 salons et active tous les journaux.

Syntaxes : `/logs setup [categorie]` et `+logs setup [categorie]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `categorie` | Salon | Non | Catégorie existante facultative. | types : catégorie |

#### `configurer`

Associe manuellement un type de journal à un salon.

Syntaxes : `/logs configurer <type> <salon>` et `+logs configurer <type> <salon>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `type` | Texte | Oui | Type d'événements à enregistrer. | choix : `Bannissements et débannissements` = `bans`, `Mutes et timeouts` = `mutes`, `Expulsions` = `kicks`, `Avertissements` = `warns`, `Anti-raid` = `antiraid`, `Rôles` = `roles`, `Salons` = `channels`, `Messages` = `messages`, `Bots` = `bots`, `Permissions` = `permissions`, `Vocaux` = `voice`, `AutoMod` = `automod`, `ModMail` = `modmail` |
| `salon` | Salon | Oui | Salon recevant les journaux. | types : textuel, annonces |

#### `statut`

Affiche tous les salons configurés.

Syntaxes : `/logs statut` et `+logs statut`

Aucune option.

#### `desactiver`

Désactive et supprime un salon de journal ou tous les salons gérés.

Syntaxes : `/logs desactiver [type]` et `+logs desactiver [type]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `type` | Texte | Non | Laisse vide pour supprimer tous les salons de logs gérés. | choix : `Bannissements et débannissements` = `bans`, `Mutes et timeouts` = `mutes`, `Expulsions` = `kicks`, `Avertissements` = `warns`, `Anti-raid` = `antiraid`, `Rôles` = `roles`, `Salons` = `channels`, `Messages` = `messages`, `Bots` = `bots`, `Permissions` = `permissions`, `Vocaux` = `voice`, `AutoMod` = `automod`, `ModMail` = `modmail` |

### `/modmail` · `+modmail`

Configure et gère l'assistance par messages privés.

- Permission utilisateur : **Gérer le serveur**
- Utilisable en message privé : **non**

Sous-commandes : **11**

#### `panel`

Publie le bouton de contact ModMail de ce serveur.

Syntaxes : `/modmail panel <salon>` et `+modmail panel <salon>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Oui | Salon public dans lequel afficher le bouton Contacter le staff. | types : textuel, annonces |

#### `all`

Génère le code unique requis avant l'installation complète du ModMail.

Syntaxes : `/modmail all` et `+modmail all`

Aucune option.

#### `verif`

Vérifie le code et installe le ModMail sur le serveur indiqué.

Syntaxes : `/modmail verif <code> <serveur_id>` et `+modmail verif <code> <serveur_id>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `code` | Texte | Oui | Code à six chiffres donné par la commande ModMail all. | au moins 6 caractères ; au plus 6 caractères |
| `serveur_id` | Texte | Oui | Identifiant du serveur dans lequel installer le ModMail. | au moins 17 caractères ; au plus 20 caractères |

#### `configurer`

Configure et active le modmail.

Syntaxes : `/modmail configurer <categorie> <role_staff> [salon_transcriptions] [transcriptions] [reclamation] [fermeture_inactive] [heures_inactivite]` et `+modmail configurer <categorie> <role_staff> [salon_transcriptions] [transcriptions] [reclamation] [fermeture_inactive] [heures_inactivite]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `categorie` | Salon | Oui | Catégorie recevant les conversations. | types : catégorie |
| `role_staff` | Rôle | Oui | Rôle autorisé à répondre. | — |
| `salon_transcriptions` | Salon | Non | Salon recevant les transcriptions. | types : textuel, annonces |
| `transcriptions` | Oui/non | Non | Active ou désactive la création de transcriptions. | — |
| `reclamation` | Oui/non | Non | Permet au staff de réclamer une conversation. | — |
| `fermeture_inactive` | Oui/non | Non | Ferme automatiquement les conversations inactives. | — |
| `heures_inactivite` | Nombre entier | Non | Délai d'inactivité entre 1 et 720 heures. | minimum 1 ; maximum 720 |

#### `activer`

Active le modmail configuré.

Syntaxes : `/modmail activer` et `+modmail activer`

Aucune option.

#### `desactiver`

Désactive le ModMail et les relais de ce serveur.

Syntaxes : `/modmail desactiver` et `+modmail desactiver`

Aucune option.

#### `statut`

Affiche la configuration du modmail.

Syntaxes : `/modmail statut` et `+modmail statut`

Aucune option.

#### `bloquer`

Bloque un utilisateur du modmail.

Syntaxes : `/modmail bloquer <utilisateur>` et `+modmail bloquer <utilisateur>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `utilisateur` | Utilisateur | Oui | Utilisateur à bloquer. | — |

#### `debloquer`

Débloque un utilisateur du modmail.

Syntaxes : `/modmail debloquer <utilisateur>` et `+modmail debloquer <utilisateur>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `utilisateur` | Utilisateur | Oui | Utilisateur à débloquer. | — |

#### `option-ajouter`

Ajoute ou remplace un type de demande.

Syntaxes : `/modmail option-ajouter <nom> <categorie> <role_staff> [role_autorise] [role_interdit]` et `+modmail option-ajouter <nom> <categorie> <role_staff> [role_autorise] [role_interdit]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `nom` | Texte | Oui | Nom visible dans le sélecteur privé. | au moins 1 caractères ; au plus 100 caractères |
| `categorie` | Salon | Oui | Catégorie de ce type de demande. | types : catégorie |
| `role_staff` | Rôle | Oui | Rôle staff de ce type de demande. | — |
| `role_autorise` | Rôle | Non | Rôle requis pour voir cette option. | — |
| `role_interdit` | Rôle | Non | Rôle empêchant l'accès à cette option. | — |

#### `option-supprimer`

Supprime un type de demande.

Syntaxes : `/modmail option-supprimer <nom>` et `+modmail option-supprimer <nom>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `nom` | Texte | Oui | Nom exact de l'option. | — |

### `/onboarding` · `+onboarding`

Configure l'accueil natif et les choix de rôles ou salons Discord.

- Permission utilisateur : **Gérer le serveur**
- Utilisable en message privé : **non**

Sous-commandes : **4**

#### `statut`

Affiche l'état de l'Onboarding Discord.

Syntaxes : `/onboarding statut` et `+onboarding statut`

Aucune option.

#### `ajouter`

Ajoute une question et un choix à l'Onboarding.

Syntaxes : `/onboarding ajouter <question> <choix> [role] [salon] [emoji]` et `+onboarding ajouter <question> <choix> [role] [salon] [emoji]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `question` | Texte | Oui | Question présentée au nouveau membre. | au plus 100 caractères |
| `choix` | Texte | Oui | Nom du choix proposé. | au plus 100 caractères |
| `role` | Rôle | Non | Rôle donné par ce choix. | — |
| `salon` | Salon | Non | Salon ajouté par ce choix. | types : textuel, annonces, forum |
| `emoji` | Texte | Non | Emoji du choix. | au plus 100 caractères |

#### `activer`

Active l'Onboarding déjà configuré dans Discord.

Syntaxes : `/onboarding activer` et `+onboarding activer`

Aucune option.

#### `desactiver`

Désactive l'Onboarding sans effacer sa configuration.

Syntaxes : `/onboarding desactiver` et `+onboarding desactiver`

Aucune option.

### `/presence` · `+presence`

Personnalise le statut et l'activité affichés par le bot.

- Permission utilisateur : **Gérer le serveur**
- Utilisable en message privé : **non**

Sous-commandes : **5**

#### `afficher`

Affiche la présence actuellement configurée.

Syntaxes : `/presence afficher` et `+presence afficher`

Aucune option.

#### `statut`

Modifie le statut de connexion du bot.

Syntaxes : `/presence statut <valeur>` et `+presence statut <valeur>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `valeur` | Texte | Oui | Nouveau statut affiché. | choix : `En ligne` = `en_ligne`, `Inactif` = `inactif`, `Ne pas déranger` = `ne_pas_deranger`, `Invisible` = `invisible` |

#### `activite`

Modifie le type et le texte de l'activité du bot.

Syntaxes : `/presence activite <type> <texte> [url]` et `+presence activite <type> <texte> [url]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `type` | Texte | Oui | Façon dont Discord présente l'activité. | choix : `Joue à` = `jouer`, `Stream` = `stream`, `Écoute` = `ecouter`, `Regarde` = `regarder`, `Participe à` = `participer` |
| `texte` | Texte | Oui | Texte affiché après le type d'activité. | au moins 1 caractères ; au plus 128 caractères |
| `url` | Texte | Non | URL HTTPS Twitch ou YouTube, uniquement pour Stream. | au plus 512 caractères |

#### `effacer-activite`

Masque complètement l'activité du bot.

Syntaxes : `/presence effacer-activite` et `+presence effacer-activite`

Aucune option.

#### `reinitialiser`

Restaure le statut en ligne et l'activité par défaut.

Syntaxes : `/presence reinitialiser` et `+presence reinitialiser`

Aucune option.

### `/questions-anonymes` · `+questions-anonymes`

Configure le salon des questions anonymes.

- Permission utilisateur : **Gérer le serveur**
- Utilisable en message privé : **non**

Sous-commandes : **3**

#### `configurer`

Choisit le salon de réception.

Syntaxes : `/questions-anonymes configurer <salon>` et `+questions-anonymes configurer <salon>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Oui | Salon public des questions. | types : textuel, annonces |

#### `desactiver`

Désactive les questions anonymes.

Syntaxes : `/questions-anonymes desactiver` et `+questions-anonymes desactiver`

Aucune option.

#### `statut`

Affiche la configuration actuelle.

Syntaxes : `/questions-anonymes statut` et `+questions-anonymes statut`

Aucune option.

### `/react-role` · `+react-role`

Configure les rôles attribués par réaction.

- Permission utilisateur : **Gérer les rôles**
- Utilisable en message privé : **non**

Sous-commandes : **3**

#### `creer`

Publie un message de reaction role.

Syntaxes : `/react-role creer <salon> <role> <emoji> [titre] [description]` et `+react-role creer <salon> <role> <emoji> [titre] [description]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Oui | Salon du message. | types : textuel, annonces |
| `role` | Rôle | Oui | Rôle à attribuer. | — |
| `emoji` | Texte | Oui | Emoji de la réaction. | — |
| `titre` | Texte | Non | Titre du message. | au plus 100 caractères |
| `description` | Texte | Non | Description du message. | au plus 2000 caractères |

#### `supprimer`

Supprime une association reaction role.

Syntaxes : `/react-role supprimer <message_id> <emoji>` et `+react-role supprimer <message_id> <emoji>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `message_id` | Texte | Oui | Identifiant du message. | — |
| `emoji` | Texte | Oui | Emoji associé. | — |

#### `liste`

Liste les reaction roles configurés.

Syntaxes : `/react-role liste` et `+react-role liste`

Aucune option.

### `/reponses` · `+reponses`

Configure des réponses personnalisées enregistrées.

- Permission utilisateur : **Gérer le serveur**
- Utilisable en message privé : **non**

Sous-commandes : **3**

#### `ajouter`

Ajoute ou remplace une réponse.

Syntaxes : `/reponses ajouter <nom> <texte>` et `+reponses ajouter <nom> <texte>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `nom` | Texte | Oui | Nom court en minuscules. | au moins 1 caractères ; au plus 32 caractères |
| `texte` | Texte | Oui | Texte de la réponse. | au plus 1900 caractères |

#### `supprimer`

Supprime une réponse.

Syntaxes : `/reponses supprimer <nom>` et `+reponses supprimer <nom>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `nom` | Texte | Oui | Nom de la réponse. | — |

#### `liste`

Liste les réponses enregistrées.

Syntaxes : `/reponses liste` et `+reponses liste`

Aucune option.

### `/role-bouton` · `+role-bouton`

Crée un bouton permettant aux membres de prendre un rôle.

- Permission utilisateur : **Gérer les rôles**
- Utilisable en message privé : **non**

Syntaxes : `/role-bouton <salon> <role> <label> [description]` et `+role-bouton <salon> <role> <label> [description]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Oui | Salon du panneau. | types : textuel, annonces |
| `role` | Rôle | Oui | Rôle attribué par le bouton. | — |
| `label` | Texte | Oui | Texte affiché sur le bouton. | au plus 80 caractères |
| `description` | Texte | Non | Description du panneau. | au plus 1000 caractères |

### `/rules` · `+rules`

Crée et configure le règlement interactif du serveur.

- Permission utilisateur : **Gérer le serveur**
- Utilisable en message privé : **non**

Sous-commandes : **3**

#### `creer`

Publie un règlement avec des boutons personnalisables.

Syntaxes : `/rules creer <salon> <role_membre> <description> [titre] [couleur] [label_accepter] [label_refuser] [label_relire] [label_question] [emoji_accepter] [emoji_refuser] [emoji_relire] [emoji_question] [ordre] [salon_questions] [confirmation]` et `+rules creer <salon> <role_membre> <description> [titre] [couleur] [label_accepter] [label_refuser] [label_relire] [label_question] [emoji_accepter] [emoji_refuser] [emoji_relire] [emoji_question] [ordre] [salon_questions] [confirmation]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Oui | Salon du règlement. | types : textuel, annonces |
| `role_membre` | Rôle | Oui | Rôle attribué après acceptation. | — |
| `description` | Texte | Oui | Texte complet du règlement. | au plus 4000 caractères |
| `titre` | Texte | Non | Titre de l'embed. | au plus 100 caractères |
| `couleur` | Texte | Non | Couleur hexadécimale. | au plus 7 caractères |
| `label_accepter` | Texte | Non | Texte du bouton Accepter. | au plus 80 caractères |
| `label_refuser` | Texte | Non | Texte du bouton Refuser. | au plus 80 caractères |
| `label_relire` | Texte | Non | Texte du bouton Relire. | au plus 80 caractères |
| `label_question` | Texte | Non | Texte du bouton Question. | au plus 80 caractères |
| `emoji_accepter` | Texte | Non | Emoji du bouton Accepter. | au plus 100 caractères |
| `emoji_refuser` | Texte | Non | Emoji du bouton Refuser. | au plus 100 caractères |
| `emoji_relire` | Texte | Non | Emoji du bouton Relire. | au plus 100 caractères |
| `emoji_question` | Texte | Non | Emoji du bouton Question. | au plus 100 caractères |
| `ordre` | Texte | Non | accept,refuse,read,question dans l'ordre voulu. | — |
| `salon_questions` | Salon | Non | Salon vers lequel orienter les questions. | types : textuel |
| `confirmation` | Oui/non | Non | Envoie une confirmation après acceptation. | — |

#### `statut`

Affiche la configuration du règlement.

Syntaxes : `/rules statut` et `+rules statut`

Aucune option.

#### `desactiver`

Désactive les boutons du règlement.

Syntaxes : `/rules desactiver` et `+rules desactiver`

Aucune option.

### `/statistiques` · `+statistiques`

Crée et personnalise des salons vocaux de statistiques verrouillés.

- Permission utilisateur : **Gérer le serveur**
- Utilisable en message privé : **non**

Sous-commandes : **10**

#### `configurer`

Ouvre le panneau interactif de personnalisation.

Syntaxes : `/statistiques configurer` et `+statistiques configurer`

Aucune option.

#### `setup`

Installe les salons par défaut ou répare les salons manquants, sans doublons.

Syntaxes : `/statistiques setup` et `+statistiques setup`

Aucune option.

#### `actualiser`

Demande une mise à jour, dans les limites de renommage.

Syntaxes : `/statistiques actualiser` et `+statistiques actualiser`

Aucune option.

#### `activer`

Reprend les mises à jour automatiques.

Syntaxes : `/statistiques activer` et `+statistiques activer`

Aucune option.

#### `desactiver`

Met les mises à jour en pause sans supprimer les salons.

Syntaxes : `/statistiques desactiver` et `+statistiques desactiver`

Aucune option.

#### `supprimer`

Demande confirmation avant de supprimer les salons du système.

Syntaxes : `/statistiques supprimer` et `+statistiques supprimer`

Aucune option.

#### `ajouter`

Ajoute un compteur ou une ligne de texte personnalisée.

Syntaxes : `/statistiques ajouter <type> <nom> [role] [position]` et `+statistiques ajouter <type> <nom> [role] [position]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `type` | Texte | Oui | Valeur à afficher. | choix : `Membres (sans bots)` = `membres`, `Membres humains` = `humains`, `Bots` = `bots`, `Humains en ligne (sans bots)` = `enligne`, `Membres en vocal` = `vocal`, `Boosts` = `boosts`, `Rôles` = `roles`, `Salons hors statistiques` = `salons`, `Membres d'un rôle` = `role`, `Texte libre / invitation` = `texte` |
| `nom` | Texte | Oui | Nom et emojis libres ; variables : {compteur}, {serveur}, {nom_role}. | au moins 1 caractères ; au plus 100 caractères |
| `role` | Rôle | Non | Rôle compté, obligatoire pour le type role. | — |
| `position` | Nombre entier | Non | Ordre du compteur. | minimum 1 ; maximum 20 |

#### `modifier`

Change le nom, les emojis, le rôle compté ou l'ordre d'un compteur.

Syntaxes : `/statistiques modifier <id> <nom> [role] [position]` et `+statistiques modifier <id> <nom> [role] [position]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `id` | Texte | Oui | Identifiant du compteur affiché dans le panneau. | — |
| `nom` | Texte | Oui | Nom et emojis libres ; variables : {compteur}, {serveur}, {nom_role}. | au moins 1 caractères ; au plus 100 caractères |
| `role` | Rôle | Non | Nouveau rôle à compter. | — |
| `position` | Nombre entier | Non | Nouvelle position. | minimum 1 ; maximum 20 |

#### `retirer`

Demande confirmation avant de supprimer un compteur et son salon.

Syntaxes : `/statistiques retirer <id>` et `+statistiques retirer <id>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `id` | Texte | Oui | Identifiant du compteur affiché dans le panneau. | — |

#### `options`

Personnalise la catégorie, la visibilité et l'actualisation.

Syntaxes : `/statistiques options [categorie] [intervalle] [position] [visible_role] [public] [couleur]` et `+statistiques options [categorie] [intervalle] [position] [visible_role] [public] [couleur]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `categorie` | Texte | Non | Nom de la catégorie, emojis inclus. | au moins 1 caractères ; au plus 100 caractères |
| `intervalle` | Nombre entier | Non | Fréquence en minutes, entre 10 et 60. | minimum 10 ; maximum 60 |
| `position` | Nombre entier | Non | Position de la catégorie, 0 = tout en haut. | minimum 0 ; maximum 499 |
| `visible_role` | Rôle | Non | Seuls ce rôle et les administrateurs voient les statistiques. | — |
| `public` | Oui/non | Non | Oui : visible par tous, retire la restriction de rôle. | — |
| `couleur` | Texte | Non | Couleur hexadécimale du panneau, exemple : 5865F2. | au plus 7 caractères |

### `/suggestions` · `+suggestions`

Configure et traite les suggestions du serveur.

- Permission utilisateur : **Gérer le serveur**
- Utilisable en message privé : **non**

Sous-commandes : **4**

#### `configurer`

Choisit le salon des suggestions.

Syntaxes : `/suggestions configurer <salon> [discussion]` et `+suggestions configurer <salon> [discussion]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Oui | Salon recevant les suggestions. | types : textuel, annonces |
| `discussion` | Oui/non | Non | Crée un fil de discussion pour chaque suggestion. | — |

#### `statut`

Affiche la configuration actuelle.

Syntaxes : `/suggestions statut` et `+suggestions statut`

Aucune option.

#### `desactiver`

Désactive les suggestions.

Syntaxes : `/suggestions desactiver` et `+suggestions desactiver`

Aucune option.

#### `traiter`

Accepte, refuse ou marque comme réalisée une suggestion.

Syntaxes : `/suggestions traiter <message_id> <statut> [raison]` et `+suggestions traiter <message_id> <statut> [raison]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `message_id` | Texte | Oui | Identifiant du message de suggestion. | au moins 17 caractères ; au plus 20 caractères |
| `statut` | Texte | Oui | Nouveau statut. | choix : `Acceptée` = `acceptee`, `Refusée` = `refusee`, `Réalisée` = `realisee`, `En étude` = `etude` |
| `raison` | Texte | Non | Réponse du staff. | au plus 1000 caractères |

### `/tempvocal` · `+tempvocal`

Configure les salons vocaux temporaires.

- Permission utilisateur : **Gérer les salons**
- Utilisable en message privé : **non**

Sous-commandes : **3**

#### `configurer`

Configure le salon Rejoindre pour créer.

Syntaxes : `/tempvocal configurer <salon_creation> <categorie>` et `+tempvocal configurer <salon_creation> <categorie>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon_creation` | Salon | Oui | Salon vocal déclenchant la création. | types : vocal |
| `categorie` | Salon | Oui | Catégorie des salons temporaires. | types : catégorie |

#### `statut`

Affiche la configuration actuelle.

Syntaxes : `/tempvocal statut` et `+tempvocal statut`

Aucune option.

#### `desactiver`

Désactive les salons temporaires.

Syntaxes : `/tempvocal desactiver` et `+tempvocal desactiver`

Aucune option.

### `/tickets` · `+tickets`

Configure les tickets et gère les demandes privées du support.

- Permission utilisateur : **Configuration : Gérer le serveur ; gestion : rôle support du ticket ou Gérer les salons ; closeall : Administrateur ; créateur : transcript, notation et fermeture si autorisée ; stars : moyenne publique, commentaires privés pour le support**
- Utilisable en message privé : **non**

Sous-commandes : **20**

#### `claim`

Prend en charge le ticket actuel (support).

Syntaxes : `/tickets claim` et `+tickets claim`

Aucune option.

#### `unclaim`

Libère la prise en charge du ticket (support).

Syntaxes : `/tickets unclaim` et `+tickets unclaim`

Aucune option.

#### `ajouter`

Ajoute des membres ou rôles au ticket (support).

Syntaxes : `/tickets ajouter <cibles>` et `+tickets ajouter <cibles>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `cibles` | Texte | Oui | Mentions ou IDs séparés par des espaces, 10 maximum. | au plus 1000 caractères |

#### `retirer`

Retire des participants ajoutés au ticket (support).

Syntaxes : `/tickets retirer <cibles>` et `+tickets retirer <cibles>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `cibles` | Texte | Oui | Mentions ou IDs des participants à retirer. | au plus 1000 caractères |

#### `renommer`

Renomme le ticket actuel (support).

Syntaxes : `/tickets renommer <nom>` et `+tickets renommer <nom>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `nom` | Texte | Oui | Nouveau nom du salon. | au moins 1 caractères ; au plus 90 caractères |

#### `rappel`

Rappelle au créateur que le support attend sa réponse.

Syntaxes : `/tickets rappel [salon]` et `+tickets rappel [salon]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Non | Ticket concerné, sinon le salon actuel. | types : textuel |

#### `transcript`

Exporte un ticket en MP (créateur ou support).

Syntaxes : `/tickets transcript [salon]` et `+tickets transcript [salon]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Non | Ticket à exporter, sinon le salon actuel. | types : textuel |

#### `fermer`

Ferme le ticket et envoie les transcripts configurés.

Syntaxes : `/tickets fermer` et `+tickets fermer`

Aucune option.

#### `rouvrir`

Rouvre un ticket fermé et annule sa suppression (support).

Syntaxes : `/tickets rouvrir` et `+tickets rouvrir`

Aucune option.

#### `supprimer`

Supprime un ticket fermé après confirmation (support).

Syntaxes : `/tickets supprimer` et `+tickets supprimer`

Aucune option.

#### `autoclose`

Programme une fermeture persistante avec transcript (support).

Syntaxes : `/tickets autoclose <duree> [raison]` et `+tickets autoclose <duree> [raison]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `duree` | Texte | Oui | De 10s à 30d : 30m, 2h, 7d ; annuler pour désactiver. | au plus 20 caractères |
| `raison` | Texte | Non | Raison affichée à la fermeture automatique. | au plus 500 caractères |

#### `closeall`

Ferme tous les tickets ouverts après confirmation (administrateur).

Syntaxes : `/tickets closeall [raison]` et `+tickets closeall [raison]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `raison` | Texte | Non | Raison de la fermeture globale. | au plus 500 caractères |

#### `stars`

Affiche la moyenne et les avis de tickets reçus par un membre du support.

Syntaxes : `/tickets stars [utilisateur]` et `+tickets stars [utilisateur]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `utilisateur` | Utilisateur | Non | Membre du support, sinon toi-même. | — |

#### `noter`

Note la prise en charge de ton ticket fermé, une seule fois.

Syntaxes : `/tickets noter <note> [commentaire]` et `+tickets noter <note> [commentaire]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `note` | Nombre entier | Oui | Note de 1 à 5 étoiles. | minimum 1 ; maximum 5 |
| `commentaire` | Texte | Non | Avis facultatif réservé au support, sans informations sensibles. | au plus 500 caractères |

#### `configurer`

Ouvre l'embed interactif de configuration des tickets.

Syntaxes : `/tickets configurer [categorie] [role_support] [titre] [description] [couleur] [confirmation]` et `+tickets configurer [categorie] [role_support] [titre] [description] [couleur] [confirmation]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `categorie` | Salon | Non | Catégorie dans laquelle créer les tickets. | types : catégorie |
| `role_support` | Rôle | Non | Rôle ayant accès aux tickets. | — |
| `titre` | Texte | Non | Titre du panneau. | au plus 100 caractères |
| `description` | Texte | Non | Description du panneau. | au plus 2000 caractères |
| `couleur` | Texte | Non | Couleur hexadécimale, par exemple 5865F2. | au plus 7 caractères |
| `confirmation` | Oui/non | Non | Confirme la création du ticket à l'utilisateur. | — |

#### `choix-ajouter`

Ajoute ou modifie un bouton du panneau de tickets.

Syntaxes : `/tickets choix-ajouter <identifiant> <label> [categorie] [role_support] [emoji] [description] [ordre]` et `+tickets choix-ajouter <identifiant> <label> [categorie] [role_support] [emoji] [description] [ordre]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `identifiant` | Texte | Oui | Identifiant court sans espace, par exemple achat. | au moins 1 caractères ; au plus 25 caractères |
| `label` | Texte | Oui | Texte du bouton. | au plus 80 caractères |
| `categorie` | Salon | Non | Catégorie particulière pour ce choix. | types : catégorie |
| `role_support` | Rôle | Non | Rôle support particulier. | — |
| `emoji` | Texte | Non | Emoji du bouton. | au plus 100 caractères |
| `description` | Texte | Non | Texte affiché dans le ticket. | au plus 1000 caractères |
| `ordre` | Nombre entier | Non | Position du bouton. | minimum 1 ; maximum 25 |

#### `choix-supprimer`

Supprime un choix du panneau.

Syntaxes : `/tickets choix-supprimer <identifiant>` et `+tickets choix-supprimer <identifiant>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `identifiant` | Texte | Oui | Identifiant du choix. | — |

#### `ordre`

Définit l'ordre des boutons avec leurs identifiants.

Syntaxes : `/tickets ordre <identifiants>` et `+tickets ordre <identifiants>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `identifiants` | Texte | Oui | Identifiants séparés par des virgules. | — |

#### `panneau`

Publie le bouton d'ouverture des tickets.

Syntaxes : `/tickets panneau <salon>` et `+tickets panneau <salon>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Oui | Salon dans lequel publier le panneau. | types : textuel, annonces |

#### `statut`

Affiche la configuration des tickets.

Syntaxes : `/tickets statut` et `+tickets statut`

Aucune option.

### `/unlogs` · `+unlogs`

Supprime les salons de logs gérés après confirmation.

- Permission utilisateur : **Gérer les salons**
- Utilisable en message privé : **non**

Syntaxes : `/unlogs` et `+unlogs`

Aucune option.

### `/unmodmail` · `+unmodmail`

Supprime entièrement le système ModMail de ce serveur.

- Permission utilisateur : **Gérer le serveur**
- Utilisable en message privé : **non**

Syntaxes : `/unmodmail` et `+unmodmail`

Aucune option.

## 🎉 Communauté (12)

Sondages, suggestions, giveaways et rappels

### `/absence` · `+absence`

Déclare et consulte les absences des membres.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **non**

Sous-commandes : **3**

#### `declarer`

Déclare ton absence.

Syntaxes : `/absence declarer <retour> [raison]` et `+absence declarer <retour> [raison]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `retour` | Texte | Oui | Date de retour : AAAA-MM-JJ. | au moins 10 caractères ; au plus 10 caractères |
| `raison` | Texte | Non | Raison facultative. | au plus 500 caractères |

#### `liste`

Affiche les absences en cours.

Syntaxes : `/absence liste` et `+absence liste`

Aucune option.

#### `terminer`

Termine ton absence ou celle d'un membre si tu gères le serveur.

Syntaxes : `/absence terminer [membre]` et `+absence terminer [membre]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `membre` | Utilisateur | Non | Membre concerné, sinon toi-même. | — |

### `/classement` · `+classement`

Affiche le classement XP du serveur.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **non**

Syntaxes : `/classement [page]` et `+classement [page]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `page` | Nombre entier | Non | Page du classement. | minimum 1 ; maximum 100 |

### `/croissance` · `+croissance`

Configure et mesure le programme de croissance communautaire.

- Permission utilisateur : **Gérer le serveur**
- Utilisable en message privé : **non**

Sous-commandes : **6**

#### `setup`

Configure l'accueil, les invitations et le calendrier de croissance.

Syntaxes : `/croissance setup <confirmation>` et `+croissance setup <confirmation>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `confirmation` | Oui/non | Oui | Confirme la modification de l'Onboarding et la création des messages. | — |

#### `statut`

Affiche la configuration et les indicateurs actuels.

Syntaxes : `/croissance statut` et `+croissance statut`

Aucune option.

#### `invitations`

Affiche les invitations suivies par source.

Syntaxes : `/croissance invitations` et `+croissance invitations`

Aucune option.

#### `rapport`

Génère immédiatement le rapport de croissance.

Syntaxes : `/croissance rapport` et `+croissance rapport`

Aucune option.

#### `activer`

Réactive les publications hebdomadaires.

Syntaxes : `/croissance activer` et `+croissance activer`

Aucune option.

#### `desactiver`

Suspend le calendrier sans effacer les données.

Syntaxes : `/croissance desactiver` et `+croissance desactiver`

Aucune option.

### `/event` · `+event`

Crée et gère les événements programmés natifs de Discord.

- Permission utilisateur : **Bitfield `8589934592`**
- Utilisable en message privé : **non**

Sous-commandes : **3**

#### `creer`

Crée un événement vocal, stage ou externe.

Syntaxes : `/event creer <nom> <date> <type> [salon] [lieu] [duree_minutes] [description]` et `+event creer <nom> <date> <type> [salon] [lieu] [duree_minutes] [description]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `nom` | Texte | Oui | Nom de l'événement. | au plus 100 caractères |
| `date` | Texte | Oui | Date locale : AAAA-MM-JJ HH:mm. | au moins 16 caractères ; au plus 32 caractères |
| `type` | Texte | Oui | Type d'événement. | choix : `Salon vocal` = `vocal`, `Stage` = `stage`, `Lieu externe` = `externe` |
| `salon` | Salon | Non | Salon vocal ou stage concerné. | types : vocal, stage |
| `lieu` | Texte | Non | Lieu affiché pour un événement externe. | au plus 100 caractères |
| `duree_minutes` | Nombre entier | Non | Durée, 120 minutes par défaut. | minimum 15 ; maximum 10080 |
| `description` | Texte | Non | Description de l'événement. | au plus 1000 caractères |

#### `liste`

Affiche les prochains événements du serveur.

Syntaxes : `/event liste` et `+event liste`

Aucune option.

#### `annuler`

Supprime un événement programmé.

Syntaxes : `/event annuler <event_id>` et `+event annuler <event_id>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `event_id` | Texte | Oui | Identifiant de l'événement. | au moins 17 caractères ; au plus 20 caractères |

### `/giveaway` · `+giveaway`

Crée et gère des giveaways persistants.

- Permission utilisateur : **Gérer le serveur**
- Utilisable en message privé : **non**

Sous-commandes : **6**

#### `lancer`

Lance un nouveau giveaway.

Syntaxes : `/giveaway lancer <salon> <duree_minutes> <gagnants> <prix> [titre] [description]` et `+giveaway lancer <salon> <duree_minutes> <gagnants> <prix> [titre] [description]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Oui | Salon du giveaway. | types : textuel, annonces |
| `duree_minutes` | Nombre entier | Oui | Durée entre 1 minute et 7 jours. | minimum 1 ; maximum 10080 |
| `gagnants` | Nombre entier | Oui | Nombre de gagnants, entre 1 et 20. | minimum 1 ; maximum 20 |
| `prix` | Texte | Oui | Prix du giveaway. | au plus 500 caractères |
| `titre` | Texte | Non | Titre personnalisé du giveaway. | au plus 256 caractères |
| `description` | Texte | Non | Description personnalisée du giveaway. | au plus 2000 caractères |

#### `terminer`

Termine immédiatement un giveaway.

Syntaxes : `/giveaway terminer <message_id>` et `+giveaway terminer <message_id>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `message_id` | Texte | Oui | Identifiant du message du giveaway. | au moins 17 caractères ; au plus 20 caractères |

#### `relancer`

Choisit de nouveaux gagnants pour un giveaway terminé.

Syntaxes : `/giveaway relancer <message_id>` et `+giveaway relancer <message_id>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `message_id` | Texte | Oui | Identifiant du message du giveaway. | au moins 17 caractères ; au plus 20 caractères |

#### `liste`

Affiche les giveaways actifs du serveur.

Syntaxes : `/giveaway liste` et `+giveaway liste`

Aucune option.

#### `pause`

Met un giveaway actif en pause.

Syntaxes : `/giveaway pause <message_id>` et `+giveaway pause <message_id>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `message_id` | Texte | Oui | Identifiant du message du giveaway. | au moins 17 caractères ; au plus 20 caractères |

#### `reprendre`

Reprend un giveaway en pause.

Syntaxes : `/giveaway reprendre <message_id>` et `+giveaway reprendre <message_id>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `message_id` | Texte | Oui | Identifiant du message du giveaway. | au moins 17 caractères ; au plus 20 caractères |

### `/question-anonyme` · `+question-anonyme`

Envoie une question sans afficher ton identité publiquement.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **non**

Syntaxes : `/question-anonyme <texte>` et `+question-anonyme <texte>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `texte` | Texte | Oui | Question à envoyer. | au moins 3 caractères ; au plus 1500 caractères |

### `/rappel` · `+rappel`

Programme un rappel personnel dans le salon.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **non**

Syntaxes : `/rappel <minutes> <texte>` et `+rappel <minutes> <texte>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `minutes` | Nombre entier | Oui | Délai entre 1 minute et 7 jours. | minimum 1 ; maximum 10080 |
| `texte` | Texte | Oui | Texte du rappel. | au plus 1000 caractères |

### `/rappel-annuler` · `+rappel-annuler`

Annule l'un de tes rappels.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **non**

Syntaxes : `/rappel-annuler <numero>` et `+rappel-annuler <numero>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `numero` | Nombre entier | Oui | Numéro du rappel. | minimum 1 |

### `/rappels` · `+rappels`

Affiche tes rappels en attente.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **non**

Syntaxes : `/rappels` et `+rappels`

Aucune option.

### `/reponse` · `+reponse`

Affiche une réponse personnalisée enregistrée.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **non**

Syntaxes : `/reponse <nom>` et `+reponse <nom>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `nom` | Texte | Oui | Nom de la réponse. | — |

### `/sondage` · `+sondage`

Crée un sondage natif Discord avec durée et choix multiples.

- Permission utilisateur : **Gérer les messages**
- Utilisable en message privé : **non**

Syntaxes : `/sondage <question> <choix_1> <choix_2> [choix_3] [choix_4] [choix_5] [choix_6] [choix_7] [choix_8] [choix_9] [choix_10] [duree_heures] [choix_multiples]` et `+sondage <question> <choix_1> <choix_2> [choix_3] [choix_4] [choix_5] [choix_6] [choix_7] [choix_8] [choix_9] [choix_10] [duree_heures] [choix_multiples]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `question` | Texte | Oui | Question du sondage. | au plus 300 caractères |
| `choix_1` | Texte | Oui | Premier choix. | au plus 55 caractères |
| `choix_2` | Texte | Oui | Deuxième choix. | au plus 55 caractères |
| `choix_3` | Texte | Non | Troisième choix. | au plus 55 caractères |
| `choix_4` | Texte | Non | Quatrième choix. | au plus 55 caractères |
| `choix_5` | Texte | Non | Cinquième choix. | au plus 55 caractères |
| `choix_6` | Texte | Non | Sixième choix. | au plus 55 caractères |
| `choix_7` | Texte | Non | Septième choix. | au plus 55 caractères |
| `choix_8` | Texte | Non | Huitième choix. | au plus 55 caractères |
| `choix_9` | Texte | Non | Neuvième choix. | au plus 55 caractères |
| `choix_10` | Texte | Non | Dixième choix. | au plus 55 caractères |
| `duree_heures` | Nombre entier | Non | Durée du sondage, 24 heures par défaut. | minimum 1 ; maximum 768 |
| `choix_multiples` | Oui/non | Non | Autorise plusieurs réponses par membre. | — |

### `/suggerer` · `+suggerer`

Envoie une suggestion dans le salon configuré.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **non**

Syntaxes : `/suggerer <texte>` et `+suggerer <texte>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `texte` | Texte | Oui | Contenu de ta suggestion. | au moins 3 caractères ; au plus 2000 caractères |

## ℹ️ Informations (11)

Serveur, membres, bot, administration et statistiques

### `/admin` · `+admin`

Affiche le propriétaire, les administrateurs visibles et les rôles admin.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **non**

Syntaxes : `/admin` et `+admin`

Aucune option.

### `/avatar` · `+avatar`

Affiche l'avatar d'un utilisateur.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **non**

Syntaxes : `/avatar [utilisateur]` et `+avatar [utilisateur]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `utilisateur` | Utilisateur | Non | Utilisateur concerné, ou toi par défaut. | — |

### `/banner` · `+banner`

Affiche la bannière du serveur.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **non**

Syntaxes : `/banner` et `+banner`

Aucune option.

### `/boosters` · `+boosters`

Affiche le niveau de boost et les boosters visibles du serveur.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **non**

Syntaxes : `/boosters` et `+boosters`

Aucune option.

### `/botinfo` · `+botinfo`

Affiche les informations techniques et statistiques du bot.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **non**

Syntaxes : `/botinfo` et `+botinfo`

Aucune option.

### `/ownerbot` · `+ownerbot`

Affiche le propriétaire de l'application et les propriétaires ajoutés.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **non**

Syntaxes : `/ownerbot` et `+ownerbot`

Aucune option.

### `/ping` · `+ping`

Affiche la latence du bot.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **oui**

Syntaxes : `/ping` et `+ping`

Aucune option.

### `/profil` · `+profil`

Affiche le profil communautaire, le niveau et les rôles d'un membre.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **non**

Syntaxes : `/profil [membre]` et `+profil [membre]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `membre` | Utilisateur | Non | Membre concerné, sinon toi-même. | — |

### `/serverinfo` · `+serverinfo`

Affiche les informations principales du serveur.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **non**

Syntaxes : `/serverinfo` et `+serverinfo`

Aucune option.

### `/stats` · `+stats`

Affiche les statistiques générales et vocales du serveur.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **non**

Syntaxes : `/stats` et `+stats`

Aucune option.

### `/userinfo` · `+userinfo`

Affiche des informations publiques sur un membre.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **non**

Syntaxes : `/userinfo [membre]` et `+userinfo [membre]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `membre` | Utilisateur | Non | Membre à consulter, ou toi par défaut. | — |

## 🎲 Détente et vocal (5)

Jeux rapides, choix aléatoires et gestion vocale

### `/choisir` · `+choisir`

Choisit au hasard parmi plusieurs possibilités.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **oui**

Syntaxes : `/choisir <options>` et `+choisir <options>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `options` | Texte | Oui | Sépare les choix avec \|. | au plus 1000 caractères |

### `/de` · `+de`

Lance un dé.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **oui**

Syntaxes : `/de [faces]` et `+de [faces]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `faces` | Nombre entier | Non | Nombre de faces, entre 2 et 100. | minimum 2 ; maximum 100 |

### `/huitball` · `+huitball`

Répond au hasard à une question.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **oui**

Syntaxes : `/huitball <question>` et `+huitball <question>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `question` | Texte | Oui | Ta question. | au plus 500 caractères |

### `/pile-ou-face` · `+pile-ou-face`

Lance une pièce.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **oui**

Syntaxes : `/pile-ou-face` et `+pile-ou-face`

Aucune option.

### `/vocal` · `+vocal`

Gère individuellement un membre dans un salon vocal.

- Permission utilisateur : **Déplacer des membres**
- Utilisable en message privé : **non**

Sous-commandes : **2**

#### `deplacer`

Déplace un membre vers un autre salon vocal.

Syntaxes : `/vocal deplacer <membre> <salon>` et `+vocal deplacer <membre> <salon>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `membre` | Utilisateur | Oui | Membre à déplacer. | — |
| `salon` | Salon | Oui | Salon vocal de destination. | types : vocal, stage |

#### `deconnecter`

Déconnecte un membre de son salon vocal.

Syntaxes : `/vocal deconnecter <membre>` et `+vocal deconnecter <membre>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `membre` | Utilisateur | Oui | Membre à déconnecter. | — |

## 🤖 Modules spécialisés (5)

Avis, boutique, protections, gestion avancée et rôles automatiques

### `/autorank` · `+autorank`

Configure l'attribution automatique de rôles.

- Permission utilisateur : **Gérer les rôles**
- Utilisable en message privé : **non**

Sous-commandes : **3**

#### `configurer`

Configure le rôle à l'arrivée et/ou à la mention du bot.

Syntaxes : `/autorank configurer [role_arrivee] [role_mention]` et `+autorank configurer [role_arrivee] [role_mention]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `role_arrivee` | Rôle | Non | Rôle donné aux nouveaux membres. | — |
| `role_mention` | Rôle | Non | Rôle donné lorsqu'un membre mentionne le bot. | — |

#### `statut`

Affiche les rôles automatiques configurés.

Syntaxes : `/autorank statut` et `+autorank statut`

Aucune option.

#### `desactiver`

Désactive tous les rôles automatiques.

Syntaxes : `/autorank desactiver` et `+autorank desactiver`

Aucune option.

### `/boutique` · `+boutique`

Gère les informations de paiement, clients et vérifications.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **non**

Sous-commandes : **8**

#### `paiement`

Affiche les moyens de paiement configurés.

Syntaxes : `/boutique paiement` et `+boutique paiement`

Aucune option.

#### `paiement-configurer`

Enregistre le texte des moyens de paiement.

Syntaxes : `/boutique paiement-configurer <texte>` et `+boutique paiement-configurer <texte>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `texte` | Texte | Oui | Texte et liens de paiement. | au plus 1500 caractères |

#### `client-configurer`

Choisit le rôle attribué aux clients.

Syntaxes : `/boutique client-configurer <role>` et `+boutique client-configurer <role>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `role` | Rôle | Oui | Rôle Client. | — |

#### `client`

Attribue le rôle Client configuré.

Syntaxes : `/boutique client <membre>` et `+boutique client <membre>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `membre` | Utilisateur | Oui | Client concerné. | — |

#### `verification-configurer`

Configure le salon et le rôle de vérification.

Syntaxes : `/boutique verification-configurer <salon> <role>` et `+boutique verification-configurer <salon> <role>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Oui | Salon dans lequel /boutique verifier sera autorisé. | types : textuel |
| `role` | Rôle | Oui | Rôle donné après vérification. | — |

#### `verifier`

Reçoit le rôle de vérification configuré.

Syntaxes : `/boutique verifier` et `+boutique verifier`

Aucune option.

#### `suggestion-configurer`

Choisit le salon utilisé par /suggerer.

Syntaxes : `/boutique suggestion-configurer <salon>` et `+boutique suggestion-configurer <salon>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Oui | Salon des suggestions. | types : textuel, annonces |

#### `statut`

Affiche la configuration de la boutique.

Syntaxes : `/boutique statut` et `+boutique statut`

Aucune option.

### `/crow` · `+crow`

Regroupe les outils avancés de gestion du serveur.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **non**

Sous-commandes : **16**

#### `roleinfo`

Affiche les informations et membres d'un rôle.

Syntaxes : `/crow roleinfo <role>` et `+crow roleinfo <role>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `role` | Rôle | Oui | Rôle à examiner. | — |

#### `saloninfo`

Affiche les informations d'un salon.

Syntaxes : `/crow saloninfo [salon]` et `+crow saloninfo [salon]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Non | Salon à examiner. | — |

#### `listes`

Liste les administrateurs, bots ou membres d'un rôle.

Syntaxes : `/crow listes <type> [role]` et `+crow listes <type> [role]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `type` | Texte | Oui | Liste demandée. | choix : `Administrateurs humains` = `admins`, `Tous les bots` = `bots`, `Bots administrateurs` = `bots-admin`, `Membres d'un rôle` = `role` |
| `role` | Rôle | Non | Requis pour le type Membres d'un rôle. | — |

#### `massrole`

Ajoute ou retire un rôle à plusieurs membres.

Syntaxes : `/crow massrole <action> <role> <confirmation> [inclure_bots]` et `+crow massrole <action> <role> <confirmation> [inclure_bots]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `action` | Texte | Oui | Action à effectuer. | choix : `Ajouter` = `ajouter`, `Retirer` = `retirer` |
| `role` | Rôle | Oui | Rôle concerné. | — |
| `confirmation` | Oui/non | Oui | Doit être réglé sur Oui. | — |
| `inclure_bots` | Oui/non | Non | Inclure les comptes bots. | — |

#### `derank`

Retire les rôles gérables d'un membre.

Syntaxes : `/crow derank <membre> <confirmation>` et `+crow derank <membre> <confirmation>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `membre` | Utilisateur | Oui | Membre concerné. | — |
| `confirmation` | Oui/non | Oui | Doit être réglé sur Oui. | — |

#### `masquer`

Masque un salon à @everyone en conservant son réglage précédent.

Syntaxes : `/crow masquer [salon]` et `+crow masquer [salon]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Non | Salon, ou salon actuel. | — |

#### `afficher`

Restaure la visibilité enregistrée d'un salon.

Syntaxes : `/crow afficher [salon]` et `+crow afficher [salon]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Non | Salon, ou salon actuel. | — |

#### `emoji`

Ajoute un emoji depuis une URL HTTPS.

Syntaxes : `/crow emoji <nom> <url>` et `+crow emoji <nom> <url>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `nom` | Texte | Oui | Nom de l'emoji. | au moins 2 caractères ; au plus 32 caractères |
| `url` | Texte | Oui | URL HTTPS de l'image. | au plus 500 caractères |

#### `vocal`

Applique une action aux membres de ton salon vocal.

Syntaxes : `/crow vocal <action> [destination]` et `+crow vocal <action> [destination]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `action` | Texte | Oui | Action à effectuer. | choix : `Déconnecter tout le monde` = `deconnecter`, `Déplacer tout le monde` = `deplacer`, `Rendre muet` = `mute`, `Réactiver le micro` = `unmute`, `Rendre sourd` = `deaf`, `Réactiver le casque` = `undeaf` |
| `destination` | Salon | Non | Destination requise pour Déplacer. | types : vocal, stage |

#### `bans`

Liste les membres bannis du serveur.

Syntaxes : `/crow bans` et `+crow bans`

Aucune option.

#### `timeouts`

Liste les membres actuellement en timeout.

Syntaxes : `/crow timeouts` et `+crow timeouts`

Aucune option.

#### `anti-everyone`

Bloque les @everyone et @here non autorisés.

Syntaxes : `/crow anti-everyone <actif>` et `+crow anti-everyone <actif>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `actif` | Oui/non | Oui | État souhaité. | — |

#### `anti-token`

Supprime immédiatement les messages contenant un token Discord probable.

Syntaxes : `/crow anti-token <actif>` et `+crow anti-token <actif>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `actif` | Oui/non | Oui | État souhaité. | — |

#### `fichiers`

Autorise ou bloque les pièces jointes pour @everyone.

Syntaxes : `/crow fichiers <bloquer> [salon]` et `+crow fichiers <bloquer> [salon]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `bloquer` | Oui/non | Oui | Oui pour bloquer, Non pour restaurer. | — |
| `salon` | Salon | Non | Salon, ou salon actuel. | — |

#### `prefix`

Ajoute un préfixe secondaire tout en gardant toujours +.

Syntaxes : `/crow prefix <valeur>` et `+crow prefix <valeur>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `valeur` | Texte | Oui | De 1 à 3 caractères, ou + pour réinitialiser. | au moins 1 caractères ; au plus 3 caractères |

#### `securite`

Affiche l'état détaillé des protections Crow et Protect.

Syntaxes : `/crow securite` et `+crow securite`

Aucune option.

### `/protect` · `+protect`

Regroupe les protections et statistiques avancées.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **non**

Sous-commandes : **19**

#### `tout`

Active l'AutoMod, l'anti-invitations et l'anti-ghost-ping.

Syntaxes : `/protect tout [salon_alertes]` et `+protect tout [salon_alertes]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon_alertes` | Salon | Non | Salon des alertes, ou le salon actuel. | types : textuel, annonces |

#### `statut`

Affiche l'état des protections configurées.

Syntaxes : `/protect statut` et `+protect statut`

Aucune option.

#### `antighostping`

Active ou désactive la détection des ghost-pings.

Syntaxes : `/protect antighostping <actif>` et `+protect antighostping <actif>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `actif` | Oui/non | Oui | État souhaité. | — |

#### `antibot`

Expulse les nouveaux bots non autorisés.

Syntaxes : `/protect antibot <actif>` et `+protect antibot <actif>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `actif` | Oui/non | Oui | État souhaité. | — |

#### `bot-autoriser`

Autorise un bot à rejoindre malgré l'anti-bot.

Syntaxes : `/protect bot-autoriser <bot>` et `+protect bot-autoriser <bot>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `bot` | Utilisateur | Oui | Compte bot autorisé. | — |

#### `bot-retirer`

Retire un bot de la liste autorisée.

Syntaxes : `/protect bot-retirer <bot>` et `+protect bot-retirer <bot>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `bot` | Utilisateur | Oui | Compte bot à retirer. | — |

#### `voctime`

Affiche le temps vocal d'un membre.

Syntaxes : `/protect voctime [membre]` et `+protect voctime [membre]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `membre` | Utilisateur | Non | Membre à consulter. | — |

#### `voicetop`

Affiche le classement du temps vocal.

Syntaxes : `/protect voicetop` et `+protect voicetop`

Aucune option.

#### `vocalreset`

Réinitialise un temps vocal ou tous les temps.

Syntaxes : `/protect vocalreset <confirmation> [membre]` et `+protect vocalreset <confirmation> [membre]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `confirmation` | Oui/non | Oui | Doit être réglé sur Oui. | — |
| `membre` | Utilisateur | Non | Membre précis, sinon tout le serveur. | — |

#### `invitation`

Génère le lien officiel pour inviter ce bot.

Syntaxes : `/protect invitation [serveur_id]` et `+protect invitation [serveur_id]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `serveur_id` | Texte | Non | Serveur présélectionné, ou serveur actuel. | au moins 17 caractères ; au plus 20 caractères |

#### `mixnom`

Mélange les noms de deux membres pour s'amuser.

Syntaxes : `/protect mixnom <membre_1> <membre_2>` et `+protect mixnom <membre_1> <membre_2>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `membre_1` | Utilisateur | Oui | Premier membre. | — |
| `membre_2` | Utilisateur | Oui | Second membre. | — |

#### `qi`

Affiche un score humoristique aléatoire, sans valeur réelle.

Syntaxes : `/protect qi [membre]` et `+protect qi [membre]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `membre` | Utilisateur | Non | Membre visé, ou toi. | — |

#### `pendu`

Lance une partie de pendu interactive dans le salon.

Syntaxes : `/protect pendu` et `+protect pendu`

Aucune option.

#### `xp-ajouter`

Ajoute de l'XP à un membre dans le système de niveaux.

Syntaxes : `/protect xp-ajouter <membre> <quantite>` et `+protect xp-ajouter <membre> <quantite>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `membre` | Utilisateur | Oui | Membre concerné. | — |
| `quantite` | Nombre entier | Oui | XP à ajouter. | minimum 1 ; maximum 1000000 |

#### `xp-reset`

Réinitialise l'XP d'un membre ou de tout le serveur.

Syntaxes : `/protect xp-reset <confirmation> [membre]` et `+protect xp-reset <confirmation> [membre]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `confirmation` | Oui/non | Oui | Doit être réglé sur Oui. | — |
| `membre` | Utilisateur | Non | Membre précis, sinon tous. | — |

#### `warns-effacer`

Retire tous les avertissements actifs d'un membre.

Syntaxes : `/protect warns-effacer <membre> <confirmation>` et `+protect warns-effacer <membre> <confirmation>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `membre` | Utilisateur | Oui | Membre concerné. | — |
| `confirmation` | Oui/non | Oui | Doit être réglé sur Oui. | — |

#### `acces-effacer`

Vide une liste d'accès après confirmation.

Syntaxes : `/protect acces-effacer <liste> <confirmation>` et `+protect acces-effacer <liste> <confirmation>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `liste` | Texte | Oui | Liste à vider. | choix : `Blacklist` = `blacklist`, `Whitelist` = `whitelist`, `Responsables délégués` = `owners` |
| `confirmation` | Oui/non | Oui | Doit être réglé sur Oui. | — |

#### `antimentions`

Configure la règle AutoMod native contre les mentions massives.

Syntaxes : `/protect antimentions <salon_alertes> <limite> <timeout_minutes>` et `+protect antimentions <salon_alertes> <limite> <timeout_minutes>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon_alertes` | Salon | Oui | Salon recevant les alertes AutoMod. | types : textuel, annonces |
| `limite` | Nombre entier | Oui | Mentions autorisées par message. | minimum 1 ; maximum 50 |
| `timeout_minutes` | Nombre entier | Oui | Durée du timeout automatique. | minimum 1 ; maximum 10080 |

#### `antiraid`

Configure la protection contre les arrivées massives.

Syntaxes : `/protect antiraid <actif> [arrivees_max] [fenetre_secondes] [timeout_minutes]` et `+protect antiraid <actif> [arrivees_max] [fenetre_secondes] [timeout_minutes]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `actif` | Oui/non | Oui | État souhaité. | — |
| `arrivees_max` | Nombre entier | Non | Seuil d'arrivées dans la fenêtre. | minimum 2 ; maximum 100 |
| `fenetre_secondes` | Nombre entier | Non | Fenêtre de détection. | minimum 5 ; maximum 300 |
| `timeout_minutes` | Nombre entier | Non | Timeout appliqué. | minimum 1 ; maximum 10080 |

### `/vouch` · `+vouch`

Gère les avis clients du serveur.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **non**

Sous-commandes : **4**

#### `configurer`

Choisit le salon dans lequel publier les avis.

Syntaxes : `/vouch configurer <salon>` et `+vouch configurer <salon>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `salon` | Salon | Oui | Salon public des avis. | types : textuel, annonces |

#### `envoyer`

Publie un avis réel sur un membre ou un service.

Syntaxes : `/vouch envoyer <membre> <service> <note> <avis> [preuve_url]` et `+vouch envoyer <membre> <service> <note> <avis> [preuve_url]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `membre` | Utilisateur | Oui | Membre évalué. | — |
| `service` | Texte | Oui | Service concerné. | au plus 100 caractères |
| `note` | Nombre entier | Oui | Note de 1 à 5. | minimum 1 ; maximum 5 |
| `avis` | Texte | Oui | Texte exact de l'avis. | au plus 1000 caractères |
| `preuve_url` | Texte | Non | URL HTTPS facultative d'une image de preuve. | au plus 500 caractères |

#### `profil`

Affiche les avis et la moyenne d'un membre.

Syntaxes : `/vouch profil [membre]` et `+vouch profil [membre]`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `membre` | Utilisateur | Non | Membre à consulter. | — |

#### `supprimer`

Supprime un avis enregistré.

Syntaxes : `/vouch supprimer <id>` et `+vouch supprimer <id>`

| Option | Type | Obligatoire | Description | Limites et valeurs |
| --- | --- | --- | --- | --- |
| `id` | Nombre entier | Oui | Identifiant de l'avis. | minimum 1 |

## ❓ Aide (2)

Accès aux panneaux d'aide

### `/aide-gestion` · `+aide-gestion`

Affiche toutes les commandes du bot de gestion.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **non**

Syntaxes : `/aide-gestion` et `+aide-gestion`

Aucune option.

### `/help` · `+help`

Affiche toutes les commandes slash et préfixées du bot.

- Permission utilisateur : **Aucune restriction Discord par défaut**
- Utilisable en message privé : **non**

Syntaxes : `/help` et `+help`

Aucune option.
