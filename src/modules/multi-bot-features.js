const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const {
  configureManagedMentionRule,
  configureNativeAutoMod,
  getAutoModStatus,
  setManagedRulesEnabled,
} = require("./discord-automod");
const { configureManagedAntiLink } = require("./legacy-features");
const { buildBotInviteUrl, isBotOwner, normalizeGuildId } = require("./guild-access");
const { sendLog } = require("./server-events");
const { mutateGuild, readGuild } = require("../persistence/guild-store");

const MAX_VOUCHES = 1000;
const HANGMAN_WORDS = Object.freeze([
  "aventure", "communaute", "discord", "dragon", "galaxie", "gaming",
  "manette", "mystere", "pixel", "serveur", "strategie", "victoire",
]);
const activeHangmanChannels = new Set();

function containsDiscordToken(value) {
  return /(?:mfa\.[\w-]{80,}|[\w-]{20,30}\.[\w-]{6,7}\.[\w-]{25,110})/.test(String(value || ""));
}

function replyPrivate(interaction, payload) {
  const data = typeof payload === "string" ? { content: payload } : { ...payload };
  if (interaction.deferred || interaction.replied) {
    delete data.flags;
    return interaction.editReply(data);
  }
  if (!interaction.isPrefixCommand) data.flags ??= MessageFlags.Ephemeral;
  return interaction.reply(data);
}

function truncate(value, maximum) {
  const text = String(value || "");
  return text.length > maximum ? `${text.slice(0, maximum - 1)}…` : text;
}

async function actorMember(interaction) {
  return interaction.member?.permissions
    ? interaction.member
    : interaction.guild.members.fetch(interaction.user.id);
}

async function requirePermission(interaction, permission) {
  const actor = await actorMember(interaction);
  if (actor.permissions.has(permission)) return actor;
  await replyPrivate(interaction, "Tu n'as pas la permission nécessaire pour cette action.");
  return null;
}

async function requireBotPermissions(interaction, permissions) {
  const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe();
  const missing = botMember.permissions.missing(permissions);
  if (!missing.length) return botMember;
  await replyPrivate(interaction, `Il manque des permissions au bot : ${missing.map((item) => `\`${item}\``).join(", ")}.`);
  return null;
}

function manageableRole(guild, role, actor, botMember) {
  if (!role || role.id === guild.id || role.managed) return false;
  if (botMember.roles.highest.comparePositionTo(role) <= 0) return false;
  return actor.id === guild.ownerId || actor.roles.highest.comparePositionTo(role) > 0;
}

function canActOnMember(guild, actor, botMember, member) {
  if (!member || member.id === guild.ownerId || member.id === botMember.id) return false;
  const actorAllowed = actor.id === guild.ownerId || actor.roles.highest.comparePositionTo(member.roles.highest) > 0;
  return actorAllowed && botMember.roles.highest.comparePositionTo(member.roles.highest) > 0;
}

function safeHttpsUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password ? url.toString() : null;
  } catch {
    return null;
  }
}

function formatMilliseconds(value) {
  let seconds = Math.max(0, Math.floor(Number(value || 0) / 1000));
  const days = Math.floor(seconds / 86400);
  seconds %= 86400;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${days ? `${days}j ` : ""}${hours ? `${hours}h ` : ""}${minutes}m ${remaining}s`;
}

function vouchEmbed(entry) {
  const embed = new EmbedBuilder()
    .setColor(0xf5a623)
    .setTitle(`⭐ Avis #${entry.id}`)
    .setDescription(entry.review)
    .addFields(
      { name: "Membre évalué", value: `<@${entry.targetId}>`, inline: true },
      { name: "Auteur", value: `<@${entry.authorId}>`, inline: true },
      { name: "Note", value: "⭐".repeat(entry.rating), inline: true },
      { name: "Service", value: entry.service },
    )
    .setTimestamp(new Date(entry.createdAt));
  if (entry.proofUrl) embed.setImage(entry.proofUrl);
  return embed;
}

async function handleVouch(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "configurer") {
    if (!await requirePermission(interaction, PermissionFlagsBits.ManageGuild)) return;
    const channel = interaction.options.getChannel("salon", true);
    const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe();
    if (!channel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
      await replyPrivate(interaction, "Le bot doit pouvoir voir ce salon, y envoyer des messages et intégrer des liens.");
      return;
    }
    await mutateGuild(interaction.guildId, (data) => { data.multiBot.vouches.channelId = channel.id; });
    await channel.send({ embeds: [new EmbedBuilder().setColor(0xf5a623).setTitle("⭐ Avis clients").setDescription("Les avis validés avec `/vouch envoyer` seront publiés ici.")] });
    await replyPrivate(interaction, `Salon des avis configuré : ${channel}.`);
    return;
  }

  if (subcommand === "envoyer") {
    const target = interaction.options.getUser("membre", true);
    if (target.id === interaction.user.id) return replyPrivate(interaction, "Tu ne peux pas publier un avis sur toi-même.");
    if (target.bot) return replyPrivate(interaction, "Un avis client ne peut pas viser un bot.");
    const proofInput = interaction.options.getString("preuve_url");
    const proofUrl = safeHttpsUrl(proofInput);
    if (proofInput && !proofUrl) return replyPrivate(interaction, "La preuve doit être une URL HTTPS valide sans identifiants intégrés.");
    const data = await readGuild(interaction.guildId);
    const channel = data.multiBot.vouches.channelId
      ? await interaction.guild.channels.fetch(data.multiBot.vouches.channelId).catch(() => null)
      : interaction.channel;
    if (!channel?.isTextBased() || channel.isThread()) return replyPrivate(interaction, "Configure d'abord un salon textuel avec `/vouch configurer`.");
    const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe();
    if (!channel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
      return replyPrivate(interaction, "Je ne peux pas publier dans le salon des avis configuré.");
    }
    const entry = await mutateGuild(interaction.guildId, (guildData) => {
      const id = Math.max(1, Number(guildData.multiBot.vouches.nextId) || 1);
      guildData.multiBot.vouches.nextId = id + 1;
      const created = {
        id,
        authorId: interaction.user.id,
        targetId: target.id,
        service: interaction.options.getString("service", true),
        rating: interaction.options.getInteger("note", true),
        review: interaction.options.getString("avis", true),
        proofUrl,
        channelId: channel.id,
        messageId: null,
        createdAt: new Date().toISOString(),
      };
      guildData.multiBot.vouches.entries.push(created);
      guildData.multiBot.vouches.entries = guildData.multiBot.vouches.entries.slice(-MAX_VOUCHES);
      return created;
    });
    try {
      const message = await channel.send({ embeds: [vouchEmbed(entry)], allowedMentions: { parse: [] } });
      await mutateGuild(interaction.guildId, (guildData) => {
        const stored = guildData.multiBot.vouches.entries.find((item) => item.id === entry.id);
        if (stored) stored.messageId = message.id;
      });
      await replyPrivate(interaction, `Avis #${entry.id} publié dans ${channel}.`);
    } catch (error) {
      await mutateGuild(interaction.guildId, (guildData) => {
        guildData.multiBot.vouches.entries = guildData.multiBot.vouches.entries.filter((item) => item.id !== entry.id);
      });
      throw error;
    }
    return;
  }

  if (subcommand === "profil") {
    const target = interaction.options.getUser("membre") || interaction.user;
    const data = await readGuild(interaction.guildId);
    const entries = data.multiBot.vouches.entries.filter((item) => item.targetId === target.id);
    if (!entries.length) return replyPrivate(interaction, `${target} n'a encore reçu aucun avis.`);
    const average = entries.reduce((sum, item) => sum + item.rating, 0) / entries.length;
    const recent = truncate(entries.slice(-5).reverse()
      .map((item) => `**#${item.id} — ${"⭐".repeat(item.rating)} — ${truncate(item.service, 100)}**\n${truncate(item.review, 550)}`)
      .join("\n\n"), 3850);
    await interaction.reply({ embeds: [new EmbedBuilder()
      .setColor(0xf5a623)
      .setTitle(`Avis de ${target.username}`)
      .setThumbnail(target.displayAvatarURL({ extension: "png", size: 256 }))
      .setDescription(`Moyenne : **${average.toFixed(1)}/5** sur **${entries.length} avis**.\n\n${recent}`)
      .setTimestamp()] });
    return;
  }

  if (subcommand === "supprimer") {
    if (!await requirePermission(interaction, PermissionFlagsBits.ManageMessages)) return;
    const id = interaction.options.getInteger("id", true);
    const removed = await mutateGuild(interaction.guildId, (data) => {
      const index = data.multiBot.vouches.entries.findIndex((item) => item.id === id);
      if (index < 0) return null;
      return data.multiBot.vouches.entries.splice(index, 1)[0];
    });
    if (!removed) return replyPrivate(interaction, "Avis introuvable.");
    if (removed.channelId && removed.messageId) {
      const channel = await interaction.guild.channels.fetch(removed.channelId).catch(() => null);
      if (channel?.isTextBased()) await channel.messages.delete(removed.messageId).catch(() => {});
    }
    await replyPrivate(interaction, `Avis #${id} supprimé.`);
  }
}

async function handleShop(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "paiement") {
    const data = await readGuild(interaction.guildId);
    if (!data.multiBot.shop.paymentText) return replyPrivate(interaction, "Aucun moyen de paiement n'est encore configuré.");
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("💳 Moyens de paiement").setDescription(data.multiBot.shop.paymentText)] });
    return;
  }
  if (subcommand === "paiement-configurer") {
    if (!await requirePermission(interaction, PermissionFlagsBits.ManageGuild)) return;
    const text = interaction.options.getString("texte", true);
    await mutateGuild(interaction.guildId, (data) => { data.multiBot.shop.paymentText = text; });
    await replyPrivate(interaction, "Moyens de paiement enregistrés. Aucun paiement ni secret bancaire n'est traité par le bot.");
    return;
  }
  if (subcommand === "client-configurer") {
    const actor = await requirePermission(interaction, PermissionFlagsBits.ManageRoles);
    if (!actor) return;
    const botMember = await requireBotPermissions(interaction, [PermissionFlagsBits.ManageRoles]);
    if (!botMember) return;
    const role = interaction.options.getRole("role", true);
    if (!manageableRole(interaction.guild, role, actor, botMember)) return replyPrivate(interaction, "Ce rôle est géré, trop élevé ou correspond à @everyone.");
    await mutateGuild(interaction.guildId, (data) => { data.multiBot.shop.customerRoleId = role.id; });
    await replyPrivate(interaction, `Rôle Client configuré : ${role}.`);
    return;
  }
  if (subcommand === "client") {
    const actor = await requirePermission(interaction, PermissionFlagsBits.ManageRoles);
    if (!actor) return;
    const botMember = await requireBotPermissions(interaction, [PermissionFlagsBits.ManageRoles]);
    if (!botMember) return;
    const target = await interaction.guild.members.fetch(interaction.options.getUser("membre", true).id);
    const data = await readGuild(interaction.guildId);
    const role = data.multiBot.shop.customerRoleId ? interaction.guild.roles.cache.get(data.multiBot.shop.customerRoleId) : null;
    if (!manageableRole(interaction.guild, role, actor, botMember)) return replyPrivate(interaction, "Le rôle Client n'est pas configuré ou n'est plus attribuable.");
    if (!canActOnMember(interaction.guild, actor, botMember, target)) return replyPrivate(interaction, "La hiérarchie des rôles empêche cette attribution.");
    await target.roles.add(role, `Rôle Client attribué par ${interaction.user.tag}`);
    await replyPrivate(interaction, `${role} attribué à ${target}.`);
    return;
  }
  if (subcommand === "verification-configurer") {
    const actor = await requirePermission(interaction, PermissionFlagsBits.ManageRoles);
    if (!actor) return;
    const botMember = await requireBotPermissions(interaction, [PermissionFlagsBits.ManageRoles]);
    if (!botMember) return;
    const channel = interaction.options.getChannel("salon", true);
    const role = interaction.options.getRole("role", true);
    if (!manageableRole(interaction.guild, role, actor, botMember)) return replyPrivate(interaction, "Le rôle de vérification n'est pas attribuable.");
    await mutateGuild(interaction.guildId, (data) => {
      data.multiBot.shop.verificationChannelId = channel.id;
      data.multiBot.shop.verificationRoleId = role.id;
    });
    await channel.send({ embeds: [new EmbedBuilder().setColor(0x57f287).setTitle("✅ Vérification").setDescription(`Utilise **/boutique verifier** dans ce salon pour recevoir ${role}.`)] });
    await replyPrivate(interaction, `Vérification configurée dans ${channel} avec ${role}.`);
    return;
  }
  if (subcommand === "verifier") {
    const data = await readGuild(interaction.guildId);
    if (!data.multiBot.shop.verificationChannelId || !data.multiBot.shop.verificationRoleId) return replyPrivate(interaction, "La vérification n'est pas configurée.");
    if (interaction.channelId !== data.multiBot.shop.verificationChannelId) return replyPrivate(interaction, `Utilise cette commande dans <#${data.multiBot.shop.verificationChannelId}>.`);
    const role = interaction.guild.roles.cache.get(data.multiBot.shop.verificationRoleId);
    const botMember = await requireBotPermissions(interaction, [PermissionFlagsBits.ManageRoles]);
    if (!role || !botMember || role.managed || botMember.roles.highest.comparePositionTo(role) <= 0) return replyPrivate(interaction, "Le rôle de vérification n'est plus attribuable.");
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (member.roles.cache.has(role.id)) return replyPrivate(interaction, "Tu es déjà vérifié.");
    await member.roles.add(role, "Vérification volontaire via le bot");
    await replyPrivate(interaction, `Vérification réussie : ${role} t'a été attribué.`);
    return;
  }
  if (subcommand === "suggestion-configurer") {
    if (!await requirePermission(interaction, PermissionFlagsBits.ManageGuild)) return;
    const channel = interaction.options.getChannel("salon", true);
    await mutateGuild(interaction.guildId, (data) => { data.suggestions.channelId = channel.id; });
    await replyPrivate(interaction, `Les suggestions de /suggerer seront publiées dans ${channel}.`);
    return;
  }
  if (subcommand === "statut") {
    if (!await requirePermission(interaction, PermissionFlagsBits.ManageGuild)) return;
    const data = await readGuild(interaction.guildId);
    const shop = data.multiBot.shop;
    await replyPrivate(interaction, { embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("🛍️ Configuration boutique").addFields(
      { name: "Paiement", value: shop.paymentText ? "Configuré" : "Non configuré", inline: true },
      { name: "Rôle Client", value: shop.customerRoleId ? `<@&${shop.customerRoleId}>` : "Non configuré", inline: true },
      { name: "Vérification", value: shop.verificationChannelId && shop.verificationRoleId ? `<#${shop.verificationChannelId}> → <@&${shop.verificationRoleId}>` : "Non configurée" },
      { name: "Suggestions", value: data.suggestions.channelId ? `<#${data.suggestions.channelId}>` : "Non configurées" },
    )] });
  }
}

function hangmanDisplay(word, guessed) {
  return [...word].map((letter) => guessed.has(letter) ? letter.toUpperCase() : "▢").join(" ");
}

async function handleHangman(interaction) {
  const key = `${interaction.guildId}:${interaction.channelId}`;
  if (activeHangmanChannels.has(key)) return replyPrivate(interaction, "Une partie de pendu est déjà en cours dans ce salon.");
  const word = HANGMAN_WORDS[Math.floor(Math.random() * HANGMAN_WORDS.length)];
  const guessed = new Set();
  let attempts = 7;
  activeHangmanChannels.add(key);
  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("🎮 Pendu")
      .setDescription(`${hangmanDisplay(word, guessed)}\n\nÉcris une lettre ou le mot complet. Il reste **${attempts} essais**.`)
      .setFooter({ text: `Partie de ${interaction.user.tag} • 60 secondes` })],
  });
  const gameMessage = await interaction.fetchReply();
  const collector = interaction.channel.createMessageCollector({
    filter: (message) => message.author.id === interaction.user.id && /^[a-zà-ÿ-]+$/i.test(message.content.trim()),
    time: 60_000,
  });
  collector.on("collect", async (message) => {
    const guess = message.content.trim().toLocaleLowerCase("fr");
    if (guess.length === 1) {
      if (guessed.has(guess)) return;
      guessed.add(guess);
      if (!word.includes(guess)) attempts -= 1;
    } else if (guess === word) {
      for (const letter of word) guessed.add(letter);
    } else {
      attempts -= 1;
    }
    const won = [...word].every((letter) => guessed.has(letter));
    const finished = won || attempts <= 0;
    await gameMessage.edit({ embeds: [new EmbedBuilder()
      .setColor(won ? 0x57f287 : finished ? 0xed4245 : 0x5865f2)
      .setTitle(won ? "🏆 Pendu gagné" : finished ? "💀 Pendu terminé" : "🎮 Pendu")
      .setDescription(`${finished ? word.toUpperCase() : hangmanDisplay(word, guessed)}\n\n${won ? "Bravo !" : finished ? "Plus aucun essai." : `Il reste **${attempts} essais**.`}`)
      .setFooter({ text: `Lettres proposées : ${[...guessed].join(", ") || "aucune"}` })] }).catch(() => {});
    if (finished) collector.stop(won ? "won" : "lost");
  });
  collector.on("end", async (_messages, reason) => {
    activeHangmanChannels.delete(key);
    if (reason === "time") {
      await gameMessage.edit({ embeds: [new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle("⏱️ Pendu expiré")
        .setDescription(`Le mot était **${word.toUpperCase()}**.`)] }).catch(() => {});
    }
  });
}

async function handleProtect(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const publicSubcommands = new Set(["invitation", "mixnom", "qi", "pendu", "voctime", "voicetop"]);
  if (!publicSubcommands.has(subcommand) && !await requirePermission(interaction, PermissionFlagsBits.ManageGuild)) return;
  if (subcommand === "invitation") {
    const guildId = normalizeGuildId(interaction.options.getString("serveur_id") || interaction.guildId);
    if (!guildId) return replyPrivate(interaction, "L'identifiant du serveur doit contenir entre 17 et 20 chiffres.");
    const url = buildBotInviteUrl(interaction.client.user.id, guildId);
    await replyPrivate(interaction, {
      embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("🔗 Inviter le bot").setDescription(`Le serveur \`${guildId}\` est présélectionné. Discord demandera toujours une validation humaine.`)],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel("Inviter le bot").setStyle(ButtonStyle.Link).setURL(url))],
    });
    return;
  }
  if (subcommand === "mixnom") {
    const first = interaction.options.getUser("membre_1", true);
    const second = interaction.options.getUser("membre_2", true);
    const left = [...first.username];
    const right = [...second.username];
    const mixed = `${left.slice(0, Math.ceil(left.length / 2)).join("")}${right.slice(Math.floor(right.length / 2)).join("")}`;
    await interaction.reply({ content: `🧪 ${first} + ${second} = **${truncate(mixed, 64)}**`, allowedMentions: { parse: [] } });
    return;
  }
  if (subcommand === "qi") {
    const target = interaction.options.getUser("membre") || interaction.user;
    const score = 70 + Math.floor(Math.random() * 71);
    await interaction.reply({ content: `🧠 Score humoristique de ${target} : **${score}**. Ce résultat est aléatoire et n'a aucune valeur réelle.`, allowedMentions: { parse: [] } });
    return;
  }
  if (subcommand === "pendu") return handleHangman(interaction);
  if (subcommand === "tout") {
    const botMember = await requireBotPermissions(interaction, [PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ModerateMembers]);
    if (!botMember) return;
    const channel = interaction.options.getChannel("salon_alertes") || interaction.channel;
    if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel?.type)) return replyPrivate(interaction, "Précise un salon textuel pour les alertes.");
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const moderatorTag = `${interaction.user.tag} (${interaction.user.id})`;
    const results = await configureNativeAutoMod(interaction.guild, {
      alertChannelId: channel.id,
      keywords: [],
      mentionLimit: 5,
      timeoutMinutes: 10,
    }, moderatorTag);
    results.push(await configureManagedAntiLink(interaction.guild, { alertChannelId: channel.id, timeoutMinutes: 10 }, moderatorTag));
    await setManagedRulesEnabled(interaction.guild, true, moderatorTag);
    await mutateGuild(interaction.guildId, (data) => { data.multiBot.protect.antiGhostPingEnabled = true; });
    await interaction.editReply(`Protection complète activée dans ${channel}.\n${results.map((item) => `• **${item.name}** : ${item.status}`).join("\n")}`);
    return;
  }
  if (subcommand === "statut") {
    const data = await readGuild(interaction.guildId);
    const { managed } = await getAutoModStatus(interaction.guild);
    await replyPrivate(interaction, { embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("🛡️ Protections avancées").addFields(
      { name: "AutoMod géré", value: `${managed.filter((rule) => rule.enabled).size}/${managed.size} règle(s) active(s)`, inline: true },
      { name: "Anti-ghost-ping", value: data.multiBot.protect.antiGhostPingEnabled ? "Actif" : "Inactif", inline: true },
      { name: "Anti-bot", value: data.multiBot.protect.antiBotEnabled ? "Actif" : "Inactif", inline: true },
      { name: "Bots autorisés", value: String(data.multiBot.protect.allowedBotIds.length), inline: true },
      { name: "Temps vocal", value: data.multiBot.protect.voiceTimeEnabled ? "Actif" : "Inactif", inline: true },
    )] });
    return;
  }
  if (subcommand === "antighostping" || subcommand === "antibot") {
    const enabled = interaction.options.getBoolean("actif", true);
    await mutateGuild(interaction.guildId, (data) => {
      if (subcommand === "antighostping") data.multiBot.protect.antiGhostPingEnabled = enabled;
      else data.multiBot.protect.antiBotEnabled = enabled;
    });
    await replyPrivate(interaction, `${subcommand === "antighostping" ? "Anti-ghost-ping" : "Anti-bot"} ${enabled ? "activé" : "désactivé"}.`);
    return;
  }
  if (subcommand === "bot-autoriser" || subcommand === "bot-retirer") {
    const bot = interaction.options.getUser("bot", true);
    if (!bot.bot) return replyPrivate(interaction, "Le compte sélectionné n'est pas un bot.");
    const add = subcommand === "bot-autoriser";
    await mutateGuild(interaction.guildId, (data) => {
      const ids = new Set(data.multiBot.protect.allowedBotIds);
      if (add) ids.add(bot.id); else ids.delete(bot.id);
      data.multiBot.protect.allowedBotIds = [...ids];
    });
    await replyPrivate(interaction, `${bot} ${add ? "est maintenant autorisé" : "n'est plus autorisé"} par l'anti-bot.`);
    return;
  }
  if (subcommand === "voctime") {
    const target = interaction.options.getUser("membre") || interaction.user;
    const data = await readGuild(interaction.guildId);
    const stored = Number(data.multiBot.protect.voiceTotals[target.id] || 0);
    const startedAt = Number(data.multiBot.protect.voiceSessions[target.id] || 0);
    const total = stored + (startedAt ? Math.max(0, Date.now() - startedAt) : 0);
    await replyPrivate(interaction, `Temps vocal de ${target} : **${formatMilliseconds(total)}**.`);
    return;
  }
  if (subcommand === "voicetop") {
    const data = await readGuild(interaction.guildId);
    const rows = Object.entries(data.multiBot.protect.voiceTotals).map(([id, total]) => {
      const startedAt = Number(data.multiBot.protect.voiceSessions[id] || 0);
      return [id, Number(total || 0) + (startedAt ? Math.max(0, Date.now() - startedAt) : 0)];
    });
    for (const [id, startedAt] of Object.entries(data.multiBot.protect.voiceSessions)) {
      if (!rows.some(([rowId]) => rowId === id)) rows.push([id, Math.max(0, Date.now() - Number(startedAt || Date.now()))]);
    }
    rows.sort((a, b) => b[1] - a[1]);
    await replyPrivate(interaction, rows.length ? rows.slice(0, 10).map(([id, total], index) => `**${index + 1}.** <@${id}> — ${formatMilliseconds(total)}`).join("\n") : "Aucun temps vocal enregistré.");
    return;
  }
  if (subcommand === "vocalreset") {
    if (!interaction.options.getBoolean("confirmation", true)) return replyPrivate(interaction, "Réinitialisation annulée : `confirmation` doit être Oui.");
    const target = interaction.options.getUser("membre");
    await mutateGuild(interaction.guildId, (data) => {
      if (target) {
        delete data.multiBot.protect.voiceTotals[target.id];
        if (data.multiBot.protect.voiceSessions[target.id]) data.multiBot.protect.voiceSessions[target.id] = Date.now();
      } else {
        data.multiBot.protect.voiceTotals = {};
        for (const id of Object.keys(data.multiBot.protect.voiceSessions)) data.multiBot.protect.voiceSessions[id] = Date.now();
      }
    });
    await replyPrivate(interaction, target ? `Temps vocal de ${target} réinitialisé.` : "Tous les temps vocaux ont été réinitialisés.");
    return;
  }
  if (subcommand === "xp-ajouter") {
    const target = interaction.options.getUser("membre", true);
    const amount = interaction.options.getInteger("quantite", true);
    const total = await mutateGuild(interaction.guildId, (data) => {
      const current = data.levels.members[target.id] || { xp: 0, messages: 0 };
      current.xp = Math.max(0, Number(current.xp) || 0) + amount;
      current.messages = Math.max(0, Number(current.messages) || 0);
      data.levels.members[target.id] = current;
      return current.xp;
    });
    await replyPrivate(interaction, `**${amount.toLocaleString("fr-FR")} XP** ajoutés à ${target}. Total : **${total.toLocaleString("fr-FR")} XP**.`);
    return;
  }
  if (subcommand === "xp-reset") {
    if (!interaction.options.getBoolean("confirmation", true)) return replyPrivate(interaction, "Réinitialisation annulée : `confirmation` doit être Oui.");
    const target = interaction.options.getUser("membre");
    const removed = await mutateGuild(interaction.guildId, (data) => {
      if (target) {
        const existed = Boolean(data.levels.members[target.id]);
        delete data.levels.members[target.id];
        return existed ? 1 : 0;
      }
      const count = Object.keys(data.levels.members).length;
      data.levels.members = {};
      return count;
    });
    await replyPrivate(interaction, target ? `XP de ${target} réinitialisée (${removed ? "profil supprimé" : "aucun profil existant"}).` : `XP réinitialisée pour **${removed} profil(s)**.`);
    return;
  }
  if (subcommand === "warns-effacer") {
    if (!interaction.options.getBoolean("confirmation", true)) return replyPrivate(interaction, "Suppression annulée : `confirmation` doit être Oui.");
    const target = interaction.options.getUser("membre", true);
    const count = await mutateGuild(interaction.guildId, (data) => {
      let changed = 0;
      for (const warning of data.warnings) {
        if (warning.userId !== target.id || !warning.active) continue;
        warning.active = false;
        warning.revokedAt = new Date().toISOString();
        warning.revokedBy = interaction.user.id;
        warning.revokeReason = "Retrait groupé via la commande de protection";
        changed += 1;
      }
      return changed;
    });
    await replyPrivate(interaction, `**${count} avertissement(s)** actif(s) retiré(s) pour ${target}.`);
    return;
  }
  if (subcommand === "acces-effacer") {
    const allowed = interaction.user.id === interaction.guild.ownerId || await isBotOwner(interaction.client, interaction.user.id);
    if (!allowed) return replyPrivate(interaction, "Seul le propriétaire du serveur ou du bot peut vider ces listes.");
    if (!interaction.options.getBoolean("confirmation", true)) return replyPrivate(interaction, "Suppression annulée : `confirmation` doit être Oui.");
    const list = interaction.options.getString("liste", true);
    const count = await mutateGuild(interaction.guildId, (data) => {
      if (list === "blacklist") {
        const size = data.blacklist.length;
        data.blacklist = [];
        return size;
      }
      if (list === "whitelist") {
        const size = data.access.whitelistUserIds.length;
        data.access.whitelistUserIds = [];
        data.access.whitelistEnabled = false;
        return size;
      }
      const size = data.access.ownerUserIds.length;
      data.access.ownerUserIds = [];
      return size;
    });
    await replyPrivate(interaction, `Liste **${list}** vidée : **${count} entrée(s)** supprimée(s).`);
    return;
  }
  if (subcommand === "antimentions") {
    if (!await requireBotPermissions(interaction, [PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ModerateMembers])) return;
    const channel = interaction.options.getChannel("salon_alertes", true);
    const result = await configureManagedMentionRule(interaction.guild, {
      alertChannelId: channel.id,
      mentionLimit: interaction.options.getInteger("limite", true),
      timeoutMinutes: interaction.options.getInteger("timeout_minutes", true),
    }, `${interaction.user.tag} (${interaction.user.id})`);
    await replyPrivate(interaction, `**${result.name}** : ${result.status}${result.detail ? ` — ${result.detail}` : ""}.`);
    return;
  }
  if (subcommand === "antiraid") {
    const enabled = interaction.options.getBoolean("actif", true);
    await mutateGuild(interaction.guildId, (data) => {
      data.antiRaid.enabled = enabled;
      data.antiRaid.maxJoins = interaction.options.getInteger("arrivees_max") ?? data.antiRaid.maxJoins;
      data.antiRaid.windowSeconds = interaction.options.getInteger("fenetre_secondes") ?? data.antiRaid.windowSeconds;
      data.antiRaid.timeoutMinutes = interaction.options.getInteger("timeout_minutes") ?? data.antiRaid.timeoutMinutes;
    });
    const data = await readGuild(interaction.guildId);
    await replyPrivate(interaction, `Anti-raid **${enabled ? "activé" : "désactivé"}** : ${data.antiRaid.maxJoins} arrivées en ${data.antiRaid.windowSeconds}s, timeout ${data.antiRaid.timeoutMinutes} min.`);
  }
}

function originalViewChannel(overwrite) {
  if (overwrite?.allow.has(PermissionFlagsBits.ViewChannel)) return "allow";
  if (overwrite?.deny.has(PermissionFlagsBits.ViewChannel)) return "deny";
  return "inherit";
}

function originalAttachFiles(overwrite) {
  if (overwrite?.allow.has(PermissionFlagsBits.AttachFiles)) return "allow";
  if (overwrite?.deny.has(PermissionFlagsBits.AttachFiles)) return "deny";
  return "inherit";
}

async function handleCrow(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "roleinfo") {
    const role = interaction.options.getRole("role", true);
    const members = [...role.members.values()].slice(0, 20).map((member) => member.toString()).join(", ") || "Aucun membre visible";
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(role.color || 0x5865f2).setTitle(`Rôle ${role.name}`).addFields(
      { name: "Identifiant", value: `\`${role.id}\``, inline: true },
      { name: "Position", value: String(role.position), inline: true },
      { name: "Membres", value: String(role.members.size), inline: true },
      { name: "Mentionnable", value: role.mentionable ? "Oui" : "Non", inline: true },
      { name: "Géré par une intégration", value: role.managed ? "Oui" : "Non", inline: true },
      { name: "Aperçu", value: members },
    )] });
    return;
  }
  if (subcommand === "saloninfo") {
    const channel = interaction.options.getChannel("salon") || interaction.channel;
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`Salon ${channel.name}`).addFields(
      { name: "Identifiant", value: `\`${channel.id}\``, inline: true },
      { name: "Type", value: String(channel.type), inline: true },
      { name: "Catégorie", value: channel.parent?.name || "Aucune", inline: true },
      { name: "Créé", value: `<t:${Math.floor(channel.createdTimestamp / 1000)}:R>`, inline: true },
      { name: "Sujet", value: channel.topic || "Aucun" },
    )] });
    return;
  }
  if (subcommand === "listes") {
    const type = interaction.options.getString("type", true);
    const role = interaction.options.getRole("role");
    if (type === "role" && !role) return replyPrivate(interaction, "Le rôle est requis pour cette liste.");
    await interaction.guild.members.fetch().catch(() => null);
    let members;
    if (type === "admins") members = interaction.guild.members.cache.filter((member) => !member.user.bot && member.permissions.has(PermissionFlagsBits.Administrator));
    else if (type === "bots") members = interaction.guild.members.cache.filter((member) => member.user.bot);
    else if (type === "bots-admin") members = interaction.guild.members.cache.filter((member) => member.user.bot && member.permissions.has(PermissionFlagsBits.Administrator));
    else members = role.members;
    const list = [...members.values()].slice(0, 50).map((member) => `${member} (\`${member.id}\`)`).join("\n") || "Aucun résultat.";
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`Liste — ${type}`).setDescription(list).setFooter({ text: `${members.size} résultat(s)` })] });
    return;
  }
  if (subcommand === "massrole") {
    const actor = await requirePermission(interaction, PermissionFlagsBits.ManageRoles);
    if (!actor) return;
    if (!interaction.options.getBoolean("confirmation", true)) return replyPrivate(interaction, "Action annulée : `confirmation` doit être Oui.");
    const botMember = await requireBotPermissions(interaction, [PermissionFlagsBits.ManageRoles]);
    if (!botMember) return;
    const role = interaction.options.getRole("role", true);
    if (!manageableRole(interaction.guild, role, actor, botMember)) return replyPrivate(interaction, "Ce rôle n'est pas attribuable selon la hiérarchie.");
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const action = interaction.options.getString("action", true);
    const includeBots = interaction.options.getBoolean("inclure_bots") ?? false;
    const members = await interaction.guild.members.fetch();
    const candidates = [...members.values()].filter((member) =>
      (includeBots || !member.user.bot) &&
      canActOnMember(interaction.guild, actor, botMember, member) &&
      (action === "ajouter" ? !member.roles.cache.has(role.id) : member.roles.cache.has(role.id)));
    let changed = 0;
    for (let index = 0; index < candidates.length; index += 5) {
      const chunk = candidates.slice(index, index + 5);
      const results = await Promise.allSettled(chunk.map((member) => action === "ajouter"
        ? member.roles.add(role, `Massrole par ${interaction.user.tag}`)
        : member.roles.remove(role, `Massrole par ${interaction.user.tag}`)));
      changed += results.filter((result) => result.status === "fulfilled").length;
    }
    await interaction.editReply(`${role} ${action === "ajouter" ? "ajouté" : "retiré"} pour **${changed}/${candidates.length}** membre(s) éligible(s).`);
    return;
  }
  if (subcommand === "derank") {
    const actor = await requirePermission(interaction, PermissionFlagsBits.ManageRoles);
    if (!actor) return;
    if (!interaction.options.getBoolean("confirmation", true)) return replyPrivate(interaction, "Action annulée : `confirmation` doit être Oui.");
    const botMember = await requireBotPermissions(interaction, [PermissionFlagsBits.ManageRoles]);
    if (!botMember) return;
    const member = await interaction.guild.members.fetch(interaction.options.getUser("membre", true).id);
    if (!canActOnMember(interaction.guild, actor, botMember, member)) return replyPrivate(interaction, "La hiérarchie empêche de modifier ce membre.");
    const roles = member.roles.cache.filter((role) => manageableRole(interaction.guild, role, actor, botMember));
    if (!roles.size) return replyPrivate(interaction, "Ce membre ne possède aucun rôle que tu peux retirer.");
    await member.roles.remove([...roles.keys()], `Derank par ${interaction.user.tag}`);
    await replyPrivate(interaction, `${roles.size} rôle(s) retiré(s) à ${member}.`);
    return;
  }
  if (subcommand === "masquer" || subcommand === "afficher") {
    if (!await requirePermission(interaction, PermissionFlagsBits.ManageChannels)) return;
    if (!await requireBotPermissions(interaction, [PermissionFlagsBits.ManageChannels])) return;
    const channel = interaction.options.getChannel("salon") || interaction.channel;
    const hidden = subcommand === "masquer";
    if (hidden) {
      const overwrite = channel.permissionOverwrites.cache.get(interaction.guild.id);
      await mutateGuild(interaction.guildId, (data) => {
        data.multiBot.crow.hiddenChannels[channel.id] ??= originalViewChannel(overwrite);
      });
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: false }, { reason: `Salon masqué par ${interaction.user.tag}` });
      await replyPrivate(interaction, `${channel} est maintenant masqué à @everyone.`);
    } else {
      const data = await readGuild(interaction.guildId);
      const original = data.multiBot.crow.hiddenChannels[channel.id];
      if (!original) return replyPrivate(interaction, "Ce salon n'a pas été masqué avec /crow masquer.");
      const value = original === "allow" ? true : original === "deny" ? false : null;
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { ViewChannel: value }, { reason: `Visibilité restaurée par ${interaction.user.tag}` });
      await mutateGuild(interaction.guildId, (guildData) => { delete guildData.multiBot.crow.hiddenChannels[channel.id]; });
      await replyPrivate(interaction, `Visibilité précédente de ${channel} restaurée.`);
    }
    return;
  }
  if (subcommand === "emoji") {
    if (!await requirePermission(interaction, PermissionFlagsBits.ManageGuildExpressions)) return;
    if (!await requireBotPermissions(interaction, [PermissionFlagsBits.ManageGuildExpressions])) return;
    const url = safeHttpsUrl(interaction.options.getString("url", true));
    if (!url) return replyPrivate(interaction, "L'image doit utiliser une URL HTTPS valide.");
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const emoji = await interaction.guild.emojis.create({ attachment: url, name: interaction.options.getString("nom", true), reason: `Emoji créé par ${interaction.user.tag}` });
    await interaction.editReply(`Emoji ${emoji} créé.`);
    return;
  }
  if (subcommand === "vocal") {
    const action = interaction.options.getString("action", true);
    const required = ["mute", "unmute"].includes(action) ? PermissionFlagsBits.MuteMembers
      : ["deaf", "undeaf"].includes(action) ? PermissionFlagsBits.DeafenMembers
        : PermissionFlagsBits.MoveMembers;
    const actor = await requirePermission(interaction, required);
    if (!actor) return;
    const botMember = await requireBotPermissions(interaction, [required]);
    if (!botMember) return;
    const source = actor.voice.channel;
    if (!source) return replyPrivate(interaction, "Rejoins d'abord le salon vocal à gérer.");
    const destination = interaction.options.getChannel("destination");
    if (action === "deplacer" && !destination) return replyPrivate(interaction, "La destination est requise pour déplacer les membres.");
    const targets = [...source.members.values()].filter((member) => member.id !== actor.id && canActOnMember(interaction.guild, actor, botMember, member));
    const operations = targets.map((member) => {
      if (action === "deconnecter") return member.voice.disconnect(`Action vocale par ${interaction.user.tag}`);
      if (action === "deplacer") return member.voice.setChannel(destination, `Action vocale par ${interaction.user.tag}`);
      if (action === "mute" || action === "unmute") return member.voice.setMute(action === "mute", `Action vocale par ${interaction.user.tag}`);
      return member.voice.setDeaf(action === "deaf", `Action vocale par ${interaction.user.tag}`);
    });
    const results = await Promise.allSettled(operations);
    await replyPrivate(interaction, `Action **${action}** réussie pour **${results.filter((item) => item.status === "fulfilled").length}/${targets.length}** membre(s).`);
    return;
  }
  if (subcommand === "bans") {
    if (!await requirePermission(interaction, PermissionFlagsBits.BanMembers)) return;
    const bans = await interaction.guild.bans.fetch();
    const rows = [...bans.values()].slice(0, 50).map((entry) => `• ${entry.user.tag} (\`${entry.user.id}\`) — ${truncate(entry.reason || "Aucune raison", 100)}`);
    await replyPrivate(interaction, { embeds: [new EmbedBuilder().setColor(0xed4245).setTitle(`🔨 Bannissements — ${bans.size}`).setDescription(rows.join("\n") || "Aucun membre banni.")] });
    return;
  }
  if (subcommand === "timeouts") {
    if (!await requirePermission(interaction, PermissionFlagsBits.ModerateMembers)) return;
    const members = await interaction.guild.members.fetch();
    const timedOut = [...members.values()].filter((member) => member.communicationDisabledUntilTimestamp > Date.now());
    const rows = timedOut.slice(0, 50).map((member) => `• ${member} (\`${member.id}\`) — jusqu'à <t:${Math.floor(member.communicationDisabledUntilTimestamp / 1000)}:R>`);
    await replyPrivate(interaction, { embeds: [new EmbedBuilder().setColor(0xfee75c).setTitle(`🔇 Timeouts — ${timedOut.length}`).setDescription(rows.join("\n") || "Aucun membre en timeout.")] });
    return;
  }
  if (subcommand === "anti-everyone" || subcommand === "anti-token") {
    if (!await requirePermission(interaction, PermissionFlagsBits.ManageGuild)) return;
    const enabled = interaction.options.getBoolean("actif", true);
    await mutateGuild(interaction.guildId, (data) => {
      if (subcommand === "anti-everyone") data.multiBot.crow.antiEveryoneEnabled = enabled;
      else data.multiBot.crow.antiTokenEnabled = enabled;
    });
    await replyPrivate(interaction, `${subcommand === "anti-everyone" ? "Anti-@everyone" : "Anti-token"} **${enabled ? "activé" : "désactivé"}**.`);
    return;
  }
  if (subcommand === "fichiers") {
    if (!await requirePermission(interaction, PermissionFlagsBits.ManageChannels)) return;
    if (!await requireBotPermissions(interaction, [PermissionFlagsBits.ManageChannels])) return;
    const channel = interaction.options.getChannel("salon") || interaction.channel;
    if (!channel?.isTextBased() || channel.isThread()) return replyPrivate(interaction, "Choisis un salon textuel hors thread.");
    const block = interaction.options.getBoolean("bloquer", true);
    if (block) {
      const overwrite = channel.permissionOverwrites.cache.get(interaction.guild.id);
      await mutateGuild(interaction.guildId, (data) => {
        data.multiBot.crow.attachmentChannels[channel.id] ??= originalAttachFiles(overwrite);
      });
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { AttachFiles: false }, { reason: `Pièces jointes bloquées par ${interaction.user.tag}` });
      await replyPrivate(interaction, `Les pièces jointes sont maintenant bloquées pour @everyone dans ${channel}.`);
      return;
    }
    const data = await readGuild(interaction.guildId);
    const original = data.multiBot.crow.attachmentChannels[channel.id];
    if (!original) return replyPrivate(interaction, "Ce salon n'a pas été modifié avec /crow fichiers.");
    const value = original === "allow" ? true : original === "deny" ? false : null;
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { AttachFiles: value }, { reason: `Pièces jointes restaurées par ${interaction.user.tag}` });
    await mutateGuild(interaction.guildId, (guildData) => { delete guildData.multiBot.crow.attachmentChannels[channel.id]; });
    await replyPrivate(interaction, `Le réglage précédent des pièces jointes a été restauré dans ${channel}.`);
    return;
  }
  if (subcommand === "prefix") {
    if (!await requirePermission(interaction, PermissionFlagsBits.ManageGuild)) return;
    const value = interaction.options.getString("valeur", true);
    if (value !== "+" && (!/^[!#$%&*?.~-]{1,3}$/.test(value) || value.startsWith("+"))) {
      return replyPrivate(interaction, "Le préfixe secondaire doit contenir 1 à 3 signes parmi `! # $ % & * ? . ~ -`. Utilise `+` pour le retirer.");
    }
    await mutateGuild(interaction.guildId, (data) => {
      data.multiBot.crow.secondaryPrefix = value === "+" ? null : value;
    });
    await replyPrivate(interaction, value === "+" ? "Préfixe secondaire supprimé. Les commandes `+` et `/` restent actives." : `Préfixe secondaire défini sur \`${value}\`. Les commandes \`+\` et \`/\` restent actives.`);
    return;
  }
  if (subcommand === "securite") {
    if (!await requirePermission(interaction, PermissionFlagsBits.ManageGuild)) return;
    const data = await readGuild(interaction.guildId);
    const { managed } = await getAutoModStatus(interaction.guild);
    await replyPrivate(interaction, { embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle("🛡️ Sécurité Crow + Protect").addFields(
      { name: "AutoMod natif", value: `${managed.filter((rule) => rule.enabled).size}/${managed.size} règle(s) active(s)`, inline: true },
      { name: "Anti-raid", value: data.antiRaid.enabled ? "Actif" : "Inactif", inline: true },
      { name: "Anti-bot", value: data.multiBot.protect.antiBotEnabled ? "Actif" : "Inactif", inline: true },
      { name: "Anti-ghost-ping", value: data.multiBot.protect.antiGhostPingEnabled ? "Actif" : "Inactif", inline: true },
      { name: "Anti-@everyone", value: data.multiBot.crow.antiEveryoneEnabled ? "Actif" : "Inactif", inline: true },
      { name: "Anti-token", value: data.multiBot.crow.antiTokenEnabled ? "Actif" : "Inactif", inline: true },
      { name: "Préfixe secondaire", value: data.multiBot.crow.secondaryPrefix ? `\`${data.multiBot.crow.secondaryPrefix}\`` : "Aucun", inline: true },
    )] });
  }
}

async function handleAutoRank(interaction) {
  const actor = await requirePermission(interaction, PermissionFlagsBits.ManageRoles);
  if (!actor) return;
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "statut") {
    const data = await readGuild(interaction.guildId);
    await replyPrivate(interaction, `Rôle à l'arrivée : ${data.multiBot.autoRank.joinRoleId ? `<@&${data.multiBot.autoRank.joinRoleId}>` : "désactivé"}\nRôle à la mention du bot : ${data.multiBot.autoRank.mentionRoleId ? `<@&${data.multiBot.autoRank.mentionRoleId}>` : "désactivé"}`);
    return;
  }
  if (subcommand === "desactiver") {
    await mutateGuild(interaction.guildId, (data) => {
      data.multiBot.autoRank.joinRoleId = null;
      data.multiBot.autoRank.mentionRoleId = null;
    });
    await replyPrivate(interaction, "AutoRank désactivé.");
    return;
  }
  const joinRole = interaction.options.getRole("role_arrivee");
  const mentionRole = interaction.options.getRole("role_mention");
  if (!joinRole && !mentionRole) return replyPrivate(interaction, "Précise au moins `role_arrivee` ou `role_mention`.");
  const botMember = await requireBotPermissions(interaction, [PermissionFlagsBits.ManageRoles]);
  if (!botMember) return;
  if ([joinRole, mentionRole].filter(Boolean).some((role) => !manageableRole(interaction.guild, role, actor, botMember))) {
    return replyPrivate(interaction, "Un des rôles est géré, trop élevé ou correspond à @everyone.");
  }
  await mutateGuild(interaction.guildId, (data) => {
    if (joinRole) data.multiBot.autoRank.joinRoleId = joinRole.id;
    if (mentionRole) data.multiBot.autoRank.mentionRoleId = mentionRole.id;
  });
  await replyPrivate(interaction, `AutoRank configuré.${joinRole ? `\nArrivée : ${joinRole}` : ""}${mentionRole ? `\nMention : ${mentionRole}` : ""}`);
}

async function handleMultiBotCommand(interaction) {
  if (interaction.commandName === "vouch") return handleVouch(interaction);
  if (interaction.commandName === "boutique") return handleShop(interaction);
  if (interaction.commandName === "protect") return handleProtect(interaction);
  if (interaction.commandName === "crow") return handleCrow(interaction);
  if (interaction.commandName === "autorank") return handleAutoRank(interaction);
  return false;
}

async function handleMultiBotMemberJoin(member) {
  if (!member.guild || member.id === member.client.user.id) return false;
  const data = await readGuild(member.guild.id);
  const config = data.multiBot;
  if (member.user.bot && config.protect.antiBotEnabled && !config.protect.allowedBotIds.includes(member.id)) {
    let blocked = false;
    if (member.kickable) {
      blocked = Boolean(await member.kick("Anti-bot : bot non autorisé").then(() => true).catch(() => false));
    }
    await sendLog(member.guild, "bots", new EmbedBuilder()
      .setColor(blocked ? 0xed4245 : 0xfee75c)
      .setTitle(blocked ? "Bot non autorisé expulsé" : "Bot non autorisé détecté")
      .setDescription(`${member} (\`${member.id}\`)${blocked ? " a été expulsé." : " n'a pas pu être expulsé : vérifie les permissions et la hiérarchie."}`)
      .setTimestamp()).catch(() => {});
    return blocked;
  }
  if (!member.user.bot && config.autoRank.joinRoleId) {
    const role = member.guild.roles.cache.get(config.autoRank.joinRoleId);
    const botMember = member.guild.members.me;
    if (role && !role.managed && botMember?.permissions.has(PermissionFlagsBits.ManageRoles) && botMember.roles.highest.comparePositionTo(role) > 0) {
      await member.roles.add(role, "AutoRank : arrivée sur le serveur").catch(() => {});
    }
  }
  return false;
}

async function handleMultiBotMessage(message) {
  if (!message.guild || message.author.bot) return false;
  const data = await readGuild(message.guild.id);
  if (data.multiBot.crow.antiTokenEnabled && containsDiscordToken(message.content)) {
    await message.delete().catch(() => {});
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("🔐 Token Discord supprimé")
      .setDescription(`Un message de <@${message.author.id}> contenant un secret ressemblant à un token Discord a été supprimé. Le secret n'est ni affiché ni enregistré. Il doit être réinitialisé immédiatement.`)
      .setTimestamp();
    await message.channel.send({ embeds: [embed], allowedMentions: { users: [message.author.id], roles: [] } }).catch(() => {});
    await sendLog(message.guild, "automod", embed).catch(() => {});
    return true;
  }
  if (
    data.multiBot.crow.antiEveryoneEnabled &&
    message.mentions.everyone &&
    !message.member?.permissions.has(PermissionFlagsBits.MentionEveryone)
  ) {
    await message.delete().catch(() => {});
    const embed = new EmbedBuilder()
      .setColor(0xfee75c)
      .setTitle("📣 Mention globale bloquée")
      .setDescription(`Une mention @everyone/@here non autorisée de <@${message.author.id}> a été supprimée dans <#${message.channelId}>.`)
      .setTimestamp();
    await message.channel.send({ content: `<@${message.author.id}>, tu n'es pas autorisé à utiliser @everyone ou @here.`, allowedMentions: { users: [message.author.id], roles: [] } }).catch(() => {});
    await sendLog(message.guild, "automod", embed).catch(() => {});
    return true;
  }
  if (!message.mentions.users.has(message.client.user.id)) return false;
  const roleId = data.multiBot.autoRank.mentionRoleId;
  if (!roleId || message.member.roles.cache.has(roleId)) return false;
  const role = message.guild.roles.cache.get(roleId);
  const botMember = message.guild.members.me;
  if (!role || role.managed || !botMember?.permissions.has(PermissionFlagsBits.ManageRoles) || botMember.roles.highest.comparePositionTo(role) <= 0) return false;
  await message.member.roles.add(role, "AutoRank : mention du bot");
  await message.reply({ content: `${role} t'a été attribué.`, allowedMentions: { users: [message.author.id], roles: [] } }).catch(() => {});
  return true;
}

async function handleMultiBotMessageDelete(message) {
  if (!message.guild || message.author?.bot || !message.mentions?.users?.size) return;
  const data = await readGuild(message.guild.id);
  if (!data.multiBot.protect.antiGhostPingEnabled) return;
  const mentions = [...message.mentions.users.values()].slice(0, 10).map((user) => `${user.tag} (\`${user.id}\`)`).join("\n");
  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle("👻 Ghost-ping détecté")
    .setDescription(`Un message de ${message.author || "membre inconnu"} contenant une ou plusieurs mentions a été supprimé.`)
    .addFields({ name: "Mentions", value: mentions || "Indisponibles" })
    .setTimestamp();
  if (message.channel?.isTextBased()) await message.channel.send({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
  await sendLog(message.guild, "automod", embed).catch(() => {});
}

async function handleMultiBotVoiceState(oldState, newState) {
  const member = newState.member || oldState.member;
  if (!member || member.user.bot || oldState.channelId === newState.channelId) return;
  const now = Date.now();
  await mutateGuild(member.guild.id, (data) => {
    const protect = data.multiBot.protect;
    if (!protect.voiceTimeEnabled) return;
    const startedAt = Number(protect.voiceSessions[member.id] || 0);
    if (oldState.channelId && startedAt) {
      protect.voiceTotals[member.id] = Number(protect.voiceTotals[member.id] || 0) + Math.max(0, now - startedAt);
      delete protect.voiceSessions[member.id];
    }
    if (newState.channelId) protect.voiceSessions[member.id] = now;
  });
}

async function startMultiBotRuntime(client) {
  for (const guild of client.guilds.cache.values()) {
    await mutateGuild(guild.id, (data) => {
      const sessions = {};
      if (data.multiBot.protect.voiceTimeEnabled) {
        for (const channel of guild.channels.cache.values()) {
          if (!channel.isVoiceBased()) continue;
          for (const member of channel.members.values()) if (!member.user.bot) sessions[member.id] = Date.now();
        }
      }
      data.multiBot.protect.voiceSessions = sessions;
    });
  }
}

module.exports = {
  containsDiscordToken,
  formatMilliseconds,
  handleMultiBotCommand,
  handleMultiBotMemberJoin,
  handleMultiBotMessage,
  handleMultiBotMessageDelete,
  handleMultiBotVoiceState,
  safeHttpsUrl,
  startMultiBotRuntime,
};
