const crypto = require("node:crypto");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  PermissionsBitField,
} = require("discord.js");

const pendingGuildLeaves = new Map();

function parseBotOwnerIds(value) {
  return [...new Set(
    String(value || "")
      .split(/[\s,;]+/)
      .map((id) => id.trim())
      .filter((id) => /^\d{17,20}$/.test(id)),
  )];
}

const ADDITIONAL_BOT_OWNER_IDS = Object.freeze(parseBotOwnerIds(process.env.BOT_OWNER_IDS));
const BOT_INSTALL_PERMISSIONS = new PermissionsBitField([
  PermissionFlagsBits.ViewAuditLog,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.Connect,
  PermissionFlagsBits.Speak,
  PermissionFlagsBits.MuteMembers,
  PermissionFlagsBits.DeafenMembers,
  PermissionFlagsBits.MoveMembers,
]).bitfield;

function normalizeGuildId(value) {
  const guildId = String(value || "").trim();
  return /^\d{17,20}$/.test(guildId) ? guildId : null;
}

function buildBotInviteUrl(clientId, guildId) {
  const normalizedClientId = normalizeGuildId(clientId);
  const normalizedGuildId = normalizeGuildId(guildId);
  if (!normalizedClientId || !normalizedGuildId) {
    throw new Error("L'identifiant du bot et celui du serveur doivent contenir 17 à 20 chiffres.");
  }
  const parameters = new URLSearchParams({
    client_id: normalizedClientId,
    permissions: BOT_INSTALL_PERMISSIONS.toString(),
    scope: "bot applications.commands",
    guild_id: normalizedGuildId,
    disable_guild_select: "true",
  });
  return `https://discord.com/oauth2/authorize?${parameters.toString()}`;
}

async function applicationOwnerId(client) {
  const application = await client.application.fetch();
  return application.owner?.ownerId || application.owner?.id || null;
}

async function isApplicationOwner(client, userId) {
  return (await applicationOwnerId(client)) === userId;
}

async function isBotOwner(client, userId) {
  return (
    ADDITIONAL_BOT_OWNER_IDS.includes(String(userId)) ||
    (await isApplicationOwner(client, userId))
  );
}

function leaveConfirmationPayload(nonce, guild) {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("Faire quitter le bot ?")
        .setDescription(
          `Le bot va quitter **${guild.name}** (\`${guild.id}\`). Les données locales du serveur ne seront pas supprimées.`,
        )
        .setFooter({ text: "Confirmation valable pendant 2 minutes" }),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`guild-access:leave:confirm:${nonce}`)
          .setLabel("Quitter le serveur")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`guild-access:leave:cancel:${nonce}`)
          .setLabel("Annuler")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
    flags: MessageFlags.Ephemeral,
  };
}

async function handleJoinCommand(interaction) {
  if (interaction.options.getSubcommand?.(false) === "voc") {
    await require("./bot-voice").handleJoinVoice(interaction);
    return;
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: "Tu dois avoir la permission Gérer le serveur pour générer cette invitation.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const guildId = normalizeGuildId(interaction.options.getString("serveur_id", true));
  if (!guildId) {
    await interaction.reply({
      content: "L'identifiant du serveur doit contenir entre 17 et 20 chiffres.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const inviteUrl = buildBotInviteUrl(interaction.client.user.id, guildId);
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("Inviter le bot sur un serveur")
        .setDescription(
          `Discord exige une autorisation humaine : clique sur le bouton puis valide l'ajout au serveur \`${guildId}\`.`,
        )
        .addFields({
          name: "Après l'ajout",
          value: "Le bot enregistrera automatiquement ses commandes slash dans le nouveau serveur.",
        })
        .setTimestamp(),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("Inviter le bot")
          .setStyle(ButtonStyle.Link)
          .setURL(inviteUrl),
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleLeaveCommand(interaction) {
  if (!(await isBotOwner(interaction.client, interaction.user.id))) {
    await interaction.reply({
      content: "Cette commande est réservée aux propriétaires du bot.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const guildId = normalizeGuildId(interaction.options.getString("serveur_id", true));
  const targetGuild = guildId ? interaction.client.guilds.cache.get(guildId) : null;
  if (!targetGuild) {
    await interaction.reply({
      content: "Le bot n'est pas présent sur ce serveur, ou l'identifiant est invalide.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const nonce = crypto.randomBytes(8).toString("hex");
  pendingGuildLeaves.set(nonce, {
    guildId,
    requestedBy: interaction.user.id,
    expiresAt: Date.now() + 2 * 60_000,
  });
  const timeout = setTimeout(() => pendingGuildLeaves.delete(nonce), 2 * 60_000);
  timeout.unref?.();
  await interaction.reply(leaveConfirmationPayload(nonce, targetGuild));
}

async function handleGuildAccessButton(interaction) {
  if (!interaction.customId?.startsWith("guild-access:leave:")) {
    return false;
  }
  const [, , action, nonce] = interaction.customId.split(":");
  const pending = pendingGuildLeaves.get(nonce);
  if (
    !pending ||
    pending.expiresAt < Date.now() ||
    pending.requestedBy !== interaction.user.id
  ) {
    await interaction.reply({
      content: "Cette confirmation a expiré ou ne t'appartient pas.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  pendingGuildLeaves.delete(nonce);
  if (action === "cancel") {
    await interaction.update({ content: "Départ annulé.", embeds: [], components: [] });
    return true;
  }
  if (action !== "confirm") {
    await interaction.reply({
      content: "Action de confirmation invalide.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  if (!(await isBotOwner(interaction.client, interaction.user.id))) {
    await interaction.update({
      content: "Tu n'es plus autorisé à effectuer cette action.",
      embeds: [],
      components: [],
    });
    return true;
  }
  const targetGuild = interaction.client.guilds.cache.get(pending.guildId);
  if (!targetGuild) {
    await interaction.update({
      content: "Le bot n'est plus présent sur ce serveur.",
      embeds: [],
      components: [],
    });
    return true;
  }
  await interaction.update({
    content: `Départ de **${targetGuild.name}** (\`${targetGuild.id}\`) confirmé.`,
    embeds: [],
    components: [],
  });
  await targetGuild.leave();
  console.log(`Le bot a quitté ${targetGuild.name} (${targetGuild.id}) sur demande du propriétaire.`);
  return true;
}

module.exports = {
  ADDITIONAL_BOT_OWNER_IDS,
  BOT_INSTALL_PERMISSIONS,
  applicationOwnerId,
  buildBotInviteUrl,
  handleGuildAccessButton,
  handleJoinCommand,
  handleLeaveCommand,
  isApplicationOwner,
  isBotOwner,
  leaveConfirmationPayload,
  normalizeGuildId,
  parseBotOwnerIds,
};
