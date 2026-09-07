const crypto = require("node:crypto");
const {
  ActionRowBuilder,
  AttachmentBuilder,
  AuditLogEvent,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
} = require("discord.js");
const { mutateGuild, readGuild } = require("../persistence/guild-store");

const recentJoins = new Map();
const logConfigurationCache = new Map();
const logQueues = new Map();
const logQueueDepths = new Map();
const pendingLogDeletions = new Map();
const LOG_CACHE_TTL = 10_000;
const MAX_QUEUED_LOGS_PER_GUILD = 250;
const LOG_DEFINITIONS = [
  { key: "bans", name: "🔨・logs-bannissements", legacyName: "logs-bannissements" },
  { key: "mutes", name: "🔇・logs-mutes", legacyName: "logs-mutes" },
  { key: "kicks", name: "🚪・logs-expulsions", legacyName: "logs-expulsions" },
  { key: "warns", name: "⚠️・logs-warns", legacyName: "logs-warns" },
  { key: "antiraid", name: "🛡️・logs-anti-raid", legacyName: "logs-anti-raid" },
  { key: "roles", name: "🎭・logs-rôles", legacyName: "logs-rôles" },
  { key: "channels", name: "🏠・logs-salons", legacyName: "logs-salons" },
  { key: "messages", name: "💬・logs-messages", legacyName: "logs-messages" },
  { key: "bots", name: "🤖・logs-bots", legacyName: "logs-bots" },
  { key: "permissions", name: "🔐・logs-permissions", legacyName: "logs-permissions" },
  { key: "voice", name: "🔊・logs-vocaux", legacyName: "logs-vocaux" },
  { key: "automod", name: "⚙️・logs-automod", legacyName: "logs-automod" },
  { key: "modmail", name: "📨・logs-modmail", legacyName: "logs-modmail" },
];

function interpolate(template, member) {
  return template
    .replaceAll("{user}", `<@${member.id}>`)
    .replaceAll("{username}", member.user.username)
    .replaceAll("{server}", member.guild.name)
    .replaceAll("{count}", String(member.guild.memberCount));
}

async function configuredChannel(guild, channelId) {
  if (!channelId) {
    return null;
  }
  const channel = guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
  return channel?.isTextBased() && !channel.isDMBased() ? channel : null;
}

function inferLogType(embed) {
  const title = embed?.data?.title?.toLowerCase() || "";
  if (/ban|débanni|blacklist/.test(title)) return "bans";
  if (/timeout|mute/.test(title)) return "mutes";
  if (/expuls|kick/.test(title)) return "kicks";
  if (/avert/.test(title)) return "warns";
  if (/raid|membre arrivé|membre parti/.test(title)) return "antiraid";
  if (/rôle/.test(title)) return "roles";
  if (/salon|ticket/.test(title)) return "channels";
  if (/modmail/.test(title)) return "modmail";
  if (/message/.test(title)) return "messages";
  if (/permission/.test(title)) return "permissions";
  if (/vocal|voix/.test(title)) return "voice";
  if (/automod/.test(title)) return "automod";
  return "bots";
}

function invalidateLogCache(guildId) {
  logConfigurationCache.delete(guildId);
}

async function cachedLogConfiguration(guildId) {
  const cached = logConfigurationCache.get(guildId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }
  const data = await readGuild(guildId);
  const value = {
    channelId: data.logs.channelId,
    channels: data.logs.channels || {},
  };
  logConfigurationCache.set(guildId, {
    value,
    expiresAt: Date.now() + LOG_CACHE_TTL,
  });
  return value;
}

async function deliverLog(guild, type, embed) {
  const config = await cachedLogConfiguration(guild.id);
  const channelId = Object.prototype.hasOwnProperty.call(config.channels, type)
    ? config.channels[type]
    : config.channelId;
  const channel = await configuredChannel(guild, channelId);
  if (channel) {
    await channel.send({ embeds: [embed] }).catch(() => {});
  }
}

async function sendLog(guild, typeOrEmbed, possibleEmbed) {
  const embed = possibleEmbed || typeOrEmbed;
  const type = possibleEmbed ? typeOrEmbed : inferLogType(embed);
  const depth = logQueueDepths.get(guild.id) || 0;
  if (depth >= MAX_QUEUED_LOGS_PER_GUILD) {
    return;
  }
  logQueueDepths.set(guild.id, depth + 1);
  const previous = logQueues.get(guild.id) || Promise.resolve();
  const task = previous
    .catch(() => {})
    .then(() => deliverLog(guild, type, embed))
    .catch((error) => console.error("Erreur d'envoi d'un journal Discord :", error.message))
    .finally(() => {
      const remaining = Math.max(0, (logQueueDepths.get(guild.id) || 1) - 1);
      if (remaining) {
        logQueueDepths.set(guild.id, remaining);
      } else {
        logQueueDepths.delete(guild.id);
      }
      if (logQueues.get(guild.id) === task) {
        logQueues.delete(guild.id);
      }
    });
  logQueues.set(guild.id, task);
}

async function installLogChannels(guild, requestedCategory, actorTag) {
  const storedData = await readGuild(guild.id);
  let category = requestedCategory;
  if (!category) {
    category = storedData.logs.categoryId
      ? await guild.channels.fetch(storedData.logs.categoryId).catch(() => null)
      : null;
    if (category?.type !== ChannelType.GuildCategory) {
      category = guild.channels.cache.find(
        (channel) =>
          channel.type === ChannelType.GuildCategory &&
          ["📋・LOGS", "📋・JOURNAUX", "logs"].includes(channel.name),
      );
    }
  }
  if (!category) {
    const staffRoles = guild.roles.cache
      .filter(
        (role) =>
          role.id !== guild.roles.everyone.id &&
          (role.permissions.has(PermissionFlagsBits.ManageGuild) ||
            role.permissions.has(PermissionFlagsBits.Administrator)),
      )
      .first(90);
    category = await guild.channels.create({
      name: "📋・LOGS",
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: guild.members.me.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.EmbedLinks,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: guild.ownerId,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        },
        ...staffRoles.map((role) => ({
          id: role.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
        })),
      ],
      reason: `Installation des journaux par ${actorTag}`,
    });
  }

  const channels = {};
  const missing = [];
  const renames = [];
  for (const definition of LOG_DEFINITIONS) {
    const storedChannelId = storedData.logs.channels?.[definition.key];
    const storedChannel = storedChannelId
      ? guild.channels.cache.get(storedChannelId) ||
        (await guild.channels.fetch(storedChannelId).catch(() => null))
      : null;
    const storedChannelInCategory =
      storedChannel?.type === ChannelType.GuildText && storedChannel.parentId === category.id
        ? storedChannel
        : null;
    const channel =
      storedChannelInCategory ||
      guild.channels.cache.find(
        (item) =>
          item.type === ChannelType.GuildText &&
          item.parentId === category.id &&
          [definition.name, definition.legacyName].includes(item.name),
      );
    if (channel) {
      channels[definition.key] = channel.id;
      if (channel.name !== definition.name) {
        renames.push({ channel, definition });
      }
    } else {
      missing.push(definition);
    }
  }
  for (let index = 0; index < renames.length; index += 4) {
    await Promise.all(
      renames.slice(index, index + 4).map(({ channel, definition }) =>
        channel.setName(definition.name, `Uniformisation des journaux par ${actorTag}`),
      ),
    );
  }
  for (let index = 0; index < missing.length; index += 4) {
    const batch = missing.slice(index, index + 4);
    const created = await Promise.all(
      batch.map((definition) =>
        guild.channels.create({
          name: definition.name,
          type: ChannelType.GuildText,
          parent: category.id,
          topic: `Journal automatique : ${definition.key}`,
          reason: `Installation des journaux par ${actorTag}`,
        }),
      ),
    );
    created.forEach((channel, offset) => {
      channels[batch[offset].key] = channel.id;
    });
  }
  await mutateGuild(guild.id, (data) => {
    data.logs.categoryId = category.id;
    data.logs.channels = channels;
  });
  invalidateLogCache(guild.id);
  return { category, channels };
}

async function managedLogCategory(guild, categoryId) {
  const storedCategory = categoryId
    ? guild.channels.cache.get(categoryId) ||
      (await guild.channels.fetch(categoryId).catch(() => null))
    : null;
  if (storedCategory?.type === ChannelType.GuildCategory) {
    return storedCategory;
  }
  return (
    guild.channels.cache.find(
      (channel) =>
        channel.type === ChannelType.GuildCategory &&
        ["📋・LOGS", "📋・JOURNAUX", "logs"].includes(channel.name),
    ) || null
  );
}

async function uninstallLogChannels(guild, actorTag) {
  const data = await readGuild(guild.id);
  const category = await managedLogCategory(guild, data.logs.categoryId);
  const configuredIds = new Set(Object.values(data.logs.channels || {}).filter(Boolean));
  if (data.logs.channelId) {
    configuredIds.add(data.logs.channelId);
  }
  const managedNames = new Set(
    LOG_DEFINITIONS.flatMap(({ name, legacyName }) => [name, legacyName]),
  );
  const channels = new Map();

  if (category) {
    for (const channel of guild.channels.cache.values()) {
      if (
        channel.type === ChannelType.GuildText &&
        channel.parentId === category.id &&
        (configuredIds.has(channel.id) || managedNames.has(channel.name))
      ) {
        channels.set(channel.id, channel);
      }
    }
    for (const channelId of configuredIds) {
      const channel =
        guild.channels.cache.get(channelId) ||
        (await guild.channels.fetch(channelId).catch(() => null));
      if (channel?.type === ChannelType.GuildText && channel.parentId === category.id) {
        channels.set(channel.id, channel);
      }
    }
  }

  const deletedIds = new Set();
  const failures = [];
  const candidates = [...channels.values()].sort(
    (left, right) => left.rawPosition - right.rawPosition,
  );
  for (let index = 0; index < candidates.length; index += 4) {
    const batch = candidates.slice(index, index + 4);
    const results = await Promise.allSettled(
      batch.map((channel) =>
        channel.delete(`Désinstallation des journaux par ${actorTag}`),
      ),
    );
    results.forEach((result, offset) => {
      const channel = batch[offset];
      if (result.status === "fulfilled") {
        deletedIds.add(channel.id);
      } else {
        failures.push({ id: channel.id, name: channel.name });
      }
    });
  }

  let categoryDeleted = false;
  if (category) {
    const hasRemainingChildren = guild.channels.cache.some(
      (channel) => channel.parentId === category.id && !deletedIds.has(channel.id),
    );
    if (!hasRemainingChildren) {
      categoryDeleted = Boolean(
        await category
          .delete(`Catégorie de journaux vide après désinstallation par ${actorTag}`)
          .then(() => true)
          .catch(() => false),
      );
    }
  }

  const failedIds = new Set(failures.map(({ id }) => id));
  await mutateGuild(guild.id, (guildData) => {
    guildData.logs.channelId = null;
    guildData.logs.channels = Object.fromEntries(
      Object.entries(guildData.logs.channels || {}).filter(([, channelId]) =>
        failedIds.has(channelId),
      ),
    );
    guildData.logs.categoryId = failures.length > 0 ? category?.id || null : null;
  });
  invalidateLogCache(guild.id);
  return {
    categoryDeleted,
    categoryKept: Boolean(category && !categoryDeleted),
    deletedCount: deletedIds.size,
    failures,
  };
}

async function uninstallLogChannel(guild, logType, actorTag) {
  const definition = LOG_DEFINITIONS.find(({ key }) => key === logType);
  if (!definition) {
    throw new Error("Type de journal inconnu.");
  }
  const data = await readGuild(guild.id);
  const category = await managedLogCategory(guild, data.logs.categoryId);
  const configuredId = data.logs.channels?.[logType];
  const configuredChannel = configuredId
    ? guild.channels.cache.get(configuredId) ||
      (await guild.channels.fetch(configuredId).catch(() => null))
    : null;
  const managedChannel =
    configuredChannel?.type === ChannelType.GuildText &&
    configuredChannel.parentId === category?.id
      ? configuredChannel
      : category
        ? guild.channels.cache.find(
            (channel) =>
              channel.type === ChannelType.GuildText &&
              channel.parentId === category.id &&
              [definition.name, definition.legacyName].includes(channel.name),
          )
        : null;
  const externalPreserved = Boolean(
    configuredChannel && (!category || configuredChannel.parentId !== category.id),
  );
  let deleted = false;
  let failure = null;
  if (managedChannel) {
    try {
      await managedChannel.delete(`Désactivation du journal ${logType} par ${actorTag}`);
      deleted = true;
    } catch (error) {
      failure = error;
    }
  }

  let categoryDeleted = false;
  if (category && !failure) {
    const hasRemainingChildren = guild.channels.cache.some(
      (channel) => channel.parentId === category.id && channel.id !== managedChannel?.id,
    );
    if (!hasRemainingChildren) {
      categoryDeleted = Boolean(
        await category
          .delete(`Catégorie de journaux vide après désactivation par ${actorTag}`)
          .then(() => true)
          .catch(() => false),
      );
    }
  }

  await mutateGuild(guild.id, (guildData) => {
    if (!failure) {
      guildData.logs.channels[logType] = null;
    }
    if (categoryDeleted) {
      guildData.logs.categoryId = null;
    }
  });
  invalidateLogCache(guild.id);
  return {
    categoryDeleted,
    deleted,
    externalPreserved,
    failure,
    name: definition.name,
  };
}

function unlogsConfirmationPayload(nonce, logType = null) {
  const definition = LOG_DEFINITIONS.find(({ key }) => key === logType);
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle(
          definition
            ? `Supprimer le salon ${definition.name} ?`
            : "Supprimer tous les salons de logs ?",
        )
        .setDescription(
          definition
            ? "Cette action désactivera ce journal et supprimera définitivement son salon géré avec son historique. Un salon externe associé manuellement sera seulement déconnecté et restera intact."
            : "Cette action supprimera définitivement les salons de logs gérés, leur historique et leur configuration. Les autres salons de la catégorie seront conservés.",
        )
        .setFooter({ text: "Confirmation valable pendant 2 minutes" }),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`unlogs:confirm:${nonce}`)
          .setLabel(definition ? "Supprimer ce salon" : "Supprimer les logs")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`unlogs:cancel:${nonce}`)
          .setLabel("Annuler")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
    flags: MessageFlags.Ephemeral,
  };
}

async function requestLogDeletion(interaction, logType = null) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.reply({
      content: "Tu dois avoir la permission Gérer les salons.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (logType && !LOG_DEFINITIONS.some(({ key }) => key === logType)) {
    await interaction.reply({
      content: "Type de journal inconnu.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const nonce = crypto.randomBytes(8).toString("hex");
  pendingLogDeletions.set(nonce, {
    guildId: interaction.guildId,
    logType,
    userId: interaction.user.id,
    expiresAt: Date.now() + 2 * 60_000,
  });
  const timeout = setTimeout(() => pendingLogDeletions.delete(nonce), 2 * 60_000);
  timeout.unref?.();
  await interaction.reply(unlogsConfirmationPayload(nonce, logType));
}

async function handleLogsDisableCommand(interaction, logType = null) {
  await requestLogDeletion(interaction, logType);
}

async function handleUnlogsCommand(interaction) {
  await requestLogDeletion(interaction);
}

async function handleUnlogsButton(interaction) {
  if (!interaction.customId?.startsWith("unlogs:")) {
    return false;
  }
  const [, action, nonce] = interaction.customId.split(":");
  const pending = pendingLogDeletions.get(nonce);
  if (
    !pending ||
    pending.expiresAt < Date.now() ||
    pending.guildId !== interaction.guildId ||
    pending.userId !== interaction.user.id
  ) {
    await interaction.reply({
      content: "Cette confirmation a expiré ou ne t'appartient pas.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  pendingLogDeletions.delete(nonce);
  if (action === "cancel") {
    await interaction.update({
      content: "Suppression des salons de logs annulée.",
      embeds: [],
      components: [],
    });
    return true;
  }
  if (action !== "confirm") {
    await interaction.update({
      content: "Action de confirmation invalide.",
      embeds: [],
      components: [],
    });
    return true;
  }
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.update({
      content: "Tu n'as plus la permission Gérer les salons.",
      embeds: [],
      components: [],
    });
    return true;
  }
  const botMember = interaction.guild.members.me || (await interaction.guild.members.fetchMe());
  if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.update({
      content: "Le bot n'a pas la permission Gérer les salons.",
      embeds: [],
      components: [],
    });
    return true;
  }

  await interaction.deferUpdate();
  if (pending.logType) {
    const result = await uninstallLogChannel(
      interaction.guild,
      pending.logType,
      interaction.user.tag,
    );
    const details = result.failure
      ? `Impossible de supprimer **${result.name}**. Sa configuration a été conservée.`
      : result.deleted
        ? `Le salon **${result.name}** et son historique ont été supprimés.`
        : result.externalPreserved
          ? `Le journal **${result.name}** est désactivé. Le salon externe configuré manuellement a été conservé.`
          : `Le journal **${result.name}** est désactivé. Aucun salon géré n'existait.`;
    await interaction.editReply({
      content: `${details}${result.categoryDeleted ? " La catégorie vide a aussi été supprimée." : ""}`,
      embeds: [],
      components: [],
    });
    return true;
  }

  const result = await uninstallLogChannels(interaction.guild, interaction.user.tag);
  const details = [
    `Salons supprimés : **${result.deletedCount}**.`,
    result.categoryDeleted
      ? "La catégorie de logs vide a aussi été supprimée."
      : result.categoryKept
        ? "La catégorie a été conservée car elle contient d'autres salons ou n'a pas pu être supprimée."
        : "Aucune catégorie de logs n'était configurée.",
  ];
  if (result.failures.length > 0) {
    details.push(
      `Échecs : ${result.failures.map(({ name }) => `\`${name}\``).join(", ")}.`,
    );
  }
  await interaction.editReply({
    content: details.join("\n"),
    embeds: [],
    components: [],
  });
  return true;
}

async function handleMemberJoin(member) {
  if (member.user.bot) {
    await sendLog(
      member.guild,
      "bots",
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("Bot ajouté")
        .setDescription(`${member.user.tag} (${member.id}) a rejoint le serveur.`)
        .setTimestamp(),
    );
    return;
  }

  const data = await readGuild(member.guild.id);

  const blacklistEntry = data.blacklist.find((entry) => entry.userId === member.id);
  if (blacklistEntry) {
    const wasBanned = member.bannable
      ? Boolean(
          await member
            .ban({
              reason: `Liste noire : ${blacklistEntry.reason || "Aucune raison précisée"}`,
            })
            .catch(() => null),
        )
      : false;
    await sendLog(
      member.guild,
      "bans",
      new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle(wasBanned ? "Membre blacklisté bloqué" : "Blacklist non appliquée")
        .setDescription(
          wasBanned
            ? `${member.user.tag} (${member.id}) a été banni automatiquement.\nRaison : ${blacklistEntry.reason || "Non précisée"}`
            : `${member.user.tag} (${member.id}) est sur la liste noire, mais le bot ne peut pas le bannir. Vérifie sa permission Bannir des membres et la hiérarchie des rôles.`,
        )
        .setTimestamp(),
    );
    return;
  }

  if (data.welcome.enabled) {
    if (data.welcome.autoRoleId) {
      const role = member.guild.roles.cache.get(data.welcome.autoRoleId);
      if (role && role.editable) {
        await member.roles.add(role, "Autorôle de bienvenue").catch(() => {});
      }
    }

    const welcomeChannel = await configuredChannel(member.guild, data.welcome.channelId);
    if (welcomeChannel) {
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL() })
        .setDescription(interpolate(data.welcome.message, member).slice(0, 4096))
        .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
        .setTimestamp();
      await welcomeChannel.send({ embeds: [embed] }).catch(() => {});
    }
  }

  await sendLog(
    member.guild,
    "antiraid",
    new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("Membre arrivé")
      .setDescription(`${member.user.tag} (${member.id}) a rejoint le serveur.`)
      .setTimestamp(),
  );

  if (!data.antiRaid.enabled || !member.moderatable) {
    return;
  }

  const now = Date.now();
  const windowStart = now - data.antiRaid.windowSeconds * 1000;
  const joins = (recentJoins.get(member.guild.id) || []).filter(
    (timestamp) => timestamp >= windowStart,
  );
  joins.push(now);
  recentJoins.set(member.guild.id, joins);

  if (joins.length > data.antiRaid.maxJoins) {
    await member
      .timeout(data.antiRaid.timeoutMinutes * 60_000, "Protection anti-raid automatique")
      .catch(() => {});
    await sendLog(
      member.guild,
      "antiraid",
      new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("Anti-raid déclenché")
        .setDescription(
          `${member} a été placé en timeout après ${joins.length} arrivées en ${data.antiRaid.windowSeconds} secondes.`,
        )
        .setTimestamp(),
    );
  }
}

async function handleMemberRemove(member) {
  if (member.user.bot) {
    await sendLog(
      member.guild,
      "bots",
      new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("Bot supprimé")
        .setDescription(`${member.user.tag} (${member.id}) a quitté le serveur.`)
        .setTimestamp(),
    );
    return;
  }
  const data = await readGuild(member.guild.id);
  const goodbyeChannel = await configuredChannel(
    member.guild,
    data.welcome.goodbyeChannelId,
  );
  if (data.welcome.enabled && goodbyeChannel) {
    await goodbyeChannel
      .send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x6f7380)
            .setDescription(`**${member.user.tag}** a quitté le serveur.`)
            .setTimestamp(),
        ],
      })
      .catch(() => {});
  }

  const kickEntry = await member.guild
    .fetchAuditLogs({ type: AuditLogEvent.MemberKick, limit: 5 })
    .then((logs) =>
      logs.entries.find(
        (entry) =>
          entry.target?.id === member.id && Date.now() - entry.createdTimestamp < 10_000,
      ),
    )
    .catch(() => null);
  await sendLog(
    member.guild,
    kickEntry ? "kicks" : "antiraid",
    new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle(kickEntry ? "Membre expulsé" : "Membre parti")
      .setDescription(
        kickEntry
          ? `${member.user.tag} (${member.id}) a été expulsé par ${kickEntry.executor || "un modérateur"}.`
          : `${member.user.tag} (${member.id}) a quitté le serveur.`,
      )
      .setTimestamp(),
  );
}

async function handleMessageDelete(message) {
  if (!message.inGuild() || message.author?.bot) {
    return;
  }
  await sendLog(
    message.guild,
    "messages",
    new EmbedBuilder()
      .setColor(0xfaa61a)
      .setTitle("Message supprimé")
      .addFields(
        {
          name: "Auteur",
          value: message.author ? `${message.author} (${message.author.id})` : "Inconnu",
        },
        { name: "Salon", value: `${message.channel}` },
        {
          name: "Contenu",
          value: message.content?.slice(0, 1024) || "*Contenu non disponible*",
        },
      )
      .setTimestamp(),
  );
}

async function handleMessageUpdate(oldMessage, newMessage) {
  if (
    !newMessage.inGuild() ||
    newMessage.author?.bot ||
    oldMessage.content === newMessage.content
  ) {
    return;
  }
  await sendLog(
    newMessage.guild,
    "messages",
    new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle("Message modifié")
      .addFields(
        {
          name: "Auteur",
          value: newMessage.author
            ? `${newMessage.author} (${newMessage.author.id})`
            : "Inconnu",
        },
        { name: "Salon", value: `${newMessage.channel}` },
        {
          name: "Avant",
          value: oldMessage.content?.slice(0, 1024) || "*Non disponible*",
        },
        {
          name: "Après",
          value: newMessage.content?.slice(0, 1024) || "*Non disponible*",
        },
      )
      .setTimestamp(),
  );
}

async function handleGuildBan(ban, added) {
  await sendLog(
    ban.guild,
    "bans",
    new EmbedBuilder()
      .setColor(added ? 0xed4245 : 0x57f287)
      .setTitle(added ? "Utilisateur banni" : "Utilisateur débanni")
      .setDescription(`${ban.user.tag} (${ban.user.id})`)
      .setTimestamp(),
  );
}

async function handleRoleCreate(role) {
  await sendLog(
    role.guild,
    "roles",
    new EmbedBuilder().setColor(0x57f287).setTitle("Rôle créé").setDescription(`${role} (${role.id})`).setTimestamp(),
  );
}

async function handleRoleDelete(role) {
  await sendLog(
    role.guild,
    "roles",
    new EmbedBuilder().setColor(0xed4245).setTitle("Rôle supprimé").setDescription(`${role.name} (${role.id})`).setTimestamp(),
  );
}

async function handleRoleUpdate(oldRole, newRole) {
  const changes = [];
  if (oldRole.name !== newRole.name) changes.push(`Nom : **${oldRole.name}** → **${newRole.name}**`);
  if (oldRole.color !== newRole.color) changes.push("Couleur modifiée.");
  if (oldRole.hoist !== newRole.hoist) changes.push(`Affichage séparé : **${newRole.hoist ? "oui" : "non"}**`);
  if (changes.length) {
    await sendLog(
      newRole.guild,
      "roles",
      new EmbedBuilder().setColor(0x3498db).setTitle("Rôle modifié").setDescription(`${newRole}\n${changes.join("\n")}`).setTimestamp(),
    );
  }
  if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
    const added = newRole.permissions.toArray().filter((permission) => !oldRole.permissions.has(permission));
    const removed = oldRole.permissions.toArray().filter((permission) => !newRole.permissions.has(permission));
    await sendLog(
      newRole.guild,
      "permissions",
      new EmbedBuilder()
        .setColor(0xfaa61a)
        .setTitle("Permissions d'un rôle modifiées")
        .setDescription(
          `${newRole}\nAjoutées : ${added.join(", ") || "aucune"}\nRetirées : ${removed.join(", ") || "aucune"}`.slice(0, 4096),
        )
        .setTimestamp(),
    );
  }
}

async function handleChannelCreate(channel) {
  if (!channel.guild) return;
  await sendLog(
    channel.guild,
    "channels",
    new EmbedBuilder().setColor(0x57f287).setTitle("Salon créé").setDescription(`${channel} (${channel.id})`).setTimestamp(),
  );
}

async function handleChannelDelete(channel) {
  if (!channel.guild) return;
  await sendLog(
    channel.guild,
    "channels",
    new EmbedBuilder().setColor(0xed4245).setTitle("Salon supprimé").setDescription(`${channel.name} (${channel.id})`).setTimestamp(),
  );
}

function overwriteSignature(channel) {
  return [...(channel.permissionOverwrites?.cache?.values() || [])]
    .map((overwrite) => `${overwrite.id}:${overwrite.allow.bitfield}:${overwrite.deny.bitfield}`)
    .sort()
    .join("|");
}

async function handleChannelUpdate(oldChannel, newChannel) {
  if (!newChannel.guild) return;
  const changes = [];
  if (oldChannel.name !== newChannel.name) changes.push(`Nom : **${oldChannel.name}** → **${newChannel.name}**`);
  if (oldChannel.parentId !== newChannel.parentId) changes.push("Catégorie modifiée.");
  if (oldChannel.topic !== newChannel.topic) changes.push("Sujet modifié.");
  if (changes.length) {
    await sendLog(
      newChannel.guild,
      "channels",
      new EmbedBuilder().setColor(0x3498db).setTitle("Salon modifié").setDescription(`${newChannel}\n${changes.join("\n")}`).setTimestamp(),
    );
  }
  if (overwriteSignature(oldChannel) !== overwriteSignature(newChannel)) {
    await sendLog(
      newChannel.guild,
      "permissions",
      new EmbedBuilder()
        .setColor(0xfaa61a)
        .setTitle("Permissions d'un salon modifiées")
        .setDescription(`${newChannel} (${newChannel.id})`)
        .setTimestamp(),
    );
  }
}

async function handleGuildMemberUpdate(oldMember, newMember) {
  if (oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp) {
    await sendLog(
      newMember.guild,
      "mutes",
      new EmbedBuilder()
        .setColor(newMember.communicationDisabledUntilTimestamp ? 0xfaa61a : 0x57f287)
        .setTitle(newMember.communicationDisabledUntilTimestamp ? "Timeout appliqué" : "Timeout retiré")
        .setDescription(
          newMember.communicationDisabledUntilTimestamp
            ? `${newMember} jusqu'à <t:${Math.floor(newMember.communicationDisabledUntilTimestamp / 1000)}:F>.`
            : `${newMember} n'est plus en timeout.`,
        )
        .setTimestamp(),
    );
  }
  const addedRoles = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id));
  const removedRoles = oldMember.roles.cache.filter((role) => !newMember.roles.cache.has(role.id));
  if (addedRoles.size || removedRoles.size) {
    await sendLog(
      newMember.guild,
      "roles",
      new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle("Rôles d'un membre modifiés")
        .setDescription(
          `${newMember}\nAjoutés : ${addedRoles.map(String).join(", ") || "aucun"}\nRetirés : ${removedRoles.map(String).join(", ") || "aucun"}`,
        )
        .setTimestamp(),
    );
  }
}

async function handleVoiceStateLog(oldState, newState) {
  if (oldState.channelId === newState.channelId && oldState.serverMute === newState.serverMute && oldState.serverDeaf === newState.serverDeaf) {
    return;
  }
  let description;
  if (!oldState.channelId && newState.channelId) {
    description = `${newState.member} a rejoint ${newState.channel}.`;
  } else if (oldState.channelId && !newState.channelId) {
    description = `${oldState.member} a quitté ${oldState.channel}.`;
  } else if (oldState.channelId !== newState.channelId) {
    description = `${newState.member} a été déplacé de ${oldState.channel} vers ${newState.channel}.`;
  } else {
    description = `${newState.member} : mute serveur **${newState.serverMute ? "oui" : "non"}**, sourdine serveur **${newState.serverDeaf ? "oui" : "non"}**.`;
  }
  await sendLog(
    newState.guild,
    "voice",
    new EmbedBuilder().setColor(0x3498db).setTitle("Activité vocale").setDescription(description).setTimestamp(),
  );
}

function ticketButtons(config = {}) {
  const choices = (config.choices?.length
    ? [...config.choices].sort((left, right) => (left.order || 999) - (right.order || 999))
    : [{ id: "general", label: "Ouvrir un ticket", emoji: "🎫" }]
  ).slice(0, 25);
  if (config.interactionType === "SelectMenu") {
    return [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
      .setCustomId("ticket:select")
      .setPlaceholder("Choisis le type de ticket")
      .addOptions(choices.map((choice) => ({
        label: choice.label.slice(0, 100), value: choice.id,
        ...(choice.description ? { description: choice.description.slice(0, 100) } : {}),
        ...(choice.emoji ? { emoji: choice.emoji } : {}),
      }))))];
  }
  const rows = [];
  for (let index = 0; index < choices.length; index += 5) {
    const row = new ActionRowBuilder();
    for (const choice of choices.slice(index, index + 5)) {
      const button = new ButtonBuilder()
        .setCustomId(`ticket:create:${choice.id}`)
        .setLabel(choice.label)
        .setStyle([1, 2, 3, 4].includes(choice.style) ? choice.style : ButtonStyle.Primary);
      if (choice.emoji) {
        try {
          button.setEmoji(choice.emoji);
        } catch {}
      }
      row.addComponents(button);
    }
    rows.push(row);
  }
  return rows;
}

async function buildTicketTranscript(channel, maximumMessages = 1000) {
  const messages = [];
  let before;

  while (messages.length < maximumMessages) {
    const limit = Math.min(100, maximumMessages - messages.length);
    const batch = await channel.messages.fetch({ limit, before });
    if (!batch.size) {
      break;
    }
    messages.push(...batch.values());
    before = batch.last().id;
    if (batch.size < limit) {
      break;
    }
  }

  messages.sort((left, right) => left.createdTimestamp - right.createdTimestamp);
  const lines = [
    `Transcript du ticket #${channel.name}`,
    `Serveur : ${channel.guild.name} (${channel.guild.id})`,
    `Salon : ${channel.name} (${channel.id})`,
    `Généré : ${new Date().toISOString()}`,
    `Messages exportés : ${messages.length}`,
    ...(messages.length >= maximumMessages ? ["[Limite atteinte : des messages plus anciens peuvent manquer.]"] : []),
    "",
  ];

  for (const message of messages) {
    const author = message.author
      ? `${message.author.tag} (${message.author.id})`
      : "Auteur inconnu";
    const content = message.content || "[message sans contenu textuel]";
    lines.push(`[${new Date(message.createdTimestamp).toISOString()}] ${author}`);
    lines.push(content);
    if (message.attachments.size) {
      lines.push(
        `Pièces jointes : ${message.attachments.map((attachment) => attachment.url).join(" | ")}`,
      );
    }
    for (const embed of message.embeds) {
      const embedText = [embed.title, embed.description].filter(Boolean).join(" — ");
      if (embedText) {
        lines.push(`[Embed] ${embedText}`);
      }
    }
    lines.push("");
  }

  let transcript = lines.join("\n");
  const maximumBytes = 7_500_000;
  if (Buffer.byteLength(transcript, "utf8") > maximumBytes) {
    const ending = Buffer.from(transcript, "utf8").subarray(-maximumBytes).toString("utf8");
    transcript = `[Transcript tronqué : seuls les messages les plus récents sont conservés.]\n\n${ending}`;
  }
  return transcript;
}

function transcriptAttachment(transcript, channel) {
  const safeName = channel.name.replace(/[^a-z0-9-_]/gi, "-").slice(0, 70) || "ticket";
  return new AttachmentBuilder(Buffer.from(transcript, "utf8"), {
    name: `transcript-${safeName}-${Date.now()}.txt`,
  });
}

async function deliverTicketTranscript(channel, ownerId, config, closedBy) {
  const result = { dm: "désactivé", staff: "non configuré" };
  let transcript;
  try {
    transcript = await buildTicketTranscript(channel);
  } catch (error) {
    return { dm: "échec", staff: "échec", error: error.message };
  }

  if (config.transcriptDmEnabled) {
    const owner = await channel.client.users.fetch(ownerId).catch(() => null);
    if (owner) {
      result.dm = await owner
        .send({
          content: `Voici le transcript de ton ticket sur **${channel.guild.name}**.`,
          files: [transcriptAttachment(transcript, channel)],
        })
        .then(() => "envoyé")
        .catch(() => "MP fermés ou envoi impossible");
    } else {
      result.dm = "utilisateur introuvable";
    }
  }
  result.incomplete = transcript.includes("[Limite atteinte :") || transcript.includes("[Transcript tronqué :");

  if (config.transcriptChannelId) {
    const logChannel =
      channel.guild.channels.cache.get(config.transcriptChannelId) ||
      (await channel.guild.channels.fetch(config.transcriptChannelId).catch(() => null));
    if (logChannel?.isTextBased() && logChannel.id !== channel.id &&
        !logChannel.permissionsFor(channel.guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel)) {
      result.staff = await logChannel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865f2)
              .setTitle("Transcript d'un ticket fermé")
              .addFields(
                { name: "Ticket", value: `${channel.name} (${channel.id})` },
                { name: "Créateur", value: `<@${ownerId}> (${ownerId})`, inline: true },
                { name: "Fermé par", value: `${closedBy} (${closedBy.id})`, inline: true },
              )
              .setTimestamp(),
          ],
          files: [transcriptAttachment(transcript, channel)],
          allowedMentions: { parse: [] },
        })
        .then(() => "envoyé")
        .catch(() => "envoi impossible");
    } else {
      result.staff = "salon introuvable, public ou identique au ticket";
    }
  }
  return result;
}

async function handleTicketButton(interaction) {
  return require("./ticket-runtime").handleTicketInteraction(interaction);
}

module.exports = {
  buildTicketTranscript,
  deliverTicketTranscript,
  LOG_DEFINITIONS,
  handleChannelCreate,
  handleChannelDelete,
  handleChannelUpdate,
  handleGuildBan,
  handleGuildMemberUpdate,
  handleLogsDisableCommand,
  handleMemberJoin,
  handleMemberRemove,
  handleMessageDelete,
  handleMessageUpdate,
  handleRoleCreate,
  handleRoleDelete,
  handleRoleUpdate,
  handleTicketButton,
  handleUnlogsButton,
  handleUnlogsCommand,
  handleVoiceStateLog,
  installLogChannels,
  invalidateLogCache,
  sendLog,
  ticketButtons,
  uninstallLogChannel,
  uninstallLogChannels,
  unlogsConfirmationPayload,
};
