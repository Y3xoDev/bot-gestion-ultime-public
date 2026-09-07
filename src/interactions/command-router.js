const {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const {
  configureNativeAutoMod,
  deleteManagedRules,
  getAutoModStatus,
  parseKeywords,
  setManagedRulesEnabled,
} = require("../modules/discord-automod");
const {
  handleTicketButton,
  handleLogsDisableCommand,
  handleUnlogsButton,
  handleUnlogsCommand,
  installLogChannels,
  invalidateLogCache,
  LOG_DEFINITIONS,
  sendLog,
} = require("../modules/server-events");
const { mutateGuild, readGuild } = require("../persistence/guild-store");
const {
  handleCommunityInteraction,
  handleRoleToggleButton,
} = require("../modules/community-tools");
const {
  handleModmailCommand,
  handleModmailInteraction,
  handleUnmodmailCommand,
} = require("../modules/modmail");
const { handleVoiceProtection } = require("../modules/voice-guard");
const { handleHelp, handleHelpInteraction } = require("../modules/help");
const {
  handleReactionRoleCommand,
  handleRulesButton,
  handleRulesCommand,
  parseColor,
} = require("../modules/interactive-panels");
const { handleSecurityCommand } = require("../modules/security");
const { handlePresenceCommand } = require("../modules/bot-presence");
const { handleStatisticsCommand, handleStatisticsInteraction } = require("../modules/statistics");
const { handleGrowthCommand } = require("../modules/growth");
const { handleMultiBotCommand } = require("../modules/multi-bot-features");
const {
  handleAbsenceCommand,
  handleAnnouncementCommand,
  handleAnnouncementInteraction,
  handleAnonymousConfig,
  handleAnonymousQuestion,
  handleBackupCommand,
  handleEventCommand,
  handleLeaderboard,
  handleLevelsCommand,
  handleOnboardingCommand,
  handleProfile,
} = require("../modules/advanced-features");
const {
  handleGuildAccessButton,
  handleJoinCommand,
  handleLeaveCommand,
} = require("../modules/guild-access");
const {
  handleTicketConfigInteraction,
  showTicketDashboard,
} = require("../modules/ticket-config");
const {
  configureManagedAntiLink,
  enforceCommandAccess,
  handleLegacyButton,
  handleLegacyCommand,
  handleSayModal,
} = require("../modules/legacy-features");

function auditReason(interaction, reason) {
  return `${reason || "Aucune raison précisée"} | par ${interaction.user.tag} (${interaction.user.id})`.slice(
    0,
    512,
  );
}

async function getActor(interaction) {
  if (interaction.member?.permissions && interaction.member?.roles?.cache) {
    return interaction.member;
  }
  return (
    interaction.guild.members.cache.get(interaction.user.id) ||
    interaction.guild.members.fetch(interaction.user.id)
  );
}

async function getGuildMember(guild, userId) {
  return guild.members.cache.get(userId) || guild.members.fetch(userId);
}

async function requireMemberPermission(interaction, permission) {
  const actor = await getActor(interaction);
  if (!actor.permissions.has(permission)) {
    await interaction.reply({
      content: "Tu n'as pas la permission nécessaire pour cette commande.",
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }
  return actor;
}

async function requireBotPermissions(interaction, requiredPermissions) {
  const botMember = interaction.guild.members.me || (await interaction.guild.members.fetchMe());
  const missing = botMember.permissions.missing(requiredPermissions);

  if (missing.length > 0) {
    const content = `Il manque des permissions au bot : ${missing.map((permission) => `\`${permission}\``).join(", ")}.`;
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(content);
    } else {
      await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
    return null;
  }

  return botMember;
}

function targetHierarchyError(guild, actor, botMember, target, capability) {
  if (target.id === guild.ownerId) {
    return "Le propriétaire du serveur ne peut pas être modéré.";
  }
  if (target.id === actor.id) {
    return "Tu ne peux pas utiliser cette commande sur toi-même.";
  }
  if (target.id === botMember.id) {
    return "Je ne peux pas utiliser cette commande sur moi-même.";
  }
  if (
    actor.id !== guild.ownerId &&
    actor.roles.highest.comparePositionTo(target.roles.highest) <= 0
  ) {
    return "Ton rôle doit être placé au-dessus de celui du membre ciblé.";
  }
  if (botMember.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
    return "Mon rôle doit être placé au-dessus de celui du membre ciblé.";
  }
  if (capability && !target[capability]) {
    return "Discord ne m'autorise pas à effectuer cette action sur ce membre.";
  }
  return null;
}

async function logAction(interaction, title, description, color = 0x5865f2) {
  await sendLog(
    interaction.guild,
    new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(description)
      .setFooter({ text: `Par ${interaction.user.tag} (${interaction.user.id})` })
      .setTimestamp(),
  );
}

async function handleAutoMod(interaction) {
  const actor = await requireMemberPermission(interaction, PermissionFlagsBits.ManageGuild);
  if (!actor) {
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const subcommand = interaction.options.getSubcommand();
  const requiredBotPermissions = [PermissionFlagsBits.ManageGuild];
  if (subcommand === "configurer" || subcommand === "all") {
    requiredBotPermissions.push(PermissionFlagsBits.ModerateMembers);
  }

  const botMember = await requireBotPermissions(interaction, requiredBotPermissions);
  if (!botMember) {
    return;
  }

  const moderatorTag = `${interaction.user.tag} (${interaction.user.id})`;

  if (subcommand === "all") {
    const alertChannel = interaction.options.getChannel("salon_alertes") || interaction.channel;
    if (
      !alertChannel ||
      ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(alertChannel.type)
    ) {
      await interaction.editReply(
        "Utilise cette commande dans un salon textuel ou précise `salon_alertes`.",
      );
      return;
    }

    const mentionLimit = interaction.options.getInteger("mentions_max") ?? 5;
    const timeoutMinutes = interaction.options.getInteger("timeout_minutes") ?? 10;
    const parsed = parseKeywords(interaction.options.getString("mots_interdits"));
    const results = await configureNativeAutoMod(
      interaction.guild,
      {
        alertChannelId: alertChannel.id,
        keywords: parsed.keywords,
        mentionLimit,
        timeoutMinutes,
      },
      moderatorTag,
    );

    try {
      results.push(
        await configureManagedAntiLink(
          interaction.guild,
          { alertChannelId: alertChannel.id, timeoutMinutes },
          moderatorTag,
        ),
      );
    } catch (error) {
      results.push({
        name: "GestionBot • Anti-invitations",
        status: "erreur",
        detail: error.message,
      });
    }

    const enabledCount = await setManagedRulesEnabled(interaction.guild, true, moderatorTag);
    const lines = results.map(
      (result) =>
        `• **${result.name}** : ${result.status}${result.detail ? ` — ${result.detail}` : ""}`,
    );
    if (parsed.rejected.length > 0) {
      lines.push(`• ${parsed.rejected.length} mot(s) trop long(s) ignoré(s).`);
    }
    await interaction.editReply(
      `🛡️ **Protection AutoMod complète activée.**\n` +
        `Alertes : ${alertChannel} • Mentions : **${mentionLimit} max** • Timeout : **${timeoutMinutes} min**\n` +
        `Règles actives gérées par le bot : **${enabledCount}**\n${lines.join("\n")}`,
    );
    return;
  }

  if (subcommand === "configurer") {
    const alertChannel = interaction.options.getChannel("salon_alertes", true);
    const mentionLimit = interaction.options.getInteger("mentions_max") ?? 5;
    const timeoutMinutes = interaction.options.getInteger("timeout_minutes") ?? 10;
    const parsed = parseKeywords(interaction.options.getString("mots_interdits"));

    const results = await configureNativeAutoMod(
      interaction.guild,
      {
        alertChannelId: alertChannel.id,
        keywords: parsed.keywords,
        mentionLimit,
        timeoutMinutes,
      },
      moderatorTag,
    );

    const lines = results.map(
      (result) =>
        `• **${result.name}** : ${result.status}${result.detail ? ` — ${result.detail}` : ""}`,
    );
    if (parsed.rejected.length > 0) {
      lines.push(`• ${parsed.rejected.length} mot(s) trop long(s) ignoré(s).`);
    }

    await interaction.editReply(
      `AutoMod natif configuré. Alertes envoyées dans ${alertChannel}.\n${lines.join("\n")}`,
    );
    return;
  }

  if (subcommand === "statut") {
    const { managed, total } = await getAutoModStatus(interaction.guild);
    const lines = managed.map(
      (rule) => `• **${rule.name}** — ${rule.enabled ? "🟢 active" : "🔴 inactive"}`,
    );

    await interaction.editReply(
      lines.length > 0
        ? `Règles AutoMod du serveur : **${total}**. Règles gérées par ce bot :\n${lines.join("\n")}`
        : `Le serveur possède ${total} règle(s) AutoMod, mais aucune n'est encore gérée par ce bot.`,
    );
    return;
  }

  if (subcommand === "activer" || subcommand === "desactiver") {
    const enabled = subcommand === "activer";
    const count = await setManagedRulesEnabled(interaction.guild, enabled, moderatorTag);
    await interaction.editReply(
      count > 0
        ? `${count} règle(s) AutoMod ${enabled ? "activée(s)" : "désactivée(s)"}.`
        : "Aucune règle gérée par ce bot n'a été trouvée.",
    );
    return;
  }

  if (subcommand === "desinstaller") {
    const count = await deleteManagedRules(interaction.guild, moderatorTag);
    await interaction.editReply(
      count > 0
        ? `${count} règle(s) créée(s) par ce bot ont été supprimée(s).`
        : "Aucune règle gérée par ce bot n'a été trouvée.",
    );
  }
}

async function handlePurge(interaction) {
  if (!(await requireMemberPermission(interaction, PermissionFlagsBits.ManageMessages))) {
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!(await requireBotPermissions(interaction, [PermissionFlagsBits.ManageMessages]))) {
    return;
  }

  const channel = interaction.channel;
  if (!channel?.isTextBased() || typeof channel.bulkDelete !== "function") {
    await interaction.editReply("Cette commande doit être utilisée dans un salon textuel classique.");
    return;
  }

  const amount = interaction.options.getInteger("nombre", true);
  const deleted = await channel.bulkDelete(amount, true);
  await interaction.editReply(
    `${deleted.size} message(s) récent(s) supprimé(s). Les messages de plus de 14 jours sont ignorés par Discord.`,
  );
  await logAction(
    interaction,
    "Messages purgés",
    `${interaction.user} a supprimé ${deleted.size} message(s) dans ${channel}.`,
    0xfaa61a,
  );
}

async function handleTimeout(interaction, remove = false) {
  if (!(await requireMemberPermission(interaction, PermissionFlagsBits.ModerateMembers))) {
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const botMember = await requireBotPermissions(interaction, [PermissionFlagsBits.ModerateMembers]);
  if (!botMember) {
    return;
  }

  const actor = await getActor(interaction);
  const user = interaction.options.getUser("membre", true);
  const target = await getGuildMember(interaction.guild, user.id);
  const hierarchyError = targetHierarchyError(
    interaction.guild,
    actor,
    botMember,
    target,
    "moderatable",
  );
  if (hierarchyError) {
    await interaction.editReply(hierarchyError);
    return;
  }

  const reason = auditReason(interaction, interaction.options.getString("raison"));
  if (remove) {
    await target.timeout(null, reason);
    await interaction.editReply(`Le timeout de ${target} a été retiré.`);
    await logAction(interaction, "Timeout retiré", `${target} n'est plus en timeout.`);
    return;
  }

  const minutes = interaction.options.getInteger("minutes", true);
  await target.timeout(minutes * 60_000, reason);
  await interaction.editReply(`${target} est en timeout pendant **${minutes} minute(s)**.`);
  await logAction(
    interaction,
    "Timeout appliqué",
    `${target} est en timeout pendant ${minutes} minute(s).\nRaison : ${interaction.options.getString("raison") || "Non précisée"}`,
    0xfaa61a,
  );
}

async function handleKick(interaction) {
  if (!(await requireMemberPermission(interaction, PermissionFlagsBits.KickMembers))) {
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const botMember = await requireBotPermissions(interaction, [PermissionFlagsBits.KickMembers]);
  if (!botMember) {
    return;
  }

  const actor = await getActor(interaction);
  const user = interaction.options.getUser("membre", true);
  const target = await getGuildMember(interaction.guild, user.id);
  const hierarchyError = targetHierarchyError(
    interaction.guild,
    actor,
    botMember,
    target,
    "kickable",
  );
  if (hierarchyError) {
    await interaction.editReply(hierarchyError);
    return;
  }

  await target.kick(auditReason(interaction, interaction.options.getString("raison")));
  await interaction.editReply(`${user.tag} a été expulsé du serveur.`);
  await logAction(
    interaction,
    "Membre expulsé",
    `${user.tag} (${user.id}) a été expulsé.\nRaison : ${interaction.options.getString("raison") || "Non précisée"}`,
    0xed4245,
  );
}

async function handleBan(interaction) {
  if (!(await requireMemberPermission(interaction, PermissionFlagsBits.BanMembers))) {
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const botMember = await requireBotPermissions(interaction, [PermissionFlagsBits.BanMembers]);
  if (!botMember) {
    return;
  }

  const actor = await getActor(interaction);
  const user = interaction.options.getUser("utilisateur", true);
  const target =
    interaction.guild.members.cache.get(user.id) ||
    (await interaction.guild.members.fetch(user.id).catch(() => null));

  if (target) {
    const hierarchyError = targetHierarchyError(
      interaction.guild,
      actor,
      botMember,
      target,
      "bannable",
    );
    if (hierarchyError) {
      await interaction.editReply(hierarchyError);
      return;
    }
  }

  const deleteHours = interaction.options.getInteger("heures_messages") ?? 0;
  await interaction.guild.members.ban(user.id, {
    deleteMessageSeconds: deleteHours * 3600,
    reason: auditReason(interaction, interaction.options.getString("raison")),
  });
  await interaction.editReply(`${user.tag} a été banni du serveur.`);
  await logAction(
    interaction,
    "Utilisateur banni",
    `${user.tag} (${user.id}) a été banni.\nRaison : ${interaction.options.getString("raison") || "Non précisée"}`,
    0xed4245,
  );
}

async function handleUnban(interaction) {
  if (!(await requireMemberPermission(interaction, PermissionFlagsBits.BanMembers))) {
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!(await requireBotPermissions(interaction, [PermissionFlagsBits.BanMembers]))) {
    return;
  }

  const userId = interaction.options.getString("identifiant", true);
  if (!/^\d{17,20}$/.test(userId)) {
    await interaction.editReply("L'identifiant Discord doit contenir uniquement 17 à 20 chiffres.");
    return;
  }

  const user = await interaction.guild.members.unban(
    userId,
    auditReason(interaction, interaction.options.getString("raison")),
  );
  await interaction.editReply(`${user.tag} a été débanni.`);
  await logAction(
    interaction,
    "Utilisateur débanni",
    `${user.tag} (${user.id}) a été débanni.`,
    0x57f287,
  );
}

async function handleChannelLock(interaction, locked) {
  if (!(await requireMemberPermission(interaction, PermissionFlagsBits.ManageChannels))) {
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!(await requireBotPermissions(interaction, [PermissionFlagsBits.ManageChannels]))) {
    return;
  }

  const channel = interaction.options.getChannel("salon") || interaction.channel;
  if (!channel?.permissionOverwrites || !channel.isTextBased()) {
    await interaction.editReply("Choisis un salon textuel ou d'annonces.");
    return;
  }

  await channel.permissionOverwrites.edit(
    interaction.guild.roles.everyone,
    { SendMessages: locked ? false : null },
    { reason: auditReason(interaction, locked ? "Verrouillage du salon" : "Déverrouillage du salon") },
  );
  await interaction.editReply(`${channel} est maintenant ${locked ? "verrouillé" : "déverrouillé"}.`);
  await logAction(
    interaction,
    locked ? "Salon verrouillé" : "Salon déverrouillé",
    `${channel} est maintenant ${locked ? "verrouillé" : "déverrouillé"}.`,
    locked ? 0xed4245 : 0x57f287,
  );
}

async function handleWarning(interaction) {
  const actor = await requireMemberPermission(interaction, PermissionFlagsBits.ModerateMembers);
  if (!actor) {
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const botMember = interaction.guild.members.me || (await interaction.guild.members.fetchMe());
  const user = interaction.options.getUser("membre", true);
  const target = await getGuildMember(interaction.guild, user.id);
  const hierarchyError = targetHierarchyError(
    interaction.guild,
    actor,
    botMember,
    target,
    null,
  );
  if (hierarchyError) {
    await interaction.editReply(hierarchyError);
    return;
  }

  const reason = interaction.options.getString("raison", true);
  let caseNumber;
  await mutateGuild(interaction.guild.id, (data) => {
    caseNumber = data.nextCaseNumber;
    data.nextCaseNumber += 1;
    data.warnings.push({
      caseNumber,
      userId: user.id,
      userTag: user.tag,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      reason,
      active: true,
      createdAt: new Date().toISOString(),
    });
  });

  await user
    .send(`Tu as reçu un avertissement sur **${interaction.guild.name}** : ${reason}`)
    .catch(() => {});
  await interaction.editReply(`Avertissement **#${caseNumber}** ajouté à ${target}.`);
  await logAction(
    interaction,
    `Avertissement #${caseNumber}`,
    `${target} a reçu un avertissement.\nRaison : ${reason}`,
    0xfaa61a,
  );
}

async function handleWarnings(interaction) {
  if (!(await requireMemberPermission(interaction, PermissionFlagsBits.ModerateMembers))) {
    return;
  }
  const user = interaction.options.getUser("membre", true);
  const data = await readGuild(interaction.guild.id);
  const warnings = data.warnings
    .filter((warning) => warning.userId === user.id && warning.active)
    .slice(-10)
    .reverse();

  const embed = new EmbedBuilder()
    .setColor(warnings.length ? 0xfaa61a : 0x57f287)
    .setTitle(`Avertissements de ${user.tag}`)
    .setDescription(
      warnings.length
        ? warnings
            .map(
              (warning) =>
                `**#${warning.caseNumber}** — ${warning.reason}\n<t:${Math.floor(new Date(warning.createdAt).getTime() / 1000)}:R> par <@${warning.moderatorId}>`,
            )
            .join("\n\n")
            .slice(0, 4096)
        : "Aucun avertissement actif.",
    );
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleWarningRemove(interaction) {
  if (!(await requireMemberPermission(interaction, PermissionFlagsBits.ModerateMembers))) {
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const caseNumber = interaction.options.getInteger("numero", true);
  let removed;
  await mutateGuild(interaction.guild.id, (data) => {
    const warning = data.warnings.find(
      (item) => item.caseNumber === caseNumber && item.active,
    );
    if (!warning) {
      return;
    }
    warning.active = false;
    warning.revokedAt = new Date().toISOString();
    warning.revokedBy = interaction.user.id;
    warning.revokeReason = interaction.options.getString("raison") || "Non précisée";
    removed = warning;
  });

  if (!removed) {
    await interaction.editReply(`Aucun avertissement actif #${caseNumber} trouvé.`);
    return;
  }
  await interaction.editReply(`L'avertissement **#${caseNumber}** a été retiré.`);
  await logAction(
    interaction,
    `Avertissement #${caseNumber} retiré`,
    `L'avertissement de <@${removed.userId}> a été retiré.`,
    0x57f287,
  );
}

async function handleSlowmode(interaction) {
  if (!(await requireMemberPermission(interaction, PermissionFlagsBits.ManageChannels))) {
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!(await requireBotPermissions(interaction, [PermissionFlagsBits.ManageChannels]))) {
    return;
  }
  const channel = interaction.options.getChannel("salon") || interaction.channel;
  if (!channel || typeof channel.setRateLimitPerUser !== "function") {
    await interaction.editReply("Choisis un salon textuel compatible avec le mode lent.");
    return;
  }
  const seconds = interaction.options.getInteger("secondes", true);
  await channel.setRateLimitPerUser(seconds, auditReason(interaction, "Modification du slowmode"));
  await interaction.editReply(
    seconds === 0
      ? `Le mode lent est désactivé dans ${channel}.`
      : `Le mode lent de ${channel} est réglé sur **${seconds} seconde(s)**.`,
  );
}

async function handleWelcome(interaction) {
  const actor = await requireMemberPermission(interaction, PermissionFlagsBits.ManageGuild);
  if (!actor) {
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "configurer") {
    const welcomeChannel = interaction.options.getChannel("salon_arrivees", true);
    const goodbyeChannel = interaction.options.getChannel("salon_departs");
    const autoRole = interaction.options.getRole("autorole");
    const message = interaction.options.getString("message");

    if (autoRole) {
      const botMember = await requireBotPermissions(interaction, [PermissionFlagsBits.ManageRoles]);
      if (!botMember) {
        return;
      }
      if (
        autoRole.managed ||
        autoRole.id === interaction.guild.roles.everyone.id ||
        botMember.roles.highest.comparePositionTo(autoRole) <= 0 ||
        (actor.id !== interaction.guild.ownerId && actor.roles.highest.comparePositionTo(autoRole) <= 0)
      ) {
        await interaction.editReply(
          "L'autorôle doit être non géré et placé sous ton rôle ainsi que sous le rôle du bot.",
        );
        return;
      }
    }

    await mutateGuild(interaction.guild.id, (data) => {
      data.welcome.enabled = true;
      data.welcome.channelId = welcomeChannel.id;
      data.welcome.goodbyeChannelId = goodbyeChannel?.id || null;
      data.welcome.autoRoleId = autoRole?.id || null;
      if (message) {
        data.welcome.message = message;
      }
    });
    await interaction.editReply(
      `Accueil activé dans ${welcomeChannel}.${goodbyeChannel ? ` Départs : ${goodbyeChannel}.` : ""}${autoRole ? ` Autorôle : ${autoRole}.` : ""}`,
    );
    return;
  }

  if (subcommand === "desactiver") {
    await mutateGuild(interaction.guild.id, (data) => {
      data.welcome.enabled = false;
    });
    await interaction.editReply("Le système d'accueil est désactivé.");
    return;
  }

  const data = await readGuild(interaction.guild.id);
  await interaction.editReply(
    [
      `Statut : **${data.welcome.enabled ? "activé" : "désactivé"}**`,
      `Arrivées : ${data.welcome.channelId ? `<#${data.welcome.channelId}>` : "non configuré"}`,
      `Départs : ${data.welcome.goodbyeChannelId ? `<#${data.welcome.goodbyeChannelId}>` : "non configuré"}`,
      `Autorôle : ${data.welcome.autoRoleId ? `<@&${data.welcome.autoRoleId}>` : "aucun"}`,
      `Message : ${data.welcome.message}`,
    ].join("\n"),
  );
}

async function handleLogs(interaction) {
  if (!(await requireMemberPermission(interaction, PermissionFlagsBits.ManageGuild))) {
    return;
  }
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "installer" || subcommand === "setup") {
    if (!(await requireBotPermissions(interaction, [PermissionFlagsBits.ManageChannels]))) {
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const category = interaction.options.getChannel("categorie");
    const result = await installLogChannels(interaction.guild, category, interaction.user.tag);
    await interaction.editReply(
      `Les **${LOG_DEFINITIONS.length} salons de logs** ont été installés dans **${result.category.name}**.`,
    );
    return;
  }
  if (subcommand === "configurer") {
    const type = interaction.options.getString("type", true);
    const channel = interaction.options.getChannel("salon", true);
    await mutateGuild(interaction.guild.id, (data) => {
      data.logs.channels[type] = channel.id;
    });
    invalidateLogCache(interaction.guild.id);
    await interaction.reply({
      content: `Les journaux **${type}** seront envoyés dans ${channel}.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (subcommand === "desactiver") {
    const type = interaction.options.getString("type");
    await handleLogsDisableCommand(interaction, type);
    return;
  }
  const data = await readGuild(interaction.guild.id);
  await interaction.reply({
    content: LOG_DEFINITIONS.map(
      ({ key, name }) => `• **${name}** : ${data.logs.channels[key] ? `<#${data.logs.channels[key]}>` : "désactivé"}`,
    ).join("\n"),
    flags: MessageFlags.Ephemeral,
  });
}

async function handleTickets(interaction) {
  if (await require("../modules/ticket-runtime").handleTicketCommand(interaction)) return;
  if (!(await requireMemberPermission(interaction, PermissionFlagsBits.ManageGuild))) {
    return;
  }
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "configurer") {
    const category = interaction.options.getChannel("categorie");
    const staffRole = interaction.options.getRole("role_support");
    const color = interaction.options.getString("couleur");
    if (staffRole?.id === interaction.guild.id || (color && !/^#?[a-f0-9]{6}$/i.test(color))) {
      await interaction.reply({ content: "Choisis un rôle autre que @everyone et une couleur hexadécimale à 6 chiffres.", flags: MessageFlags.Ephemeral }); return;
    }
    if (
      category ||
      staffRole ||
      color ||
      interaction.options.getString("titre") ||
      interaction.options.getString("description") ||
      interaction.options.getBoolean("confirmation") !== null
    ) {
      await mutateGuild(interaction.guild.id, (data) => {
        if (category) data.tickets.categoryId = category.id;
        if (staffRole) data.tickets.staffRoleId = staffRole.id;
        data.tickets.panelTitle = interaction.options.getString("titre") || data.tickets.panelTitle;
        data.tickets.panelDescription =
          interaction.options.getString("description") || data.tickets.panelDescription;
        if (color) data.tickets.panelColor = color.replace(/^#/, "");
        data.tickets.confirmationEnabled =
          interaction.options.getBoolean("confirmation") ?? data.tickets.confirmationEnabled;
      });
    }
    await showTicketDashboard(interaction);
    return;
  }
  if (subcommand === "choix-ajouter") {
    const id = interaction.options.getString("identifiant", true).toLowerCase();
    if (interaction.options.getRole("role_support")?.id === interaction.guild.id) {
      await interaction.reply({ content: "Le rôle support ne peut pas être @everyone.", flags: MessageFlags.Ephemeral }); return;
    }
    if (!/^[a-z0-9-]+$/.test(id)) {
      await interaction.reply({ content: "L'identifiant accepte seulement a-z, 0-9 et les tirets.", flags: MessageFlags.Ephemeral });
      return;
    }
    await mutateGuild(interaction.guild.id, (data) => {
      const existing = data.tickets.choices.find((choice) => choice.id === id) || {};
      if (!existing.id && data.tickets.choices.length >= 25) throw new Error("Limite de 25 options atteinte.");
      const requestedOrder = interaction.options.getInteger("ordre");
      const choice = {
        ...existing,
        id,
        label: interaction.options.getString("label", true),
        emoji: interaction.options.getString("emoji") || existing.emoji || null,
        description: interaction.options.getString("description") || existing.description || null,
        categoryId: interaction.options.getChannel("categorie")?.id || existing.categoryId || null,
        staffRoleId: interaction.options.getRole("role_support")?.id || existing.staffRoleId || null,
        order: requestedOrder || existing.order || data.tickets.choices.length + 1,
      };
      data.tickets.choices = data.tickets.choices.filter((item) => item.id !== id);
      data.tickets.choices.push(choice);
      data.tickets.choices.sort((left, right) => left.order - right.order);
      data.tickets.choices.forEach((item, index) => {
        item.order = index + 1;
      });
    });
    await interaction.reply({ content: `Le choix **${id}** a été enregistré.`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (subcommand === "choix-supprimer") {
    const id = interaction.options.getString("identifiant", true).toLowerCase();
    let removed = false;
    await mutateGuild(interaction.guild.id, (data) => {
      const before = data.tickets.choices.length;
      data.tickets.choices = data.tickets.choices.filter((choice) => choice.id !== id);
      removed = before !== data.tickets.choices.length;
    });
    await interaction.reply({ content: removed ? `Le choix **${id}** a été supprimé.` : "Choix introuvable.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (subcommand === "ordre") {
    const ids = interaction.options.getString("identifiants", true).split(",").map((id) => id.trim().toLowerCase()).filter(Boolean);
    const data = await readGuild(interaction.guild.id);
    const known = new Set(data.tickets.choices.map((choice) => choice.id));
    if (new Set(ids).size !== ids.length || ids.some((id) => !known.has(id)) || ids.length !== known.size) {
      await interaction.reply({ content: `Indique chaque identifiant exactement une fois : ${[...known].join(", ") || "aucun choix configuré"}.`, flags: MessageFlags.Ephemeral });
      return;
    }
    await mutateGuild(interaction.guild.id, (guildData) => {
      guildData.tickets.choices.forEach((choice) => {
        choice.order = ids.indexOf(choice.id) + 1;
      });
    });
    await interaction.reply({ content: `Nouvel ordre : **${ids.join(" → ")}**.`, flags: MessageFlags.Ephemeral });
    return;
  }
  if (subcommand === "panneau") {
    const data = await readGuild(interaction.guild.id);
    if (!data.tickets.categoryId || !data.tickets.staffRoleId) {
      await interaction.reply({
        content: "Utilise d'abord `/tickets configurer`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = interaction.options.getChannel("salon", true);
    await require("../modules/ticket-runtime").publishTicketPanel(interaction.guild, channel);
    await interaction.editReply({ content: `Panneau publié dans ${channel}.` });
    return;
  }
  const data = await readGuild(interaction.guild.id);
  await interaction.reply({
    content: [
      `Catégorie : ${data.tickets.categoryId ? `<#${data.tickets.categoryId}>` : "non configurée"}`,
      `Rôle support : ${data.tickets.staffRoleId ? `<@&${data.tickets.staffRoleId}>` : "non configuré"}`,
      `Choix : ${data.tickets.choices.length ? data.tickets.choices.sort((a, b) => a.order - b.order).map((choice) => `${choice.order}. ${choice.id} (${choice.label})`).join(" • ") : "bouton général"}`,
      `Prochain ticket : **#${data.tickets.nextNumber}**`,
    ].join("\n"),
    flags: MessageFlags.Ephemeral,
  });
}

async function handleAntiRaid(interaction) {
  if (!(await requireMemberPermission(interaction, PermissionFlagsBits.ManageGuild))) {
    return;
  }
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "configurer") {
    if (!(await requireBotPermissions(interaction, [PermissionFlagsBits.ModerateMembers]))) {
      return;
    }
    const maxJoins = interaction.options.getInteger("arrivees_max", true);
    const windowSeconds = interaction.options.getInteger("secondes", true);
    const timeoutMinutes = interaction.options.getInteger("timeout_minutes", true);
    await mutateGuild(interaction.guild.id, (data) => {
      data.antiRaid = { enabled: true, maxJoins, windowSeconds, timeoutMinutes };
    });
    await interaction.reply({
      content: `Anti-raid activé : plus de **${maxJoins} arrivées en ${windowSeconds}s** déclenchent un timeout de **${timeoutMinutes} min** sur les nouvelles arrivées.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (subcommand === "desactiver") {
    await mutateGuild(interaction.guild.id, (data) => {
      data.antiRaid.enabled = false;
    });
    await interaction.reply({
      content: "La détection anti-raid est désactivée.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const data = await readGuild(interaction.guild.id);
  await interaction.reply({
    content: `Anti-raid : **${data.antiRaid.enabled ? "activé" : "désactivé"}**\nSeuil : ${data.antiRaid.maxJoins} arrivées en ${data.antiRaid.windowSeconds}s\nTimeout : ${data.antiRaid.timeoutMinutes} min`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleRole(interaction) {
  const actor = await requireMemberPermission(interaction, PermissionFlagsBits.ManageRoles);
  if (!actor) {
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const botMember = await requireBotPermissions(interaction, [PermissionFlagsBits.ManageRoles]);
  if (!botMember) {
    return;
  }
  const user = interaction.options.getUser("membre", true);
  const target = await getGuildMember(interaction.guild, user.id);
  const role = interaction.options.getRole("role", true);
  const hierarchyError = targetHierarchyError(
    interaction.guild,
    actor,
    botMember,
    target,
    null,
  );
  if (hierarchyError) {
    await interaction.editReply(hierarchyError);
    return;
  }
  if (
    role.managed ||
    role.id === interaction.guild.roles.everyone.id ||
    botMember.roles.highest.comparePositionTo(role) <= 0 ||
    (actor.id !== interaction.guild.ownerId && actor.roles.highest.comparePositionTo(role) <= 0)
  ) {
    await interaction.editReply(
      "Ce rôle doit être non géré et placé sous ton rôle ainsi que sous le rôle du bot.",
    );
    return;
  }
  const add = interaction.options.getSubcommand() === "ajouter";
  if (add) {
    await target.roles.add(role, auditReason(interaction, "Ajout manuel d'un rôle"));
  } else {
    await target.roles.remove(role, auditReason(interaction, "Retrait manuel d'un rôle"));
  }
  await interaction.editReply(`${role} a été ${add ? "ajouté à" : "retiré de"} ${target}.`);
  await logAction(
    interaction,
    add ? "Rôle ajouté" : "Rôle retiré",
    `${role} a été ${add ? "ajouté à" : "retiré de"} ${target}.`,
  );
}

async function handlePoll(interaction) {
  if (!(await requireMemberPermission(interaction, PermissionFlagsBits.ManageMessages))) {
    return;
  }
  const choices = Array.from({ length: 10 }, (_, index) => index + 1)
    .map((index) => interaction.options.getString(`choix_${index}`))
    .filter(Boolean);
  const question = interaction.options.getString("question", true);
  await interaction.reply({
    content: `📊 Sondage créé par ${interaction.user}.`,
    poll: {
      question: { text: question },
      answers: choices.map((choice) => ({ text: choice })),
      duration: interaction.options.getInteger("duree_heures") ?? 24,
      allowMultiselect: interaction.options.getBoolean("choix_multiples") ?? false,
    },
    allowedMentions: { users: [interaction.user.id] },
  });
}

async function handleVoice(interaction) {
  if (!(await requireMemberPermission(interaction, PermissionFlagsBits.MoveMembers))) {
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!(await requireBotPermissions(interaction, [PermissionFlagsBits.MoveMembers]))) {
    return;
  }
  const user = interaction.options.getUser("membre", true);
  const member = await getGuildMember(interaction.guild, user.id);
  if (!member.voice.channelId) {
    await interaction.editReply("Ce membre n'est pas connecté à un salon vocal.");
    return;
  }
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "deplacer") {
    const channel = interaction.options.getChannel("salon", true);
    await member.voice.setChannel(channel, auditReason(interaction, "Déplacement vocal"));
    await interaction.editReply(`${member} a été déplacé dans ${channel}.`);
  } else {
    await member.voice.disconnect(auditReason(interaction, "Déconnexion vocale"));
    await interaction.editReply(`${member} a été déconnecté du vocal.`);
  }
}

async function handleUserInfo(interaction) {
  await interaction.deferReply();
  const user = interaction.options.getUser("membre") || interaction.user;
  const member =
    interaction.guild.members.cache.get(user.id) ||
    (await interaction.guild.members.fetch(user.id).catch(() => null));
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(user.globalName || user.username)
    .setThumbnail(user.displayAvatarURL({ extension: "png", size: 512 }))
    .addFields(
      { name: "Identifiant", value: user.id, inline: true },
      {
        name: "Compte créé",
        value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`,
        inline: true,
      },
      {
        name: "Arrivée sur le serveur",
        value: member?.joinedTimestamp
          ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
          : "Inconnue",
        inline: true,
      },
    );

  await interaction.editReply({ embeds: [embed] });
}

async function handleServerInfo(interaction) {
  const guild = interaction.guild;
  const embed = new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(guild.name)
    .setThumbnail(guild.iconURL({ extension: "png", size: 512 }))
    .addFields(
      { name: "Membres", value: String(guild.memberCount), inline: true },
      { name: "Salons", value: String(guild.channels.cache.size), inline: true },
      { name: "Rôles", value: String(guild.roles.cache.size), inline: true },
      {
        name: "Créé",
        value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`,
        inline: true,
      },
      { name: "Identifiant", value: guild.id, inline: true },
    );

  await interaction.reply({ embeds: [embed] });
}

async function handleInteraction(interaction) {
  if (await handleStatisticsInteraction(interaction)) return;
  if (await handleSayModal(interaction)) return;
  if (await handleAnnouncementInteraction(interaction)) return;
  if (
    interaction.isChannelSelectMenu?.() ||
    interaction.isRoleSelectMenu?.() ||
    interaction.isModalSubmit?.()
  ) {
    if (await handleTicketConfigInteraction(interaction)) {
      return;
    }
  }

  if (interaction.isStringSelectMenu()) {
    if (await handleTicketButton(interaction)) return;
    if (await handleHelpInteraction(interaction)) {
      return;
    }
    if (await handleTicketConfigInteraction(interaction)) {
      return;
    }
    await handleModmailInteraction(interaction);
    return;
  }

  if (interaction.isButton()) {
    if (await handleGuildAccessButton(interaction)) {
      return;
    }
    if (await handleUnlogsButton(interaction)) {
      return;
    }
    if (await handleHelpInteraction(interaction)) {
      return;
    }
    if (await handleTicketConfigInteraction(interaction)) {
      return;
    }
    if (await handleLegacyButton(interaction)) {
      return;
    }
    const rulesHandled = await handleRulesButton(interaction);
    if (rulesHandled) {
      return;
    }
    const modmailHandled = await handleModmailInteraction(interaction);
    if (modmailHandled) {
      return;
    }
    const ticketHandled = await handleTicketButton(interaction);
    if (!ticketHandled) {
      await handleRoleToggleButton(interaction);
    }
    return;
  }

  if (!interaction.inGuild()) {
    await interaction.reply({
      content: "Cette commande fonctionne uniquement dans un serveur.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!(await enforceCommandAccess(interaction))) {
    return;
  }

  switch (interaction.commandName) {
    case "automod":
      await handleAutoMod(interaction);
      break;
    case "purger":
      await handlePurge(interaction);
      break;
    case "timeout":
      await handleTimeout(interaction);
      break;
    case "untimeout":
      await handleTimeout(interaction, true);
      break;
    case "expulser":
      await handleKick(interaction);
      break;
    case "bannir":
      await handleBan(interaction);
      break;
    case "debannir":
      await handleUnban(interaction);
      break;
    case "verrouiller":
      await handleChannelLock(interaction, true);
      break;
    case "deverrouiller":
      await handleChannelLock(interaction, false);
      break;
    case "userinfo":
      await handleUserInfo(interaction);
      break;
    case "serverinfo":
      await handleServerInfo(interaction);
      break;
    case "aide-gestion":
    case "help":
      await handleHelp(interaction);
      break;
    case "avertir":
      await handleWarning(interaction);
      break;
    case "avertissements":
      await handleWarnings(interaction);
      break;
    case "avertissement-retirer":
      await handleWarningRemove(interaction);
      break;
    case "slowmode":
      await handleSlowmode(interaction);
      break;
    case "accueil":
      await handleWelcome(interaction);
      break;
    case "logs":
      await handleLogs(interaction);
      break;
    case "unlogs":
      await handleUnlogsCommand(interaction);
      break;
    case "tickets":
      await handleTickets(interaction);
      break;
    case "rules":
      await handleRulesCommand(interaction);
      break;
    case "security":
      await handleSecurityCommand(interaction);
      break;
    case "react-role":
      await handleReactionRoleCommand(interaction);
      break;
    case "antiraid":
      await handleAntiRaid(interaction);
      break;
    case "role":
      await handleRole(interaction);
      break;
    case "sondage":
      await handlePoll(interaction);
      break;
    case "vocal":
      await handleVoice(interaction);
      break;
    case "protection-vocale":
      await handleVoiceProtection(interaction);
      break;
    case "presence":
      await handlePresenceCommand(interaction);
      break;
    case "statistiques":
      await handleStatisticsCommand(interaction);
      break;
    case "event":
      await handleEventCommand(interaction);
      break;
    case "levels":
      await handleLevelsCommand(interaction);
      break;
    case "classement":
      await handleLeaderboard(interaction);
      break;
    case "backup":
      await handleBackupCommand(interaction);
      break;
    case "annonce":
      await handleAnnouncementCommand(interaction);
      break;
    case "absence":
      await handleAbsenceCommand(interaction);
      break;
    case "onboarding":
      await handleOnboardingCommand(interaction);
      break;
    case "croissance":
      await handleGrowthCommand(interaction);
      break;
    case "vouch":
    case "boutique":
    case "protect":
    case "crow":
    case "autorank":
      await handleMultiBotCommand(interaction);
      break;
    case "questions-anonymes":
      await handleAnonymousConfig(interaction);
      break;
    case "question-anonyme":
      await handleAnonymousQuestion(interaction);
      break;
    case "profil":
      await handleProfile(interaction);
      break;
    case "join":
      await handleJoinCommand(interaction);
      break;
    case "leave":
      await handleLeaveCommand(interaction);
      break;
    case "modmail":
      await handleModmailCommand(interaction);
      break;
    case "unmodmail":
      await handleUnmodmailCommand(interaction);
      break;
    default:
      if (
        !(await handleLegacyCommand(interaction)) &&
        !(await handleCommunityInteraction(interaction))
      ) {
        await interaction.reply({
          content: "Commande inconnue.",
          flags: MessageFlags.Ephemeral,
        });
      }
  }
}

module.exports = { handleInteraction };
