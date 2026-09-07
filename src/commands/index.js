const {
  ChannelType,
  PermissionsBitField,
  SlashCommandBuilder,
} = require("discord.js");
const { communityCommands } = require("./community");
const { advancedCommands } = require("./advanced");
const { legacyCommands } = require("./legacy");
const { multiBotCommands } = require("./multi-bot");
const { statisticsCommands } = require("./statistics");
const { growthCommands } = require("./growth");

const permissions = PermissionsBitField.Flags;
const logTypeChoices = [
  ["Bannissements et débannissements", "bans"],
  ["Mutes et timeouts", "mutes"],
  ["Expulsions", "kicks"],
  ["Avertissements", "warns"],
  ["Anti-raid", "antiraid"],
  ["Rôles", "roles"],
  ["Salons", "channels"],
  ["Messages", "messages"],
  ["Bots", "bots"],
  ["Permissions", "permissions"],
  ["Vocaux", "voice"],
  ["AutoMod", "automod"],
  ["ModMail", "modmail"],
];

function addLogTypeChoices(option) {
  return option.addChoices(
    ...logTypeChoices.map(([name, value]) => ({ name, value })),
  );
}

const managementCommands = [
  new SlashCommandBuilder()
    .setName("automod")
    .setDescription("Configure le véritable AutoMod natif de Discord.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("all")
        .setDescription("Installe et active toutes les protections, anti-invitations comprise.")
        .addChannelOption((option) =>
          option
            .setName("salon_alertes")
            .setDescription("Salon d'alertes, ou le salon actuel par défaut.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addStringOption((option) =>
          option
            .setName("mots_interdits")
            .setDescription("Mots supplémentaires séparés par des virgules.")
            .setMaxLength(2000),
        )
        .addIntegerOption((option) =>
          option
            .setName("mentions_max")
            .setDescription("Nombre maximal de mentions (5 par défaut).")
            .setMinValue(3)
            .setMaxValue(50),
        )
        .addIntegerOption((option) =>
          option
            .setName("timeout_minutes")
            .setDescription("Timeout automatique (10 minutes par défaut).")
            .setMinValue(1)
            .setMaxValue(40320),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("configurer")
        .setDescription("Crée ou met à jour les règles AutoMod du bot.")
        .addChannelOption((option) =>
          option
            .setName("salon_alertes")
            .setDescription("Salon recevant les alertes AutoMod.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("mots_interdits")
            .setDescription("Mots ou phrases séparés par des virgules. Les * sont acceptés.")
            .setMaxLength(2000)
            .setRequired(false),
        )
        .addIntegerOption((option) =>
          option
            .setName("mentions_max")
            .setDescription("Nombre maximal de mentions dans un message (5 par défaut).")
            .setMinValue(3)
            .setMaxValue(50)
            .setRequired(false),
        )
        .addIntegerOption((option) =>
          option
            .setName("timeout_minutes")
            .setDescription("Durée du timeout anti-mentions (10 minutes par défaut).")
            .setMinValue(1)
            .setMaxValue(40320)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("statut")
        .setDescription("Affiche les règles AutoMod et leur état."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("activer")
        .setDescription("Active toutes les règles créées par ce bot."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("desactiver")
        .setDescription("Désactive toutes les règles créées par ce bot."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("desinstaller")
        .setDescription("Supprime uniquement les règles AutoMod créées par ce bot."),
    ),

  new SlashCommandBuilder()
    .setName("purger")
    .setDescription("Supprime plusieurs messages récents du salon.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageMessages)
    .addIntegerOption((option) =>
      option
        .setName("nombre")
        .setDescription("Nombre de messages à supprimer, entre 1 et 100.")
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("timeout")
    .setDescription("Place temporairement un membre en timeout.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ModerateMembers)
    .addUserOption((option) =>
      option.setName("membre").setDescription("Membre concerné.").setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("minutes")
        .setDescription("Durée entre 1 minute et 28 jours.")
        .setMinValue(1)
        .setMaxValue(40320)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("raison")
        .setDescription("Raison du timeout.")
        .setMaxLength(400)
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("untimeout")
    .setDescription("Retire le timeout d'un membre.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ModerateMembers)
    .addUserOption((option) =>
      option.setName("membre").setDescription("Membre concerné.").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("raison")
        .setDescription("Raison du retrait.")
        .setMaxLength(400)
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("expulser")
    .setDescription("Expulse un membre du serveur.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.KickMembers)
    .addUserOption((option) =>
      option.setName("membre").setDescription("Membre à expulser.").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("raison")
        .setDescription("Raison de l'expulsion.")
        .setMaxLength(400)
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("bannir")
    .setDescription("Bannit un utilisateur du serveur.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.BanMembers)
    .addUserOption((option) =>
      option.setName("utilisateur").setDescription("Utilisateur à bannir.").setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("heures_messages")
        .setDescription("Heures de messages à supprimer, de 0 à 168.")
        .setMinValue(0)
        .setMaxValue(168)
        .setRequired(false),
    )
    .addStringOption((option) =>
      option
        .setName("raison")
        .setDescription("Raison du bannissement.")
        .setMaxLength(400)
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("debannir")
    .setDescription("Retire le bannissement d'un utilisateur avec son identifiant.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.BanMembers)
    .addStringOption((option) =>
      option
        .setName("identifiant")
        .setDescription("Identifiant numérique Discord de l'utilisateur.")
        .setMinLength(17)
        .setMaxLength(20)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("raison")
        .setDescription("Raison du débannissement.")
        .setMaxLength(400)
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("verrouiller")
    .setDescription("Empêche @everyone d'envoyer des messages dans un salon.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageChannels)
    .addChannelOption((option) =>
      option
        .setName("salon")
        .setDescription("Salon à verrouiller, ou le salon actuel.")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("deverrouiller")
    .setDescription("Rétablit l'autorisation d'envoi héritée de @everyone.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageChannels)
    .addChannelOption((option) =>
      option
        .setName("salon")
        .setDescription("Salon à déverrouiller, ou le salon actuel.")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("Affiche des informations publiques sur un membre.")
    .setDMPermission(false)
    .addUserOption((option) =>
      option
        .setName("membre")
        .setDescription("Membre à consulter, ou toi par défaut.")
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("serverinfo")
    .setDescription("Affiche les informations principales du serveur.")
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("aide-gestion")
    .setDescription("Affiche toutes les commandes du bot de gestion.")
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Affiche toutes les commandes slash et préfixées du bot.")
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("avertir")
    .setDescription("Ajoute un avertissement permanent au dossier d'un membre.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ModerateMembers)
    .addUserOption((option) =>
      option.setName("membre").setDescription("Membre à avertir.").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("raison")
        .setDescription("Raison de l'avertissement.")
        .setMaxLength(500)
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("avertissements")
    .setDescription("Affiche les avertissements actifs d'un membre.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ModerateMembers)
    .addUserOption((option) =>
      option.setName("membre").setDescription("Membre à consulter.").setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("avertissement-retirer")
    .setDescription("Retire un avertissement avec son numéro de dossier.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ModerateMembers)
    .addIntegerOption((option) =>
      option
        .setName("numero")
        .setDescription("Numéro du dossier d'avertissement.")
        .setMinValue(1)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("raison")
        .setDescription("Raison du retrait.")
        .setMaxLength(400)
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("slowmode")
    .setDescription("Configure le mode lent d'un salon textuel.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageChannels)
    .addIntegerOption((option) =>
      option
        .setName("secondes")
        .setDescription("De 0 (désactivé) à 21600 secondes.")
        .setMinValue(0)
        .setMaxValue(21600)
        .setRequired(true),
    )
    .addChannelOption((option) =>
      option
        .setName("salon")
        .setDescription("Salon concerné, ou le salon actuel.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("accueil")
    .setDescription("Configure les arrivées, départs et l'autorôle.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("configurer")
        .setDescription("Active et configure le système d'accueil.")
        .addChannelOption((option) =>
          option
            .setName("salon_arrivees")
            .setDescription("Salon des messages de bienvenue.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName("salon_departs")
            .setDescription("Salon facultatif des messages de départ.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        )
        .addRoleOption((option) =>
          option
            .setName("autorole")
            .setDescription("Rôle facultatif donné aux nouveaux membres.")
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("message")
            .setDescription("Variables : {user}, {username}, {server}, {count}.")
            .setMaxLength(1500)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("statut").setDescription("Affiche la configuration d'accueil."),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("desactiver").setDescription("Désactive les messages d'accueil."),
    ),

  new SlashCommandBuilder()
    .setName("logs")
    .setDescription("Configure les journaux séparés du bot.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("installer")
        .setDescription("Crée automatiquement la catégorie et les 13 salons de logs.")
        .addChannelOption((option) =>
          option
            .setName("categorie")
            .setDescription("Catégorie existante facultative.")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Crée la catégorie Logs, ses 13 salons et active tous les journaux.")
        .addChannelOption((option) =>
          option
            .setName("categorie")
            .setDescription("Catégorie existante facultative.")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("configurer")
        .setDescription("Associe manuellement un type de journal à un salon.")
        .addStringOption((option) =>
          addLogTypeChoices(
            option
              .setName("type")
              .setDescription("Type d'événements à enregistrer.")
              .setRequired(true),
          ),
        )
        .addChannelOption((option) =>
          option
            .setName("salon")
            .setDescription("Salon recevant les journaux.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("statut").setDescription("Affiche tous les salons configurés."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("desactiver")
        .setDescription("Désactive et supprime un salon de journal ou tous les salons gérés.")
        .addStringOption((option) =>
          addLogTypeChoices(
            option
              .setName("type")
              .setDescription("Laisse vide pour supprimer tous les salons de logs gérés.")
              .setRequired(false),
          ),
        ),
    ),

  new SlashCommandBuilder()
    .setName("unlogs")
    .setDescription("Supprime les salons de logs gérés après confirmation.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageChannels),

  new SlashCommandBuilder()
    .setName("tickets")
    .setDescription("Configure les tickets et gère les demandes privées du support.")
    .setDMPermission(false)
    .addSubcommand((s) => s.setName("claim").setDescription("Prend en charge le ticket actuel (support)."))
    .addSubcommand((s) => s.setName("unclaim").setDescription("Libère la prise en charge du ticket (support)."))
    .addSubcommand((s) => s.setName("ajouter").setDescription("Ajoute des membres ou rôles au ticket (support).")
      .addStringOption((o) => o.setName("cibles").setDescription("Mentions ou IDs séparés par des espaces, 10 maximum.").setMaxLength(1000).setRequired(true)))
    .addSubcommand((s) => s.setName("retirer").setDescription("Retire des participants ajoutés au ticket (support).")
      .addStringOption((o) => o.setName("cibles").setDescription("Mentions ou IDs des participants à retirer.").setMaxLength(1000).setRequired(true)))
    .addSubcommand((s) => s.setName("renommer").setDescription("Renomme le ticket actuel (support).")
      .addStringOption((o) => o.setName("nom").setDescription("Nouveau nom du salon.").setMinLength(1).setMaxLength(90).setRequired(true)))
    .addSubcommand((s) => s.setName("rappel").setDescription("Rappelle au créateur que le support attend sa réponse.")
      .addChannelOption((o) => o.setName("salon").setDescription("Ticket concerné, sinon le salon actuel.").addChannelTypes(ChannelType.GuildText)))
    .addSubcommand((s) => s.setName("transcript").setDescription("Exporte un ticket en MP (créateur ou support).")
      .addChannelOption((o) => o.setName("salon").setDescription("Ticket à exporter, sinon le salon actuel.").addChannelTypes(ChannelType.GuildText)))
    .addSubcommand((s) => s.setName("fermer").setDescription("Ferme le ticket et envoie les transcripts configurés."))
    .addSubcommand((s) => s.setName("rouvrir").setDescription("Rouvre un ticket fermé et annule sa suppression (support)."))
    .addSubcommand((s) => s.setName("supprimer").setDescription("Supprime un ticket fermé après confirmation (support)."))
    .addSubcommand((s) => s.setName("autoclose").setDescription("Programme une fermeture persistante avec transcript (support).")
      .addStringOption((o) => o.setName("duree").setDescription("De 10s à 30d : 30m, 2h, 7d ; annuler pour désactiver.").setMaxLength(20).setRequired(true))
      .addStringOption((o) => o.setName("raison").setDescription("Raison affichée à la fermeture automatique.").setMaxLength(500)))
    .addSubcommand((s) => s.setName("closeall").setDescription("Ferme tous les tickets ouverts après confirmation (administrateur).")
      .addStringOption((o) => o.setName("raison").setDescription("Raison de la fermeture globale.").setMaxLength(500)))
    .addSubcommand((s) => s.setName("stars").setDescription("Affiche la moyenne et les avis de tickets reçus par un membre du support.")
      .addUserOption((o) => o.setName("utilisateur").setDescription("Membre du support, sinon toi-même.")))
    .addSubcommand((s) => s.setName("noter").setDescription("Note la prise en charge de ton ticket fermé, une seule fois.")
      .addIntegerOption((o) => o.setName("note").setDescription("Note de 1 à 5 étoiles.").setMinValue(1).setMaxValue(5).setRequired(true))
      .addStringOption((o) => o.setName("commentaire").setDescription("Avis facultatif réservé au support, sans informations sensibles.").setMaxLength(500)))
    .addSubcommand((subcommand) =>
      subcommand
        .setName("configurer")
        .setDescription("Ouvre l'embed interactif de configuration des tickets.")
        .addChannelOption((option) =>
          option
            .setName("categorie")
            .setDescription("Catégorie dans laquelle créer les tickets.")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(false),
        )
        .addRoleOption((option) =>
          option
            .setName("role_support")
            .setDescription("Rôle ayant accès aux tickets.")
            .setRequired(false),
        )
        .addStringOption((option) =>
          option.setName("titre").setDescription("Titre du panneau.").setMaxLength(100),
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("Description du panneau.")
            .setMaxLength(2000),
        )
        .addStringOption((option) =>
          option
            .setName("couleur")
            .setDescription("Couleur hexadécimale, par exemple 5865F2.")
            .setMaxLength(7),
        )
        .addBooleanOption((option) =>
          option
            .setName("confirmation")
            .setDescription("Confirme la création du ticket à l'utilisateur."),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("choix-ajouter")
        .setDescription("Ajoute ou modifie un bouton du panneau de tickets.")
        .addStringOption((option) =>
          option
            .setName("identifiant")
            .setDescription("Identifiant court sans espace, par exemple achat.")
            .setMinLength(1)
            .setMaxLength(25)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("label").setDescription("Texte du bouton.").setMaxLength(80).setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName("categorie")
            .setDescription("Catégorie particulière pour ce choix.")
            .addChannelTypes(ChannelType.GuildCategory),
        )
        .addRoleOption((option) =>
          option.setName("role_support").setDescription("Rôle support particulier."),
        )
        .addStringOption((option) =>
          option.setName("emoji").setDescription("Emoji du bouton.").setMaxLength(100),
        )
        .addStringOption((option) =>
          option.setName("description").setDescription("Texte affiché dans le ticket.").setMaxLength(1000),
        )
        .addIntegerOption((option) =>
          option.setName("ordre").setDescription("Position du bouton.").setMinValue(1).setMaxValue(25),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("choix-supprimer")
        .setDescription("Supprime un choix du panneau.")
        .addStringOption((option) =>
          option.setName("identifiant").setDescription("Identifiant du choix.").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("ordre")
        .setDescription("Définit l'ordre des boutons avec leurs identifiants.")
        .addStringOption((option) =>
          option
            .setName("identifiants")
            .setDescription("Identifiants séparés par des virgules.")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("panneau")
        .setDescription("Publie le bouton d'ouverture des tickets.")
        .addChannelOption((option) =>
          option
            .setName("salon")
            .setDescription("Salon dans lequel publier le panneau.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("statut").setDescription("Affiche la configuration des tickets."),
    ),

  new SlashCommandBuilder()
    .setName("rules")
    .setDescription("Crée et configure le règlement interactif du serveur.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("creer")
        .setDescription("Publie un règlement avec des boutons personnalisables.")
        .addChannelOption((option) =>
          option
            .setName("salon")
            .setDescription("Salon du règlement.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option
            .setName("role_membre")
            .setDescription("Rôle attribué après acceptation.")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("Texte complet du règlement.")
            .setMaxLength(4000)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("titre").setDescription("Titre de l'embed.").setMaxLength(100),
        )
        .addStringOption((option) =>
          option.setName("couleur").setDescription("Couleur hexadécimale.").setMaxLength(7),
        )
        .addStringOption((option) =>
          option.setName("label_accepter").setDescription("Texte du bouton Accepter.").setMaxLength(80),
        )
        .addStringOption((option) =>
          option.setName("label_refuser").setDescription("Texte du bouton Refuser.").setMaxLength(80),
        )
        .addStringOption((option) =>
          option.setName("label_relire").setDescription("Texte du bouton Relire.").setMaxLength(80),
        )
        .addStringOption((option) =>
          option.setName("label_question").setDescription("Texte du bouton Question.").setMaxLength(80),
        )
        .addStringOption((option) =>
          option.setName("emoji_accepter").setDescription("Emoji du bouton Accepter.").setMaxLength(100),
        )
        .addStringOption((option) =>
          option.setName("emoji_refuser").setDescription("Emoji du bouton Refuser.").setMaxLength(100),
        )
        .addStringOption((option) =>
          option.setName("emoji_relire").setDescription("Emoji du bouton Relire.").setMaxLength(100),
        )
        .addStringOption((option) =>
          option.setName("emoji_question").setDescription("Emoji du bouton Question.").setMaxLength(100),
        )
        .addStringOption((option) =>
          option.setName("ordre").setDescription("accept,refuse,read,question dans l'ordre voulu."),
        )
        .addChannelOption((option) =>
          option
            .setName("salon_questions")
            .setDescription("Salon vers lequel orienter les questions.")
            .addChannelTypes(ChannelType.GuildText),
        )
        .addBooleanOption((option) =>
          option.setName("confirmation").setDescription("Envoie une confirmation après acceptation."),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("statut").setDescription("Affiche la configuration du règlement."),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("desactiver").setDescription("Désactive les boutons du règlement."),
    ),

  new SlashCommandBuilder()
    .setName("security")
    .setDescription("Crée automatiquement le salon de sécurité et ses alertes.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageGuild)
    .addChannelOption((option) =>
      option
        .setName("categorie")
        .setDescription("Catégorie facultative du salon.")
        .addChannelTypes(ChannelType.GuildCategory),
    )
    .addRoleOption((option) =>
      option.setName("role_staff").setDescription("Rôle autorisé à voir les alertes."),
    )
    .addIntegerOption((option) =>
      option
        .setName("anciennete_jours")
        .setDescription("Âge minimal d'un compte avant alerte.")
        .setMinValue(1)
        .setMaxValue(365),
    ),

  new SlashCommandBuilder()
    .setName("react-role")
    .setDescription("Configure les rôles attribués par réaction.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageRoles)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("creer")
        .setDescription("Publie un message de reaction role.")
        .addChannelOption((option) =>
          option
            .setName("salon")
            .setDescription("Salon du message.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option.setName("role").setDescription("Rôle à attribuer.").setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("emoji").setDescription("Emoji de la réaction.").setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("titre").setDescription("Titre du message.").setMaxLength(100),
        )
        .addStringOption((option) =>
          option.setName("description").setDescription("Description du message.").setMaxLength(2000),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("supprimer")
        .setDescription("Supprime une association reaction role.")
        .addStringOption((option) =>
          option.setName("message_id").setDescription("Identifiant du message.").setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("emoji").setDescription("Emoji associé.").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("liste").setDescription("Liste les reaction roles configurés."),
    ),

  new SlashCommandBuilder()
    .setName("antiraid")
    .setDescription("Configure la protection contre les arrivées massives.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("configurer")
        .setDescription("Active et règle la détection d'arrivées massives.")
        .addIntegerOption((option) =>
          option
            .setName("arrivees_max")
            .setDescription("Nombre maximal d'arrivées dans la fenêtre.")
            .setMinValue(3)
            .setMaxValue(100)
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("secondes")
            .setDescription("Fenêtre de détection, entre 5 et 300 secondes.")
            .setMinValue(5)
            .setMaxValue(300)
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("timeout_minutes")
            .setDescription("Timeout appliqué aux nouvelles arrivées détectées.")
            .setMinValue(1)
            .setMaxValue(1440)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("statut").setDescription("Affiche la configuration anti-raid."),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("desactiver").setDescription("Désactive la détection anti-raid."),
    ),

  new SlashCommandBuilder()
    .setName("role")
    .setDescription("Ajoute ou retire un rôle en respectant la hiérarchie.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageRoles)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("ajouter")
        .setDescription("Ajoute un rôle à un membre.")
        .addUserOption((option) =>
          option.setName("membre").setDescription("Membre concerné.").setRequired(true),
        )
        .addRoleOption((option) =>
          option.setName("role").setDescription("Rôle à ajouter.").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("retirer")
        .setDescription("Retire un rôle à un membre.")
        .addUserOption((option) =>
          option.setName("membre").setDescription("Membre concerné.").setRequired(true),
        )
        .addRoleOption((option) =>
          option.setName("role").setDescription("Rôle à retirer.").setRequired(true),
        ),
    ),

  new SlashCommandBuilder()
    .setName("sondage")
    .setDescription("Crée un sondage natif Discord avec durée et choix multiples.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageMessages)
    .addStringOption((option) =>
      option
        .setName("question")
        .setDescription("Question du sondage.")
        .setMaxLength(300)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("choix_1").setDescription("Premier choix.").setMaxLength(55).setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("choix_2").setDescription("Deuxième choix.").setMaxLength(55).setRequired(true),
    )
    .addStringOption((option) =>
      option.setName("choix_3").setDescription("Troisième choix.").setMaxLength(55).setRequired(false),
    )
    .addStringOption((option) =>
      option.setName("choix_4").setDescription("Quatrième choix.").setMaxLength(55).setRequired(false),
    )
    .addStringOption((option) => option.setName("choix_5").setDescription("Cinquième choix.").setMaxLength(55))
    .addStringOption((option) => option.setName("choix_6").setDescription("Sixième choix.").setMaxLength(55))
    .addStringOption((option) => option.setName("choix_7").setDescription("Septième choix.").setMaxLength(55))
    .addStringOption((option) => option.setName("choix_8").setDescription("Huitième choix.").setMaxLength(55))
    .addStringOption((option) => option.setName("choix_9").setDescription("Neuvième choix.").setMaxLength(55))
    .addStringOption((option) => option.setName("choix_10").setDescription("Dixième choix.").setMaxLength(55))
    .addIntegerOption((option) => option.setName("duree_heures").setDescription("Durée du sondage, 24 heures par défaut.").setMinValue(1).setMaxValue(768))
    .addBooleanOption((option) => option.setName("choix_multiples").setDescription("Autorise plusieurs réponses par membre.")),

  new SlashCommandBuilder()
    .setName("vocal")
    .setDescription("Gère individuellement un membre dans un salon vocal.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.MoveMembers)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("deplacer")
        .setDescription("Déplace un membre vers un autre salon vocal.")
        .addUserOption((option) =>
          option.setName("membre").setDescription("Membre à déplacer.").setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName("salon")
            .setDescription("Salon vocal de destination.")
            .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("deconnecter")
        .setDescription("Déconnecte un membre de son salon vocal.")
        .addUserOption((option) =>
          option.setName("membre").setDescription("Membre à déconnecter.").setRequired(true),
        ),
    ),
].map((command) => command.toJSON());

const commands = [
  ...managementCommands,
  ...communityCommands,
  ...legacyCommands,
  ...statisticsCommands,
  ...advancedCommands,
  ...growthCommands,
  ...multiBotCommands,
];

module.exports = { commands };
