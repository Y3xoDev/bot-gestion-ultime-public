const crypto = require("node:crypto");
const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
} = require("discord.js");
const { mutateGuild, readGuild } = require("../persistence/guild-store");
const { installLogChannels, sendLog, uninstallLogChannel } = require("./server-events");
const {
  accessibleModmailDestination,
  bindModmailThread, clearGuildModmailRoutes, clearModmailRoute, ensureModmailPanel,
  handleModmailDestinationButton, modmailContactRow, readModmailRoute, withModmailLock,
} = require("./modmail-routing");

const pendingSelections = new Map();
const pendingModmailSetups = new Map();
const pendingModmailUninstalls = new Map();
const maintenanceTimers = new Map();
const MODMAIL_CODE_LIFETIME_MS = 5 * 60_000;
const MODMAIL_CODE_MAX_ATTEMPTS = 5;
const AUTOMATIC_CATEGORY_NAME = "📨・MODMAIL";
const AUTOMATIC_STAFF_ROLE_NAME = "📨・Support ModMail";
const AUTOMATIC_TRANSCRIPT_CHANNEL_NAME = "📜・transcriptions-modmail";

function emptyModmailConfig() {
  return {
    enabled: false,
    panelChannelId: null,
    panelMessageId: null,
    categoryId: null,
    staffRoleId: null,
    transcriptChannelId: null,
    claimEnabled: true,
    inactivityHours: 0,
    blockedUserIds: [],
    options: [],
    threads: [],
  };
}

function generateModmailVerificationCode() {
  return String(crypto.randomInt(100_000, 1_000_000));
}

function modmailVerificationCodeHash(code, userId) {
  return crypto
    .createHash("sha256")
    .update(`${userId}:${code}`)
    .digest("hex");
}

function modmailVerificationPayload(code) {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0xfaa61a)
        .setTitle("🔐 Vérification ModMail requise")
        .setDescription(
          "Renseigne l'identifiant du serveur que tu veux configurer dans la commande de confirmation. " +
            "C'est uniquement ce serveur destinataire qui recevra l'installation du ModMail.",
        )
        .addFields(
          { name: "Code à usage unique", value: `\`${code}\`` },
          {
            name: "Commande de confirmation",
            value:
              `\`/modmail verif code:${code} serveur_id:ID_DU_SERVEUR\`\n` +
              `\`+modmail verif ${code} ID_DU_SERVEUR\``,
          },
          {
            name: "Expiration",
            value: "Cinq minutes, cinq essais maximum. Le code disparaît après sa première utilisation.",
          },
        )
        .setTimestamp(),
    ],
    allowedMentions: { parse: [] },
  };
}

function automaticModmailOptions(categoryId, staffRoleId) {
  return ["💬 Question générale", "🚨 Signalement", "🤝 Partenariat"].map((name) => ({
    name,
    categoryId,
    staffRoleId,
    allowedRoleId: null,
    blockedRoleId: null,
  }));
}

function sendModmailLog(guild, title, description, color = 0x5865f2) {
  return sendLog(
    guild,
    "modmail",
    new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(description)
      .setTimestamp(),
  );
}

function defaultOption(config) {
  return {
    name: "Général",
    categoryId: config.categoryId,
    staffRoleId: config.staffRoleId,
    allowedRoleId: null,
    blockedRoleId: null,
  };
}

function activeThreadForUser(config, userId) {
  return config.threads.find((thread) => thread.userId === userId && thread.active);
}

function threadForChannel(config, channelId) {
  return config.threads.find((thread) => thread.channelId === channelId);
}

function optionForThread(config, thread) {
  return (
    config.options.find((option) => option.name === thread.optionName) ||
    defaultOption(config)
  );
}

function staffRoleIds(config, thread) {
  return [
    ...new Set(
      [config.staffRoleId, thread.staffRoleId, optionForThread(config, thread).staffRoleId].filter(
        Boolean,
      ),
    ),
  ];
}

function isStaff(member, config, thread) {
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    staffRoleIds(config, thread).some((roleId) => member.roles.cache.has(roleId))
  );
}

function modmailButtons(config, thread) {
  const buttons = [];
  if (thread.active) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`modmail:close:${thread.userId}`)
        .setLabel("Fermer")
        .setEmoji("🔒")
        .setStyle(ButtonStyle.Danger),
    );
    if (config.claimEnabled) {
      buttons.push(
        new ButtonBuilder()
          .setCustomId(
            `modmail:${thread.claimedBy ? "unclaim" : "claim"}:${thread.userId}`,
          )
          .setLabel(thread.claimedBy ? "Libérer" : "Réclamer")
          .setEmoji(thread.claimedBy ? "🔓" : "🙋")
          .setStyle(thread.claimedBy ? ButtonStyle.Secondary : ButtonStyle.Primary),
      );
    }
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`modmail:block:${thread.userId}`)
        .setLabel("Bloquer")
        .setEmoji("🚫")
        .setStyle(ButtonStyle.Secondary),
    );
  } else {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`modmail:reopen:${thread.userId}`)
        .setLabel("Rouvrir")
        .setEmoji("🔓")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`modmail:delete:${thread.userId}`)
        .setLabel("Supprimer le salon")
        .setEmoji("🗑️")
        .setStyle(ButtonStyle.Danger),
    );
  }
  return new ActionRowBuilder().addComponents(buttons);
}

function messagePayload(message) {
  return {
    content: message.content?.trim() || "",
    attachmentUrls: [...message.attachments.values()].map((attachment) => attachment.url),
  };
}

async function relayUserMessage(channel, user, payload) {
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
    .setDescription((payload.content || "*Pièce jointe envoyée*").slice(0, 4096))
    .setFooter({ text: `Utilisateur : ${user.id}` })
    .setTimestamp();
  await channel.send({
    embeds: [embed],
    files: payload.attachmentUrls.slice(0, 10),
    allowedMentions: { parse: [] },
  });
}

async function relayStaffMessage(message, user) {
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setAuthor({
      name: `${message.member.displayName} • ${message.guild.name}`,
      iconURL: message.author.displayAvatarURL(),
    })
    .setDescription((message.content?.trim() || "*Pièce jointe envoyée*").slice(0, 4096))
    .setFooter({ text: `ModMail : ${message.guild.id} / ${message.channel.id}` })
    .setTimestamp();
  await user.send({
    embeds: [embed],
    components: [modmailContactRow(message.guild.id, "Sélectionner ce serveur")],
    files: [...message.attachments.values()].slice(0, 10).map((attachment) => attachment.url),
    allowedMentions: { parse: [] },
  });
}

function safeChannelName(user) {
  const base = user.username.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
  return `modmail-${base || "utilisateur"}-${user.id.slice(-4)}`.slice(0, 100);
}

async function createThread(client, guild, config, user, option, payload) {
  const category = guild.channels.cache.get(option.categoryId);
  const staffRole = guild.roles.cache.get(option.staffRoleId);
  if (category?.type !== ChannelType.GuildCategory || !staffRole) {
    throw new Error("La catégorie ou le rôle staff du modmail n'existe plus.");
  }
  const accessRoleIds = [...new Set([config.staffRoleId, staffRole.id].filter(Boolean))];

  const channel = await guild.channels.create({
    name: safeChannelName(user),
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `modmail-user:${user.id};option:${option.name}`.slice(0, 1024),
    permissionOverwrites: [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: guild.members.me.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ManageChannels,
        ],
      },
      ...accessRoleIds.map((roleId) => ({
        id: roleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
        ],
      })),
    ],
    reason: `Modmail ouvert par ${user.tag}`,
  });

  const thread = {
    channelId: channel.id,
    userId: user.id,
    optionName: option.name,
    staffRoleId: option.staffRoleId,
    active: true,
    claimedBy: null,
    createdAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
  };
  await mutateGuild(guild.id, (guildData) => {
    guildData.modmail.threads = guildData.modmail.threads.filter(
      (item) => item.channelId !== channel.id,
    );
    guildData.modmail.threads.push(thread);
  });
  await bindModmailThread(user.id, guild.id, channel.id);

  await channel.send({
    content: accessRoleIds.map((roleId) => `<@&${roleId}>`).join(" "),
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`📨 Nouveau modmail — ${option.name}`)
        .setDescription(`Utilisateur : ${user} (${user.tag})\nIdentifiant : \`${user.id}\``)
        .setThumbnail(user.displayAvatarURL())
        .setTimestamp(),
    ],
    components: [modmailButtons(config, thread)],
    allowedMentions: { roles: accessRoleIds },
  });
  await relayUserMessage(channel, user, payload);
  await user
    .send(
      `✅ Ton modmail **${option.name}** a été ouvert sur **${guild.name}**. Réponds directement ici pour parler avec l'équipe.`,
    )
    .catch(() => {});
  sendModmailLog(
    guild,
    "📨 Nouveau ModMail",
    `${user} (\`${user.id}\`) a ouvert ${channel} avec l'option **${option.name}**.`,
    0x57f287,
  );
  return thread;
}

function optionSelectorRow(options, nonce = "expired") {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`modmail:select:${nonce}`)
    .setPlaceholder("Choisis le sujet de ta demande")
    .addOptions(
      options.slice(0, 25).map((option, index) => ({
        label: option.name.slice(0, 100),
        value: String(index),
        description: `Ouvrir un modmail ${option.name}`.slice(0, 100),
      })),
    );
  return new ActionRowBuilder().addComponents(menu);
}

async function sendOptionSelector(message, guild, options, payload) {
  const route = await readModmailRoute(message.author.id);
  if (route?.guildId !== guild.id) return;
  const nonce = crypto.randomBytes(12).toString("hex");
  const pending = {
    guildId: guild.id, selectionId: route.selectionId, nonce,
    payloads: [payload], options: options.map((option) => option.name),
    expiresAt: Date.now() + 5 * 60_000,
  };
  const reply = await message.reply({
    content: `Choisis le type de demande pour **${guild.name}** :\n` +
      "Les messages en attente ne seront pas transférés si tu changes de serveur.",
    components: [optionSelectorRow(options, nonce)], allowedMentions: { parse: [] },
  });
  pending.messageId = reply.id;
  pendingSelections.set(message.author.id, pending);
  const timer = setTimeout(() => {
    if (pendingSelections.get(message.author.id)?.nonce === nonce) pendingSelections.delete(message.author.id);
  }, 5 * 60_000);
  timer.unref?.();
}

async function routeUserPayload(client, guild, user, payload) {
  const access = await accessibleModmailDestination(client, user.id, guild.id);
  if (access.error) return { error: access.error, guild };
  const { config, options } = access;
  const route = await readModmailRoute(user.id);
  if (route?.guildId !== guild.id) return { error: "Sélectionne ce serveur avec son bouton ModMail avant d'écrire.", guild };
  const existing = route.channelId
    ? config.threads.find((thread) => thread.channelId === route.channelId && thread.userId === user.id && thread.active)
    : activeThreadForUser(config, user.id);
  if (route.channelId && !existing) {
    await clearModmailRoute(user.id, guild.id, route.channelId);
    return { error: "La conversation sélectionnée est fermée. Reclique sur le bouton du serveur puis renvoie ton message.", guild };
  }
  if (existing) {
    if (!options.some((option) => option.name === existing.optionName)) {
      return { error: "Tu n'as plus accès au type de demande de cette conversation.", guild };
    }
    const channel =
      guild.channels.cache.get(existing.channelId) ||
      (await guild.channels.fetch(existing.channelId).catch((error) => {
        if (error.code === 10003) return null;
        throw error;
      }));
    if (channel?.isTextBased()) {
      await bindModmailThread(user.id, guild.id, existing.channelId);
      await relayUserMessage(channel, user, payload);
      await mutateGuild(guild.id, (guildData) => {
        const stored = guildData.modmail.threads.find(
          (thread) => thread.channelId === existing.channelId,
        );
        if (stored) stored.lastActivity = new Date().toISOString();
      });
      return { guild, status: "relayed" };
    }
    await mutateGuild(guild.id, (guildData) => {
      guildData.modmail.threads = guildData.modmail.threads.filter(
        (thread) => thread.channelId !== existing.channelId,
      );
    });
    await clearModmailRoute(user.id, guild.id);
    return { error: "Le salon de la conversation n'est plus accessible. Préviens le staff puis sélectionne à nouveau le serveur.", guild };
  }
  if (options.length > 1) {
    return { config, guild, options, status: "select-option" };
  }
  await createThread(client, guild, config, user, options[0], payload);
  return { guild, status: "opened" };
}

async function handleDirectMessage(client, message) {
  const route = await readModmailRoute(message.author.id);
  if (!route) {
    await message.reply({ content: "📨 Pour choisir le bon destinataire, clique sur **Contacter le staff** dans le serveur concerné, puis renvoie ton message ici.\nAucun message n'a été transmis.", allowedMentions: { parse: [] } }).catch(() => {});
    return;
  }
  if (Number.isFinite(message.createdTimestamp) && message.createdTimestamp < route.selectedAt) {
    await message.reply("Ce message a été écrit avant ton dernier choix de serveur. Il n'a pas été transmis : renvoie-le après avoir vérifié la destination.").catch(() => {});
    return;
  }
  if (message.reference?.messageId) {
    const referenced = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
    const origin = referenced?.author.id === client.user.id
      ? referenced.embeds?.map((embed) => embed.footer?.text?.match(/^ModMail : (\d+) \/ (\d+)$/)).find(Boolean) : null;
    if (!origin || origin[1] !== route.guildId || origin[2] !== route.channelId) {
      await message.reply("Cette réponse concerne une autre conversation, ou son contexte n'a pas pu être vérifié. Sélectionne le bon serveur avant de renvoyer le message.").catch(() => {});
      return;
    }
  }
  const access = await accessibleModmailDestination(client, message.author.id, route.guildId);
  if (access.error) {
    pendingSelections.delete(message.author.id);
    await message.reply({ content: `❌ ${access.error}\nAucun message n'a été transmis.`, allowedMentions: { parse: [] } }).catch(() => {});
    return;
  }
  const pendingOption = pendingSelections.get(message.author.id);
  const payload = messagePayload(message);
  if (pendingOption && pendingOption.expiresAt > Date.now() && pendingOption.selectionId === route.selectionId && pendingOption.guildId === route.guildId) {
    if (pendingOption.payloads.length >= 10) {
      await message.reply("Dix messages sont déjà en attente. Choisis le sujet de ta demande, puis renvoie ce dernier message.").catch(() => {});
      return;
    }
    pendingOption.payloads.push(payload);
    await message.react("⏳").catch(() => {});
    return;
  }
  pendingSelections.delete(message.author.id);
  try {
    const result = await routeUserPayload(
      client,
      access.guild,
      message.author,
      payload,
    );
    if (result.error) {
      await message.reply(`❌ ${result.error}`).catch(() => {});
    } else if (result.status === "relayed") {
      await message.react("✅").catch(() => {});
    } else if (result.status === "select-option") {
      await sendOptionSelector(message, result.guild, result.options, payload);
    }
  } catch (error) {
    console.error("Impossible d'acheminer le ModMail :", error.message);
    await message
      .reply("❌ Impossible d'envoyer ce ModMail. Préviens un responsable du serveur.")
      .catch(() => {});
  }
}

async function handleStaffMessage(client, message) {
  const data = await readGuild(message.guild.id);
  const config = data.modmail;
  const thread = threadForChannel(config, message.channel.id);
  if (!thread?.active || !isStaff(message.member, config, thread)) {
    return;
  }
  const route = await readModmailRoute(thread.userId);
  if (!config.enabled || config.blockedUserIds.includes(thread.userId) ||
      route?.guildId !== message.guild.id || route.channelId !== thread.channelId) {
    await message.reply({ content: "⏸️ Message non transmis : ce membre doit sélectionner cette conversation avec le bouton ModMail de ce serveur. Ses autres échanges sont en pause.", allowedMentions: { parse: [] } });
    return;
  }
  const access = await accessibleModmailDestination(client, thread.userId, message.guild.id);
  if (access.error || !access.options.some((option) => option.name === thread.optionName)) {
    await message.reply({ content: "❌ Message non transmis : le destinataire n'a plus accès à cette conversation ou son accès n'a pas pu être vérifié.", allowedMentions: { parse: [] } });
    return;
  }
  if (
    config.claimEnabled &&
    thread.claimedBy &&
    thread.claimedBy !== message.author.id &&
    !message.member.permissions.has(PermissionFlagsBits.ManageGuild)
  ) {
    await message.react("🔒").catch(() => {});
    return;
  }

  const user = await client.users.fetch(thread.userId).catch(() => null);
  if (!user) {
    await message.react("❌").catch(() => {});
    return;
  }
  await relayStaffMessage(message, user);
  await mutateGuild(message.guild.id, (guildData) => {
    const stored = guildData.modmail.threads.find(
      (item) => item.channelId === thread.channelId,
    );
    if (stored) stored.lastActivity = new Date().toISOString();
  });
  await message.react("✅").catch(() => {});
}

async function handleModmailMessage(client, message) {
  if (message.author.bot) {
    return;
  }
  if (message.guild) {
    if (!message.channel?.topic?.startsWith("modmail-user:")) {
      return;
    }
    const userId = message.channel.topic.match(/^modmail-user:(\d+);/)?.[1];
    if (userId) await withModmailLock(userId, () => handleStaffMessage(client, message));
  } else {
    await withModmailLock(message.author.id, () => handleDirectMessage(client, message));
  }
}

async function sendTranscript(channel, config, thread, closedBy) {
  if (!config.transcriptChannelId) {
    return;
  }
  const transcriptChannel = channel.guild.channels.cache.get(config.transcriptChannelId);
  if (!transcriptChannel?.isTextBased()) {
    return;
  }
  const messages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!messages) {
    return;
  }
  const lines = [...messages.values()]
    .reverse()
    .map((message) => {
      const author = message.embeds[0]?.author?.name || message.author.tag;
      const content =
        message.content || message.embeds[0]?.description || "[message sans texte]";
      const attachments = [...message.attachments.values()].map((item) => item.url).join(" ");
      return `[${message.createdAt.toISOString()}] ${author}: ${content}${attachments ? ` ${attachments}` : ""}`;
    });
  const attachment = new AttachmentBuilder(Buffer.from(lines.join("\n"), "utf8"), {
    name: `modmail-${thread.userId}-${Date.now()}.txt`,
  });
  await transcriptChannel.send({
    content: `Transcript du modmail de <@${thread.userId}> — fermé par ${closedBy}`,
    files: [attachment],
    allowedMentions: { parse: [] },
  });
}

async function closeThread(client, guild, config, thread, closedBy) {
  return withModmailLock(thread.userId, () => closeThreadUnlocked(client, guild, config, thread, closedBy));
}

async function closeThreadUnlocked(client, guild, config, thread, closedBy) {
  const fresh = await readGuild(guild.id);
  const current = threadForChannel(fresh.modmail, thread.channelId);
  if (!current?.active) return false;
  config = fresh.modmail;
  Object.assign(thread, current);
  const channel = guild.channels.cache.get(thread.channelId);
  if (!channel?.isTextBased() || !thread.active) {
    return false;
  }
  await sendTranscript(channel, config, thread, closedBy).catch(() => {});
  thread.active = false;
  thread.closedAt = new Date().toISOString();
  thread.closedBy = closedBy;
  thread.claimedBy = null;
  await mutateGuild(guild.id, (guildData) => {
    const stored = guildData.modmail.threads.find(
      (item) => item.channelId === thread.channelId,
    );
    if (stored) Object.assign(stored, thread);
  });
  await clearModmailRoute(thread.userId, guild.id, thread.channelId);
  if (pendingSelections.get(thread.userId)?.guildId === guild.id) pendingSelections.delete(thread.userId);

  for (const roleId of staffRoleIds(config, thread)) {
    await channel.permissionOverwrites.edit(roleId, { SendMessages: false }).catch(() => {});
  }
  if (!channel.name.startsWith("ferme-")) {
    await channel.setName(`ferme-${channel.name}`.slice(0, 100)).catch(() => {});
  }
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("Modmail fermé")
        .setDescription(`Fermé par ${closedBy}.`)
        .setTimestamp(),
    ],
    components: [modmailButtons(config, thread)],
  }).catch(() => {});
  const user = await client.users.fetch(thread.userId).catch(() => null);
  if (user) {
    await user.send(`🔒 Ton modmail sur **${guild.name}** a été fermé.`).catch(() => {});
  }
  sendModmailLog(
    guild,
    "🔒 ModMail fermé",
    `Conversation de <@${thread.userId}> (\`${thread.userId}\`) fermée par **${closedBy}** dans ${channel}.`,
    0xed4245,
  );
  return true;
}

function unmodmailConfirmationPayload(nonce, guild) {
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("Supprimer entièrement le ModMail ?")
        .setDescription(
          `Cette action supprimera définitivement de **${guild.name}** les conversations ModMail, ` +
            "le salon de transcriptions, le journal ModMail, les catégories devenues vides, " +
            "le rôle automatique et toute la configuration enregistrée.",
        )
        .addFields({
          name: "Éléments préservés",
          value:
            "Les autres journaux, les catégories contenant des salons non-ModMail et les rôles personnalisés seront conservés.",
        })
        .setFooter({ text: "Confirmation valable pendant 2 minutes" }),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`modmail:uninstall:confirm:${nonce}`)
          .setLabel("Supprimer le ModMail")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`modmail:uninstall:cancel:${nonce}`)
          .setLabel("Annuler")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
    flags: MessageFlags.Ephemeral,
  };
}

async function handleUnmodmailCommand(interaction) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: "Tu dois avoir la permission Gérer le serveur.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const data = await readGuild(interaction.guildId);
  const destructiveChannelIds = new Set([
    data.modmail.transcriptChannelId,
    data.logs.channels?.modmail,
    ...data.modmail.threads.map((thread) => thread.channelId),
  ]);
  if (
    destructiveChannelIds.has(interaction.channelId) ||
    interaction.channel?.topic?.startsWith("modmail-user:")
  ) {
    await interaction.reply({
      content:
        "Exécute cette commande dans un salon qui ne sera pas supprimé, par exemple un salon réservé au staff.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const nonce = crypto.randomBytes(8).toString("hex");
  pendingModmailUninstalls.set(nonce, {
    expiresAt: Date.now() + 2 * 60_000,
    guildId: interaction.guildId,
    userId: interaction.user.id,
  });
  const timeout = setTimeout(() => pendingModmailUninstalls.delete(nonce), 2 * 60_000);
  timeout.unref?.();
  await interaction.reply(unmodmailConfirmationPayload(nonce, interaction.guild));
}

async function uninstallModmail(guild, actorTag) {
  const data = await readGuild(guild.id);
  await mutateGuild(guild.id, (stored) => { stored.modmail.enabled = false; });
  await clearGuildModmailRoutes(guild.id);
  if (data.modmail.panelChannelId && data.modmail.panelMessageId) {
    const panelChannel = await guild.channels.fetch(data.modmail.panelChannelId).catch(() => null);
    const panelMessage = panelChannel?.isTextBased()
      ? await panelChannel.messages.fetch(data.modmail.panelMessageId).catch(() => null) : null;
    if (panelMessage?.author.id === guild.client.user.id) await panelMessage.delete().catch(() => {});
  }
  const categoryIds = new Set(
    [data.modmail.categoryId, ...data.modmail.options.map((option) => option.categoryId)].filter(
      Boolean,
    ),
  );
  const channelIds = new Set(
    [
      data.modmail.transcriptChannelId,
      ...data.modmail.threads.map((thread) => thread.channelId),
    ].filter(Boolean),
  );

  for (const channel of guild.channels.cache.values()) {
    if (
      channel.topic?.startsWith("modmail-user:") ||
      ([AUTOMATIC_TRANSCRIPT_CHANNEL_NAME, "transcriptions-modmail"].includes(channel.name) &&
        categoryIds.has(channel.parentId))
    ) {
      channelIds.add(channel.id);
    }
  }

  const deletedChannelIds = new Set();
  const failures = [];
  const channelCandidates = [];
  for (const channelId of channelIds) {
    const channel =
      guild.channels.cache.get(channelId) ||
      (await guild.channels.fetch(channelId).catch(() => null));
    if (channel && channel.type !== ChannelType.GuildCategory) {
      channelCandidates.push(channel);
    }
  }
  for (let index = 0; index < channelCandidates.length; index += 4) {
    const batch = channelCandidates.slice(index, index + 4);
    const results = await Promise.allSettled(
      batch.map((channel) => channel.delete(`Désinstallation du ModMail par ${actorTag}`)),
    );
    results.forEach((result, offset) => {
      const channel = batch[offset];
      if (result.status === "fulfilled") {
        deletedChannelIds.add(channel.id);
      } else {
        failures.push(`salon ${channel.name}`);
      }
    });
  }

  let deletedCategories = 0;
  let preservedCategories = 0;
  for (const categoryId of categoryIds) {
    const category =
      guild.channels.cache.get(categoryId) ||
      (await guild.channels.fetch(categoryId).catch(() => null));
    if (category?.type !== ChannelType.GuildCategory) {
      continue;
    }
    const hasRemainingChildren = guild.channels.cache.some(
      (channel) =>
        channel.parentId === category.id && !deletedChannelIds.has(channel.id),
    );
    if (hasRemainingChildren) {
      preservedCategories += 1;
      continue;
    }
    const deleted = await category
      .delete(`Désinstallation du ModMail par ${actorTag}`)
      .then(() => true)
      .catch(() => false);
    if (deleted) {
      deletedCategories += 1;
    } else {
      failures.push(`catégorie ${category.name}`);
    }
  }

  const automaticRoleNames = new Set([AUTOMATIC_STAFF_ROLE_NAME, "Support ModMail"]);
  const roleCandidates = new Map();
  const configuredRole = data.modmail.staffRoleId
    ? guild.roles.cache.get(data.modmail.staffRoleId) ||
      (await guild.roles.fetch(data.modmail.staffRoleId).catch(() => null))
    : null;
  if (configuredRole && automaticRoleNames.has(configuredRole.name)) {
    roleCandidates.set(configuredRole.id, configuredRole);
  }
  for (const role of guild.roles.cache.values()) {
    if (automaticRoleNames.has(role.name)) {
      roleCandidates.set(role.id, role);
    }
  }
  let deletedRoles = 0;
  for (const role of roleCandidates.values()) {
    const deleted = await role
      .delete(`Désinstallation du ModMail par ${actorTag}`)
      .then(() => true)
      .catch(() => false);
    if (deleted) {
      deletedRoles += 1;
    } else {
      failures.push(`rôle ${role.name}`);
    }
  }

  const logResult = await uninstallLogChannel(guild, "modmail", actorTag);
  if (logResult.failure) {
    failures.push(`journal ${logResult.name}`);
  }

  await mutateGuild(guild.id, (guildData) => {
    guildData.modmail = emptyModmailConfig();
  });
  for (const [userId, pending] of pendingSelections) {
    if (pending.guildId === guild.id) {
      pendingSelections.delete(userId);
    }
  }

  return {
    deletedCategories,
    deletedChannels: deletedChannelIds.size,
    deletedLogChannel: logResult.deleted,
    deletedRoles,
    failures,
    preservedCategories,
    preservedExternalLog: logResult.externalPreserved,
  };
}

async function handleUnmodmailButton(interaction) {
  if (!interaction.customId?.startsWith("modmail:uninstall:")) {
    return false;
  }
  const [, , action, nonce] = interaction.customId.split(":");
  const pending = pendingModmailUninstalls.get(nonce);
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
  pendingModmailUninstalls.delete(nonce);
  if (action === "cancel") {
    await interaction.update({
      content: "Suppression du ModMail annulée.",
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
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.update({
      content: "Tu n'as plus la permission Gérer le serveur.",
      embeds: [],
      components: [],
    });
    return true;
  }
  const botMember = interaction.guild.members.me || (await interaction.guild.members.fetchMe());
  const missing = botMember.permissions.missing([
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageRoles,
  ]);
  if (missing.length) {
    await interaction.update({
      content: `Permissions manquantes au bot : ${missing
        .map((permission) => `\`${permission}\``)
        .join(", ")}.`,
      embeds: [],
      components: [],
    });
    return true;
  }

  await interaction.update({
    content: "Suppression complète du ModMail en cours…",
    embeds: [],
    components: [],
  });
  const result = await uninstallModmail(interaction.guild, interaction.user.tag);
  const details = [
    `✅ ModMail supprimé de **${interaction.guild.name}**.`,
    `• Conversations et transcriptions supprimées : **${result.deletedChannels}**`,
    `• Catégories vides supprimées : **${result.deletedCategories}**`,
    `• Rôles automatiques supprimés : **${result.deletedRoles}**`,
    `• Journal ModMail supprimé : **${result.deletedLogChannel ? "oui" : "non ou externe"}**`,
    "• Configuration et demandes en attente : **effacées**",
  ];
  if (result.preservedCategories) {
    details.push(
      `• Catégories partagées conservées : **${result.preservedCategories}**`,
    );
  }
  if (result.preservedExternalLog) {
    details.push("• Le salon de journal externe a été déconnecté mais conservé.");
  }
  if (result.failures.length) {
    details.push(`⚠️ Échecs à vérifier : ${result.failures.slice(0, 8).join(", ")}.`);
  }
  await interaction.editReply({ content: details.join("\n") });
  return true;
}

async function handleModmailInteraction(interaction) {
  if (await handleModmailDestinationButton(interaction, (userId) => pendingSelections.delete(userId))) return true;
  if (await handleUnmodmailButton(interaction)) {
    return true;
  }
  if (interaction.isStringSelectMenu() && /^modmail:select(?::|$)/.test(interaction.customId)) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return withModmailLock(interaction.user.id, async () => {
      const pending = pendingSelections.get(interaction.user.id);
      const route = await readModmailRoute(interaction.user.id);
      if (!pending || pending.expiresAt <= Date.now() ||
          interaction.customId !== `modmail:select:${pending.nonce}` ||
          interaction.message.id !== pending.messageId || route?.selectionId !== pending.selectionId ||
          route.guildId !== pending.guildId) {
        await interaction.editReply("Cette sélection a expiré ou concerne une ancienne destination. Renvoie ton message après avoir choisi le bon serveur.");
        return true;
      }
      const access = await accessibleModmailDestination(interaction.client, interaction.user.id, pending.guildId);
      const index = /^\d+$/.test(interaction.values[0]) ? Number(interaction.values[0]) : -1;
      const option = access.options?.find((item) => item.name === pending.options[index]);
      if (access.error || !option) {
        pendingSelections.delete(interaction.user.id);
        await interaction.editReply(access.error || "Cette option n'est plus disponible. Renvoie ton message pour actualiser les choix.");
        return true;
      }
      pendingSelections.delete(interaction.user.id);
      // The per-user queue serializes concurrent menu clicks and incoming DMs.
      const existing = activeThreadForUser(access.config, interaction.user.id);
      if (existing) {
        for (const payload of pending.payloads) {
          const result = await routeUserPayload(interaction.client, access.guild, interaction.user, payload);
          if (result.error) throw new Error(result.error);
        }
      } else {
        const thread = await createThread(interaction.client, access.guild, access.config, interaction.user, option, pending.payloads[0]);
        const channel = access.guild.channels.cache.get(thread.channelId);
        for (const payload of pending.payloads.slice(1)) await relayUserMessage(channel, interaction.user, payload);
      }
      await interaction.message.edit({ components: [] }).catch(() => {});
      await interaction.editReply({ content: `✅ ModMail ouvert sur **${access.guild.name}**.`, allowedMentions: { parse: [] } });
      return true;
    });
  }

  if (!interaction.isButton() || !interaction.customId.startsWith("modmail:")) {
    return false;
  }
  if (!interaction.inCachedGuild()) {
    return true;
  }
  const [, action, userId] = interaction.customId.split(":");
  const data = await readGuild(interaction.guild.id);
  const config = data.modmail;
  const thread = config.threads.find(
    (item) => item.channelId === interaction.channelId && item.userId === userId,
  );
  if (!thread || !isStaff(interaction.member, config, thread)) {
    await interaction.reply({
      content: "Tu ne peux pas gérer ce modmail.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (["claim", "unclaim", "close", "block"].includes(action) && !thread.active) {
    await interaction.reply({
      content: "Ce modmail est déjà fermé.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (action === "claim") {
    if (thread.claimedBy && thread.claimedBy !== interaction.user.id) {
      await interaction.reply({
        content: `Ce modmail est déjà réclamé par <@${thread.claimedBy}>.`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    thread.claimedBy = interaction.user.id;
    await mutateGuild(interaction.guild.id, (guildData) => {
      const stored = threadForChannel(guildData.modmail, thread.channelId);
      if (stored) stored.claimedBy = thread.claimedBy;
    });
    await interaction.update({ components: [modmailButtons(config, thread)] });
    await interaction.followUp({
      content: "Tu as réclamé ce modmail.",
      flags: MessageFlags.Ephemeral,
    });
    sendModmailLog(
      interaction.guild,
      "🙋 ModMail réclamé",
      `${interaction.user} a réclamé ${interaction.channel} pour <@${userId}>.`,
    );
    return true;
  }

  if (action === "unclaim") {
    if (
      thread.claimedBy !== interaction.user.id &&
      !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)
    ) {
      await interaction.reply({
        content: "Seul le membre ayant réclamé ce modmail peut le libérer.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    thread.claimedBy = null;
    await mutateGuild(interaction.guild.id, (guildData) => {
      const stored = threadForChannel(guildData.modmail, thread.channelId);
      if (stored) stored.claimedBy = null;
    });
    await interaction.update({ components: [modmailButtons(config, thread)] });
    sendModmailLog(
      interaction.guild,
      "🔓 ModMail libéré",
      `${interaction.user} a libéré ${interaction.channel}.`,
      0xfaa61a,
    );
    return true;
  }

  if (action === "close" || action === "block") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (action === "block") {
      await mutateGuild(interaction.guild.id, (guildData) => {
        if (!guildData.modmail.blockedUserIds.includes(userId)) {
          guildData.modmail.blockedUserIds.push(userId);
        }
      });
      sendModmailLog(
        interaction.guild,
        "🚫 Utilisateur ModMail bloqué",
        `${interaction.user} a bloqué <@${userId}> (\`${userId}\`) depuis ${interaction.channel}.`,
        0xed4245,
      );
    }
    await closeThread(
      interaction.client,
      interaction.guild,
      config,
      thread,
      interaction.user.tag,
    );
    await interaction.message
      .edit({ components: [modmailButtons(config, thread)] })
      .catch(() => {});
    await interaction.editReply(action === "block" ? "Utilisateur bloqué et modmail fermé." : "Modmail fermé.");
    return true;
  }

  if (action === "reopen") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    return withModmailLock(userId, async () => {
      const { modmail: config } = await readGuild(interaction.guild.id);
      const thread = config.threads.find((item) => item.channelId === interaction.channelId && item.userId === userId);
      if (!thread || !isStaff(interaction.member, config, thread)) {
        await interaction.editReply("Cette conversation n'est plus disponible ou tu n'as plus accès à sa gestion.");
        return true;
      }
      const otherActive = activeThreadForUser(config, userId);
      if (!config.enabled || (otherActive && otherActive.channelId !== thread.channelId)) {
        await interaction.editReply("Le ModMail est désactivé ou une autre conversation de ce membre est déjà ouverte sur ce serveur.");
        return true;
      }
      if (config.blockedUserIds.includes(userId)) {
        await interaction.editReply("Débloque d'abord cet utilisateur avec `/modmail debloquer`.");
        return true;
      }
      thread.active = true;
      thread.closedAt = null;
      thread.closedBy = null;
      thread.lastActivity = new Date().toISOString();
      await mutateGuild(interaction.guild.id, (guildData) => {
        const stored = threadForChannel(guildData.modmail, thread.channelId);
        if (stored) Object.assign(stored, thread);
      });
      for (const roleId of staffRoleIds(config, thread)) {
        await interaction.channel.permissionOverwrites
          .edit(roleId, { SendMessages: true })
          .catch(() => {});
      }
      await interaction.channel
        .setName(interaction.channel.name.replace(/^ferme-/, ""))
        .catch(() => {});
      await interaction.message.edit({ components: [modmailButtons(config, thread)] }).catch(() => {});
      await interaction.editReply("ModMail rouvert. Le membre doit sélectionner ce serveur pour reprendre les échanges.");
      const user = await interaction.client.users.fetch(userId).catch(() => null);
      if (user) {
        await user.send({
          content: `🔓 Ton ModMail sur **${interaction.guild.name}** a été rouvert. Clique ci-dessous pour le sélectionner avant d'écrire.`,
          components: [modmailContactRow(interaction.guild.id)], allowedMentions: { parse: [] },
        }).catch(() => {});
      }
      sendModmailLog(
        interaction.guild,
        "🔓 ModMail rouvert",
        `${interaction.user} a rouvert ${interaction.channel} pour <@${userId}>.`,
        0x57f287,
      );
      return true;
    });
  }

  if (action === "delete") {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({
        content: "Tu dois avoir la permission Gérer les salons.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    await mutateGuild(interaction.guild.id, (guildData) => {
      guildData.modmail.threads = guildData.modmail.threads.filter(
        (item) => item.channelId !== thread.channelId,
      );
    });
    await clearModmailRoute(userId, interaction.guild.id, thread.channelId);
    await interaction.reply({
      content: "Suppression du salon…",
      flags: MessageFlags.Ephemeral,
    });
    sendModmailLog(
      interaction.guild,
      "🗑️ Salon ModMail supprimé",
      `${interaction.user} a supprimé le salon de <@${userId}> (\`${userId}\`).`,
      0xed4245,
    );
    await interaction.channel.delete(`Modmail supprimé par ${interaction.user.tag}`);
    return true;
  }
  return true;
}

async function requestCompleteModmailSetup(interaction) {
  let code;
  let codeHash;
  do {
    code = generateModmailVerificationCode();
    codeHash = modmailVerificationCodeHash(code, interaction.user.id);
  } while (pendingModmailSetups.has(codeHash));
  const pending = {
    attempts: 0,
    codeHash,
    expiresAt: Date.now() + MODMAIL_CODE_LIFETIME_MS,
    nonce: crypto.randomUUID(),
    userId: interaction.user.id,
  };
  pendingModmailSetups.set(codeHash, pending);
  const timeout = setTimeout(() => {
    if (pendingModmailSetups.get(codeHash)?.nonce === pending.nonce) {
      pendingModmailSetups.delete(codeHash);
    }
  }, MODMAIL_CODE_LIFETIME_MS);
  timeout.unref?.();

  const payload = modmailVerificationPayload(code);
  if (interaction.isPrefixCommand) {
    const delivered = await interaction.user.send(payload).then(() => true).catch(() => false);
    if (!delivered) {
      pendingModmailSetups.delete(codeHash);
      await interaction.reply({
        content:
          "Impossible de t'envoyer le code en message privé. Autorise les MP ou utilise `/modmail all`.",
      });
      return;
    }
    await interaction.reply({
      content: "🔐 Le code unique de vérification vient de t'être envoyé en message privé.",
    });
    return;
  }
  await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

async function verifyCompleteModmailSetup(interaction) {
  const code = interaction.options.getString("code", true).trim();
  const targetGuildId = interaction.options.getString("serveur_id", true).trim();
  if (!/^\d{17,20}$/.test(targetGuildId)) {
    await interaction.reply({
      content: "L'identifiant du serveur destinataire doit contenir entre 17 et 20 chiffres.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const targetGuild =
    interaction.client.guilds.cache.get(targetGuildId) ||
    (await interaction.client.guilds.fetch(targetGuildId).catch(() => null));
  if (!targetGuild) {
    await interaction.editReply({
      content:
        "Le bot n'est pas présent sur le serveur indiqué. Invite-le sur ce serveur avant de recommencer.",
    });
    return;
  }
  const targetMember =
    targetGuild.members.cache.get(interaction.user.id) ||
    (await targetGuild.members.fetch(interaction.user.id).catch(() => null));
  if (!targetMember?.permissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.editReply({
      content:
        "Tu dois être membre du serveur indiqué et y posséder la permission Gérer le serveur.",
    });
    return;
  }

  const now = Date.now();
  const userSetups = [];
  for (const [codeHash, pending] of pendingModmailSetups) {
    if (pending.expiresAt < now) {
      pendingModmailSetups.delete(codeHash);
    } else if (pending.userId === interaction.user.id) {
      userSetups.push([codeHash, pending]);
    }
  }
  if (!userSetups.length) {
    await interaction.editReply({
      content: "Tu n'as aucun code valide. Relance `/modmail all` pour en générer un.",
    });
    return;
  }
  const providedHash = modmailVerificationCodeHash(code, interaction.user.id);
  const pending = pendingModmailSetups.get(providedHash);
  if (!/^\d{6}$/.test(code) || !pending || pending.userId !== interaction.user.id) {
    let remaining = 0;
    for (const [codeHash, userPending] of userSetups) {
      userPending.attempts += 1;
      const setupRemaining = MODMAIL_CODE_MAX_ATTEMPTS - userPending.attempts;
      remaining = Math.max(remaining, setupRemaining);
      if (setupRemaining <= 0) {
        pendingModmailSetups.delete(codeHash);
      }
    }
    await interaction.editReply({
      content:
        remaining > 0
          ? `Code incorrect. Il reste **${remaining} essai(s)**.`
          : "Code invalidé après cinq essais. Relance `/modmail all`.",
    });
    return;
  }

  pendingModmailSetups.delete(providedHash);
  await setupCompleteModmail(interaction, targetGuild);
}

async function setupCompleteModmail(interaction, guild = interaction.guild) {
  const botMember = guild.members.me || (await guild.members.fetchMe());
  const requiredPermissions = [
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ];
  const missingPermissions = botMember.permissions.missing(requiredPermissions);
  if (missingPermissions.length > 0) {
    const payload = {
      content: `Permissions manquantes au bot sur **${guild.name}** : ${missingPermissions
        .map((permission) => `\`${permission}\``)
        .join(", ")}.`,
    };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
    } else {
      await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    }
    return null;
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }
  const current = await readGuild(guild.id);
  let staffRole = current.modmail.staffRoleId
    ? guild.roles.cache.get(current.modmail.staffRoleId) ||
      (await guild.roles.fetch(current.modmail.staffRoleId).catch(() => null))
    : null;
  if (!staffRole || staffRole.id === guild.roles.everyone.id || staffRole.managed) {
    staffRole = guild.roles.cache.find(
      (role) => [AUTOMATIC_STAFF_ROLE_NAME, "Support ModMail"].includes(role.name),
    );
  }
  if (!staffRole) {
    staffRole = await guild.roles.create({
      name: AUTOMATIC_STAFF_ROLE_NAME,
      colors: { primaryColor: 0x5865f2 },
      mentionable: true,
      reason: `Configuration ModMail complète par ${interaction.user.tag}`,
    });
  }

  const categoryPermissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: botMember.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ManageChannels,
      ],
    },
    {
      id: staffRole.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
  ];

  let category = current.modmail.categoryId
    ? guild.channels.cache.get(current.modmail.categoryId) ||
      (await guild.channels.fetch(current.modmail.categoryId).catch(() => null))
    : null;
  if (category?.type !== ChannelType.GuildCategory) {
    category = guild.channels.cache.find(
      (channel) =>
        channel.type === ChannelType.GuildCategory &&
        [AUTOMATIC_CATEGORY_NAME, "MODMAIL"].includes(channel.name),
    );
  }
  if (
    category &&
    !category
      .permissionsFor(botMember)
      ?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels])
  ) {
    category = null;
  }
  if (!category) {
    category = await guild.channels.create({
      name: AUTOMATIC_CATEGORY_NAME,
      type: ChannelType.GuildCategory,
      permissionOverwrites: categoryPermissionOverwrites,
      reason: `Configuration ModMail complète par ${interaction.user.tag}`,
    });
  }
  await category.permissionOverwrites.edit(botMember.id, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AttachFiles: true,
    EmbedLinks: true,
    ManageChannels: true,
  });
  await category.permissionOverwrites.edit(staffRole.id, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AttachFiles: true,
  });
  await category.permissionOverwrites.edit(guild.roles.everyone.id, {
    ViewChannel: false,
  });

  let transcriptChannel = current.modmail.transcriptChannelId
    ? guild.channels.cache.get(current.modmail.transcriptChannelId) ||
      (await guild.channels.fetch(current.modmail.transcriptChannelId).catch(() => null))
    : null;
  if (transcriptChannel?.type !== ChannelType.GuildText) {
    transcriptChannel = guild.channels.cache.find(
      (channel) =>
        channel.type === ChannelType.GuildText &&
        channel.parentId === category.id &&
        [AUTOMATIC_TRANSCRIPT_CHANNEL_NAME, "transcriptions-modmail"].includes(channel.name),
    );
  }
  if (!transcriptChannel) {
    transcriptChannel = await guild.channels.create({
      name: AUTOMATIC_TRANSCRIPT_CHANNEL_NAME,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: "Archives automatiques des conversations ModMail fermées.",
      reason: `Configuration ModMail complète par ${interaction.user.tag}`,
    });
  }

  const logSetup = await installLogChannels(guild, null, interaction.user.tag);
  await mutateGuild(guild.id, (data) => {
    data.modmail.enabled = true;
    data.modmail.categoryId = category.id;
    data.modmail.staffRoleId = staffRole.id;
    data.modmail.transcriptChannelId = transcriptChannel.id;
    data.modmail.claimEnabled = true;
    data.modmail.inactivityHours = 72;
    if (!data.modmail.options.length) {
      data.modmail.options = automaticModmailOptions(category.id, staffRole.id);
    } else {
      data.modmail.options = data.modmail.options.map((option) => ({
        ...option,
        categoryId:
          guild.channels.cache.get(option.categoryId)?.type === ChannelType.GuildCategory
            ? option.categoryId
            : category.id,
        staffRoleId:
          guild.roles.cache.get(option.staffRoleId) &&
          !guild.roles.cache.get(option.staffRoleId).managed
            ? option.staffRoleId
            : staffRole.id,
      }));
    }
  });
  const panel = await ensureModmailPanel(guild);

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("📨 ModMail complet activé")
        .setDescription(
          `Le système est installé sur **${guild.name}** (\`${guild.id}\`). Les membres choisissent ce serveur avec le bouton du panel avant d'écrire en MP.`,
        )
        .addFields(
          { name: "Catégorie privée", value: `${category}`, inline: true },
          { name: "Panel de contact", value: `<#${panel.channel.id}>`, inline: true },
          { name: "Rôle du staff", value: `${staffRole}`, inline: true },
          { name: "Transcriptions", value: `${transcriptChannel}`, inline: true },
          {
            name: "Journal ModMail",
            value: `<#${logSetup.channels.modmail}> dans **${logSetup.category.name}**`,
            inline: true,
          },
          { name: "Réclamation", value: "Activée", inline: true },
          { name: "Fermeture inactive", value: "Après 72 heures", inline: true },
          {
            name: "Dernière étape",
            value: `Attribue ${staffRole} aux membres du staff qui doivent répondre aux ModMails.`,
          },
        )
        .setTimestamp(),
    ],
    allowedMentions: { parse: [] },
  });
  sendModmailLog(
    guild,
    "⚙️ ModMail entièrement configuré",
    `Configuration automatique exécutée par ${interaction.user} (\`${interaction.user.id}\`).`,
    0x57f287,
  );
  return { category, logSetup, panel, staffRole, transcriptChannel };
}

async function handleModmailCommand(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: "Tu dois avoir la permission Gérer le serveur.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "all") {
    await requestCompleteModmailSetup(interaction);
    return;
  }

  if (subcommand === "verif") {
    await verifyCompleteModmailSetup(interaction);
    return;
  }

  if (subcommand === "panel") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const panel = await ensureModmailPanel(interaction.guild, interaction.options.getChannel("salon", true));
    await interaction.editReply(panel
      ? { content: `📨 Panel **Contacter le staff** publié dans <#${panel.channel.id}>. Chaque clic sélectionne **${interaction.guild.name}** comme destinataire.`, allowedMentions: { parse: [] } }
      : "Configure et active d'abord le ModMail avec /modmail all puis /modmail verif, ou /modmail configurer.");
    return;
  }

  if (subcommand === "configurer") {
    const category = interaction.options.getChannel("categorie", true);
    const staffRole = interaction.options.getRole("role_staff", true);
    const transcriptChannel = interaction.options.getChannel("salon_transcriptions");
    const transcriptsEnabled = interaction.options.getBoolean("transcriptions");
    const claimEnabled = interaction.options.getBoolean("reclamation");
    const closeInactive = interaction.options.getBoolean("fermeture_inactive");
    const inactivityHours = interaction.options.getInteger("heures_inactivite");
    const botMember = interaction.guild.members.me;
    const current = await readGuild(interaction.guild.id);
    if (staffRole.id === interaction.guild.roles.everyone.id) {
      await interaction.reply({
        content: "Choisis un rôle staff différent de @everyone.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (
      transcriptsEnabled === true &&
      !transcriptChannel &&
      !current.modmail.transcriptChannelId
    ) {
      await interaction.reply({
        content: "Choisis un salon de transcriptions pour activer cette fonction.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (
      !botMember?.permissions.has([
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ViewChannel,
      ])
    ) {
      await interaction.reply({
        content: "Le bot doit pouvoir gérer, voir et écrire dans les salons.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await mutateGuild(interaction.guild.id, (data) => {
      data.modmail.enabled = true;
      data.modmail.categoryId = category.id;
      data.modmail.staffRoleId = staffRole.id;
      if (transcriptChannel) data.modmail.transcriptChannelId = transcriptChannel.id;
      if (transcriptsEnabled === false) data.modmail.transcriptChannelId = null;
      if (claimEnabled !== null) data.modmail.claimEnabled = claimEnabled;
      if (closeInactive === false) data.modmail.inactivityHours = 0;
      if (closeInactive === true) data.modmail.inactivityHours = inactivityHours || 24;
    });
    const panel = await ensureModmailPanel(interaction.guild);
    await interaction.editReply({ content: `ModMail activé dans la catégorie **${category.name}** pour ${staffRole}. Panel de contact : <#${panel.channel.id}>.`, allowedMentions: { parse: [] } });
    sendModmailLog(
      interaction.guild,
      "⚙️ Configuration ModMail modifiée",
      `${interaction.user} a configuré le ModMail dans ${category} pour ${staffRole}.`,
    );
    return;
  }

  if (subcommand === "activer" || subcommand === "desactiver") {
    const data = await readGuild(interaction.guild.id);
    if (subcommand === "activer" && (!data.modmail.categoryId || !data.modmail.staffRoleId)) {
      await interaction.reply({
        content: "Utilise d'abord `/modmail configurer`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await mutateGuild(interaction.guild.id, (guildData) => {
      guildData.modmail.enabled = subcommand === "activer";
    });
    if (subcommand === "desactiver") {
      await clearGuildModmailRoutes(interaction.guild.id);
      for (const [userId, pending] of pendingSelections) {
        if (pending.guildId === interaction.guild.id) pendingSelections.delete(userId);
      }
    }
    await interaction.reply({
      content: `Modmail ${subcommand === "activer" ? "activé" : "désactivé"}.`,
      flags: MessageFlags.Ephemeral,
    });
    if (subcommand === "activer") await ensureModmailPanel(interaction.guild);
    sendModmailLog(
      interaction.guild,
      subcommand === "activer" ? "✅ ModMail activé" : "⏸️ ModMail désactivé",
      `${interaction.user} a ${subcommand === "activer" ? "activé" : "désactivé"} le ModMail et ses relais.`,
      subcommand === "activer" ? 0x57f287 : 0xfaa61a,
    );
    return;
  }

  if (subcommand === "bloquer" || subcommand === "debloquer") {
    const user = interaction.options.getUser("utilisateur", true);
    await mutateGuild(interaction.guild.id, (data) => {
      if (subcommand === "bloquer") {
        if (!data.modmail.blockedUserIds.includes(user.id)) {
          data.modmail.blockedUserIds.push(user.id);
        }
      } else {
        data.modmail.blockedUserIds = data.modmail.blockedUserIds.filter(
          (userId) => userId !== user.id,
        );
      }
    });
    await interaction.reply({
      content: `${user.tag} est maintenant ${subcommand === "bloquer" ? "bloqué du" : "débloqué pour le"} modmail.`,
      flags: MessageFlags.Ephemeral,
    });
    sendModmailLog(
      interaction.guild,
      subcommand === "bloquer"
        ? "🚫 Utilisateur ModMail bloqué"
        : "✅ Utilisateur ModMail débloqué",
      `${interaction.user} a ${subcommand === "bloquer" ? "bloqué" : "débloqué"} ${user} (\`${user.id}\`).`,
      subcommand === "bloquer" ? 0xed4245 : 0x57f287,
    );
    return;
  }

  if (subcommand === "option-ajouter") {
    const name = interaction.options.getString("nom", true).trim();
    const category = interaction.options.getChannel("categorie", true);
    const staffRole = interaction.options.getRole("role_staff", true);
    const allowedRole = interaction.options.getRole("role_autorise");
    const blockedRole = interaction.options.getRole("role_interdit");
    if (staffRole.id === interaction.guild.roles.everyone.id) {
      await interaction.reply({
        content: "Choisis un rôle staff différent de @everyone.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (allowedRole && blockedRole && allowedRole.id === blockedRole.id) {
      await interaction.reply({
        content: "Le même rôle ne peut pas être à la fois autorisé et interdit.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const current = await readGuild(interaction.guild.id);
    const replacesExisting = current.modmail.options.some(
      (option) => option.name.toLocaleLowerCase("fr") === name.toLocaleLowerCase("fr"),
    );
    if (!replacesExisting && current.modmail.options.length >= 25) {
      await interaction.reply({
        content: "Discord autorise au maximum 25 options dans ce sélecteur.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await mutateGuild(interaction.guild.id, (data) => {
      data.modmail.options = data.modmail.options.filter(
        (option) => option.name.toLocaleLowerCase("fr") !== name.toLocaleLowerCase("fr"),
      );
      data.modmail.options.push({
        name,
        categoryId: category.id,
        staffRoleId: staffRole.id,
        allowedRoleId: allowedRole?.id || null,
        blockedRoleId: blockedRole?.id || null,
      });
    });
    await interaction.reply({
      content: `Option de modmail **${name}** enregistrée.`,
      flags: MessageFlags.Ephemeral,
    });
    sendModmailLog(
      interaction.guild,
      "🧩 Option ModMail enregistrée",
      `${interaction.user} a enregistré l'option **${name}**.`,
    );
    return;
  }

  if (subcommand === "option-supprimer") {
    const name = interaction.options.getString("nom", true).trim();
    let removed = false;
    await mutateGuild(interaction.guild.id, (data) => {
      const before = data.modmail.options.length;
      data.modmail.options = data.modmail.options.filter(
        (option) => option.name.toLocaleLowerCase("fr") !== name.toLocaleLowerCase("fr"),
      );
      removed = data.modmail.options.length !== before;
    });
    await interaction.reply({
      content: removed ? `Option **${name}** supprimée.` : "Option introuvable.",
      flags: MessageFlags.Ephemeral,
    });
    if (removed) {
      sendModmailLog(
        interaction.guild,
        "🗑️ Option ModMail supprimée",
        `${interaction.user} a supprimé l'option **${name}**.`,
        0xed4245,
      );
    }
    return;
  }

  const data = await readGuild(interaction.guild.id);
  const config = data.modmail;
  const activeCount = config.threads.filter((thread) => thread.active).length;
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(config.enabled ? 0x57f287 : 0x6f7380)
        .setTitle("Configuration du modmail")
        .addFields(
          { name: "État", value: config.enabled ? "Activé" : "Désactivé", inline: true },
          { name: "Catégorie", value: config.categoryId ? `<#${config.categoryId}>` : "Non définie", inline: true },
          { name: "Panel de contact", value: config.panelChannelId ? `<#${config.panelChannelId}>` : "Non publié", inline: true },
          { name: "Rôle staff", value: config.staffRoleId ? `<@&${config.staffRoleId}>` : "Non défini", inline: true },
          { name: "Transcriptions", value: config.transcriptChannelId ? `<#${config.transcriptChannelId}>` : "Désactivées", inline: true },
          { name: "Réclamation", value: config.claimEnabled ? "Activée" : "Désactivée", inline: true },
          { name: "Fermeture inactive", value: config.inactivityHours ? `${config.inactivityHours} h` : "Désactivée", inline: true },
          { name: "Conversations actives", value: String(activeCount), inline: true },
          { name: "Options", value: config.options.length ? config.options.map((option) => `• ${option.name}`).join("\n").slice(0, 1024) : "Général" },
        ),
    ],
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
}

async function sweepInactiveModmail(client, guildId) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) return;
  const data = await readGuild(guildId);
  const config = data.modmail;
  for (const thread of config.threads.filter((item) => item.active)) {
    const channel = guild.channels.cache.get(thread.channelId) ||
      await guild.channels.fetch(thread.channelId).catch((error) => {
        if (error.code === 10003) return null;
        throw error;
      });
    if (!channel) {
      await mutateGuild(guildId, (guildData) => {
        guildData.modmail.threads = guildData.modmail.threads.filter(
          (item) => item.channelId !== thread.channelId,
        );
      });
      await clearModmailRoute(thread.userId, guildId, thread.channelId);
      continue;
    }
    if (
      config.inactivityHours > 0 &&
      Date.now() - new Date(thread.lastActivity).getTime() >= config.inactivityHours * 3_600_000
    ) {
      await closeThread(client, guild, config, thread, "inactivité automatique");
    }
  }
}

function startModmailMaintenance(client, guildId) {
  if (maintenanceTimers.has(guildId)) return;
  void sweepInactiveModmail(client, guildId).catch((error) =>
    console.error("Erreur de maintenance modmail :", error),
  );
  const timer = setInterval(() => {
    void sweepInactiveModmail(client, guildId).catch((error) =>
      console.error("Erreur de maintenance modmail :", error),
    );
  }, 10 * 60_000);
  timer.unref?.();
  maintenanceTimers.set(guildId, timer);
}

module.exports = {
  automaticModmailOptions,
  generateModmailVerificationCode,
  handleModmailCommand,
  handleModmailInteraction,
  handleModmailMessage,
  handleUnmodmailCommand,
  modmailVerificationCodeHash,
  modmailVerificationPayload,
  optionSelectorRow,
  requestCompleteModmailSetup,
  setupCompleteModmail,
  startModmailMaintenance,
  uninstallModmail,
  unmodmailConfirmationPayload,
  verifyCompleteModmailSetup,
};
