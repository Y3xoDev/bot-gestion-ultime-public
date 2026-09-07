const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { TYPES, MIN_INTERVAL, MAX_COUNTERS } = require("../modules/statistics-config");
const typeOption = (o) => o.setName("type").setDescription("Valeur à afficher.")
  .addChoices(...Object.entries(TYPES).map(([value, name]) => ({ name, value })))
  .setRequired(true);
const templateOption = (o) => o.setName("nom").setDescription("Nom et emojis libres ; variables : {compteur}, {serveur}, {nom_role}.")
  .setMinLength(1).setMaxLength(100).setRequired(true);
const idOption = (o) => o.setName("id").setDescription("Identifiant du compteur affiché dans le panneau.").setRequired(true);
const command = new SlashCommandBuilder().setName("statistiques")
  .setDescription("Crée et personnalise des salons vocaux de statistiques verrouillés.")
  .setDMPermission(false).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
for (const [name, description] of [
  ["configurer", "Ouvre le panneau interactif de personnalisation."],
  ["setup", "Installe les salons par défaut ou répare les salons manquants, sans doublons."],
  ["actualiser", "Demande une mise à jour, dans les limites de renommage."],
  ["activer", "Reprend les mises à jour automatiques."],
  ["desactiver", "Met les mises à jour en pause sans supprimer les salons."],
  ["supprimer", "Demande confirmation avant de supprimer les salons du système."],
]) command.addSubcommand(s => s.setName(name).setDescription(description));
command.addSubcommand(s => s.setName("ajouter").setDescription("Ajoute un compteur ou une ligne de texte personnalisée.")
  .addStringOption(typeOption).addStringOption(templateOption)
  .addRoleOption(o => o.setName("role").setDescription("Rôle compté, obligatoire pour le type role."))
  .addIntegerOption(o => o.setName("position").setDescription("Ordre du compteur.").setMinValue(1).setMaxValue(MAX_COUNTERS)));
command.addSubcommand(s => s.setName("modifier").setDescription("Change le nom, les emojis, le rôle compté ou l'ordre d'un compteur.")
  .addStringOption(idOption).addStringOption(templateOption)
  .addRoleOption(o => o.setName("role").setDescription("Nouveau rôle à compter."))
  .addIntegerOption(o => o.setName("position").setDescription("Nouvelle position.").setMinValue(1).setMaxValue(MAX_COUNTERS)));
command.addSubcommand(s => s.setName("retirer").setDescription("Demande confirmation avant de supprimer un compteur et son salon.")
  .addStringOption(idOption));
command.addSubcommand(s => s.setName("options").setDescription("Personnalise la catégorie, la visibilité et l'actualisation.")
  .addStringOption(o => o.setName("categorie").setDescription("Nom de la catégorie, emojis inclus.").setMinLength(1).setMaxLength(100))
  .addIntegerOption(o => o.setName("intervalle").setDescription("Fréquence en minutes, entre 10 et 60.").setMinValue(MIN_INTERVAL).setMaxValue(60))
  .addIntegerOption(o => o.setName("position").setDescription("Position de la catégorie, 0 = tout en haut.").setMinValue(0).setMaxValue(499))
  .addRoleOption(o => o.setName("visible_role").setDescription("Seuls ce rôle et les administrateurs voient les statistiques."))
  .addBooleanOption(o => o.setName("public").setDescription("Oui : visible par tous, retire la restriction de rôle."))
  .addStringOption(o => o.setName("couleur").setDescription("Couleur hexadécimale du panneau, exemple : 5865F2.").setMaxLength(7)));

module.exports = { statisticsCommands: [command.toJSON()] };
