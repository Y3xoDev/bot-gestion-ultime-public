const {
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const { mutateGuild, readGuild } = require("../persistence/guild-store");

function canBypassLock(member, lock) {
  return (
    member.id === lock.ownerId ||
    (lock.allowedUserIds || []).includes(member.id) ||
    member.id === member.guild.ownerId ||
    member.permissions.has(PermissionFlagsBits.Administrator)
  );
}

async function handleVoiceProtection(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.reply({
      content: "Tu dois avoir la permission Gérer les salons.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const channel = interaction.options.getChannel("salon");
  const selectedUser = interaction.options.getUser("membre");
  const member = selectedUser
    ? await interaction.guild.members.fetch(selectedUser.id).catch(() => null)
    : null;
  const data = await readGuild(interaction.guild.id);

  if (subcommand === "statut") {
    const entries = channel
      ? [[channel.id, data.voiceProtection.locks[channel.id]]].filter(([, lock]) => lock)
      : Object.entries(data.voiceProtection.locks);
    const description = entries.length
      ? entries
          .map(
            ([channelId, lock]) =>
              `• <#${channelId}> — propriétaire <@${lock.ownerId}> — ${(lock.allowedUserIds || []).length} autorisé(s)\n  Motif : ${lock.reason}`,
          )
          .join("\n")
          .slice(0, 3900)
      : "Aucun salon vocal protégé.";
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle("Protection des salons vocaux")
          .setDescription(description),
      ],
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }

  const existing = data.voiceProtection.locks[channel.id];
  if (subcommand === "verrouiller") {
    if (!interaction.guild.members.me?.permissions.has(PermissionFlagsBits.MoveMembers)) {
      await interaction.reply({
        content: "Le bot doit avoir la permission Déplacer les membres.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const reason =
      interaction.options.getString("raison") || "Salon vocal privé protégé";
    await mutateGuild(interaction.guild.id, (guildData) => {
      guildData.voiceProtection.locks[channel.id] = {
        ownerId: interaction.user.id,
        reason,
        allowedUserIds: existing?.allowedUserIds || [],
        createdAt: existing?.createdAt || new Date().toISOString(),
      };
    });
    await interaction.reply({
      content: `${channel} est maintenant protégé. Les membres non autorisés seront déconnectés.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!existing) {
    await interaction.reply({
      content: "Ce salon vocal n'est pas protégé.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === "deverrouiller") {
    await mutateGuild(interaction.guild.id, (guildData) => {
      delete guildData.voiceProtection.locks[channel.id];
    });
    await interaction.reply({
      content: `${channel} n'est plus protégé.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!member) {
    await interaction.reply({
      content: "Membre introuvable sur ce serveur.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (member.id === interaction.guild.ownerId || member.user.bot) {
    await interaction.reply({
      content: "Ce membre ne peut pas être ajouté ou retiré de cette liste.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (subcommand === "autoriser") {
    await mutateGuild(interaction.guild.id, (guildData) => {
      const lock = guildData.voiceProtection.locks[channel.id];
      if (lock && !lock.allowedUserIds.includes(member.id)) {
        lock.allowedUserIds.push(member.id);
      }
    });
    await interaction.reply({
      content: `${member} peut maintenant rejoindre ${channel}.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await mutateGuild(interaction.guild.id, (guildData) => {
    const lock = guildData.voiceProtection.locks[channel.id];
    if (lock) {
      lock.allowedUserIds = lock.allowedUserIds.filter((userId) => userId !== member.id);
    }
  });
  if (
    member.voice.channelId === channel.id &&
    interaction.guild.members.me?.permissions.has(PermissionFlagsBits.MoveMembers)
  ) {
    await member.voice.disconnect("Retrait de la liste d'accès vocal").catch(() => {});
  }
  await interaction.reply({
    content: `${member} ne peut plus rejoindre ${channel}.`,
    flags: MessageFlags.Ephemeral,
  });
}

async function enforceVoiceProtection(oldState, newState) {
  if (
    !newState.channelId ||
    newState.channelId === oldState.channelId ||
    !newState.member ||
    newState.member.user.bot
  ) {
    return;
  }

  const data = await readGuild(newState.guild.id);
  const lock = data.voiceProtection.locks[newState.channelId];
  if (!lock || canBypassLock(newState.member, lock)) {
    return;
  }

  if (newState.guild.members.me?.permissions.has(PermissionFlagsBits.MoveMembers)) {
    await newState.disconnect(`Salon vocal protégé : ${lock.reason}`).catch(() => {});
  }
  await newState.member
    .send(
      `⛔ Accès refusé au salon vocal **${newState.channel?.name || newState.channelId}**.\nMotif : ${lock.reason}`,
    )
    .catch(() => {});
}

module.exports = { enforceVoiceProtection, handleVoiceProtection };
