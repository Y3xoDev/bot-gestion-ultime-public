const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const { sendLog } = require("./server-events");
const { mutateGuild, readGuild } = require("../persistence/guild-store");

const scheduledGiveaways = new Map();
const scheduledReminders = new Map();

function selectWinners(users, count, excludedIds = new Set()) {
  const pool = [...users].filter((user) => !user.bot && !excludedIds.has(user.id));
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool.slice(0, count);
}

async function giveawayParticipants(message) {
  const reaction = message.reactions.cache.get("🎉");
  if (!reaction) {
    return [];
  }
  const users = await reaction.users.fetch();
  return [...users.values()].filter((user) => !user.bot);
}

async function endGiveaway(client, guildId, messageId, reroll = false) {
  const data = await readGuild(guildId);
  const giveaway = data.giveaways.find((item) => item.messageId === messageId);
  if (!giveaway) {
    return { error: "Giveaway introuvable." };
  }
  if (!reroll && giveaway.ended) {
    return { error: "Ce giveaway est déjà terminé." };
  }
  if (reroll && !giveaway.ended) {
    return { error: "Termine d'abord le giveaway avant de relancer le tirage." };
  }

  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId));
  const channel =
    guild.channels.cache.get(giveaway.channelId) ||
    (await guild.channels.fetch(giveaway.channelId).catch(() => null));
  if (!channel?.isTextBased()) {
    return { error: "Salon du giveaway introuvable." };
  }
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (!message) {
    return { error: "Message du giveaway introuvable." };
  }

  const participants = await giveawayParticipants(message);
  const previousWinnerIds = new Set([
    ...(giveaway.previousWinnerIds || []),
    ...(giveaway.winnerIds || []),
  ]);
  const winners = selectWinners(
    participants,
    giveaway.winnerCount,
    reroll ? previousWinnerIds : new Set(),
  );
  const winnerText = winners.length
    ? winners.map((winner) => winner.toString()).join(", ")
    : "Aucun participant valide";

  if (!reroll) {
    await mutateGuild(guildId, (guildData) => {
      const stored = guildData.giveaways.find((item) => item.messageId === messageId);
      if (stored) {
        stored.ended = true;
        stored.winnerIds = winners.map((winner) => winner.id);
        stored.endedAt = new Date().toISOString();
      }
    });
    const timer = scheduledGiveaways.get(messageId);
    if (timer) {
      clearTimeout(timer);
      scheduledGiveaways.delete(messageId);
    }
    await message.edit({
      embeds: [
        new EmbedBuilder()
          .setColor(0x6f7380)
          .setTitle(giveaway.title || `🎉 ${giveaway.prize}`)
          .setDescription(`Giveaway terminé.\nGagnant(s) : ${winnerText}`)
          .setTimestamp(),
      ],
    });
  } else {
    await mutateGuild(guildId, (guildData) => {
      const stored = guildData.giveaways.find((item) => item.messageId === messageId);
      if (stored) {
        stored.previousWinnerIds = [...previousWinnerIds];
        stored.winnerIds = winners.map((winner) => winner.id);
      }
    });
  }

  await channel.send(
    reroll
      ? `🔁 Nouveau tirage pour **${giveaway.prize}** : ${winnerText}`
      : `🎊 Giveaway terminé pour **${giveaway.prize}** ! Gagnant(s) : ${winnerText}`,
  );
  return { winners, giveaway };
}

function scheduleGiveaway(client, giveaway) {
  if (giveaway.ended || giveaway.paused) {
    return;
  }
  const existingTimer = scheduledGiveaways.get(giveaway.messageId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }
  const delay = Math.max(0, new Date(giveaway.endsAt).getTime() - Date.now());
  const timer = setTimeout(() => {
    void endGiveaway(client, giveaway.guildId, giveaway.messageId).catch((error) =>
      console.error("Erreur de fin de giveaway :", error),
    );
  }, Math.min(delay, 2_147_000_000));
  scheduledGiveaways.set(giveaway.messageId, timer);
}

async function deliverReminder(client, reminder) {
  const guild = client.guilds.cache.get(reminder.guildId);
  const channel = guild?.channels.cache.get(reminder.channelId);
  if (channel?.isTextBased()) {
    await channel
      .send({
        content: `<@${reminder.userId}> ⏰ **Rappel #${reminder.id}** : ${reminder.text}`,
        allowedMentions: { users: [reminder.userId] },
      })
      .catch(() => {});
  }
  await mutateGuild(reminder.guildId, (data) => {
    data.reminders = data.reminders.filter((item) => item.id !== reminder.id);
  });
  scheduledReminders.delete(`${reminder.guildId}:${reminder.id}`);
}

function scheduleReminder(client, reminder) {
  const key = `${reminder.guildId}:${reminder.id}`;
  const delay = Math.max(0, new Date(reminder.dueAt).getTime() - Date.now());
  const timer = setTimeout(() => {
    void deliverReminder(client, reminder).catch((error) =>
      console.error("Erreur de rappel :", error),
    );
  }, Math.min(delay, 2_147_000_000));
  scheduledReminders.set(key, timer);
}

async function restoreScheduledTasks(client) {
  for (const guild of client.guilds.cache.values()) {
    const data = await readGuild(guild.id);
    for (const giveaway of data.giveaways.filter((item) => !item.ended && !item.paused)) {
      scheduleGiveaway(client, giveaway);
    }
    for (const reminder of data.reminders) {
      scheduleReminder(client, reminder);
    }
  }
}

async function handleSuggestions(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: "Tu dois avoir la permission Gérer le serveur.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (subcommand === "configurer") {
    const channel = interaction.options.getChannel("salon", true);
    const discussion = interaction.options.getBoolean("discussion");
    await mutateGuild(interaction.guild.id, (data) => {
      data.suggestions.channelId = channel.id;
      if (discussion !== null) data.suggestions.discussionThreads = discussion;
    });
    await interaction.reply({
      content: `Les suggestions seront envoyées dans ${channel}.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (subcommand === "desactiver") {
    await mutateGuild(interaction.guild.id, (data) => {
      data.suggestions.channelId = null;
    });
    await interaction.reply({
      content: "Les suggestions sont désactivées.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (subcommand === "traiter") {
    const data = await readGuild(interaction.guild.id);
    const channel = data.suggestions.channelId
      ? interaction.guild.channels.cache.get(data.suggestions.channelId)
      : null;
    if (!channel?.isTextBased()) {
      await interaction.reply({ content: "Le salon des suggestions n'est pas configuré.", flags: MessageFlags.Ephemeral });
      return;
    }
    const messageId = interaction.options.getString("message_id", true);
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message?.author?.bot || !message.embeds[0]) {
      await interaction.reply({ content: "Message de suggestion introuvable.", flags: MessageFlags.Ephemeral });
      return;
    }
    const status = interaction.options.getString("statut", true);
    const reason = interaction.options.getString("raison") || "Aucune précision fournie.";
    const statusInfo = {
      acceptee: { label: "✅ Suggestion acceptée", color: 0x57f287 },
      refusee: { label: "❌ Suggestion refusée", color: 0xed4245 },
      realisee: { label: "🚀 Suggestion réalisée", color: 0x5865f2 },
      etude: { label: "🔎 Suggestion en étude", color: 0xfee75c },
    }[status];
    const embed = EmbedBuilder.from(message.embeds[0])
      .setColor(statusInfo.color)
      .setTitle(statusInfo.label)
      .addFields({ name: "Réponse du staff", value: reason.slice(0, 1024) })
      .setFooter({ text: `Traitée par ${interaction.user.tag}` });
    await message.edit({ embeds: [embed] });
    await interaction.reply({ content: `Suggestion mise à jour : **${statusInfo.label.replace(/^\S+\s/, "")}**.`, flags: MessageFlags.Ephemeral });
    return;
  }
  const data = await readGuild(interaction.guild.id);
  await interaction.reply({
    content: data.suggestions.channelId
      ? `Salon configuré : <#${data.suggestions.channelId}>.`
      : "Aucun salon de suggestions configuré.",
    flags: MessageFlags.Ephemeral,
  });
}

async function handleSuggest(interaction) {
  const data = await readGuild(interaction.guild.id);
  const channel = data.suggestions.channelId
    ? interaction.guild.channels.cache.get(data.suggestions.channelId)
    : null;
  if (!channel?.isTextBased()) {
    await interaction.reply({
      content: "Le système de suggestions n'est pas configuré.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({
      name: interaction.user.tag,
      iconURL: interaction.user.displayAvatarURL(),
    })
    .setTitle("💡 Nouvelle suggestion")
    .setDescription(interaction.options.getString("texte", true))
    .setFooter({ text: `Utilisateur : ${interaction.user.id}` })
    .setTimestamp();
  const message = await channel.send({ embeds: [embed] });
  await message.react("✅");
  await message.react("❌");
  if (data.suggestions.discussionThreads) {
    await message.startThread({ name: `Suggestion de ${interaction.user.username}`.slice(0, 100), autoArchiveDuration: 1440 }).catch(() => {});
  }
  await interaction.reply({
    content: `Suggestion envoyée dans ${channel}.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleGiveaway(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: "Tu dois avoir la permission Gérer le serveur.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "lancer") {
    const channel = interaction.options.getChannel("salon", true);
    const durationMinutes = interaction.options.getInteger("duree_minutes", true);
    const winnerCount = interaction.options.getInteger("gagnants", true);
    const prize = interaction.options.getString("prix", true);
    const title = interaction.options.getString("titre") || `🎉 ${prize}`;
    const description =
      interaction.options.getString("description") || "Réagis avec 🎉 pour participer.";
    const endsAt = new Date(Date.now() + durationMinutes * 60_000);
    const message = await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle(title)
          .setDescription(
            `${description}\n\nFin : <t:${Math.floor(endsAt.getTime() / 1000)}:R>\nGagnants : **${winnerCount}**`,
          )
          .setFooter({ text: `Organisé par ${interaction.user.tag}` }),
      ],
    });
    await message.react("🎉");
    const giveaway = {
      guildId: interaction.guild.id,
      channelId: channel.id,
      messageId: message.id,
      prize,
      title,
      description,
      winnerCount,
      endsAt: endsAt.toISOString(),
      ended: false,
      paused: false,
      hostId: interaction.user.id,
    };
    await mutateGuild(interaction.guild.id, (data) => data.giveaways.push(giveaway));
    scheduleGiveaway(interaction.client, giveaway);
    await interaction.editReply(`Giveaway créé : ${message.url}`);
    return;
  }

  if (subcommand === "liste") {
    const data = await readGuild(interaction.guild.id);
    const active = data.giveaways.filter((giveaway) => !giveaway.ended);
    const description = active.length
      ? active
          .map(
            (giveaway, index) =>
              `${index + 1}. [${giveaway.prize}](https://discord.com/channels/${interaction.guild.id}/${giveaway.channelId}/${giveaway.messageId}) — ${giveaway.paused ? "⏸️ en pause" : `<t:${Math.floor(new Date(giveaway.endsAt).getTime() / 1000)}:R>`}`,
          )
          .join("\n")
          .slice(0, 3900)
      : "Aucun giveaway actif.";
    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xf1c40f)
          .setTitle("Giveaways du serveur")
          .setDescription(description),
      ],
    });
    return;
  }

  const messageId = interaction.options.getString("message_id", true);
  if (!/^\d{17,20}$/.test(messageId)) {
    await interaction.editReply("Identifiant de message invalide.");
    return;
  }
  if (subcommand === "pause" || subcommand === "reprendre") {
    const data = await readGuild(interaction.guild.id);
    const giveaway = data.giveaways.find((item) => item.messageId === messageId);
    if (!giveaway || giveaway.ended) {
      await interaction.editReply("Giveaway actif introuvable.");
      return;
    }
    if (subcommand === "pause" && giveaway.paused) {
      await interaction.editReply("Ce giveaway est déjà en pause.");
      return;
    }
    if (subcommand === "reprendre" && !giveaway.paused) {
      await interaction.editReply("Ce giveaway n'est pas en pause.");
      return;
    }

    if (subcommand === "pause") {
      giveaway.remainingMs = Math.max(0, new Date(giveaway.endsAt).getTime() - Date.now());
      giveaway.paused = true;
      const timer = scheduledGiveaways.get(messageId);
      if (timer) clearTimeout(timer);
      scheduledGiveaways.delete(messageId);
    } else {
      giveaway.endsAt = new Date(Date.now() + Math.max(0, giveaway.remainingMs || 0)).toISOString();
      giveaway.remainingMs = null;
      giveaway.paused = false;
    }
    await mutateGuild(interaction.guild.id, (guildData) => {
      const stored = guildData.giveaways.find((item) => item.messageId === messageId);
      if (stored) Object.assign(stored, giveaway);
    });
    if (!giveaway.paused) scheduleGiveaway(interaction.client, giveaway);

    const channel = interaction.guild.channels.cache.get(giveaway.channelId);
    const message = channel?.isTextBased()
      ? await channel.messages.fetch(messageId).catch(() => null)
      : null;
    if (message) {
      const status = giveaway.paused
        ? "⏸️ Giveaway en pause."
        : `Fin : <t:${Math.floor(new Date(giveaway.endsAt).getTime() / 1000)}:R>`;
      await message
        .edit({
          embeds: [
            new EmbedBuilder()
              .setColor(giveaway.paused ? 0x6f7380 : 0xf1c40f)
              .setTitle(giveaway.title || `🎉 ${giveaway.prize}`)
              .setDescription(
                `${giveaway.description || "Réagis avec 🎉 pour participer."}\n\n${status}\nGagnants : **${giveaway.winnerCount}**`,
              ),
          ],
        })
        .catch(() => {});
    }
    await interaction.editReply(
      giveaway.paused ? "Giveaway mis en pause." : "Giveaway repris.",
    );
    return;
  }
  const result = await endGiveaway(
    interaction.client,
    interaction.guild.id,
    messageId,
    subcommand === "relancer",
  );
  await interaction.editReply(result.error || "Tirage effectué.");
}

async function handleReminder(interaction) {
  const minutes = interaction.options.getInteger("minutes", true);
  const text = interaction.options.getString("texte", true);
  let reminder;
  await mutateGuild(interaction.guild.id, (data) => {
    reminder = {
      id: data.nextReminderId,
      guildId: interaction.guild.id,
      channelId: interaction.channelId,
      userId: interaction.user.id,
      text,
      dueAt: new Date(Date.now() + minutes * 60_000).toISOString(),
    };
    data.nextReminderId += 1;
    data.reminders.push(reminder);
  });
  scheduleReminder(interaction.client, reminder);
  await interaction.reply({
    content: `Rappel **#${reminder.id}** programmé dans ${minutes} minute(s).`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleReminderList(interaction) {
  const data = await readGuild(interaction.guild.id);
  const reminders = data.reminders.filter((item) => item.userId === interaction.user.id);
  await interaction.reply({
    content: reminders.length
      ? reminders
          .map(
            (item) =>
              `**#${item.id}** — <t:${Math.floor(new Date(item.dueAt).getTime() / 1000)}:R> — ${item.text}`,
          )
          .join("\n")
          .slice(0, 1900)
      : "Tu n'as aucun rappel en attente.",
    flags: MessageFlags.Ephemeral,
  });
}

async function handleReminderCancel(interaction) {
  const reminderId = interaction.options.getInteger("numero", true);
  let removed = false;
  await mutateGuild(interaction.guild.id, (data) => {
    const before = data.reminders.length;
    data.reminders = data.reminders.filter(
      (item) => !(item.id === reminderId && item.userId === interaction.user.id),
    );
    removed = data.reminders.length !== before;
  });
  const key = `${interaction.guild.id}:${reminderId}`;
  if (removed && scheduledReminders.has(key)) {
    clearTimeout(scheduledReminders.get(key));
    scheduledReminders.delete(key);
  }
  await interaction.reply({
    content: removed ? `Rappel #${reminderId} annulé.` : "Rappel introuvable.",
    flags: MessageFlags.Ephemeral,
  });
}

async function handleRoleButtonCreate(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({
      content: "Tu dois avoir la permission Gérer les rôles.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const channel = interaction.options.getChannel("salon", true);
  const role = interaction.options.getRole("role", true);
  const botMember = interaction.guild.members.me;
  if (
    role.managed ||
    role.id === interaction.guild.roles.everyone.id ||
    !botMember?.permissions.has(PermissionFlagsBits.ManageRoles) ||
    botMember.roles.highest.comparePositionTo(role) <= 0 ||
    (interaction.user.id !== interaction.guild.ownerId &&
      interaction.member.roles.highest.comparePositionTo(role) <= 0)
  ) {
    await interaction.reply({
      content: "Ce rôle doit être non géré et placé sous ton rôle ainsi que sous celui du bot.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const label = interaction.options.getString("label", true);
  const description =
    interaction.options.getString("description") || `Clique pour ajouter ou retirer le rôle ${role}.`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`role-toggle:${role.id}`)
      .setLabel(label)
      .setStyle(ButtonStyle.Secondary),
  );
  await channel.send({
    embeds: [new EmbedBuilder().setColor(role.color || 0x5865f2).setDescription(description)],
    components: [row],
  });
  await interaction.reply({
    content: `Panneau de rôle publié dans ${channel}.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleRoleToggleButton(interaction) {
  const roleId = interaction.customId.match(/^role-toggle:(\d+)$/)?.[1];
  if (!roleId || !interaction.inCachedGuild()) {
    return false;
  }
  const role = interaction.guild.roles.cache.get(roleId);
  const member = interaction.member;
  const botMember = interaction.guild.members.me;
  if (
    !role ||
    role.managed ||
    !botMember?.permissions.has(PermissionFlagsBits.ManageRoles) ||
    botMember.roles.highest.comparePositionTo(role) <= 0
  ) {
    await interaction.reply({
      content: "Ce rôle n'est plus disponible ou n'est plus gérable par le bot.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  const hasRole = member.roles.cache.has(role.id);
  if (hasRole) {
    await member.roles.remove(role, "Rôle retiré via bouton");
  } else {
    await member.roles.add(role, "Rôle ajouté via bouton");
  }
  await interaction.reply({
    content: `${role} a été ${hasRole ? "retiré" : "ajouté"}.`,
    flags: MessageFlags.Ephemeral,
  });
  return true;
}

function normalizeResponseName(input) {
  return input.trim().toLowerCase();
}

async function handleCustomResponses(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: "Tu dois avoir la permission Gérer le serveur.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "ajouter") {
    const name = normalizeResponseName(interaction.options.getString("nom", true));
    if (!/^[a-z0-9_-]{1,32}$/.test(name)) {
      await interaction.reply({
        content: "Le nom accepte seulement les lettres minuscules, chiffres, `_` et `-`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const text = interaction.options.getString("texte", true);
    await mutateGuild(interaction.guild.id, (data) => {
      data.customResponses[name] = text;
    });
    await interaction.reply({
      content: `Réponse **${name}** enregistrée.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (subcommand === "supprimer") {
    const name = normalizeResponseName(interaction.options.getString("nom", true));
    let existed = false;
    await mutateGuild(interaction.guild.id, (data) => {
      existed = Object.hasOwn(data.customResponses, name);
      delete data.customResponses[name];
    });
    await interaction.reply({
      content: existed ? `Réponse **${name}** supprimée.` : "Réponse introuvable.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const data = await readGuild(interaction.guild.id);
  const names = Object.keys(data.customResponses).sort();
  await interaction.reply({
    content: names.length ? names.map((name) => `\`${name}\``).join(", ") : "Aucune réponse enregistrée.",
    flags: MessageFlags.Ephemeral,
  });
}

async function handleCustomResponse(interaction) {
  const name = normalizeResponseName(interaction.options.getString("nom", true));
  const data = await readGuild(interaction.guild.id);
  const response = data.customResponses[name];
  if (!response) {
    await interaction.reply({
      content: "Réponse personnalisée introuvable.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await interaction.reply({ content: response, allowedMentions: { parse: [] } });
}

async function handleTempVoiceConfig(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.reply({
      content: "Tu dois avoir la permission Gérer les salons.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "configurer") {
    const lobby = interaction.options.getChannel("salon_creation", true);
    const category = interaction.options.getChannel("categorie", true);
    const botMember = interaction.guild.members.me;
    if (
      !botMember?.permissions.has([
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.MoveMembers,
      ])
    ) {
      await interaction.reply({
        content: "Le bot doit avoir les permissions Gérer les salons et Déplacer les membres.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await mutateGuild(interaction.guild.id, (data) => {
      data.tempVoice.enabled = true;
      data.tempVoice.lobbyId = lobby.id;
      data.tempVoice.categoryId = category.id;
    });
    await interaction.reply({
      content: `Salons temporaires activés via ${lobby}, dans **${category.name}**.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (subcommand === "desactiver") {
    await mutateGuild(interaction.guild.id, (data) => {
      data.tempVoice.enabled = false;
    });
    await interaction.reply({
      content: "Les salons vocaux temporaires sont désactivés.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const data = await readGuild(interaction.guild.id);
  await interaction.reply({
    content: `Temp vocal : **${data.tempVoice.enabled ? "activé" : "désactivé"}**\nSalon de création : ${data.tempVoice.lobbyId ? `<#${data.tempVoice.lobbyId}>` : "non configuré"}\nCatégorie : ${data.tempVoice.categoryId ? `<#${data.tempVoice.categoryId}>` : "non configurée"}`,
    flags: MessageFlags.Ephemeral,
  });
}

async function handleFun(interaction) {
  if (interaction.commandName === "ping") {
    await interaction.reply(`Pong ! Latence : ${interaction.client.ws.ping} ms 🏓`);
    return;
  }
  if (interaction.commandName === "avatar") {
    const user = interaction.options.getUser("utilisateur") || interaction.user;
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(`Avatar de ${user.globalName || user.username}`)
          .setImage(user.displayAvatarURL({ extension: "png", size: 1024 })),
      ],
    });
    return;
  }
  if (interaction.commandName === "pile-ou-face") {
    await interaction.reply(`La pièce tombe sur **${Math.random() < 0.5 ? "Pile" : "Face"}** 🪙`);
    return;
  }
  if (interaction.commandName === "de") {
    const faces = interaction.options.getInteger("faces") || 6;
    await interaction.reply(`Le dé à ${faces} faces donne **${Math.floor(Math.random() * faces) + 1}** 🎲`);
    return;
  }
  if (interaction.commandName === "choisir") {
    const choices = interaction.options
      .getString("options", true)
      .split("|")
      .map((choice) => choice.trim())
      .filter(Boolean);
    if (choices.length < 2) {
      await interaction.reply({
        content: "Donne au moins deux choix séparés par `|`.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.reply(`Je choisis : **${choices[Math.floor(Math.random() * choices.length)]}** ✨`);
    return;
  }
  const answers = [
    "Oui, clairement.",
    "C'est très probable.",
    "Peut-être, reste prudent.",
    "Difficile à dire pour le moment.",
    "Je ne pense pas.",
    "Non.",
  ];
  await interaction.reply(
    `🎱 **${interaction.options.getString("question", true)}**\n${answers[Math.floor(Math.random() * answers.length)]}`,
  );
}

async function handleBlacklist(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.BanMembers)) {
    await interaction.reply({
      content: "Tu dois avoir la permission Bannir des membres.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "info" || subcommand === "retablir") {
    const userId = interaction.options.getString("identifiant", true);
    if (!/^\d{17,20}$/.test(userId)) {
      await interaction.reply({
        content: "Identifiant Discord invalide.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const data = await readGuild(interaction.guild.id);
    const entry = data.blacklist.find((item) => item.userId === userId);
    if (!entry) {
      await interaction.reply({
        content: "Cet identifiant n'est pas sur la liste noire.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (subcommand === "info") {
      const createdTimestamp = Number.isFinite(new Date(entry.createdAt).getTime())
        ? Math.floor(new Date(entry.createdAt).getTime() / 1000)
        : Math.floor(Date.now() / 1000);
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xed4245)
            .setTitle(`Dossier blacklist — ${entry.userTag || userId}`)
            .addFields(
              { name: "Identifiant", value: `\`${userId}\`` },
              { name: "Raison", value: entry.reason || "Non précisée" },
              {
                name: "Modérateur",
                value: entry.moderatorId ? `<@${entry.moderatorId}>` : "Inconnu",
                inline: true,
              },
              {
                name: "Date",
                value: `<t:${createdTimestamp}:F>`,
                inline: true,
              },
            ),
        ],
        flags: MessageFlags.Ephemeral,
        allowedMentions: { parse: [] },
      });
      return;
    }
    await mutateGuild(interaction.guild.id, (guildData) => {
      guildData.blacklist = guildData.blacklist.filter((item) => item.userId !== userId);
    });
    await interaction.guild.bans.remove(userId, `Rétabli par ${interaction.user.tag}`).catch(() => {});
    await interaction.reply({
      content: `<@${userId}> a été retiré de la liste noire et débanni s'il était banni.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }
  if (subcommand === "ajouter") {
    const user = interaction.options.getUser("utilisateur", true);
    const reason = interaction.options.getString("raison", true);
    if (user.id === interaction.user.id || user.id === interaction.guild.ownerId) {
      await interaction.reply({
        content: "Cet utilisateur ne peut pas être ajouté à la liste noire.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await mutateGuild(interaction.guild.id, (data) => {
      data.blacklist = data.blacklist.filter((entry) => entry.userId !== user.id);
      data.blacklist.push({
        userId: user.id,
        userTag: user.tag,
        reason,
        moderatorId: interaction.user.id,
        createdAt: new Date().toISOString(),
      });
    });
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member?.bannable) {
      await member.ban({ reason: `Liste noire : ${reason}` });
    }
    await interaction.reply({
      content: `${user.tag} est maintenant sur la liste noire.`,
      flags: MessageFlags.Ephemeral,
    });
    await sendLog(
      interaction.guild,
      new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("Ajout à la liste noire")
        .setDescription(`${user.tag} (${user.id})\nRaison : ${reason}`)
        .setTimestamp(),
    );
    return;
  }
  if (subcommand === "retirer") {
    const userId = interaction.options.getString("identifiant", true);
    if (!/^\d{17,20}$/.test(userId)) {
      await interaction.reply({
        content: "Identifiant Discord invalide.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    let removed = false;
    await mutateGuild(interaction.guild.id, (data) => {
      const before = data.blacklist.length;
      data.blacklist = data.blacklist.filter((entry) => entry.userId !== userId);
      removed = data.blacklist.length !== before;
    });
    await interaction.reply({
      content: removed ? `<@${userId}> a été retiré de la liste noire.` : "Identifiant introuvable.",
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }
  const data = await readGuild(interaction.guild.id);
  await interaction.reply({
    content: data.blacklist.length
      ? data.blacklist
          .map((entry) => `• **${entry.userTag || entry.userId}** (${entry.userId}) — ${entry.reason}`)
          .join("\n")
          .slice(0, 1900)
      : "La liste noire est vide.",
    flags: MessageFlags.Ephemeral,
  });
}

async function handleTempVoiceState(oldState, newState) {
  const guild = newState.guild || oldState.guild;
  const data = await readGuild(guild.id);
  if (!data.tempVoice.enabled) {
    return;
  }

  if (newState.channelId === data.tempVoice.lobbyId && newState.member) {
    const safeName = newState.member.displayName.replace(/[^\p{L}\p{N} _-]/gu, "").slice(0, 70);
    const channel = await guild.channels.create({
      name: `🔊・${safeName || "Salon temporaire"}`,
      type: ChannelType.GuildVoice,
      parent: data.tempVoice.categoryId,
      permissionOverwrites: [
        {
          id: newState.member.id,
          allow: [
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.MoveMembers,
            PermissionFlagsBits.MuteMembers,
          ],
        },
      ],
      reason: `Salon temporaire de ${newState.member.user.tag}`,
    });
    await mutateGuild(guild.id, (guildData) => {
      guildData.tempVoice.createdChannelIds.push(channel.id);
    });
    await newState.setChannel(channel, "Création d'un salon vocal temporaire").catch(() => {});
  }

  if (
    oldState.channelId &&
    data.tempVoice.createdChannelIds.includes(oldState.channelId) &&
    oldState.channel?.members.size === 0
  ) {
    await oldState.channel.delete("Salon vocal temporaire vide").catch(() => {});
    await mutateGuild(guild.id, (guildData) => {
      guildData.tempVoice.createdChannelIds = guildData.tempVoice.createdChannelIds.filter(
        (channelId) => channelId !== oldState.channelId,
      );
    });
  }
}

async function handleCommunityInteraction(interaction) {
  switch (interaction.commandName) {
    case "ping":
    case "avatar":
    case "pile-ou-face":
    case "de":
    case "choisir":
    case "huitball":
      await handleFun(interaction);
      return true;
    case "blacklist":
      await handleBlacklist(interaction);
      return true;
    case "suggestions":
      await handleSuggestions(interaction);
      return true;
    case "suggerer":
      await handleSuggest(interaction);
      return true;
    case "giveaway":
      await handleGiveaway(interaction);
      return true;
    case "rappel":
      await handleReminder(interaction);
      return true;
    case "rappels":
      await handleReminderList(interaction);
      return true;
    case "rappel-annuler":
      await handleReminderCancel(interaction);
      return true;
    case "role-bouton":
      await handleRoleButtonCreate(interaction);
      return true;
    case "reponses":
      await handleCustomResponses(interaction);
      return true;
    case "reponse":
      await handleCustomResponse(interaction);
      return true;
    case "tempvocal":
      await handleTempVoiceConfig(interaction);
      return true;
    default:
      return false;
  }
}

module.exports = {
  handleCommunityInteraction,
  handleRoleToggleButton,
  handleTempVoiceState,
  restoreScheduledTasks,
};
