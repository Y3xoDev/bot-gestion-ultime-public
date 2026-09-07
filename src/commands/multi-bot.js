const {
  ChannelType,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require("discord.js");

const multiBotCommands = [
  new SlashCommandBuilder()
    .setName("vouch")
    .setDescription("Gère les avis clients du serveur.")
    .setDMPermission(false)
    .addSubcommand((subcommand) => subcommand
      .setName("configurer")
      .setDescription("Choisit le salon dans lequel publier les avis.")
      .addChannelOption((option) => option
        .setName("salon")
        .setDescription("Salon public des avis.")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("envoyer")
      .setDescription("Publie un avis réel sur un membre ou un service.")
      .addUserOption((option) => option.setName("membre").setDescription("Membre évalué.").setRequired(true))
      .addStringOption((option) => option.setName("service").setDescription("Service concerné.").setMaxLength(100).setRequired(true))
      .addIntegerOption((option) => option.setName("note").setDescription("Note de 1 à 5.").setMinValue(1).setMaxValue(5).setRequired(true))
      .addStringOption((option) => option.setName("avis").setDescription("Texte exact de l'avis.").setMaxLength(1000).setRequired(true))
      .addStringOption((option) => option.setName("preuve_url").setDescription("URL HTTPS facultative d'une image de preuve.").setMaxLength(500)))
    .addSubcommand((subcommand) => subcommand
      .setName("profil")
      .setDescription("Affiche les avis et la moyenne d'un membre.")
      .addUserOption((option) => option.setName("membre").setDescription("Membre à consulter.")))
    .addSubcommand((subcommand) => subcommand
      .setName("supprimer")
      .setDescription("Supprime un avis enregistré.")
      .addIntegerOption((option) => option.setName("id").setDescription("Identifiant de l'avis.").setMinValue(1).setRequired(true))),

  new SlashCommandBuilder()
    .setName("boutique")
    .setDescription("Gère les informations de paiement, clients et vérifications.")
    .setDMPermission(false)
    .addSubcommand((subcommand) => subcommand.setName("paiement").setDescription("Affiche les moyens de paiement configurés."))
    .addSubcommand((subcommand) => subcommand
      .setName("paiement-configurer")
      .setDescription("Enregistre le texte des moyens de paiement.")
      .addStringOption((option) => option.setName("texte").setDescription("Texte et liens de paiement.").setMaxLength(1500).setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("client-configurer")
      .setDescription("Choisit le rôle attribué aux clients.")
      .addRoleOption((option) => option.setName("role").setDescription("Rôle Client.").setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("client")
      .setDescription("Attribue le rôle Client configuré.")
      .addUserOption((option) => option.setName("membre").setDescription("Client concerné.").setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("verification-configurer")
      .setDescription("Configure le salon et le rôle de vérification.")
      .addChannelOption((option) => option
        .setName("salon")
        .setDescription("Salon dans lequel /boutique verifier sera autorisé.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true))
      .addRoleOption((option) => option.setName("role").setDescription("Rôle donné après vérification.").setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName("verifier").setDescription("Reçoit le rôle de vérification configuré."))
    .addSubcommand((subcommand) => subcommand
      .setName("suggestion-configurer")
      .setDescription("Choisit le salon utilisé par /suggerer.")
      .addChannelOption((option) => option
        .setName("salon")
        .setDescription("Salon des suggestions.")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName("statut").setDescription("Affiche la configuration de la boutique.")),

  new SlashCommandBuilder()
    .setName("protect")
    .setDescription("Regroupe les protections et statistiques avancées.")
    .setDMPermission(false)
    .addSubcommand((subcommand) => subcommand
      .setName("tout")
      .setDescription("Active l'AutoMod, l'anti-invitations et l'anti-ghost-ping.")
      .addChannelOption((option) => option
        .setName("salon_alertes")
        .setDescription("Salon des alertes, ou le salon actuel.")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((subcommand) => subcommand.setName("statut").setDescription("Affiche l'état des protections configurées."))
    .addSubcommand((subcommand) => subcommand
      .setName("antighostping")
      .setDescription("Active ou désactive la détection des ghost-pings.")
      .addBooleanOption((option) => option.setName("actif").setDescription("État souhaité.").setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("antibot")
      .setDescription("Expulse les nouveaux bots non autorisés.")
      .addBooleanOption((option) => option.setName("actif").setDescription("État souhaité.").setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("bot-autoriser")
      .setDescription("Autorise un bot à rejoindre malgré l'anti-bot.")
      .addUserOption((option) => option.setName("bot").setDescription("Compte bot autorisé.").setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("bot-retirer")
      .setDescription("Retire un bot de la liste autorisée.")
      .addUserOption((option) => option.setName("bot").setDescription("Compte bot à retirer.").setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("voctime")
      .setDescription("Affiche le temps vocal d'un membre.")
      .addUserOption((option) => option.setName("membre").setDescription("Membre à consulter.")))
    .addSubcommand((subcommand) => subcommand.setName("voicetop").setDescription("Affiche le classement du temps vocal."))
    .addSubcommand((subcommand) => subcommand
      .setName("vocalreset")
      .setDescription("Réinitialise un temps vocal ou tous les temps.")
      .addBooleanOption((option) => option.setName("confirmation").setDescription("Doit être réglé sur Oui.").setRequired(true))
      .addUserOption((option) => option.setName("membre").setDescription("Membre précis, sinon tout le serveur.")))
    .addSubcommand((subcommand) => subcommand
      .setName("invitation")
      .setDescription("Génère le lien officiel pour inviter ce bot.")
      .addStringOption((option) => option.setName("serveur_id").setDescription("Serveur présélectionné, ou serveur actuel.").setMinLength(17).setMaxLength(20)))
    .addSubcommand((subcommand) => subcommand
      .setName("mixnom")
      .setDescription("Mélange les noms de deux membres pour s'amuser.")
      .addUserOption((option) => option.setName("membre_1").setDescription("Premier membre.").setRequired(true))
      .addUserOption((option) => option.setName("membre_2").setDescription("Second membre.").setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("qi")
      .setDescription("Affiche un score humoristique aléatoire, sans valeur réelle.")
      .addUserOption((option) => option.setName("membre").setDescription("Membre visé, ou toi.")))
    .addSubcommand((subcommand) => subcommand
      .setName("pendu")
      .setDescription("Lance une partie de pendu interactive dans le salon."))
    .addSubcommand((subcommand) => subcommand
      .setName("xp-ajouter")
      .setDescription("Ajoute de l'XP à un membre dans le système de niveaux.")
      .addUserOption((option) => option.setName("membre").setDescription("Membre concerné.").setRequired(true))
      .addIntegerOption((option) => option.setName("quantite").setDescription("XP à ajouter.").setMinValue(1).setMaxValue(1000000).setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("xp-reset")
      .setDescription("Réinitialise l'XP d'un membre ou de tout le serveur.")
      .addBooleanOption((option) => option.setName("confirmation").setDescription("Doit être réglé sur Oui.").setRequired(true))
      .addUserOption((option) => option.setName("membre").setDescription("Membre précis, sinon tous.")))
    .addSubcommand((subcommand) => subcommand
      .setName("warns-effacer")
      .setDescription("Retire tous les avertissements actifs d'un membre.")
      .addUserOption((option) => option.setName("membre").setDescription("Membre concerné.").setRequired(true))
      .addBooleanOption((option) => option.setName("confirmation").setDescription("Doit être réglé sur Oui.").setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("acces-effacer")
      .setDescription("Vide une liste d'accès après confirmation.")
      .addStringOption((option) => option.setName("liste").setDescription("Liste à vider.").setRequired(true).addChoices(
        { name: "Blacklist", value: "blacklist" },
        { name: "Whitelist", value: "whitelist" },
        { name: "Responsables délégués", value: "owners" },
      ))
      .addBooleanOption((option) => option.setName("confirmation").setDescription("Doit être réglé sur Oui.").setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("antimentions")
      .setDescription("Configure la règle AutoMod native contre les mentions massives.")
      .addChannelOption((option) => option
        .setName("salon_alertes")
        .setDescription("Salon recevant les alertes AutoMod.")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(true))
      .addIntegerOption((option) => option.setName("limite").setDescription("Mentions autorisées par message.").setMinValue(1).setMaxValue(50).setRequired(true))
      .addIntegerOption((option) => option.setName("timeout_minutes").setDescription("Durée du timeout automatique.").setMinValue(1).setMaxValue(10080).setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("antiraid")
      .setDescription("Configure la protection contre les arrivées massives.")
      .addBooleanOption((option) => option.setName("actif").setDescription("État souhaité.").setRequired(true))
      .addIntegerOption((option) => option.setName("arrivees_max").setDescription("Seuil d'arrivées dans la fenêtre.").setMinValue(2).setMaxValue(100))
      .addIntegerOption((option) => option.setName("fenetre_secondes").setDescription("Fenêtre de détection.").setMinValue(5).setMaxValue(300))
      .addIntegerOption((option) => option.setName("timeout_minutes").setDescription("Timeout appliqué.").setMinValue(1).setMaxValue(10080))),

  new SlashCommandBuilder()
    .setName("crow")
    .setDescription("Regroupe les outils avancés de gestion du serveur.")
    .setDMPermission(false)
    .addSubcommand((subcommand) => subcommand
      .setName("roleinfo")
      .setDescription("Affiche les informations et membres d'un rôle.")
      .addRoleOption((option) => option.setName("role").setDescription("Rôle à examiner.").setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("saloninfo")
      .setDescription("Affiche les informations d'un salon.")
      .addChannelOption((option) => option.setName("salon").setDescription("Salon à examiner.")))
    .addSubcommand((subcommand) => subcommand
      .setName("listes")
      .setDescription("Liste les administrateurs, bots ou membres d'un rôle.")
      .addStringOption((option) => option.setName("type").setDescription("Liste demandée.").setRequired(true).addChoices(
        { name: "Administrateurs humains", value: "admins" },
        { name: "Tous les bots", value: "bots" },
        { name: "Bots administrateurs", value: "bots-admin" },
        { name: "Membres d'un rôle", value: "role" },
      ))
      .addRoleOption((option) => option.setName("role").setDescription("Requis pour le type Membres d'un rôle.")))
    .addSubcommand((subcommand) => subcommand
      .setName("massrole")
      .setDescription("Ajoute ou retire un rôle à plusieurs membres.")
      .addStringOption((option) => option.setName("action").setDescription("Action à effectuer.").setRequired(true).addChoices(
        { name: "Ajouter", value: "ajouter" },
        { name: "Retirer", value: "retirer" },
      ))
      .addRoleOption((option) => option.setName("role").setDescription("Rôle concerné.").setRequired(true))
      .addBooleanOption((option) => option.setName("confirmation").setDescription("Doit être réglé sur Oui.").setRequired(true))
      .addBooleanOption((option) => option.setName("inclure_bots").setDescription("Inclure les comptes bots.")))
    .addSubcommand((subcommand) => subcommand
      .setName("derank")
      .setDescription("Retire les rôles gérables d'un membre.")
      .addUserOption((option) => option.setName("membre").setDescription("Membre concerné.").setRequired(true))
      .addBooleanOption((option) => option.setName("confirmation").setDescription("Doit être réglé sur Oui.").setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("masquer")
      .setDescription("Masque un salon à @everyone en conservant son réglage précédent.")
      .addChannelOption((option) => option.setName("salon").setDescription("Salon, ou salon actuel.")))
    .addSubcommand((subcommand) => subcommand
      .setName("afficher")
      .setDescription("Restaure la visibilité enregistrée d'un salon.")
      .addChannelOption((option) => option.setName("salon").setDescription("Salon, ou salon actuel.")))
    .addSubcommand((subcommand) => subcommand
      .setName("emoji")
      .setDescription("Ajoute un emoji depuis une URL HTTPS.")
      .addStringOption((option) => option.setName("nom").setDescription("Nom de l'emoji.").setMinLength(2).setMaxLength(32).setRequired(true))
      .addStringOption((option) => option.setName("url").setDescription("URL HTTPS de l'image.").setMaxLength(500).setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("vocal")
      .setDescription("Applique une action aux membres de ton salon vocal.")
      .addStringOption((option) => option.setName("action").setDescription("Action à effectuer.").setRequired(true).addChoices(
        { name: "Déconnecter tout le monde", value: "deconnecter" },
        { name: "Déplacer tout le monde", value: "deplacer" },
        { name: "Rendre muet", value: "mute" },
        { name: "Réactiver le micro", value: "unmute" },
        { name: "Rendre sourd", value: "deaf" },
        { name: "Réactiver le casque", value: "undeaf" },
      ))
      .addChannelOption((option) => option
        .setName("destination")
        .setDescription("Destination requise pour Déplacer.")
        .addChannelTypes(ChannelType.GuildVoice, ChannelType.GuildStageVoice)))
    .addSubcommand((subcommand) => subcommand.setName("bans").setDescription("Liste les membres bannis du serveur."))
    .addSubcommand((subcommand) => subcommand.setName("timeouts").setDescription("Liste les membres actuellement en timeout."))
    .addSubcommand((subcommand) => subcommand
      .setName("anti-everyone")
      .setDescription("Bloque les @everyone et @here non autorisés.")
      .addBooleanOption((option) => option.setName("actif").setDescription("État souhaité.").setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("anti-token")
      .setDescription("Supprime immédiatement les messages contenant un token Discord probable.")
      .addBooleanOption((option) => option.setName("actif").setDescription("État souhaité.").setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName("fichiers")
      .setDescription("Autorise ou bloque les pièces jointes pour @everyone.")
      .addBooleanOption((option) => option.setName("bloquer").setDescription("Oui pour bloquer, Non pour restaurer.").setRequired(true))
      .addChannelOption((option) => option.setName("salon").setDescription("Salon, ou salon actuel.")))
    .addSubcommand((subcommand) => subcommand
      .setName("prefix")
      .setDescription("Ajoute un préfixe secondaire tout en gardant toujours +.")
      .addStringOption((option) => option.setName("valeur").setDescription("De 1 à 3 caractères, ou + pour réinitialiser.").setMinLength(1).setMaxLength(3).setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName("securite").setDescription("Affiche l'état détaillé des protections Crow et Protect.")),

  new SlashCommandBuilder()
    .setName("autorank")
    .setDescription("Configure l'attribution automatique de rôles.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .addSubcommand((subcommand) => subcommand
      .setName("configurer")
      .setDescription("Configure le rôle à l'arrivée et/ou à la mention du bot.")
      .addRoleOption((option) => option.setName("role_arrivee").setDescription("Rôle donné aux nouveaux membres."))
      .addRoleOption((option) => option.setName("role_mention").setDescription("Rôle donné lorsqu'un membre mentionne le bot.")))
    .addSubcommand((subcommand) => subcommand.setName("statut").setDescription("Affiche les rôles automatiques configurés."))
    .addSubcommand((subcommand) => subcommand.setName("desactiver").setDescription("Désactive tous les rôles automatiques.")),
].map((command) => command.toJSON());

module.exports = { multiBotCommands };
