const crypto = require("node:crypto");
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder,
  MessageFlags, PermissionFlagsBits: Permissions,
} = require("discord.js");
const { readBot, mutateBot, readGuild, mutateGuild } = require("../persistence/guild-store");

const operations = new Map();
const switches = new Map();
const SWITCH_LIFETIME = 2 * 60_000;

function withModmailLock(key, operation) {
  const previous = operations.get(key) || Promise.resolve();
  const task = previous.catch(() => {}).then(operation);
  operations.set(key, task);
  return task.finally(() => {
    if (operations.get(key) === task) operations.delete(key);
  });
}

async function readModmailRoute(userId) {
  return (await readBot()).modmailRoutes?.[userId] || null;
}

async function clearModmailRoute(userId, guildId, channelId) {
  await mutateBot((bot) => {
    const route = bot.modmailRoutes?.[userId];
    if (route?.guildId === guildId && (!channelId || route.channelId === channelId)) {
      delete bot.modmailRoutes[userId];
    }
  });
}

async function clearGuildModmailRoutes(guildId) {
  await mutateBot((bot) => {
    for (const [userId, route] of Object.entries(bot.modmailRoutes || {})) {
      if (route.guildId === guildId) delete bot.modmailRoutes[userId];
    }
  });
  for (const [nonce, pending] of switches) {
    if (pending.guildId === guildId) switches.delete(nonce);
  }
}

async function bindModmailThread(userId, guildId, channelId) {
  await mutateBot((bot) => {
    const route = bot.modmailRoutes?.[userId];
    if (route?.guildId === guildId) route.channelId = channelId;
  });
}

function allowedModmailOptions(config, member) {
  const options = config.options.length ? config.options : [{
    name: "Général", categoryId: config.categoryId, staffRoleId: config.staffRoleId,
  }];
  return options.filter((option) =>
    (!option.allowedRoleId || member.roles.cache.has(option.allowedRoleId)) &&
    (!option.blockedRoleId || !member.roles.cache.has(option.blockedRoleId)),
  );
}

async function accessibleModmailDestination(client, userId, guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return { error: "Le bot n'a plus accès au serveur choisi. Choisis un autre serveur avec son bouton ModMail." };
  const { modmail: config } = await readGuild(guildId);
  if (!config.enabled) return { error: `Le ModMail est désactivé sur **${guild.name}**.` };
  if (config.blockedUserIds.includes(userId)) return { error: `Tu es bloqué du ModMail de **${guild.name}**.` };
  // Fetch rather than trust a possibly stale member/role cache after a leave or a role change.
  const member = await guild.members.fetch({ user: userId, force: true }).catch(() => null);
  if (!member) return { error: `Ton appartenance à **${guild.name}** n'a pas pu être vérifiée.` };
  const options = allowedModmailOptions(config, member);
  if (!options.length) return { error: `Aucun type de demande ne t'est accessible sur **${guild.name}**.` };
  return { guild, config, member, options };
}

function modmailContactRow(guildId, label = "Contacter le staff") {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`modmail:contact:${guildId}`)
      .setLabel(label).setEmoji("📨").setStyle(ButtonStyle.Primary),
  );
}

function modmailPanelPayload(guild) {
  return {
    embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("📨 Contacter le staff")
      .setDescription(`Besoin d'aide sur **${guild.name}** ?\n\n` +
        "Clique sur le bouton, puis écris en message privé au bot. " +
        "Ta conversation sera envoyée uniquement au staff de ce serveur.\n\n" +
        "Une seule destination est sélectionnée à la fois. Pour contacter un autre serveur, " +
        "utilise son bouton et confirme le changement.")
      .setFooter({ text: `Serveur destinataire : ${guild.id}` })],
    components: [modmailContactRow(guild.id)],
    allowedMentions: { parse: [] },
  };
}

async function fetchPanelMessage(channel, messageId) {
  if (!messageId) return null;
  return channel.messages.fetch(messageId).catch((error) => {
    if (error.code === 10008) return null;
    throw error;
  });
}

async function ensureModmailPanel(guild, requestedChannel = null) {
  return withModmailLock(`panel:${guild.id}`, async () => {
    const { modmail: config } = await readGuild(guild.id);
    if (!config.enabled) return null;
    const botMember = guild.members.me || await guild.members.fetchMe();
    const usable = (channel) => channel &&
      [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type) &&
      channel.permissionsFor(guild.roles.everyone)?.has(Permissions.ViewChannel) &&
      channel.permissionsFor(botMember)?.has([
        Permissions.ViewChannel, Permissions.SendMessages, Permissions.EmbedLinks, Permissions.ReadMessageHistory,
      ]);
    let channel = requestedChannel;
    if (channel && (channel.guild.id !== guild.id || !usable(channel))) {
      throw new Error("Choisis un salon de ce serveur visible par les membres, où le bot peut lire et envoyer des embeds.");
    }
    if (!channel && config.panelChannelId) {
      channel = await guild.channels.fetch(config.panelChannelId).catch((error) => {
        if (error.code === 10003) return null;
        throw error;
      });
      if (channel && !usable(channel)) throw new Error("Le salon du panel ModMail n'est plus accessible. Utilise /modmail panel avec un autre salon.");
    }
    channel ||= guild.channels.cache.find((candidate) =>
      ["📩・contact-staff", "📨・contacter-le-staff"].includes(candidate.name) && usable(candidate),
    );
    if (!channel) {
      channel = await guild.channels.create({
        name: "📨・contacter-le-staff", type: ChannelType.GuildText,
        permissionOverwrites: [
          { id: guild.roles.everyone.id, allow: [Permissions.ViewChannel, Permissions.ReadMessageHistory],
            deny: [Permissions.SendMessages, Permissions.CreatePublicThreads, Permissions.CreatePrivateThreads] },
          { id: botMember.id, allow: [Permissions.ViewChannel, Permissions.SendMessages, Permissions.EmbedLinks, Permissions.ReadMessageHistory] },
        ],
        reason: "Panel public de contact ModMail multiserveur",
      });
    }
    const existing = config.panelChannelId === channel.id
      ? await fetchPanelMessage(channel, config.panelMessageId) : null;
    if (existing && existing.author.id !== botMember.id) throw new Error("Le message enregistré n'appartient pas au bot.");
    const message = existing
      ? await existing.edit(modmailPanelPayload(guild))
      : await channel.send(modmailPanelPayload(guild));
    await mutateGuild(guild.id, (data) => {
      data.modmail.panelChannelId = channel.id;
      data.modmail.panelMessageId = message.id;
    });
    if (config.panelMessageId && config.panelChannelId !== channel.id) {
      const oldChannel = await guild.channels.fetch(config.panelChannelId).catch(() => null);
      const oldMessage = oldChannel?.isTextBased()
        ? await oldChannel.messages.fetch(config.panelMessageId).catch(() => null) : null;
      if (oldMessage?.author.id === botMember.id) {
        await oldMessage.edit({ content: `Le panel ModMail a été déplacé vers <#${channel.id}>.`, embeds: [], components: [] }).catch(() => {});
      }
    }
    return { channel, message };
  });
}

async function handleModmailDestinationButton(interaction, onSelected) {
  if (!interaction.isButton() || !/^modmail:(contact|switch|switch-cancel):/.test(interaction.customId)) return false;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  return withModmailLock(interaction.user.id, async () => {
    const [, action, value] = interaction.customId.split(":");
    let guildId = value;
    let current = await readModmailRoute(interaction.user.id);
    if (action !== "contact") {
      const pending = switches.get(value);
      if (!pending || pending.userId !== interaction.user.id || pending.expiresAt <= Date.now() ||
          pending.previousSelectionId !== (current?.selectionId || null)) {
        await interaction.editReply("Cette confirmation a expiré ou ne t'appartient pas. Reclique sur le bouton du serveur.");
        return true;
      }
      switches.delete(value);
      if (action === "switch-cancel") {
        await interaction.editReply("Changement annulé : ta destination actuelle est conservée.");
        return true;
      }
      guildId = pending.guildId;
    }
    if (!/^\d{17,20}$/.test(guildId)) {
      await interaction.editReply("Destination ModMail invalide.");
      return true;
    }
    const destination = await accessibleModmailDestination(interaction.client, interaction.user.id, guildId);
    if (destination.error) {
      await interaction.editReply(destination.error);
      return true;
    }
    const { guild, config } = destination;
    if (action === "contact" && interaction.guildId &&
        (interaction.guildId !== guildId || config.panelChannelId !== interaction.channelId || config.panelMessageId !== interaction.message.id)) {
      await interaction.editReply("Ce panel n'est plus valide. Utilise le dernier panel ModMail de ce serveur.");
      return true;
    }
    if (action === "contact" && current && current.guildId !== guildId) {
      const nonce = crypto.randomBytes(12).toString("hex");
      switches.set(nonce, { userId: interaction.user.id, guildId, previousSelectionId: current.selectionId,
        expiresAt: Date.now() + SWITCH_LIFETIME });
      const timer = setTimeout(() => switches.delete(nonce), SWITCH_LIFETIME);
      timer.unref?.();
      const previousName = interaction.client.guilds.cache.get(current.guildId)?.name || current.guildId;
      await interaction.editReply({
        content: `Tu contactes actuellement **${previousName}**. Passer à **${guild.name}** ?\n` +
          "Les anciennes conversations seront mises en pause. Aucun message en attente ne sera transféré au nouveau serveur.",
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`modmail:switch:${nonce}`).setLabel("Changer de serveur").setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`modmail:switch-cancel:${nonce}`).setLabel("Annuler").setStyle(ButtonStyle.Secondary),
        )], allowedMentions: { parse: [] },
      });
      return true;
    }
    const activeThread = config.threads.find((thread) => thread.userId === interaction.user.id && thread.active);
    try {
      await interaction.user.send({
        content: `📨 **Serveur destinataire : ${guild.name}** (\`${guild.id}\`)\n` +
          "Écris ton message ici : seul le staff de ce serveur le recevra. " +
          "Les échanges avec les autres serveurs restent en pause jusqu'à un changement explicite de destination.\n" +
          "Si des messages attendaient un choix dans un ancien menu, renvoie-les : ils n'ont pas été transférés.",
        allowedMentions: { parse: [] },
      });
    } catch {
      await interaction.editReply("Impossible de t'envoyer un MP. Autorise les messages privés du serveur et réessaie. Ta destination précédente n'a pas changé.");
      return true;
    }
    const route = { guildId, channelId: activeThread?.channelId || null,
      selectionId: crypto.randomBytes(12).toString("hex"), selectedAt: Date.now() };
    await mutateBot((bot) => {
      bot.modmailRoutes ||= {};
      bot.modmailRoutes[interaction.user.id] = route;
    });
    onSelected(interaction.user.id);
    await interaction.editReply({ content: `✅ **${guild.name}** est maintenant ta destination ModMail. Tu peux écrire au bot en MP.`, components: [], allowedMentions: { parse: [] } });
    return true;
  });
}

module.exports = {
  accessibleModmailDestination, allowedModmailOptions, bindModmailThread,
  clearGuildModmailRoutes, clearModmailRoute, ensureModmailPanel,
  handleModmailDestinationButton, modmailContactRow, modmailPanelPayload,
  readModmailRoute, withModmailLock,
};
