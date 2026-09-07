const crypto = require("node:crypto");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  GuildOnboardingPromptType,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { mutateGuild, readGuild } = require("../persistence/guild-store");
const { parseColor } = require("./interactive-panels");

const levelCooldowns = new Map();
const announcementTimers = new Map();
const pendingAnnouncementDrafts = new Map();
const ANNOUNCEMENT_DRAFT_TTL = 15 * 60_000;

function parseLocalDate(value, endOfDay = false) {
  const match = String(value || "").trim().match(
    endOfDay
      ? /^(\d{4})-(\d{2})-(\d{2})$/
      : /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/,
  );
  if (!match) return null;
  const [, year, month, day, hour = endOfDay ? "23" : "00", minute = endOfDay ? "59" : "00"] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0);
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day) ||
    date.getHours() !== Number(hour) ||
    date.getMinutes() !== Number(minute)
  ) {
    return null;
  }
  return date;
}

function levelFromXp(xp) {
  return Math.floor(Math.sqrt(Math.max(0, Number(xp) || 0) / 100));
}

function xpForLevel(level) {
  return Math.max(0, Number(level) || 0) ** 2 * 100;
}

function safeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function hasPermission(interaction, permission) {
  return interaction.memberPermissions?.has(permission) || interaction.member?.permissions?.has(permission);
}

async function ephemeral(interaction, content) {
  const payload = typeof content === "string" ? { content } : content;
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

async function handleEventCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "liste") {
    const events = await interaction.guild.scheduledEvents.fetch();
    const upcoming = [...events.values()]
      .filter((event) => event.scheduledStartTimestamp > Date.now() - 60_000)
      .sort((left, right) => left.scheduledStartTimestamp - right.scheduledStartTimestamp)
      .slice(0, 20);
    return ephemeral(interaction, {
      embeds: [new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("📅 Événements programmés")
        .setDescription(upcoming.length
          ? upcoming.map((event) => `• **${event.name}** — <t:${Math.floor(event.scheduledStartTimestamp / 1000)}:F>\n  ID : \`${event.id}\``).join("\n")
          : "Aucun événement à venir.")],
    });
  }

  if (subcommand === "annuler") {
    const eventId = interaction.options.getString("event_id", true);
    const event = await interaction.guild.scheduledEvents.fetch(eventId).catch(() => null);
    if (!event) return ephemeral(interaction, "Événement introuvable.");
    await event.delete(`Supprimé par ${interaction.user.tag}`);
    return ephemeral(interaction, `L'événement **${event.name}** a été supprimé.`);
  }

  const start = parseLocalDate(interaction.options.getString("date", true));
  if (!start || start.getTime() < Date.now() + 60_000) {
    return ephemeral(interaction, "La date doit respecter `AAAA-MM-JJ HH:mm` et être dans le futur.");
  }
  const type = interaction.options.getString("type", true);
  const channel = interaction.options.getChannel("salon");
  const duration = interaction.options.getInteger("duree_minutes") ?? 120;
  const options = {
    name: interaction.options.getString("nom", true),
    scheduledStartTime: start,
    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
    description: interaction.options.getString("description") || undefined,
    reason: `Créé par ${interaction.user.tag}`,
  };
  if (type === "externe") {
    const location = interaction.options.getString("lieu");
    if (!location) return ephemeral(interaction, "L'option `lieu` est obligatoire pour un événement externe.");
    options.entityType = GuildScheduledEventEntityType.External;
    options.entityMetadata = { location };
    options.scheduledEndTime = new Date(start.getTime() + duration * 60_000);
  } else {
    if (!channel) return ephemeral(interaction, "L'option `salon` est obligatoire pour un événement vocal ou stage.");
    if (type === "stage" && channel.type !== ChannelType.GuildStageVoice) {
      return ephemeral(interaction, "Choisis un salon Stage pour le type `stage`.");
    }
    if (type === "vocal" && channel.type !== ChannelType.GuildVoice) {
      return ephemeral(interaction, "Choisis un salon vocal classique pour le type `vocal`.");
    }
    options.entityType = type === "stage"
      ? GuildScheduledEventEntityType.StageInstance
      : GuildScheduledEventEntityType.Voice;
    options.channel = channel;
  }
  const event = await interaction.guild.scheduledEvents.create(options);
  return ephemeral(interaction, `📅 Événement **${event.name}** créé pour <t:${Math.floor(start.getTime() / 1000)}:F>.\n${event.url}`);
}

async function handleLevelsCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "activer" || subcommand === "desactiver") {
    const enabled = subcommand === "activer";
    await mutateGuild(interaction.guildId, (data) => { data.levels.enabled = enabled; });
    return ephemeral(interaction, `Le système de niveaux est maintenant **${enabled ? "activé" : "désactivé"}**.`);
  }
  if (subcommand === "configurer") {
    let error = null;
    await mutateGuild(interaction.guildId, (data) => {
      const minimum = interaction.options.getInteger("xp_min");
      const maximum = interaction.options.getInteger("xp_max");
      const cooldown = interaction.options.getInteger("cooldown");
      const ignored = interaction.options.getChannel("salon_ignore");
      const role = interaction.options.getRole("role");
      const rewardLevel = interaction.options.getInteger("niveau");
      const nextMinimum = minimum ?? data.levels.minimumXp;
      const nextMaximum = maximum ?? data.levels.maximumXp;
      if (nextMinimum > nextMaximum) {
        error = "`xp_min` ne peut pas être supérieur à `xp_max`.";
        return;
      }
      if ((role && !rewardLevel) || (!role && rewardLevel)) {
        error = "Pour une récompense, précise à la fois `role` et `niveau`.";
        return;
      }
      data.levels.minimumXp = nextMinimum;
      data.levels.maximumXp = nextMaximum;
      if (cooldown) data.levels.cooldownSeconds = cooldown;
      if (ignored) {
        const index = data.levels.ignoredChannelIds.indexOf(ignored.id);
        if (index === -1) data.levels.ignoredChannelIds.push(ignored.id);
        else data.levels.ignoredChannelIds.splice(index, 1);
      }
      if (role && rewardLevel) data.levels.roleRewards[String(rewardLevel)] = role.id;
    });
    if (error) return ephemeral(interaction, error);
  }
  const data = await readGuild(interaction.guildId);
  const rewards = Object.entries(data.levels.roleRewards)
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([level, roleId]) => `Niveau ${level} : <@&${roleId}>`)
    .join("\n") || "Aucune";
  return ephemeral(interaction, {
    embeds: [new EmbedBuilder()
      .setColor(data.levels.enabled ? 0x57f287 : 0xed4245)
      .setTitle("⭐ Configuration des niveaux")
      .addFields(
        { name: "État", value: data.levels.enabled ? "Activé" : "Désactivé", inline: true },
        { name: "Gain", value: `${data.levels.minimumXp} à ${data.levels.maximumXp} XP`, inline: true },
        { name: "Délai", value: `${data.levels.cooldownSeconds}s`, inline: true },
        { name: "Salons ignorés", value: data.levels.ignoredChannelIds.map((id) => `<#${id}>`).join(", ") || "Aucun" },
        { name: "Rôles récompenses", value: rewards.slice(0, 1024) },
      )],
  });
}

async function handleLevelMessage(message) {
  if (!message.guild || message.author.bot || message.webhookId) return false;
  if (!message.content?.trim() && message.attachments.size === 0) return false;
  const data = await readGuild(message.guildId);
  if (!data.levels.enabled || data.levels.ignoredChannelIds.includes(message.channelId)) return false;
  const key = `${message.guildId}:${message.author.id}`;
  const now = Date.now();
  if ((levelCooldowns.get(key) || 0) > now) return false;
  levelCooldowns.set(key, now + data.levels.cooldownSeconds * 1000);
  const gain = Math.floor(Math.random() * (data.levels.maximumXp - data.levels.minimumXp + 1)) + data.levels.minimumXp;
  let oldLevel;
  let newLevel;
  await mutateGuild(message.guildId, (guildData) => {
    const current = guildData.levels.members[message.author.id] || { xp: 0, messages: 0 };
    oldLevel = levelFromXp(current.xp);
    current.xp += gain;
    current.messages += 1;
    current.updatedAt = new Date().toISOString();
    newLevel = levelFromXp(current.xp);
    guildData.levels.members[message.author.id] = current;
  });
  if (newLevel > oldLevel) {
    const latest = await readGuild(message.guildId);
    const roleId = latest.levels.roleRewards[String(newLevel)];
    if (roleId && message.member) await message.member.roles.add(roleId, `Récompense niveau ${newLevel}`).catch(() => {});
    await message.channel.send({
      content: `🎉 ${message.author}, tu viens d'atteindre le **niveau ${newLevel}** !${roleId ? ` Tu reçois <@&${roleId}>.` : ""}`,
      allowedMentions: { users: [message.author.id], roles: roleId ? [roleId] : [] },
    }).catch(() => {});
  }
  return true;
}

async function handleLeaderboard(interaction) {
  const data = await readGuild(interaction.guildId);
  const page = interaction.options.getInteger("page") ?? 1;
  const ranking = Object.entries(data.levels.members)
    .sort(([, left], [, right]) => right.xp - left.xp);
  const start = (page - 1) * 10;
  const lines = ranking.slice(start, start + 10).map(([userId, stats], index) =>
    `**${start + index + 1}.** <@${userId}> — niveau **${levelFromXp(stats.xp)}**, ${stats.xp} XP`,
  );
  return interaction.reply({ embeds: [new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle(`🏆 Classement XP — page ${page}`)
    .setDescription(lines.join("\n") || "Aucun membre n'a encore gagné d'XP.")
    .setFooter({ text: `${ranking.length} profil(s) classé(s)` })] });
}

function snapshotGuild(guild) {
  const roleNames = new Map(guild.roles.cache.map((role) => [role.id, role.id === guild.id ? "@everyone" : role.name]));
  const roles = guild.roles.cache
    .filter((role) => role.id !== guild.id && !role.managed)
    .sort((left, right) => left.position - right.position)
    .map((role) => ({
      name: role.name,
      color: role.color,
      hoist: role.hoist,
      mentionable: role.mentionable,
      permissions: role.permissions.bitfield.toString(),
      position: role.position,
    }));
  const supported = new Set([
    ChannelType.GuildCategory,
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildVoice,
    ChannelType.GuildStageVoice,
    ChannelType.GuildForum,
  ]);
  const channels = guild.channels.cache
    .filter((channel) => supported.has(channel.type))
    .sort((left, right) => left.rawPosition - right.rawPosition)
    .map((channel) => ({
      name: channel.name,
      type: channel.type,
      parentName: channel.parent?.name || null,
      topic: "topic" in channel ? channel.topic : null,
      nsfw: "nsfw" in channel ? channel.nsfw : false,
      rateLimitPerUser: "rateLimitPerUser" in channel ? channel.rateLimitPerUser : 0,
      bitrate: "bitrate" in channel ? channel.bitrate : undefined,
      userLimit: "userLimit" in channel ? channel.userLimit : undefined,
      permissionOverwrites: [...channel.permissionOverwrites.cache.values()].map((overwrite) => ({
        target: overwrite.type === 0 ? roleNames.get(overwrite.id) : overwrite.id,
        type: overwrite.type,
        allow: overwrite.allow.bitfield.toString(),
        deny: overwrite.deny.bitfield.toString(),
      })).filter((overwrite) => overwrite.target),
    }));
  return { roles, channels };
}

async function restoreSnapshot(guild, snapshot, reason) {
  const roleMap = new Map([["@everyone", guild.roles.everyone]]);
  let rolesCreated = 0;
  let channelsCreated = 0;
  for (const roleData of snapshot.roles || []) {
    let role = guild.roles.cache.find((candidate) => !candidate.managed && candidate.name === roleData.name);
    if (!role) {
      role = await guild.roles.create({
        name: roleData.name,
        color: roleData.color,
        hoist: roleData.hoist,
        mentionable: roleData.mentionable,
        permissions: BigInt(roleData.permissions),
        reason,
      });
      rolesCreated += 1;
    }
    roleMap.set(roleData.name, role);
  }
  const channelMap = new Map();
  const ordered = [...(snapshot.channels || [])].sort((left, right) =>
    (left.type === ChannelType.GuildCategory ? 0 : 1) - (right.type === ChannelType.GuildCategory ? 0 : 1),
  );
  for (const channelData of ordered) {
    let channel = guild.channels.cache.find((candidate) => candidate.type === channelData.type && candidate.name === channelData.name);
    if (!channel) {
      const parent = channelData.parentName
        ? channelMap.get(`${ChannelType.GuildCategory}:${channelData.parentName}`) || guild.channels.cache.find((candidate) => candidate.type === ChannelType.GuildCategory && candidate.name === channelData.parentName)
        : null;
      const permissionOverwrites = (channelData.permissionOverwrites || []).map((overwrite) => {
        const target = overwrite.type === 0 ? roleMap.get(overwrite.target) : overwrite.target;
        return target ? { id: target.id || target, type: overwrite.type, allow: BigInt(overwrite.allow), deny: BigInt(overwrite.deny) } : null;
      }).filter(Boolean);
      const createOptions = {
        name: channelData.name,
        type: channelData.type,
        parent: parent?.id,
        permissionOverwrites,
        reason,
      };
      if ([ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum].includes(channelData.type)) {
        createOptions.topic = channelData.topic || undefined;
        createOptions.nsfw = channelData.nsfw;
      }
      if ([ChannelType.GuildText, ChannelType.GuildForum].includes(channelData.type)) {
        createOptions.rateLimitPerUser = channelData.rateLimitPerUser;
      }
      if ([ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channelData.type)) {
        createOptions.bitrate = channelData.bitrate;
        createOptions.userLimit = channelData.userLimit;
      }
      channel = await guild.channels.create(createOptions);
      channelsCreated += 1;
    }
    channelMap.set(`${channelData.type}:${channelData.name}`, channel);
  }
  return { rolesCreated, channelsCreated };
}

async function handleBackupCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const name = interaction.options.getString("nom")?.trim();
  if (subcommand === "creer") {
    const snapshot = snapshotGuild(interaction.guild);
    await mutateGuild(interaction.guildId, (data) => {
      data.backups = data.backups.filter((backup) => backup.name.toLowerCase() !== name.toLowerCase());
      data.backups.push({ name, createdAt: new Date().toISOString(), createdBy: interaction.user.id, snapshot });
      data.backups = data.backups.slice(-10);
    });
    return ephemeral(interaction, `💾 Sauvegarde **${name}** créée : ${snapshot.roles.length} rôles et ${snapshot.channels.length} salons.`);
  }
  const data = await readGuild(interaction.guildId);
  if (subcommand === "liste") {
    return ephemeral(interaction, data.backups.length
      ? data.backups.map((backup) => `• **${backup.name}** — <t:${Math.floor(new Date(backup.createdAt).getTime() / 1000)}:R>`).join("\n")
      : "Aucune sauvegarde enregistrée.");
  }
  const backup = data.backups.find((item) => item.name.toLowerCase() === name.toLowerCase());
  if (!backup) return ephemeral(interaction, "Sauvegarde introuvable.");
  if (subcommand === "supprimer") {
    await mutateGuild(interaction.guildId, (guildData) => {
      guildData.backups = guildData.backups.filter((item) => item.name.toLowerCase() !== name.toLowerCase());
    });
    return ephemeral(interaction, `La sauvegarde **${backup.name}** a été supprimée.`);
  }
  if (!interaction.options.getBoolean("confirmation", true)) {
    return ephemeral(interaction, "Restauration annulée : règle `confirmation` sur Oui pour continuer.");
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const result = await restoreSnapshot(interaction.guild, backup.snapshot, `Restauration ${backup.name} par ${interaction.user.tag}`);
  return interaction.editReply(`✅ Restauration terminée sans suppression : **${result.rolesCreated}** rôle(s) et **${result.channelsCreated}** salon(s) recréés.`);
}

function announcementPayload(data) {
  const embed = new EmbedBuilder()
    .setColor(parseColor(data.color || "5865F2"))
    .setDescription(data.text)
    .setTimestamp();
  if (data.title) embed.setTitle(data.title);
  if (data.imageUrl) embed.setImage(data.imageUrl);
  const payload = { embeds: [embed], allowedMentions: { parse: [] } };
  if (data.buttonLabel && data.buttonUrl) {
    payload.components = [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(data.buttonLabel).setURL(data.buttonUrl),
    )];
  }
  return payload;
}

function cleanupAnnouncementDrafts() {
  for (const [nonce, draft] of pendingAnnouncementDrafts) {
    if (draft.expiresAt <= Date.now()) pendingAnnouncementDrafts.delete(nonce);
  }
}

function announcementModal(nonce, text = null) {
  const input = new TextInputBuilder()
    .setCustomId("texte")
    .setLabel("Texte de l'annonce (multiligne)")
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(1)
    .setMaxLength(4000)
    .setRequired(true);
  if (typeof text === "string" && text.length >= 1 && text.length <= 4000) {
    input.setValue(text);
  }
  return new ModalBuilder()
    .setCustomId(`annonce:compose:${nonce}`)
    .setTitle("Composer l'annonce multiligne")
    .addComponents(new ActionRowBuilder().addComponents(input));
}

async function executeAnnouncement(interaction, draft, text) {
  const channel = interaction.guild.channels.cache.get(draft.channelId)
    || await interaction.guild.channels.fetch(draft.channelId).catch(() => null);
  if (!channel?.isTextBased()) return ephemeral(interaction, "Le salon d'annonce n'existe plus.");
  const actor = interaction.member;
  const bot = interaction.guild.members.me;
  const actorPermissions = channel.permissionsFor?.(actor);
  const botPermissions = channel.permissionsFor?.(bot);
  if (actorPermissions && !actorPermissions.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])) {
    return ephemeral(interaction, "Tu dois pouvoir voir et écrire dans le salon d'annonce.");
  }
  if (botPermissions && !botPermissions.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    return ephemeral(interaction, "Le bot doit pouvoir voir le salon, envoyer des messages et intégrer des liens.");
  }
  const announcement = {
    channelId: channel.id,
    text,
    title: draft.title,
    color: draft.color,
    imageUrl: draft.imageUrl,
    buttonLabel: draft.buttonLabel,
    buttonUrl: draft.buttonUrl,
    createdBy: interaction.user.id,
  };
  if (draft.subcommand === "envoyer") {
    await channel.send(announcementPayload(announcement));
    return ephemeral(interaction, `📢 Annonce envoyée dans ${channel}.`);
  }
  let stored;
  await mutateGuild(interaction.guildId, (data) => {
    stored = { ...announcement, id: data.nextAnnouncementId++, status: "pending", sendAt: new Date(Date.now() + draft.minutes * 60_000).toISOString() };
    data.announcements.push(stored);
    data.announcements = data.announcements.slice(-100);
  });
  scheduleAnnouncement(interaction.client, interaction.guildId, stored);
  return ephemeral(interaction, `⏰ Annonce **#${stored.id}** programmée pour <t:${Math.floor(new Date(stored.sendAt).getTime() / 1000)}:F>.`);
}

async function handleAnnouncementInteraction(interaction) {
  const isButton = interaction.isButton?.() && interaction.customId?.startsWith("annonce:compose:");
  const isModal = interaction.isModalSubmit?.() && interaction.customId?.startsWith("annonce:compose:");
  if (!isButton && !isModal) return false;
  const nonce = interaction.customId.slice("annonce:compose:".length);
  const draft = pendingAnnouncementDrafts.get(nonce);
  if (!draft || draft.expiresAt <= Date.now()) {
    pendingAnnouncementDrafts.delete(nonce);
    await ephemeral(interaction, "Ce formulaire d'annonce a expiré. Relance la commande `annonce`.");
    return true;
  }
  if (draft.userId !== interaction.user.id || draft.guildId !== interaction.guildId) {
    await ephemeral(interaction, "Ce formulaire d'annonce ne t'appartient pas.");
    return true;
  }
  if (isButton) {
    await interaction.showModal(announcementModal(nonce, draft.text));
    return true;
  }
  const text = interaction.fields.getTextInputValue("texte");
  if (typeof text !== "string" || text.length < 1 || text.length > 4000) {
    await ephemeral(interaction, "Le texte doit contenir entre 1 et 4 000 caractères.");
    return true;
  }
  pendingAnnouncementDrafts.delete(nonce);
  if (!hasPermission(interaction, PermissionFlagsBits.ManageMessages)) {
    await ephemeral(interaction, "Tu n'as plus la permission nécessaire pour publier cette annonce.");
    return true;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await executeAnnouncement(interaction, draft, text);
  return true;
}

async function deliverAnnouncement(client, guildId, announcement) {
  const guild = client.guilds.cache.get(guildId);
  const channel = guild?.channels.cache.get(announcement.channelId) || await guild?.channels.fetch(announcement.channelId).catch(() => null);
  if (!channel?.isTextBased()) throw new Error("Salon d'annonce introuvable.");
  await channel.send(announcementPayload(announcement));
  await mutateGuild(guildId, (data) => {
    const entry = data.announcements.find((item) => item.id === announcement.id);
    if (entry) {
      entry.status = "sent";
      entry.sentAt = new Date().toISOString();
    }
  });
}

function scheduleAnnouncement(client, guildId, announcement) {
  const key = `${guildId}:${announcement.id}`;
  if (announcementTimers.has(key)) clearTimeout(announcementTimers.get(key));
  const delay = new Date(announcement.sendAt).getTime() - Date.now();
  if (delay <= 0) {
    void deliverAnnouncement(client, guildId, announcement).catch(() => {});
    return;
  }
  const wait = Math.min(delay, 2_147_000_000);
  const timer = setTimeout(() => {
    announcementTimers.delete(key);
    if (new Date(announcement.sendAt).getTime() > Date.now() + 1000) {
      scheduleAnnouncement(client, guildId, announcement);
      return;
    }
    void deliverAnnouncement(client, guildId, announcement).catch(async (error) => {
      console.error(`Annonce ${key} impossible :`, error.message);
      await mutateGuild(guildId, (data) => {
        const entry = data.announcements.find((item) => item.id === announcement.id);
        if (entry) entry.status = "error";
      }).catch(() => {});
    });
  }, wait);
  timer.unref?.();
  announcementTimers.set(key, timer);
}

async function handleAnnouncementCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "liste") {
    const data = await readGuild(interaction.guildId);
    const pending = data.announcements.filter((item) => item.status === "pending").slice(-20);
    return ephemeral(interaction, pending.length
      ? pending.map((item) => `• **#${item.id}** dans <#${item.channelId}> — <t:${Math.floor(new Date(item.sendAt).getTime() / 1000)}:R>`).join("\n")
      : "Aucune annonce programmée.");
  }
  if (subcommand === "annuler") {
    const id = interaction.options.getInteger("numero", true);
    let found = false;
    await mutateGuild(interaction.guildId, (data) => {
      const item = data.announcements.find((entry) => entry.id === id && entry.status === "pending");
      if (item) { item.status = "cancelled"; found = true; }
    });
    const key = `${interaction.guildId}:${id}`;
    if (announcementTimers.has(key)) clearTimeout(announcementTimers.get(key));
    announcementTimers.delete(key);
    return ephemeral(interaction, found ? `Annonce **#${id}** annulée.` : "Annonce programmée introuvable.");
  }
  const channel = interaction.options.getChannel("salon", true);
  const imageInput = interaction.options.getString("image");
  const buttonInput = interaction.options.getString("bouton_url");
  const imageUrl = safeUrl(imageInput);
  const buttonUrl = safeUrl(buttonInput);
  if (imageInput && !imageUrl) return ephemeral(interaction, "L'image doit utiliser une URL HTTPS valide.");
  if (buttonInput && !buttonUrl) return ephemeral(interaction, "Le bouton doit utiliser une URL HTTPS valide.");
  const buttonLabel = interaction.options.getString("bouton_label");
  if ((buttonLabel && !buttonUrl) || (!buttonLabel && buttonUrl)) {
    return ephemeral(interaction, "Précise ensemble `bouton_label` et `bouton_url`.");
  }
  const draft = {
    subcommand,
    guildId: interaction.guildId,
    userId: interaction.user.id,
    channelId: channel.id,
    text: interaction.options.getString("texte"),
    title: interaction.options.getString("titre"),
    color: interaction.options.getString("couleur") || "5865F2",
    imageUrl,
    buttonLabel,
    buttonUrl,
    minutes: subcommand === "programmer" ? interaction.options.getInteger("minutes", true) : null,
    expiresAt: Date.now() + ANNOUNCEMENT_DRAFT_TTL,
  };
  if (!/^#?[0-9a-f]{6}$/i.test(draft.color)) {
    return ephemeral(interaction, "La couleur doit être composée de 6 chiffres hexadécimaux, par exemple `5865F2`.");
  }
  cleanupAnnouncementDrafts();
  const nonce = crypto.randomBytes(12).toString("hex");
  pendingAnnouncementDrafts.set(nonce, draft);
  if (interaction.isPrefixCommand) {
    return ephemeral(interaction, {
      content: "Clique sur le bouton puis écris ou colle ton annonce dans le champ multiligne.",
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`annonce:compose:${nonce}`)
          .setLabel("Composer l'annonce")
          .setStyle(ButtonStyle.Primary),
      )],
    });
  }
  return interaction.showModal(announcementModal(nonce, draft.text));
}

async function restoreAdvancedTasks(client) {
  for (const guild of client.guilds.cache.values()) {
    const data = await readGuild(guild.id);
    for (const announcement of data.announcements.filter((item) => item.status === "pending")) {
      const sendAt = new Date(announcement.sendAt).getTime();
      if (sendAt <= Date.now()) await deliverAnnouncement(client, guild.id, announcement).catch(() => {});
      else scheduleAnnouncement(client, guild.id, announcement);
    }
  }
}

async function handleAbsenceCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "declarer") {
    const returnDate = parseLocalDate(interaction.options.getString("retour", true), true);
    if (!returnDate || returnDate.getTime() <= Date.now()) return ephemeral(interaction, "La date de retour doit respecter `AAAA-MM-JJ` et être future.");
    let id;
    await mutateGuild(interaction.guildId, (data) => {
      data.absences = data.absences.filter((absence) => absence.userId !== interaction.user.id || absence.status !== "active");
      id = data.nextAbsenceId++;
      data.absences.push({ id, userId: interaction.user.id, reason: interaction.options.getString("raison") || null, returnAt: returnDate.toISOString(), createdAt: new Date().toISOString(), status: "active" });
    });
    return interaction.reply(`🏖️ Absence **#${id}** enregistrée jusqu'au <t:${Math.floor(returnDate.getTime() / 1000)}:D>.`);
  }
  if (subcommand === "liste") {
    const data = await readGuild(interaction.guildId);
    const active = data.absences.filter((absence) => absence.status === "active" && new Date(absence.returnAt).getTime() >= Date.now()).slice(-25);
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57f287).setTitle("🏖️ Absences en cours").setDescription(
      active.length ? active.map((absence) => `• <@${absence.userId}> jusqu'au <t:${Math.floor(new Date(absence.returnAt).getTime() / 1000)}:D>${absence.reason ? ` — ${absence.reason}` : ""}`).join("\n").slice(0, 4096) : "Aucune absence en cours.",
    )] });
  }
  const target = interaction.options.getUser("membre") || interaction.user;
  if (target.id !== interaction.user.id && !hasPermission(interaction, PermissionFlagsBits.ManageGuild)) {
    return ephemeral(interaction, "Tu dois avoir la permission Gérer le serveur pour terminer l'absence d'un autre membre.");
  }
  let changed = false;
  await mutateGuild(interaction.guildId, (data) => {
    for (const absence of data.absences) {
      if (absence.userId === target.id && absence.status === "active") { absence.status = "ended"; absence.endedAt = new Date().toISOString(); changed = true; }
    }
  });
  return ephemeral(interaction, changed ? `L'absence de ${target} est terminée.` : "Aucune absence active trouvée.");
}

function serializeOnboarding(onboarding) {
  return {
    prompts: [...onboarding.prompts.values()].map((prompt) => ({
      id: prompt.id,
      title: prompt.title,
      singleSelect: prompt.singleSelect,
      required: prompt.required,
      inOnboarding: prompt.inOnboarding,
      type: prompt.type,
      options: [...prompt.options.values()].map((option) => ({
        id: option.id,
        title: option.title,
        description: option.description,
        emoji: option.emoji,
        channels: [...option.channels.values()].filter(Boolean).map((channel) => channel.id),
        roles: [...option.roles.values()].filter(Boolean).map((role) => role.id),
      })),
    })),
    defaultChannels: [...onboarding.defaultChannels.values()].filter(Boolean).map((channel) => channel.id),
    mode: onboarding.mode,
  };
}

async function handleOnboardingCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const onboarding = await interaction.guild.fetchOnboarding();
  if (subcommand === "statut") {
    return ephemeral(interaction, {
      embeds: [new EmbedBuilder().setColor(onboarding.enabled ? 0x57f287 : 0xed4245).setTitle("👋 Onboarding Discord").addFields(
        { name: "État", value: onboarding.enabled ? "Activé" : "Désactivé", inline: true },
        { name: "Questions", value: String(onboarding.prompts.size), inline: true },
        { name: "Salons par défaut", value: String(onboarding.defaultChannels.size), inline: true },
      )],
    });
  }
  const serialized = serializeOnboarding(onboarding);
  if (subcommand === "activer" || subcommand === "desactiver") {
    const enabled = subcommand === "activer";
    await interaction.guild.editOnboarding({ ...serialized, enabled, reason: `${enabled ? "Activation" : "Désactivation"} par ${interaction.user.tag}` });
    return ephemeral(interaction, `L'Onboarding Discord est maintenant **${enabled ? "activé" : "désactivé"}**.`);
  }
  const role = interaction.options.getRole("role");
  const channel = interaction.options.getChannel("salon");
  if (!role && !channel) return ephemeral(interaction, "Choisis au moins un `role` ou un `salon` pour ce choix.");
  const question = interaction.options.getString("question", true);
  const choice = {
    title: interaction.options.getString("choix", true),
    description: null,
    emoji: interaction.options.getString("emoji") || undefined,
    roles: role ? [role.id] : [],
    channels: channel ? [channel.id] : [],
  };
  const existing = serialized.prompts.find((prompt) => prompt.title.toLowerCase() === question.toLowerCase());
  if (existing) existing.options.push(choice);
  else serialized.prompts.push({
    title: question,
    singleSelect: false,
    required: false,
    inOnboarding: true,
    type: GuildOnboardingPromptType.MultipleChoice,
    options: [choice],
  });
  await interaction.guild.editOnboarding({ ...serialized, enabled: onboarding.enabled, reason: `Choix ajouté par ${interaction.user.tag}` });
  return ephemeral(interaction, `Choix **${choice.title}** ajouté à la question **${question}**.`);
}

async function handleAnonymousConfig(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "configurer") {
    const channel = interaction.options.getChannel("salon", true);
    await mutateGuild(interaction.guildId, (data) => {
      data.anonymousQuestions.enabled = true;
      data.anonymousQuestions.channelId = channel.id;
    });
    return ephemeral(interaction, `Les questions anonymes seront publiées dans ${channel}.`);
  }
  if (subcommand === "desactiver") {
    await mutateGuild(interaction.guildId, (data) => { data.anonymousQuestions.enabled = false; });
    return ephemeral(interaction, "Les questions anonymes sont désactivées.");
  }
  const data = await readGuild(interaction.guildId);
  return ephemeral(interaction, data.anonymousQuestions.enabled
    ? `Système activé dans <#${data.anonymousQuestions.channelId}>. L'identité est conservée uniquement dans l'audit privé anti-abus.`
    : "Le système est désactivé.");
}

async function handleAnonymousQuestion(interaction) {
  const data = await readGuild(interaction.guildId);
  if (!data.anonymousQuestions.enabled) return ephemeral(interaction, "Les questions anonymes ne sont pas configurées sur ce serveur.");
  const channel = interaction.guild.channels.cache.get(data.anonymousQuestions.channelId) || await interaction.guild.channels.fetch(data.anonymousQuestions.channelId).catch(() => null);
  if (!channel?.isTextBased()) return ephemeral(interaction, "Le salon configuré n'existe plus. Demande au staff de reconfigurer le système.");
  const text = interaction.options.getString("texte", true);
  let number;
  await mutateGuild(interaction.guildId, (guildData) => {
    number = guildData.anonymousQuestions.nextNumber++;
    guildData.anonymousQuestions.audit.push({ number, userId: interaction.user.id, text, createdAt: new Date().toISOString() });
    guildData.anonymousQuestions.audit = guildData.anonymousQuestions.audit.slice(-1000);
  });
  const message = await channel.send({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`❓ Question anonyme #${number}`).setDescription(text).setFooter({ text: "Identité masquée publiquement • abus traçables par les propriétaires du bot" }).setTimestamp()], allowedMentions: { parse: [] } });
  await message.react("👍").catch(() => {});
  await message.react("👎").catch(() => {});
  return ephemeral(interaction, `Ta question anonyme **#${number}** a été envoyée.`);
}

async function handleProfile(interaction) {
  const user = interaction.options.getUser("membre") || interaction.user;
  const member = interaction.guild.members.cache.get(user.id) || await interaction.guild.members.fetch(user.id).catch(() => null);
  const data = await readGuild(interaction.guildId);
  const levelStats = data.levels.members[user.id] || { xp: 0, messages: 0 };
  const level = levelFromXp(levelStats.xp);
  const activeWarnings = data.warnings.filter((warning) => warning.userId === user.id && warning.active).length;
  const roles = member ? member.roles.cache.filter((role) => role.id !== interaction.guildId).sort((left, right) => right.position - left.position).first(15).map(String).join(" ") : "Membre absent du serveur";
  return interaction.reply({ embeds: [new EmbedBuilder()
    .setColor(member?.displayColor || 0x5865f2)
    .setTitle(`👤 Profil de ${user.globalName || user.username}`)
    .setThumbnail(user.displayAvatarURL({ extension: "png", size: 512 }))
    .addFields(
      { name: "Niveau", value: String(level), inline: true },
      { name: "XP", value: `${levelStats.xp} / ${xpForLevel(level + 1)}`, inline: true },
      { name: "Messages comptés", value: String(levelStats.messages), inline: true },
      { name: "Avertissements actifs", value: String(activeWarnings), inline: true },
      { name: "Arrivée", value: member?.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : "Inconnue", inline: true },
      { name: "Vocal", value: member?.voice?.channel ? `Dans ${member.voice.channel}` : "Non connecté", inline: true },
      { name: "Rôles", value: roles || "Aucun rôle", inline: false },
    )
    .setFooter({ text: `ID : ${user.id}` })] });
}

module.exports = {
  announcementPayload,
  handleAbsenceCommand,
  handleAnnouncementCommand,
  handleAnnouncementInteraction,
  handleAnonymousConfig,
  handleAnonymousQuestion,
  handleBackupCommand,
  handleEventCommand,
  handleLeaderboard,
  handleLevelMessage,
  handleLevelsCommand,
  handleOnboardingCommand,
  handleProfile,
  levelFromXp,
  parseLocalDate,
  restoreAdvancedTasks,
  snapshotGuild,
  xpForLevel,
};
