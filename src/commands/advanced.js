const {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require("discord.js");

const permissions = PermissionFlagsBits;

const advancedCommands = [
  new SlashCommandBuilder()
    .setName("event")
    .setDescription("Crée et gère les événements programmés natifs de Discord.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageEvents)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("creer")
        .setDescription("Crée un événement vocal, stage ou externe.")
        .addStringOption((option) => option.setName("nom").setDescription("Nom de l'événement.").setMaxLength(100).setRequired(true))
        .addStringOption((option) => option.setName("date").setDescription("Date locale : AAAA-MM-JJ HH:mm.").setMinLength(16).setMaxLength(32).setRequired(true))
        .addStringOption((option) => option.setName("type").setDescription("Type d'événement.").setRequired(true).addChoices(
          { name: "Salon vocal", value: "vocal" },
          { name: "Stage", value: "stage" },
          { name: "Lieu externe", value: "externe" },
        ))
        .addChannelOption((option) => option.setName("salon").setDescription("Salon vocal ou stage concerné.").addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice))
        .addStringOption((option) => option.setName("lieu").setDescription("Lieu affiché pour un événement externe.").setMaxLength(100))
        .addIntegerOption((option) => option.setName("duree_minutes").setDescription("Durée, 120 minutes par défaut.").setMinValue(15).setMaxValue(10080))
        .addStringOption((option) => option.setName("description").setDescription("Description de l'événement.").setMaxLength(1000)),
    )
    .addSubcommand((subcommand) => subcommand.setName("liste").setDescription("Affiche les prochains événements du serveur."))
    .addSubcommand((subcommand) =>
      subcommand
        .setName("annuler")
        .setDescription("Supprime un événement programmé.")
        .addStringOption((option) => option.setName("event_id").setDescription("Identifiant de l'événement.").setMinLength(17).setMaxLength(20).setRequired(true)),
    ),

  new SlashCommandBuilder()
    .setName("levels")
    .setDescription("Configure le système d'XP et de niveaux du serveur.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageGuild)
    .addSubcommand((subcommand) => subcommand.setName("activer").setDescription("Active les gains d'XP."))
    .addSubcommand((subcommand) => subcommand.setName("desactiver").setDescription("Désactive les gains d'XP sans effacer les niveaux."))
    .addSubcommand((subcommand) =>
      subcommand
        .setName("configurer")
        .setDescription("Règle les gains, le délai et une récompense de niveau.")
        .addIntegerOption((option) => option.setName("xp_min").setDescription("XP minimale par message.").setMinValue(1).setMaxValue(100))
        .addIntegerOption((option) => option.setName("xp_max").setDescription("XP maximale par message.").setMinValue(1).setMaxValue(200))
        .addIntegerOption((option) => option.setName("cooldown").setDescription("Délai entre deux gains, en secondes.").setMinValue(10).setMaxValue(3600))
        .addChannelOption((option) => option.setName("salon_ignore").setDescription("Ajoute ou retire ce salon de la liste ignorée.").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum))
        .addRoleOption((option) => option.setName("role").setDescription("Rôle récompense à enregistrer."))
        .addIntegerOption((option) => option.setName("niveau").setDescription("Niveau du rôle récompense.").setMinValue(1).setMaxValue(1000)),
    )
    .addSubcommand((subcommand) => subcommand.setName("statut").setDescription("Affiche la configuration des niveaux.")),

  new SlashCommandBuilder()
    .setName("classement")
    .setDescription("Affiche le classement XP du serveur.")
    .setDMPermission(false)
    .addIntegerOption((option) => option.setName("page").setDescription("Page du classement.").setMinValue(1).setMaxValue(100)),

  new SlashCommandBuilder()
    .setName("backup")
    .setDescription("Sauvegarde et restaure la structure du serveur sans supprimer l'existant.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.Administrator)
    .addSubcommand((subcommand) =>
      subcommand.setName("creer").setDescription("Sauvegarde les rôles, catégories, salons et permissions.")
        .addStringOption((option) => option.setName("nom").setDescription("Nom de la sauvegarde.").setMaxLength(50).setRequired(true)),
    )
    .addSubcommand((subcommand) => subcommand.setName("liste").setDescription("Liste les sauvegardes disponibles."))
    .addSubcommand((subcommand) =>
      subcommand.setName("restaurer").setDescription("Recrée les éléments manquants de la sauvegarde.")
        .addStringOption((option) => option.setName("nom").setDescription("Nom de la sauvegarde.").setRequired(true))
        .addBooleanOption((option) => option.setName("confirmation").setDescription("Doit être réglé sur Oui.").setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("supprimer").setDescription("Supprime une sauvegarde enregistrée.")
        .addStringOption((option) => option.setName("nom").setDescription("Nom de la sauvegarde.").setRequired(true)),
    ),

  new SlashCommandBuilder()
    .setName("annonce")
    .setDescription("Envoie ou programme une annonce personnalisée.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageMessages)
    .addSubcommand((subcommand) => addAnnouncementOptions(subcommand.setName("envoyer").setDescription("Envoie immédiatement l'annonce."), false))
    .addSubcommand((subcommand) => addAnnouncementOptions(subcommand.setName("programmer").setDescription("Programme l'annonce pour plus tard."), true))
    .addSubcommand((subcommand) => subcommand.setName("liste").setDescription("Liste les annonces programmées."))
    .addSubcommand((subcommand) => subcommand.setName("annuler").setDescription("Annule une annonce programmée.")
      .addIntegerOption((option) => option.setName("numero").setDescription("Numéro de l'annonce.").setMinValue(1).setRequired(true))),

  new SlashCommandBuilder()
    .setName("absence")
    .setDescription("Déclare et consulte les absences des membres.")
    .setDMPermission(false)
    .addSubcommand((subcommand) => subcommand.setName("declarer").setDescription("Déclare ton absence.")
      .addStringOption((option) => option.setName("retour").setDescription("Date de retour : AAAA-MM-JJ.").setMinLength(10).setMaxLength(10).setRequired(true))
      .addStringOption((option) => option.setName("raison").setDescription("Raison facultative.").setMaxLength(500)))
    .addSubcommand((subcommand) => subcommand.setName("liste").setDescription("Affiche les absences en cours."))
    .addSubcommand((subcommand) => subcommand.setName("terminer").setDescription("Termine ton absence ou celle d'un membre si tu gères le serveur.")
      .addUserOption((option) => option.setName("membre").setDescription("Membre concerné, sinon toi-même."))),

  new SlashCommandBuilder()
    .setName("onboarding")
    .setDescription("Configure l'accueil natif et les choix de rôles ou salons Discord.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageGuild)
    .addSubcommand((subcommand) => subcommand.setName("statut").setDescription("Affiche l'état de l'Onboarding Discord."))
    .addSubcommand((subcommand) => subcommand.setName("ajouter").setDescription("Ajoute une question et un choix à l'Onboarding.")
      .addStringOption((option) => option.setName("question").setDescription("Question présentée au nouveau membre.").setMaxLength(100).setRequired(true))
      .addStringOption((option) => option.setName("choix").setDescription("Nom du choix proposé.").setMaxLength(100).setRequired(true))
      .addRoleOption((option) => option.setName("role").setDescription("Rôle donné par ce choix."))
      .addChannelOption((option) => option.setName("salon").setDescription("Salon ajouté par ce choix.").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum))
      .addStringOption((option) => option.setName("emoji").setDescription("Emoji du choix.").setMaxLength(100)))
    .addSubcommand((subcommand) => subcommand.setName("activer").setDescription("Active l'Onboarding déjà configuré dans Discord."))
    .addSubcommand((subcommand) => subcommand.setName("desactiver").setDescription("Désactive l'Onboarding sans effacer sa configuration.")),

  new SlashCommandBuilder()
    .setName("questions-anonymes")
    .setDescription("Configure le salon des questions anonymes.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageGuild)
    .addSubcommand((subcommand) => subcommand.setName("configurer").setDescription("Choisit le salon de réception.")
      .addChannelOption((option) => option.setName("salon").setDescription("Salon public des questions.").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName("desactiver").setDescription("Désactive les questions anonymes."))
    .addSubcommand((subcommand) => subcommand.setName("statut").setDescription("Affiche la configuration actuelle.")),

  new SlashCommandBuilder()
    .setName("question-anonyme")
    .setDescription("Envoie une question sans afficher ton identité publiquement.")
    .setDMPermission(false)
    .addStringOption((option) => option.setName("texte").setDescription("Question à envoyer.").setMinLength(3).setMaxLength(1500).setRequired(true)),

  new SlashCommandBuilder()
    .setName("profil")
    .setDescription("Affiche le profil communautaire, le niveau et les rôles d'un membre.")
    .setDMPermission(false)
    .addUserOption((option) => option.setName("membre").setDescription("Membre concerné, sinon toi-même.")),
].map((command) => command.toJSON());

function addAnnouncementOptions(subcommand, scheduled) {
  subcommand
    .addChannelOption((option) => option.setName("salon").setDescription("Salon de destination.").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true));
  if (scheduled) {
    subcommand.addIntegerOption((option) => option.setName("minutes").setDescription("Délai avant l'envoi.").setMinValue(1).setMaxValue(525600).setRequired(true));
  }
  subcommand
    .addStringOption((option) => option.setName("texte").setDescription("Préremplit le formulaire multiligne facultatif.").setMaxLength(4000))
    .addStringOption((option) => option.setName("titre").setDescription("Titre facultatif de l'embed.").setMaxLength(256))
    .addStringOption((option) => option.setName("couleur").setDescription("Couleur hexadécimale, par exemple 5865F2.").setMaxLength(7))
    .addStringOption((option) => option.setName("image").setDescription("URL HTTPS d'une image.").setMaxLength(500))
    .addStringOption((option) => option.setName("bouton_label").setDescription("Texte d'un bouton-lien.").setMaxLength(80))
    .addStringOption((option) => option.setName("bouton_url").setDescription("URL HTTPS du bouton.").setMaxLength(500));
  return subcommand;
}

module.exports = { advancedCommands };
