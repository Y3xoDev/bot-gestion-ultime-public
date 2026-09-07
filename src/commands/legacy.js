const {
  ChannelType,
  PermissionsBitField,
  SlashCommandBuilder,
} = require("discord.js");

const permissions = PermissionsBitField.Flags;

const legacyCommands = [
  new SlashCommandBuilder()
    .setName("antilink")
    .setDescription("Bloque les invitations de serveurs avec l'AutoMod natif de Discord.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("configurer")
        .setDescription("Crée ou met à jour la règle anti-invitations native.")
        .addChannelOption((option) =>
          option
            .setName("salon_alertes")
            .setDescription("Salon recevant les alertes de liens bloqués.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("timeout_minutes")
            .setDescription("Timeout appliqué, ou 0 pour bloquer sans timeout.")
            .setMinValue(0)
            .setMaxValue(40320),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("exception-ajouter")
        .setDescription("Autorise un salon et/ou un rôle à publier des liens.")
        .addChannelOption((option) =>
          option
            .setName("salon")
            .setDescription("Salon à autoriser.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addRoleOption((option) =>
          option.setName("role").setDescription("Rôle à autoriser."),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("exception-retirer")
        .setDescription("Retire un salon et/ou un rôle des exceptions.")
        .addChannelOption((option) =>
          option
            .setName("salon")
            .setDescription("Salon à retirer.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
        )
        .addRoleOption((option) =>
          option.setName("role").setDescription("Rôle à retirer."),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("statut").setDescription("Affiche l'état et les exceptions de l'anti-invitations."),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("activer").setDescription("Active la règle anti-invitations du bot."),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("desactiver").setDescription("Désactive la règle anti-invitations du bot."),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("desinstaller").setDescription("Supprime la règle anti-invitations créée par le bot."),
    ),

  new SlashCommandBuilder()
    .setName("admin")
    .setDescription("Affiche le propriétaire, les administrateurs visibles et les rôles admin.")
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("banner")
    .setDescription("Affiche la bannière du serveur.")
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("boosters")
    .setDescription("Affiche le niveau de boost et les boosters visibles du serveur.")
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("botinfo")
    .setDescription("Affiche les informations techniques et statistiques du bot.")
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Affiche les statistiques générales et vocales du serveur.")
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("dire")
    .setDescription("Ouvre un formulaire multiligne puis envoie le texte ou l'embed sans mentions.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageMessages)
    .addStringOption((option) =>
      option
        .setName("contenu")
        .setDescription("Préremplit le formulaire multiligne ; tu pourras encore modifier le texte.")
        .setMinLength(1)
        .setMaxLength(2000)
        .setRequired(false),
    )
    .addChannelOption((option) =>
      option
        .setName("salon")
        .setDescription("Salon de destination, ou le salon actuel.")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    )
    .addBooleanOption((option) =>
      option.setName("embed").setDescription("Envoie le texte dans un embed."),
    ),

  new SlashCommandBuilder()
    .setName("snipe")
    .setDescription("Affiche le dernier message supprimé récemment dans un salon.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageMessages)
    .addChannelOption((option) =>
      option
        .setName("salon")
        .setDescription("Salon à consulter, ou le salon actuel.")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    ),

  new SlashCommandBuilder()
    .setName("renouveler")
    .setDescription("Recrée un salon après une confirmation explicite.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageChannels)
    .addChannelOption((option) =>
      option
        .setName("salon")
        .setDescription("Salon à recréer, ou le salon actuel.")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    ),

  new SlashCommandBuilder()
    .setName("renew")
    .setDescription("Supprime et recrée un salon après une confirmation explicite.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageChannels)
    .addChannelOption((option) =>
      option
        .setName("salon")
        .setDescription("Salon à recréer, ou le salon actuel.")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
    ),

  new SlashCommandBuilder()
    .setName("ownerbot")
    .setDescription("Affiche le propriétaire de l'application et les propriétaires ajoutés.")
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("join")
    .setDescription("Fait rejoindre un vocal au bot ou génère son invitation sur un serveur.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageGuild)
    .addSubcommand(subcommand => subcommand.setName("voc")
      .setDescription("Rejoint ton vocal ou un salon choisi, sans écouter ni diffuser d'audio.")
      .addChannelOption(option => option.setName("salon").setDescription("Salon vocal à rejoindre ; par défaut, ton vocal actuel.")
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)))
    .addSubcommand(subcommand => subcommand.setName("serveur")
      .setDescription("Génère le lien Discord pour inviter le bot sur un serveur précis.")
      .addStringOption(option => option.setName("serveur_id").setDescription("Identifiant du serveur sur lequel inviter le bot.")
        .setMinLength(17).setMaxLength(20).setRequired(true))),

  new SlashCommandBuilder()
    .setName("leave")
    .setDescription("Fait quitter au bot un serveur avec son identifiant, après confirmation.")
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName("serveur_id")
        .setDescription("Identifiant du serveur que le bot doit quitter.")
        .setMinLength(17)
        .setMaxLength(20)
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("presence")
    .setDescription("Personnalise le statut et l'activité affichés par le bot.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand.setName("afficher").setDescription("Affiche la présence actuellement configurée."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("statut")
        .setDescription("Modifie le statut de connexion du bot.")
        .addStringOption((option) =>
          option
            .setName("valeur")
            .setDescription("Nouveau statut affiché.")
            .setRequired(true)
            .addChoices(
              { name: "En ligne", value: "en_ligne" },
              { name: "Inactif", value: "inactif" },
              { name: "Ne pas déranger", value: "ne_pas_deranger" },
              { name: "Invisible", value: "invisible" },
            ),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("activite")
        .setDescription("Modifie le type et le texte de l'activité du bot.")
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("Façon dont Discord présente l'activité.")
            .setRequired(true)
            .addChoices(
              { name: "Joue à", value: "jouer" },
              { name: "Stream", value: "stream" },
              { name: "Écoute", value: "ecouter" },
              { name: "Regarde", value: "regarder" },
              { name: "Participe à", value: "participer" },
            ),
        )
        .addStringOption((option) =>
          option
            .setName("texte")
            .setDescription("Texte affiché après le type d'activité.")
            .setMinLength(1)
            .setMaxLength(128)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("url")
            .setDescription("URL HTTPS Twitch ou YouTube, uniquement pour Stream.")
            .setMaxLength(512),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("effacer-activite")
        .setDescription("Masque complètement l'activité du bot."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reinitialiser")
        .setDescription("Restaure le statut en ligne et l'activité par défaut."),
    ),

  new SlashCommandBuilder()
    .setName("whitelist")
    .setDescription("Gère la liste des utilisateurs autorisés à utiliser les commandes.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("ajouter")
        .setDescription("Ajoute un utilisateur à la liste blanche.")
        .addUserOption((option) =>
          option.setName("utilisateur").setDescription("Utilisateur à autoriser.").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("retirer")
        .setDescription("Retire un utilisateur de la liste blanche.")
        .addStringOption((option) =>
          option
            .setName("identifiant")
            .setDescription("Identifiant Discord à retirer.")
            .setMinLength(17)
            .setMaxLength(20)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("activer").setDescription("Réserve les commandes aux utilisateurs autorisés."),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("desactiver").setDescription("Rend les commandes de nouveau accessibles normalement."),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("liste").setDescription("Affiche la liste blanche et son état."),
    ),

  new SlashCommandBuilder()
    .setName("owners")
    .setDescription("Gère les responsables délégués du bot pour ce serveur.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("ajouter")
        .setDescription("Ajoute un responsable délégué; seul le propriétaire du serveur peut le faire.")
        .addUserOption((option) =>
          option.setName("utilisateur").setDescription("Utilisateur à déléguer.").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("retirer")
        .setDescription("Retire un responsable délégué.")
        .addStringOption((option) =>
          option
            .setName("identifiant")
            .setDescription("Identifiant Discord à retirer.")
            .setMinLength(17)
            .setMaxLength(20)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("liste").setDescription("Affiche les responsables délégués."),
    ),

  new SlashCommandBuilder()
    .setName("listes")
    .setDescription("Affiche un résumé des blacklist, whitelist et responsables du bot.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageGuild),
].map((command) => command.toJSON());

module.exports = { legacyCommands };
