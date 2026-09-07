const {
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require("discord.js");

const growthCommands = [
  new SlashCommandBuilder()
    .setName("croissance")
    .setDescription("Configure et mesure le programme de croissance communautaire.")
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName("setup")
        .setDescription("Configure l'accueil, les invitations et le calendrier de croissance.")
        .addBooleanOption((option) =>
          option
            .setName("confirmation")
            .setDescription("Confirme la modification de l'Onboarding et la création des messages.")
            .setRequired(true),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("statut").setDescription("Affiche la configuration et les indicateurs actuels."),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("invitations").setDescription("Affiche les invitations suivies par source."),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("rapport").setDescription("Génère immédiatement le rapport de croissance."),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("activer").setDescription("Réactive les publications hebdomadaires."),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("desactiver").setDescription("Suspend le calendrier sans effacer les données."),
    ),
].map((command) => command.toJSON());

module.exports = { growthCommands };
