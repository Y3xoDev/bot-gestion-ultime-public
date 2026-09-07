const crypto = require("node:crypto");
const {
  ActionRowBuilder,
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  version: discordJsVersion,
} = require("discord.js");
const { mutateGuild, readGuild } = require("../persistence/guild-store");
const { sendLog } = require("./server-events");
const { ADDITIONAL_BOT_OWNER_IDS, isBotOwner } = require("./guild-access");

const LINK_RULE_NAME = "GestionBot • Anti-invitations";
const LEGACY_LINK_RULE_NAME = "GestionBot • Anti-liens";
const LINK_FILTER = [
  "*discord.gg/*",
  "*discord.com/invite/*",
  "*discordapp.com/invite/*",
];
const SNIPE_TTL = 15 * 60_000;
const deletedMessages = new Map();
const pendingRenewals = new Map();
const pendingSayDrafts = new Map();
const SAY_DRAFT_TTL = 15 * 60_000;

function truncate(value, maximum) {
  const text = String(value || "");
  return text.length > maximum ? `${text.slice(0, maximum - 1)}…` : text;
}

function formatDuration(totalSeconds) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor(totalSeconds / 3600) % 24;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = Math.floor(totalSeconds % 60);
  return `${days}j ${hours}h ${minutes}m ${seconds}s`;
}

async function requirePermission(interaction, permission) {
  const member =
    interaction.member?.permissions && interaction.member?.roles?.cache
      ? interaction.member
      : interaction.guild.members.cache.get(interaction.user.id) ||
        (await interaction.guild.members.fetch(interaction.user.id));
  if (member.permissions.has(permission)) {
    return member;
  }
  await interaction.reply({
    content: "Tu n'as pas la permission nécessaire pour cette commande.",
    flags: MessageFlags.Ephemeral,
  });
  return null;
}

async function requireBotPermissions(interaction, requiredPermissions) {
  const botMember = interaction.guild.members.me || (await interaction.guild.members.fetchMe());
  const missing = botMember.permissions.missing(requiredPermissions);
  if (missing.length === 0) {
    return botMember;
  }
  const content = `Il manque des permissions au bot : ${missing.map((item) => `\`${item}\``).join(", ")}.`;
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(content);
  } else {
    await interaction.reply({ content, flags: MessageFlags.Ephemeral });
  }
  return null;
}

async function findManagedLinkRule(guild) {
  const rules = await guild.autoModerationRules.fetch();
  const rule = rules.find((item) => item.name === LINK_RULE_NAME) ||
    rules.find((item) => item.name === LEGACY_LINK_RULE_NAME) ||
    null;
  if (rule && rule.creatorId !== guild.client.user.id) {
    throw new Error(
      `Une règle nommée « ${LINK_RULE_NAME} » existe déjà mais n'appartient pas à ce bot. Renomme-la dans Discord puis réessaie.`,
    );
  }
  return rule;
}

async function refreshManagedAntiLinkRule(guild) {
  const rule = await findManagedLinkRule(guild);
  if (!rule) return null;
  const currentFilter = [...(rule.triggerMetadata?.keywordFilter || [])];
  const alreadyCurrent = rule.name === LINK_RULE_NAME &&
    currentFilter.length === LINK_FILTER.length &&
    currentFilter.every((entry, index) => entry === LINK_FILTER[index]);
  if (alreadyCurrent) return { name: LINK_RULE_NAME, status: "déjà à jour" };

  await rule.edit({
    name: LINK_RULE_NAME,
    triggerMetadata: {
      keywordFilter: LINK_FILTER,
      regexPatterns: [],
      allowList: rule.triggerMetadata?.allowList || [],
    },
    reason: "Migration automatique vers le filtrage des invitations Discord uniquement",
  });
  return { name: LINK_RULE_NAME, status: "migrée" };
}

function linkActions(alertChannelId, timeoutMinutes) {
  const actions = [
    {
      type: AutoModerationActionType.BlockMessage,
      metadata: { customMessage: "Les invitations vers d'autres serveurs Discord ne sont pas autorisées." },
    },
    {
      type: AutoModerationActionType.SendAlertMessage,
      metadata: { channel: alertChannelId },
    },
  ];
  if (timeoutMinutes > 0) {
    actions.push({
      type: AutoModerationActionType.Timeout,
      metadata: { durationSeconds: timeoutMinutes * 60 },
    });
  }
  return actions;
}

function buildAntiLinkRuleOptions({ alertChannelId, timeoutMinutes = 10 }) {
  return {
    name: LINK_RULE_NAME,
    eventType: AutoModerationRuleEventType.MessageSend,
    triggerMetadata: {
      keywordFilter: LINK_FILTER,
      regexPatterns: [],
      allowList: [],
    },
    actions: linkActions(alertChannelId, timeoutMinutes),
    enabled: true,
  };
}

async function configureManagedAntiLink(guild, options, moderatorTag) {
  const existing = await findManagedLinkRule(guild);
  const ruleOptions = {
    ...buildAntiLinkRuleOptions(options),
    reason: `Anti-invitations configuré par ${moderatorTag}`,
  };

  if (existing) {
    await existing.edit(ruleOptions);
    return { name: LINK_RULE_NAME, status: "mise à jour" };
  }

  await guild.autoModerationRules.create({
    ...ruleOptions,
    triggerType: AutoModerationRuleTriggerType.Keyword,
  });
  return { name: LINK_RULE_NAME, status: "créée" };
}

async function configureAntiLink(interaction) {
  if (!(await requirePermission(interaction, PermissionFlagsBits.ManageGuild))) {
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const timeoutMinutes = interaction.options.getInteger("timeout_minutes") ?? 10;
  const needed = [PermissionFlagsBits.ManageGuild];
  if (timeoutMinutes > 0) {
    needed.push(PermissionFlagsBits.ModerateMembers);
  }
  if (!(await requireBotPermissions(interaction, needed))) {
    return;
  }

  const alertChannel = interaction.options.getChannel("salon_alertes", true);
  await configureManagedAntiLink(
    interaction.guild,
    { alertChannelId: alertChannel.id, timeoutMinutes },
    `${interaction.user.tag} (${interaction.user.id})`,
  );

  await interaction.editReply(
    `Anti-invitations Discord **activé**. Seuls les liens de serveur sont bloqués ; les autres URL restent autorisées. Les alertes arrivent dans ${alertChannel}.${
      timeoutMinutes > 0 ? ` Timeout : **${timeoutMinutes} min**.` : " Aucun timeout automatique."
    }`,
  );
}

async function handleAntiLink(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "configurer") {
    await configureAntiLink(interaction);
    return;
  }
  if (!(await requirePermission(interaction, PermissionFlagsBits.ManageGuild))) {
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!(await requireBotPermissions(interaction, [PermissionFlagsBits.ManageGuild]))) {
    return;
  }

  const rule = await findManagedLinkRule(interaction.guild);
  if (!rule) {
    await interaction.editReply("Aucune règle anti-invitations gérée par ce bot. Utilise `/antilink configurer`.");
    return;
  }

  if (subcommand === "activer" || subcommand === "desactiver") {
    const enabled = subcommand === "activer";
    await rule.setEnabled(
      enabled,
      `${enabled ? "Activation" : "Désactivation"} par ${interaction.user.tag}`,
    );
    await interaction.editReply(`La règle anti-invitations est **${enabled ? "activée" : "désactivée"}**.`);
    return;
  }

  if (subcommand === "desinstaller") {
    await rule.delete(`Suppression par ${interaction.user.tag}`);
    await interaction.editReply("La règle anti-invitations du bot a été supprimée.");
    return;
  }

  if (subcommand === "exception-ajouter" || subcommand === "exception-retirer") {
    const channel = interaction.options.getChannel("salon");
    const role = interaction.options.getRole("role");
    if (!channel && !role) {
      await interaction.editReply("Choisis au moins un salon ou un rôle.");
      return;
    }
    if (role?.id === interaction.guild.roles.everyone.id) {
      await interaction.editReply("Le rôle @everyone ne peut pas être ajouté aux exceptions.");
      return;
    }
    const add = subcommand === "exception-ajouter";
    const channelIds = new Set(rule.exemptChannels.map((item) => item.id));
    const roleIds = new Set(rule.exemptRoles.map((item) => item.id));
    if (channel) {
      add ? channelIds.add(channel.id) : channelIds.delete(channel.id);
    }
    if (role) {
      add ? roleIds.add(role.id) : roleIds.delete(role.id);
    }
    if (channelIds.size > 50 || roleIds.size > 20) {
      await interaction.editReply("La limite d'exceptions autorisée par Discord serait dépassée.");
      return;
    }
    await rule.edit({
      exemptChannels: [...channelIds],
      exemptRoles: [...roleIds],
      reason: `Exceptions anti-invitations modifiées par ${interaction.user.tag}`,
    });
    await interaction.editReply(
      `${[channel, role].filter(Boolean).join(" et ")} ${add ? "ajouté(s) aux" : "retiré(s) des"} exceptions anti-invitations.`,
    );
    return;
  }

  const alertAction = rule.actions.find(
    (action) => action.type === AutoModerationActionType.SendAlertMessage,
  );
  const timeoutAction = rule.actions.find(
    (action) => action.type === AutoModerationActionType.Timeout,
  );
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(rule.enabled ? 0x57f287 : 0xed4245)
        .setTitle("Protection anti-invitations Discord")
        .addFields(
          { name: "État", value: rule.enabled ? "Activée" : "Désactivée", inline: true },
          {
            name: "Salon d'alertes",
            value: alertAction?.metadata?.channelId
              ? `<#${alertAction.metadata.channelId}>`
              : "Non disponible",
            inline: true,
          },
          {
            name: "Timeout",
            value: timeoutAction?.metadata?.durationSeconds
              ? `${Math.round(timeoutAction.metadata.durationSeconds / 60)} min`
              : "Désactivé",
            inline: true,
          },
          {
            name: "Salons autorisés",
            value: rule.exemptChannels.size
              ? rule.exemptChannels.map((item) => `${item}`).join(", ").slice(0, 1024)
              : "Aucun",
          },
          {
            name: "Rôles autorisés",
            value: rule.exemptRoles.size
              ? rule.exemptRoles.map((item) => `${item}`).join(", ").slice(0, 1024)
              : "Aucun",
          },
        )
        .setTimestamp(),
    ],
  });
}

async function handleAdmin(interaction) {
  await interaction.deferReply();
  const guild = interaction.guild;
  const owner =
    guild.members.cache.get(guild.ownerId) ||
    (await guild.members.fetch(guild.ownerId).catch(() => null));
  const administrators = guild.members.cache
    .filter((member) => !member.user.bot && member.permissions.has(PermissionFlagsBits.Administrator))
    .sort((left, right) => right.roles.highest.position - left.roles.highest.position)
    .first(20);
  const adminRoles = guild.roles.cache
    .filter(
      (role) =>
        role.id !== guild.roles.everyone.id &&
        role.permissions.has(PermissionFlagsBits.Administrator),
    )
    .sort((left, right) => right.position - left.position)
    .first(15);

  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle(`Administration de ${guild.name}`)
        .setThumbnail(guild.iconURL({ extension: "png", size: 256 }))
        .addFields(
          { name: "Propriétaire", value: owner ? `${owner} — ${owner.user.tag}` : `<@${guild.ownerId}>` },
          {
            name: "Administrateurs visibles",
            value: administrators.length
              ? administrators.map((member) => `${member} — ${member.user.tag}`).join("\n").slice(0, 1024)
              : "Aucun administrateur présent dans le cache du bot.",
          },
          {
            name: "Rôles administrateurs",
            value: adminRoles.length ? adminRoles.map((role) => `${role}`).join(", ").slice(0, 1024) : "Aucun",
          },
        )
        .setFooter({ text: "La liste des membres peut être partielle sans l'intent Membres." })
        .setTimestamp(),
    ],
  });
}

async function handleBanner(interaction) {
  await interaction.deferReply();
  const guild = await interaction.guild.fetch();
  const url = guild.bannerURL({ extension: "png", size: 2048 });
  if (!url) {
    await interaction.editReply({ content: "Ce serveur n'a pas de bannière." });
    return;
  }
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`Bannière de ${guild.name}`)
        .setImage(url)
        .setDescription(`[Ouvrir l'image](${url})`),
    ],
  });
}

async function handleBoosters(interaction) {
  const guild = interaction.guild;
  const boosterRole = guild.roles.cache.find((role) => role.tags?.premiumSubscriberRole);
  const visibleBoosters = boosterRole
    ? boosterRole.members.sort(
        (left, right) => (left.premiumSinceTimestamp || 0) - (right.premiumSinceTimestamp || 0),
      )
    : null;
  const list = visibleBoosters?.size
    ? visibleBoosters
        .first(25)
        .map(
          (member) =>
            `${member}${member.premiumSinceTimestamp ? ` — depuis <t:${Math.floor(member.premiumSinceTimestamp / 1000)}:R>` : ""}`,
        )
        .join("\n")
    : "Aucun booster n'est actuellement visible dans le cache du bot.";

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xff73fa)
        .setTitle(`Boosts de ${guild.name}`)
        .addFields(
          { name: "Niveau", value: `${guild.premiumTier}/3`, inline: true },
          { name: "Nombre de boosts", value: String(guild.premiumSubscriptionCount || 0), inline: true },
          { name: "Boosters visibles", value: truncate(list, 1024) },
        )
        .setThumbnail(guild.iconURL({ extension: "png", size: 256 }))
        .setTimestamp(),
    ],
  });
}

async function handleBotInfo(interaction) {
  const client = interaction.client;
  const guildCount = client.guilds.cache.size;
  const channelCount = client.channels.cache.size;
  const cachedUsers = client.users.cache.size;
  const memory = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1);
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("Informations du bot")
        .setThumbnail(client.user.displayAvatarURL({ extension: "png", size: 256 }))
        .addFields(
          { name: "Compte", value: `${client.user.tag}\n\`${client.user.id}\``, inline: true },
          { name: "Édition", value: "Publique — sans hébergement", inline: true },
          { name: "Uptime", value: formatDuration(process.uptime()), inline: true },
          { name: "Latence", value: `${client.ws.ping} ms`, inline: true },
          { name: "Serveurs", value: String(guildCount), inline: true },
          { name: "Salons", value: String(channelCount), inline: true },
          { name: "Utilisateurs en cache", value: String(cachedUsers), inline: true },
          { name: "Discord.js", value: discordJsVersion, inline: true },
          { name: "Node.js", value: process.version, inline: true },
          { name: "Mémoire", value: `${memory} Mio`, inline: true },
          { name: "Modules", value: "Modération, AutoMod, tickets, ModMail, logs et outils communautaires" },
        )
        .setTimestamp(),
    ],
  });
}

async function handleStats(interaction) {
  const guild = interaction.guild;
  await interaction.deferReply();
  // Loaded here because the interactive statistics module also uses the access checks above.
  const { membres } = await require("./statistics").collectCounts(guild, { entries: [{ type: "membres" }] });
  const voiceChannels = guild.channels.cache.filter((channel) => channel.isVoiceBased());
  const voiceMembers = new Set();
  for (const channel of voiceChannels.values()) {
    for (const memberId of channel.members.keys()) {
      voiceMembers.add(memberId);
    }
  }
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`Statistiques de ${guild.name}`)
        .setThumbnail(guild.iconURL({ extension: "png", size: 256 }))
        .addFields(
          { name: "Membres (hors bots)", value: membres === null ? "indisponible" : String(membres), inline: true },
          { name: "En vocal", value: String(voiceMembers.size), inline: true },
          { name: "Salons vocaux", value: String(voiceChannels.size), inline: true },
          { name: "Salons totaux", value: String(guild.channels.cache.size), inline: true },
          { name: "Rôles", value: String(guild.roles.cache.size), inline: true },
          { name: "Boosts", value: String(guild.premiumSubscriptionCount || 0), inline: true },
        )
        .setTimestamp(),
    ],
  });
}

async function handleSay(interaction, draft = null) {
  const actor = await requirePermission(interaction, PermissionFlagsBits.ManageMessages);
  if (!actor) {
    return;
  }
  // Keep Discord's string untouched: no trimming, tokenizing, newline decoding or Markdown escaping.
  const content = draft
    ? interaction.fields.getTextInputValue("contenu")
    : interaction.options.getString("contenu");
  const asEmbed = draft ? draft.asEmbed : interaction.options.getBoolean("embed") ?? false;
  const openMultilineComposer = !draft && !interaction.isPrefixCommand;
  if (!openMultilineComposer && content !== null) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  }
  const respond = (text) => interaction.deferred
    ? interaction.editReply({ content: text })
    : interaction.reply({ content: text, flags: MessageFlags.Ephemeral });
  const channel = draft
    ? await interaction.guild.channels.fetch(draft.channelId).catch(() => null)
    : interaction.options.getChannel("salon") || interaction.channel;
  const needed = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
  if (asEmbed) {
    needed.push(PermissionFlagsBits.EmbedLinks);
  }
  if (!channel?.isTextBased() || !channel.permissionsFor(actor)?.has(needed)) {
    await respond("Tu dois pouvoir voir ce salon et y envoyer des messages.");
    return;
  }
  const botMember = interaction.guild.members.me || (await interaction.guild.members.fetchMe());
  if (!channel.permissionsFor(botMember)?.has(needed)) {
    await respond("Je n'ai pas les permissions nécessaires dans ce salon.");
    return;
  }
  if (openMultilineComposer) {
    for (const [id, pending] of pendingSayDrafts) {
      if (pending.expiresAt <= Date.now()) pendingSayDrafts.delete(id);
    }
    const nonce = crypto.randomBytes(12).toString("hex");
    pendingSayDrafts.set(nonce, { guildId: interaction.guild.id, userId: interaction.user.id,
      channelId: channel.id, asEmbed, expiresAt: Date.now() + SAY_DRAFT_TTL });
    const input = new TextInputBuilder()
        .setCustomId("contenu").setLabel("Texte à envoyer, retours à la ligne inclus")
        .setStyle(TextInputStyle.Paragraph).setMinLength(1).setMaxLength(2000).setRequired(true);
    if (typeof content === "string" && content.length >= 1 && content.length <= 2000) {
      input.setValue(content);
    }
    const modal = new ModalBuilder().setCustomId(`dire:compose:${nonce}`).setTitle("Composer le message multiligne")
      .addComponents(new ActionRowBuilder().addComponents(input));
    await interaction.showModal(modal);
    return;
  }
  if (content === null) {
    await respond('Indique le contenu avec +dire "ton texte", ou utilise /dire pour ouvrir la saisie multiligne.');
    return;
  }
  if (typeof content !== "string" || content.length < 1 || content.length > 2000) {
    await respond("Le contenu doit contenir entre 1 et 2 000 caractères.");
    return;
  }
  await channel.send(
    asEmbed
      ? {
          embeds: [
            new EmbedBuilder()
              .setColor(0x5865f2)
              .setDescription(content)
              .setFooter({ text: `Publié par ${interaction.user.tag}` })
              .setTimestamp(),
          ],
          allowedMentions: { parse: [] },
        }
      : { content, allowedMentions: { parse: [] } },
  );
  await respond(`Message envoyé dans ${channel}.`);
}

async function handleSayModal(interaction) {
  if (!interaction.isModalSubmit?.() || !interaction.customId?.startsWith("dire:compose:")) return false;
  const nonce = interaction.customId.slice("dire:compose:".length);
  const draft = pendingSayDrafts.get(nonce);
  if (!draft || draft.expiresAt <= Date.now() || draft.guildId !== interaction.guild?.id || draft.userId !== interaction.user.id) {
    if (draft?.expiresAt <= Date.now()) pendingSayDrafts.delete(nonce);
    await interaction.reply({ content: "Ce formulaire a expiré ou ne t'appartient pas. Relance /dire.", flags: MessageFlags.Ephemeral });
    return true;
  }
  pendingSayDrafts.delete(nonce);
  // Recheck access on submit; the destination and embed mode are bound to the original command.
  if (await enforceCommandAccess(interaction)) await handleSay(interaction, draft);
  return true;
}

function rememberDeletedMessage(message) {
  if (!message.guild || !message.channelId || !message.author || message.author.bot) {
    return;
  }
  const attachments = [...message.attachments.values()].slice(0, 10).map((attachment) => ({
    name: attachment.name || "fichier",
    url: attachment.url,
  }));
  if (!message.content && attachments.length === 0) {
    return;
  }
  const key = `${message.guild.id}:${message.channelId}`;
  const entry = {
    authorId: message.author.id,
    authorTag: message.author.tag,
    avatarUrl: message.author.displayAvatarURL({ extension: "png", size: 256 }),
    channelId: message.channelId,
    content: message.content || null,
    attachments,
    deletedAt: Date.now(),
  };
  deletedMessages.set(key, entry);
  const timeout = setTimeout(() => {
    if (deletedMessages.get(key) === entry) {
      deletedMessages.delete(key);
    }
  }, SNIPE_TTL);
  timeout.unref?.();
}

async function handleSnipe(interaction) {
  if (!(await requirePermission(interaction, PermissionFlagsBits.ManageMessages))) {
    return;
  }
  const channel = interaction.options.getChannel("salon") || interaction.channel;
  const entry = deletedMessages.get(`${interaction.guild.id}:${channel.id}`);
  if (!entry || Date.now() - entry.deletedAt > SNIPE_TTL) {
    await interaction.reply({
      content: "Aucun message supprimé n'a été mémorisé dans ce salon durant les 15 dernières minutes.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const embed = new EmbedBuilder()
    .setColor(0xfaa61a)
    .setTitle("Dernier message supprimé")
    .setAuthor({ name: entry.authorTag, iconURL: entry.avatarUrl })
    .setDescription(truncate(entry.content || "*Aucun contenu textuel*", 4000))
    .addFields(
      { name: "Auteur", value: `<@${entry.authorId}> (\`${entry.authorId}\`)`, inline: true },
      { name: "Salon", value: `<#${entry.channelId}>`, inline: true },
      { name: "Supprimé", value: `<t:${Math.floor(entry.deletedAt / 1000)}:R>`, inline: true },
    )
    .setTimestamp(entry.deletedAt);
  if (entry.attachments.length) {
    embed.addFields({
      name: "Pièces jointes",
      value: truncate(entry.attachments.map((item) => `[${item.name}](${item.url})`).join("\n"), 1024),
    });
  }
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleRenewCommand(interaction) {
  if (!(await requirePermission(interaction, PermissionFlagsBits.ManageChannels))) {
    return;
  }
  const channel = interaction.options.getChannel("salon") || interaction.channel;
  if (!channel?.guild || typeof channel.clone !== "function") {
    await interaction.reply({ content: "Choisis un salon textuel recréable.", flags: MessageFlags.Ephemeral });
    return;
  }
  const nonce = crypto.randomBytes(8).toString("hex");
  pendingRenewals.set(nonce, {
    guildId: interaction.guild.id,
    channelId: channel.id,
    userId: interaction.user.id,
    expiresAt: Date.now() + 2 * 60_000,
  });
  const timeout = setTimeout(() => pendingRenewals.delete(nonce), 2 * 60_000);
  timeout.unref?.();
  await interaction.reply({
    content: `⚠️ Confirme la recréation de ${channel}. L'ancien salon et tous ses messages seront supprimés après clonage.`,
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`legacy:renew:confirm:${nonce}`)
          .setLabel("Confirmer la recréation")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`legacy:renew:cancel:${nonce}`)
          .setLabel("Annuler")
          .setStyle(ButtonStyle.Secondary),
      ),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function handleRenewButton(interaction) {
  if (!interaction.customId.startsWith("legacy:renew:")) {
    return false;
  }
  const [, , action, nonce] = interaction.customId.split(":");
  const pending = pendingRenewals.get(nonce);
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
  pendingRenewals.delete(nonce);
  if (action === "cancel") {
    await interaction.update({ content: "Recréation annulée.", components: [] });
    return true;
  }
  if (!(await requirePermission(interaction, PermissionFlagsBits.ManageChannels))) {
    return true;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  if (!(await requireBotPermissions(interaction, [PermissionFlagsBits.ManageChannels]))) {
    return true;
  }
  const oldChannel = await interaction.guild.channels.fetch(pending.channelId).catch(() => null);
  if (!oldChannel || typeof oldChannel.clone !== "function") {
    await interaction.editReply("Le salon n'existe plus ou ne peut pas être recréé.");
    return true;
  }
  const reason = `Salon recréé par ${interaction.user.tag} (${interaction.user.id})`;
  let newChannel;
  try {
    newChannel = await oldChannel.clone({ reason });
    await newChannel.setPosition(oldChannel.position, { reason }).catch(() => {});
    await newChannel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("Salon recréé")
          .setDescription(`Ce salon a été recréé à la demande de ${interaction.user}.`)
          .setTimestamp(),
      ],
    });
    await interaction.editReply(`Le nouveau salon ${newChannel} a été créé. Suppression de l'ancien salon…`);
    await oldChannel.delete(reason);
    await sendLog(
      interaction.guild,
      "channels",
      new EmbedBuilder()
        .setColor(0xfaa61a)
        .setTitle("Salon recréé")
        .setDescription(`${newChannel} remplace le salon \`${pending.channelId}\`.`)
        .setFooter({ text: `Par ${interaction.user.tag}` })
        .setTimestamp(),
    );
  } catch (error) {
    if (newChannel && oldChannel?.guild?.channels.cache.has(oldChannel.id)) {
      await newChannel.delete("Annulation après échec de la recréation").catch(() => {});
    }
    throw error;
  }
  return true;
}

async function applicationOwnerLabel(client) {
  const application = await client.application.fetch();
  const owner = application.owner;
  if (!owner) {
    return "Non disponible";
  }
  if (owner.user) {
    return `${owner.user.tag} (équipe ${owner.name || owner.id})`;
  }
  return `${owner.tag} (\`${owner.id}\`)`;
}

async function handleOwnerBot(interaction) {
  await interaction.deferReply();
  const owner = await applicationOwnerLabel(interaction.client);
  await interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf1c40f)
        .setTitle("Propriétaires du bot")
        .setDescription(`Propriétaire de l'application : **${owner}**`)
        .addFields(
          {
            name: "Propriétaires supplémentaires",
            value: ADDITIONAL_BOT_OWNER_IDS.length
              ? ADDITIONAL_BOT_OWNER_IDS.map((id) => `<@${id}> (\`${id}\`)`).join("\n")
              : "Aucun",
          },
          { name: "Bot", value: `${interaction.client.user.tag} (\`${interaction.client.user.id}\`)` },
          {
            name: "Application créée",
            value: `<t:${Math.floor(interaction.client.user.createdTimestamp / 1000)}:F>`,
          },
        )
        .setTimestamp(),
    ],
  });
}

function isDelegatedOwner(data, userId) {
  return data.access.ownerUserIds.includes(userId);
}

async function requireAccessManager(interaction, ownerOnly = false) {
  const data = await readGuild(interaction.guild.id);
  const guildOwner = interaction.user.id === interaction.guild.ownerId;
  const botOwner = await isBotOwner(interaction.client, interaction.user.id);
  if (
    guildOwner ||
    botOwner ||
    (!ownerOnly && isDelegatedOwner(data, interaction.user.id))
  ) {
    return data;
  }
  await interaction.reply({
    content: ownerOnly
      ? "Seuls le propriétaire du serveur et les propriétaires du bot peuvent modifier les responsables."
      : "Cette commande est réservée aux propriétaires et aux responsables délégués.",
    flags: MessageFlags.Ephemeral,
  });
  return null;
}

async function handleWhitelist(interaction) {
  const current = await requireAccessManager(interaction);
  if (!current) {
    return;
  }
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "liste") {
    await interaction.reply({
      content: [
        `Liste blanche : **${current.access.whitelistEnabled ? "activée" : "désactivée"}**`,
        current.access.whitelistUserIds.length
          ? current.access.whitelistUserIds.map((id) => `• <@${id}> (\`${id}\`)`).join("\n")
          : "Aucun utilisateur ajouté.",
        "Les propriétaires du serveur et du bot, les responsables délégués et les administrateurs restent toujours autorisés.",
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (subcommand === "activer" || subcommand === "desactiver") {
    const enabled = subcommand === "activer";
    await mutateGuild(interaction.guild.id, (data) => {
      data.access.whitelistEnabled = enabled;
    });
    await interaction.reply({
      content: `La liste blanche des commandes est **${enabled ? "activée" : "désactivée"}**.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (subcommand === "ajouter") {
    const user = interaction.options.getUser("utilisateur", true);
    if (user.bot) {
      await interaction.reply({ content: "Un bot ne peut pas être ajouté à cette liste.", flags: MessageFlags.Ephemeral });
      return;
    }
    await mutateGuild(interaction.guild.id, (data) => {
      if (!data.access.whitelistUserIds.includes(user.id)) {
        data.access.whitelistUserIds.push(user.id);
      }
    });
    await interaction.reply({ content: `${user} est maintenant sur la liste blanche.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const userId = interaction.options.getString("identifiant", true);
  if (!/^\d{17,20}$/.test(userId)) {
    await interaction.reply({ content: "Identifiant Discord invalide.", flags: MessageFlags.Ephemeral });
    return;
  }
  let removed = false;
  await mutateGuild(interaction.guild.id, (data) => {
    const before = data.access.whitelistUserIds.length;
    data.access.whitelistUserIds = data.access.whitelistUserIds.filter((id) => id !== userId);
    removed = before !== data.access.whitelistUserIds.length;
  });
  await interaction.reply({
    content: removed ? `<@${userId}> a été retiré de la liste blanche.` : "Identifiant absent de la liste blanche.",
    flags: MessageFlags.Ephemeral,
  });
}

async function handleOwners(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const current = await requireAccessManager(interaction, subcommand !== "liste");
  if (!current) {
    return;
  }
  if (subcommand === "liste") {
    await interaction.reply({
      content: [
        `Propriétaire du serveur : <@${interaction.guild.ownerId}>`,
        `Propriétaires supplémentaires du bot : ${ADDITIONAL_BOT_OWNER_IDS.length
          ? ADDITIONAL_BOT_OWNER_IDS.map((id) => `<@${id}>`).join(", ")
          : "aucun"}`,
        current.access.ownerUserIds.length
          ? `Responsables délégués :\n${current.access.ownerUserIds.map((id) => `• <@${id}> (\`${id}\`)`).join("\n")}`
          : "Aucun responsable délégué.",
      ].join("\n"),
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (subcommand === "ajouter") {
    const user = interaction.options.getUser("utilisateur", true);
    if (user.bot || user.id === interaction.guild.ownerId) {
      await interaction.reply({ content: "Cet utilisateur ne peut pas être ajouté.", flags: MessageFlags.Ephemeral });
      return;
    }
    await mutateGuild(interaction.guild.id, (data) => {
      if (!data.access.ownerUserIds.includes(user.id)) {
        data.access.ownerUserIds.push(user.id);
      }
    });
    await interaction.reply({ content: `${user} est maintenant responsable délégué du bot.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const userId = interaction.options.getString("identifiant", true);
  let removed = false;
  await mutateGuild(interaction.guild.id, (data) => {
    const before = data.access.ownerUserIds.length;
    data.access.ownerUserIds = data.access.ownerUserIds.filter((id) => id !== userId);
    removed = before !== data.access.ownerUserIds.length;
  });
  await interaction.reply({
    content: removed ? `<@${userId}> n'est plus responsable délégué.` : "Identifiant absent de la liste.",
    flags: MessageFlags.Ephemeral,
  });
}

async function handleLists(interaction) {
  if (!(await requirePermission(interaction, PermissionFlagsBits.ManageGuild))) {
    return;
  }
  const data = await readGuild(interaction.guild.id);
  const describe = (ids) =>
    ids.length ? ids.slice(0, 20).map((id) => `<@${id}>`).join(", ") : "Aucun";
  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("Listes de sécurité")
        .addFields(
          {
            name: `Blacklist (${data.blacklist.length})`,
            value: describe(data.blacklist.map((entry) => entry.userId)),
          },
          {
            name: `Whitelist (${data.access.whitelistUserIds.length})`,
            value: `${data.access.whitelistEnabled ? "Activée" : "Désactivée"} — ${describe(data.access.whitelistUserIds)}`,
          },
          {
            name: `Responsables (${data.access.ownerUserIds.length})`,
            value: describe(data.access.ownerUserIds),
          },
        )
        .setTimestamp(),
    ],
    flags: MessageFlags.Ephemeral,
  });
}

async function enforceCommandAccess(interaction) {
  const data = await readGuild(interaction.guild.id);
  if (!data.access.whitelistEnabled) {
    return true;
  }
  if (["help", "aide-gestion", "whitelist", "owners"].includes(interaction.commandName)) {
    return true;
  }
  const member =
    interaction.member?.permissions && interaction.member?.roles?.cache
      ? interaction.member
      : interaction.guild.members.cache.get(interaction.user.id) ||
        (await interaction.guild.members.fetch(interaction.user.id));
  const allowed =
    interaction.user.id === interaction.guild.ownerId ||
    (await isBotOwner(interaction.client, interaction.user.id)) ||
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    data.access.ownerUserIds.includes(interaction.user.id) ||
    data.access.whitelistUserIds.includes(interaction.user.id);
  if (allowed) {
    return true;
  }
  await interaction.reply({
    content: "La liste blanche des commandes est activée et tu n'es pas autorisé à utiliser le bot.",
    flags: MessageFlags.Ephemeral,
  });
  return false;
}

async function handleLegacyCommand(interaction) {
  switch (interaction.commandName) {
    case "antilink":
      await handleAntiLink(interaction);
      return true;
    case "admin":
      await handleAdmin(interaction);
      return true;
    case "banner":
      await handleBanner(interaction);
      return true;
    case "boosters":
      await handleBoosters(interaction);
      return true;
    case "botinfo":
      await handleBotInfo(interaction);
      return true;
    case "stats":
      await handleStats(interaction);
      return true;
    case "dire":
      await handleSay(interaction);
      return true;
    case "snipe":
      await handleSnipe(interaction);
      return true;
    case "renouveler":
    case "renew":
      await handleRenewCommand(interaction);
      return true;
    case "ownerbot":
      await handleOwnerBot(interaction);
      return true;
    case "whitelist":
      await handleWhitelist(interaction);
      return true;
    case "owners":
      await handleOwners(interaction);
      return true;
    case "listes":
      await handleLists(interaction);
      return true;
    default:
      return false;
  }
}

module.exports = {
  LINK_FILTER,
  LINK_RULE_NAME,
  buildAntiLinkRuleOptions,
  configureManagedAntiLink,
  enforceCommandAccess,
  handleLegacyButton: handleRenewButton,
  handleLegacyCommand,
  handleSayModal,
  rememberDeletedMessage,
  refreshManagedAntiLinkRule,
};
