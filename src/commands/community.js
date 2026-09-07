const {
  ChannelType,
  PermissionsBitField,
  SlashCommandBuilder,
} = require("discord.js");

const permissions = PermissionsBitField.Flags;

const communityCommands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Affiche la latence du bot."),

  new SlashCommandBuilder()
    .setName("avatar")
    .setDescription("Affiche l'avatar d'un utilisateur.")
    .setDMPermission(false)
    .addUserOption((option) =>
      option
        .setName("utilisateur")
        .setDescription("Utilisateur concerné, ou toi par défaut.")
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("pile-ou-face")
    .setDescription("Lance une pièce."),

  new SlashCommandBuilder()
    .setName("de")
    .setDescription("Lance un dé.")
    .addIntegerOption((option) =>
      option
        .setName("faces")
        .setDescription("Nombre de faces, entre 2 et 100.")
        .setMinValue(2)
        .setMaxValue(100)
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("choisir")
    .setDescription("Choisit au hasard parmi plusieurs possibilités.")
    .addStringOption((option) =>
      option
        .setName("options")
        .setDescription("Sépare les choix avec |.")
        .setMaxLength(1000)
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("huitball")
    .setDescription("Répond au hasard à une question.")
    .addStringOption((option) =>
      option
        .setName("question")
        .setDescription("Ta question.")
        .setMaxLength(500)
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("blacklist")
    .setDescription("Gère la liste noire persistante du serveur.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.BanMembers)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("ajouter")
        .setDescription("Ajoute un utilisateur à la liste noire.")
        .addUserOption((option) =>
          option
            .setName("utilisateur")
            .setDescription("Utilisateur à bloquer.")
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("raison")
            .setDescription("Raison de la liste noire.")
            .setMaxLength(500)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("retirer")
        .setDescription("Retire un identifiant de la liste noire.")
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
      subcommand.setName("liste").setDescription("Affiche la liste noire du serveur."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("info")
        .setDescription("Affiche le dossier d'un utilisateur blacklisté.")
        .addStringOption((option) =>
          option
            .setName("identifiant")
            .setDescription("Identifiant Discord de l'utilisateur.")
            .setMinLength(17)
            .setMaxLength(20)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("retablir")
        .setDescription("Retire de la liste noire et débannit cet utilisateur.")
        .addStringOption((option) =>
          option
            .setName("identifiant")
            .setDescription("Identifiant Discord à rétablir.")
            .setMinLength(17)
            .setMaxLength(20)
            .setRequired(true),
        ),
    ),

  new SlashCommandBuilder()
    .setName("protection-vocale")
    .setDescription("Protège des salons vocaux avec une liste d'accès.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageChannels)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("verrouiller")
        .setDescription("Protège un salon vocal.")
        .addChannelOption((option) =>
          option
            .setName("salon")
            .setDescription("Salon vocal à protéger.")
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("raison")
            .setDescription("Motif affiché aux membres refusés.")
            .setMaxLength(500)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("deverrouiller")
        .setDescription("Retire la protection d'un salon vocal.")
        .addChannelOption((option) =>
          option
            .setName("salon")
            .setDescription("Salon vocal concerné.")
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("autoriser")
        .setDescription("Autorise un membre dans un salon protégé.")
        .addChannelOption((option) =>
          option
            .setName("salon")
            .setDescription("Salon vocal concerné.")
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(true),
        )
        .addUserOption((option) =>
          option
            .setName("membre")
            .setDescription("Membre à autoriser.")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("retirer")
        .setDescription("Retire l'accès d'un membre.")
        .addChannelOption((option) =>
          option
            .setName("salon")
            .setDescription("Salon vocal concerné.")
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(true),
        )
        .addUserOption((option) =>
          option
            .setName("membre")
            .setDescription("Membre à retirer.")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("statut")
        .setDescription("Affiche les salons protégés ou le détail d'un salon.")
        .addChannelOption((option) =>
          option
            .setName("salon")
            .setDescription("Salon vocal facultatif.")
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(false),
        ),
    ),

  new SlashCommandBuilder()
    .setName("unmodmail")
    .setDescription("Supprime entièrement le système ModMail de ce serveur.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageGuild),

  new SlashCommandBuilder()
    .setName("modmail")
    .setDescription("Configure et gère l'assistance par messages privés.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand.setName("panel").setDescription("Publie le bouton de contact ModMail de ce serveur.")
        .addChannelOption((option) => option.setName("salon")
          .setDescription("Salon public dans lequel afficher le bouton Contacter le staff.")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("all")
        .setDescription("Génère le code unique requis avant l'installation complète du ModMail."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("verif")
        .setDescription("Vérifie le code et installe le ModMail sur le serveur indiqué.")
        .addStringOption((option) =>
          option
            .setName("code")
            .setDescription("Code à six chiffres donné par la commande ModMail all.")
            .setMinLength(6)
            .setMaxLength(6)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("serveur_id")
            .setDescription("Identifiant du serveur dans lequel installer le ModMail.")
            .setMinLength(17)
            .setMaxLength(20)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("configurer")
        .setDescription("Configure et active le modmail.")
        .addChannelOption((option) =>
          option
            .setName("categorie")
            .setDescription("Catégorie recevant les conversations.")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option
            .setName("role_staff")
            .setDescription("Rôle autorisé à répondre.")
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName("salon_transcriptions")
            .setDescription("Salon recevant les transcriptions.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName("transcriptions")
            .setDescription("Active ou désactive la création de transcriptions.")
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName("reclamation")
            .setDescription("Permet au staff de réclamer une conversation.")
            .setRequired(false),
        )
        .addBooleanOption((option) =>
          option
            .setName("fermeture_inactive")
            .setDescription("Ferme automatiquement les conversations inactives.")
            .setRequired(false),
        )
        .addIntegerOption((option) =>
          option
            .setName("heures_inactivite")
            .setDescription("Délai d'inactivité entre 1 et 720 heures.")
            .setMinValue(1)
            .setMaxValue(720)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("activer").setDescription("Active le modmail configuré."),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("desactiver").setDescription("Désactive le ModMail et les relais de ce serveur."),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("statut").setDescription("Affiche la configuration du modmail."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("bloquer")
        .setDescription("Bloque un utilisateur du modmail.")
        .addUserOption((option) =>
          option
            .setName("utilisateur")
            .setDescription("Utilisateur à bloquer.")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("debloquer")
        .setDescription("Débloque un utilisateur du modmail.")
        .addUserOption((option) =>
          option
            .setName("utilisateur")
            .setDescription("Utilisateur à débloquer.")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("option-ajouter")
        .setDescription("Ajoute ou remplace un type de demande.")
        .addStringOption((option) =>
          option
            .setName("nom")
            .setDescription("Nom visible dans le sélecteur privé.")
            .setMinLength(1)
            .setMaxLength(100)
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName("categorie")
            .setDescription("Catégorie de ce type de demande.")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option
            .setName("role_staff")
            .setDescription("Rôle staff de ce type de demande.")
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option
            .setName("role_autorise")
            .setDescription("Rôle requis pour voir cette option.")
            .setRequired(false),
        )
        .addRoleOption((option) =>
          option
            .setName("role_interdit")
            .setDescription("Rôle empêchant l'accès à cette option.")
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("option-supprimer")
        .setDescription("Supprime un type de demande.")
        .addStringOption((option) =>
          option
            .setName("nom")
            .setDescription("Nom exact de l'option.")
            .setRequired(true),
        ),
    ),

  new SlashCommandBuilder()
    .setName("suggestions")
    .setDescription("Configure et traite les suggestions du serveur.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("configurer")
        .setDescription("Choisit le salon des suggestions.")
        .addChannelOption((option) =>
          option
            .setName("salon")
            .setDescription("Salon recevant les suggestions.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        )
        .addBooleanOption((option) =>
          option.setName("discussion").setDescription("Crée un fil de discussion pour chaque suggestion."),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("statut").setDescription("Affiche la configuration actuelle."),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("desactiver").setDescription("Désactive les suggestions."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("traiter")
        .setDescription("Accepte, refuse ou marque comme réalisée une suggestion.")
        .addStringOption((option) =>
          option.setName("message_id").setDescription("Identifiant du message de suggestion.").setMinLength(17).setMaxLength(20).setRequired(true),
        )
        .addStringOption((option) =>
          option.setName("statut").setDescription("Nouveau statut.").setRequired(true).addChoices(
            { name: "Acceptée", value: "acceptee" },
            { name: "Refusée", value: "refusee" },
            { name: "Réalisée", value: "realisee" },
            { name: "En étude", value: "etude" },
          ),
        )
        .addStringOption((option) => option.setName("raison").setDescription("Réponse du staff.").setMaxLength(1000)),
    ),

  new SlashCommandBuilder()
    .setName("suggerer")
    .setDescription("Envoie une suggestion dans le salon configuré.")
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName("texte")
        .setDescription("Contenu de ta suggestion.")
        .setMinLength(3)
        .setMaxLength(2000)
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Crée et gère des giveaways persistants.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("lancer")
        .setDescription("Lance un nouveau giveaway.")
        .addChannelOption((option) =>
          option
            .setName("salon")
            .setDescription("Salon du giveaway.")
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("duree_minutes")
            .setDescription("Durée entre 1 minute et 7 jours.")
            .setMinValue(1)
            .setMaxValue(10080)
            .setRequired(true),
        )
        .addIntegerOption((option) =>
          option
            .setName("gagnants")
            .setDescription("Nombre de gagnants, entre 1 et 20.")
            .setMinValue(1)
            .setMaxValue(20)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("prix")
            .setDescription("Prix du giveaway.")
            .setMaxLength(500)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("titre")
            .setDescription("Titre personnalisé du giveaway.")
            .setMaxLength(256)
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName("description")
            .setDescription("Description personnalisée du giveaway.")
            .setMaxLength(2000)
            .setRequired(false),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("terminer")
        .setDescription("Termine immédiatement un giveaway.")
        .addStringOption((option) =>
          option
            .setName("message_id")
            .setDescription("Identifiant du message du giveaway.")
            .setMinLength(17)
            .setMaxLength(20)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("relancer")
        .setDescription("Choisit de nouveaux gagnants pour un giveaway terminé.")
        .addStringOption((option) =>
          option
            .setName("message_id")
            .setDescription("Identifiant du message du giveaway.")
            .setMinLength(17)
            .setMaxLength(20)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("liste")
        .setDescription("Affiche les giveaways actifs du serveur."),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("pause")
        .setDescription("Met un giveaway actif en pause.")
        .addStringOption((option) =>
          option
            .setName("message_id")
            .setDescription("Identifiant du message du giveaway.")
            .setMinLength(17)
            .setMaxLength(20)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("reprendre")
        .setDescription("Reprend un giveaway en pause.")
        .addStringOption((option) =>
          option
            .setName("message_id")
            .setDescription("Identifiant du message du giveaway.")
            .setMinLength(17)
            .setMaxLength(20)
            .setRequired(true),
        ),
    ),

  new SlashCommandBuilder()
    .setName("rappel")
    .setDescription("Programme un rappel personnel dans le salon.")
    .setDMPermission(false)
    .addIntegerOption((option) =>
      option
        .setName("minutes")
        .setDescription("Délai entre 1 minute et 7 jours.")
        .setMinValue(1)
        .setMaxValue(10080)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("texte")
        .setDescription("Texte du rappel.")
        .setMaxLength(1000)
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("rappels")
    .setDescription("Affiche tes rappels en attente.")
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("rappel-annuler")
    .setDescription("Annule l'un de tes rappels.")
    .setDMPermission(false)
    .addIntegerOption((option) =>
      option
        .setName("numero")
        .setDescription("Numéro du rappel.")
        .setMinValue(1)
        .setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("role-bouton")
    .setDescription("Crée un bouton permettant aux membres de prendre un rôle.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageRoles)
    .addChannelOption((option) =>
      option
        .setName("salon")
        .setDescription("Salon du panneau.")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true),
    )
    .addRoleOption((option) =>
      option.setName("role").setDescription("Rôle attribué par le bouton.").setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("label")
        .setDescription("Texte affiché sur le bouton.")
        .setMaxLength(80)
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("description")
        .setDescription("Description du panneau.")
        .setMaxLength(1000)
        .setRequired(false),
    ),

  new SlashCommandBuilder()
    .setName("reponses")
    .setDescription("Configure des réponses personnalisées enregistrées.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("ajouter")
        .setDescription("Ajoute ou remplace une réponse.")
        .addStringOption((option) =>
          option
            .setName("nom")
            .setDescription("Nom court en minuscules.")
            .setMinLength(1)
            .setMaxLength(32)
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName("texte")
            .setDescription("Texte de la réponse.")
            .setMaxLength(1900)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("supprimer")
        .setDescription("Supprime une réponse.")
        .addStringOption((option) =>
          option.setName("nom").setDescription("Nom de la réponse.").setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("liste").setDescription("Liste les réponses enregistrées."),
    ),

  new SlashCommandBuilder()
    .setName("reponse")
    .setDescription("Affiche une réponse personnalisée enregistrée.")
    .setDMPermission(false)
    .addStringOption((option) =>
      option.setName("nom").setDescription("Nom de la réponse.").setRequired(true),
    ),

  new SlashCommandBuilder()
    .setName("tempvocal")
    .setDescription("Configure les salons vocaux temporaires.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(permissions.ManageChannels)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("configurer")
        .setDescription("Configure le salon Rejoindre pour créer.")
        .addChannelOption((option) =>
          option
            .setName("salon_creation")
            .setDescription("Salon vocal déclenchant la création.")
            .addChannelTypes(ChannelType.GuildVoice)
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName("categorie")
            .setDescription("Catégorie des salons temporaires.")
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("statut").setDescription("Affiche la configuration actuelle."),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("desactiver").setDescription("Désactive les salons temporaires."),
    ),
].map((command) => command.toJSON());

module.exports = { communityCommands };
