const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const { mutateGuild, readGuild } = require("../persistence/guild-store");
const { sendLog } = require("./server-events");

const RULE_ACTIONS = ["accept", "refuse", "read", "question"];

function parseColor(value, fallback = 0x5865f2) {
  if (!value) {
    return fallback;
  }
  const normalized = value.replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(normalized) ? Number.parseInt(normalized, 16) : fallback;
}

function normalizeRulesOrder(value, current = RULE_ACTIONS) {
  const requested = String(value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item, index, values) => RULE_ACTIONS.includes(item) && values.indexOf(item) === index);
  const base = requested.length ? requested : current;
  return [...base, ...RULE_ACTIONS.filter((item) => !base.includes(item))];
}

function applyEmoji(button, emoji) {
  if (!emoji) {
    return button;
  }
  try {
    return button.setEmoji(emoji);
  } catch {
    return button;
  }
}

function rulesComponents(config) {
  const definitions = {
    accept: { style: ButtonStyle.Success, customId: "rules:accept" },
    refuse: { style: ButtonStyle.Danger, customId: "rules:refuse" },
    read: { style: ButtonStyle.Secondary, customId: "rules:read" },
    question: { style: ButtonStyle.Primary, customId: "rules:question" },
  };
  const row = new ActionRowBuilder();
  for (const action of normalizeRulesOrder(config.order)) {
    const definition = definitions[action];
    const appearance = config.buttons[action];
    const button = new ButtonBuilder()
      .setCustomId(definition.customId)
      .setLabel(appearance.label)
      .setStyle(definition.style);
    row.addComponents(applyEmoji(button, appearance.emoji));
  }
  return [row];
}

function rulesEmbed(config) {
  return new EmbedBuilder()
    .setColor(parseColor(config.color))
    .setTitle(config.title)
    .setDescription(config.description)
    .setFooter({ text: "Utilise les boutons ci-dessous pour répondre au règlement." });
}

async function handleRulesCommand(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: "Tu dois avoir la permission Gérer le serveur.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "creer") {
    const channel = interaction.options.getChannel("salon", true);
    const role = interaction.options.getRole("role_membre", true);
    const botMember = interaction.guild.members.me || (await interaction.guild.members.fetchMe());
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles) || !role.editable) {
      await interaction.reply({
        content: "Le bot doit pouvoir gérer le rôle choisi et son rôle doit être placé au-dessus.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const current = (await readGuild(interaction.guild.id)).rules;
    const config = {
      ...current,
      enabled: true,
      channelId: channel.id,
      memberRoleId: role.id,
      questionChannelId:
        interaction.options.getChannel("salon_questions")?.id || current.questionChannelId,
      title: interaction.options.getString("titre") || current.title,
      description: interaction.options.getString("description", true),
      color: (interaction.options.getString("couleur") || current.color).replace(/^#/, ""),
      confirmationEnabled:
        interaction.options.getBoolean("confirmation") ?? current.confirmationEnabled,
      buttons: {
        accept: {
          ...current.buttons.accept,
          label: interaction.options.getString("label_accepter") || current.buttons.accept.label,
          emoji: interaction.options.getString("emoji_accepter") || current.buttons.accept.emoji,
        },
        refuse: {
          ...current.buttons.refuse,
          label: interaction.options.getString("label_refuser") || current.buttons.refuse.label,
          emoji: interaction.options.getString("emoji_refuser") || current.buttons.refuse.emoji,
        },
        read: {
          ...current.buttons.read,
          label: interaction.options.getString("label_relire") || current.buttons.read.label,
          emoji: interaction.options.getString("emoji_relire") || current.buttons.read.emoji,
        },
        question: {
          ...current.buttons.question,
          label: interaction.options.getString("label_question") || current.buttons.question.label,
          emoji: interaction.options.getString("emoji_question") || current.buttons.question.emoji,
        },
      },
      order: normalizeRulesOrder(interaction.options.getString("ordre"), current.order),
    };
    const panel = await channel.send({
      embeds: [rulesEmbed(config)],
      components: rulesComponents(config),
    });
    config.messageId = panel.id;
    await mutateGuild(interaction.guild.id, (data) => {
      data.rules = config;
    });
    await interaction.editReply({ content: `Règlement interactif publié dans ${channel}.` });
    return;
  }

  if (subcommand === "desactiver") {
    await mutateGuild(interaction.guild.id, (data) => {
      data.rules.enabled = false;
    });
    await interaction.reply({ content: "Le règlement interactif est désactivé.", flags: MessageFlags.Ephemeral });
    return;
  }

  const config = (await readGuild(interaction.guild.id)).rules;
  await interaction.reply({
    content: [
      `Statut : **${config.enabled ? "activé" : "désactivé"}**`,
      `Salon : ${config.channelId ? `<#${config.channelId}>` : "non configuré"}`,
      `Rôle membre : ${config.memberRoleId ? `<@&${config.memberRoleId}>` : "non configuré"}`,
      `Ordre : ${config.order.join(" → ")}`,
    ].join("\n"),
    flags: MessageFlags.Ephemeral,
  });
}

async function handleRulesButton(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith("rules:")) {
    return false;
  }
  const action = interaction.customId.split(":")[1];
  const config = (await readGuild(interaction.guild.id)).rules;
  if (!config.enabled || !config.memberRoleId) {
    await interaction.reply({ content: "Ce règlement n'est plus actif.", flags: MessageFlags.Ephemeral });
    return true;
  }

  if (action === "read") {
    await interaction.reply({ embeds: [rulesEmbed(config)], flags: MessageFlags.Ephemeral });
    return true;
  }
  if (action === "question") {
    await interaction.reply({
      content: config.questionChannelId
        ? `Tu peux poser ta question dans <#${config.questionChannelId}>.`
        : "Contacte un membre du staff pour poser ta question.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const role = interaction.guild.roles.cache.get(config.memberRoleId);
  if (!role?.editable) {
    await interaction.reply({ content: "Le rôle Membre ne peut pas être géré par le bot.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (action === "accept") {
    await interaction.member.roles.add(role, "Règlement accepté");
    await interaction.reply({
      content: config.confirmationEnabled ? `Règlement accepté : le rôle ${role} t'a été attribué.` : "✅",
      flags: MessageFlags.Ephemeral,
    });
    await sendLog(
      interaction.guild,
      "roles",
      new EmbedBuilder().setColor(0x57f287).setTitle("Règlement accepté").setDescription(`${interaction.user} a reçu ${role}.`).setTimestamp(),
    );
    return true;
  }
  if (action === "refuse") {
    if (interaction.member.roles.cache.has(role.id)) {
      await interaction.member.roles.remove(role, "Règlement refusé");
    }
    await interaction.reply({ content: "Tu as refusé le règlement. Aucun rôle membre n'est attribué.", flags: MessageFlags.Ephemeral });
    return true;
  }
  return true;
}

function reactionEmojiKey(value) {
  return value?.match(/<?a?:?[^:>]*:?(\d{17,20})>?/)?.[1] || value;
}

async function handleReactionRoleCommand(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({ content: "Tu dois avoir la permission Gérer les rôles.", flags: MessageFlags.Ephemeral });
    return;
  }
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "creer") {
    const channel = interaction.options.getChannel("salon", true);
    const role = interaction.options.getRole("role", true);
    const emoji = interaction.options.getString("emoji", true);
    if (!role.editable || role.id === interaction.guild.roles.everyone.id) {
      await interaction.reply({ content: "Ce rôle ne peut pas être géré par le bot.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const message = await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle(interaction.options.getString("titre") || "Choisis ton rôle")
          .setDescription(
            interaction.options.getString("description") || `Réagis avec ${emoji} pour recevoir ${role}.`,
          ),
      ],
    });
    try {
      await message.react(emoji);
    } catch {
      await message.delete().catch(() => {});
      await interaction.editReply({ content: "Emoji invalide ou inaccessible au bot." });
      return;
    }
    await mutateGuild(interaction.guild.id, (data) => {
      const key = reactionEmojiKey(emoji);
      data.reactionRoles = data.reactionRoles.filter(
        (item) => !(item.messageId === message.id && item.emoji === key),
      );
      data.reactionRoles.push({ channelId: channel.id, messageId: message.id, emoji: key, roleId: role.id });
    });
    await interaction.editReply({ content: `Reaction role publié dans ${channel}.` });
    return;
  }
  if (subcommand === "supprimer") {
    const messageId = interaction.options.getString("message_id", true);
    const emoji = reactionEmojiKey(interaction.options.getString("emoji", true));
    let removed = false;
    await mutateGuild(interaction.guild.id, (data) => {
      const before = data.reactionRoles.length;
      data.reactionRoles = data.reactionRoles.filter(
        (item) => !(item.messageId === messageId && item.emoji === emoji),
      );
      removed = before !== data.reactionRoles.length;
    });
    await interaction.reply({ content: removed ? "Association supprimée." : "Association introuvable.", flags: MessageFlags.Ephemeral });
    return;
  }
  const entries = (await readGuild(interaction.guild.id)).reactionRoles;
  await interaction.reply({
    content: entries.length
      ? entries.map((item) => `• message \`${item.messageId}\` • emoji ${item.emoji} • <@&${item.roleId}>`).join("\n").slice(0, 1900)
      : "Aucun reaction role configuré.",
    flags: MessageFlags.Ephemeral,
  });
}

async function handleReactionRole(reaction, user, add) {
  if (user.bot) {
    return;
  }
  if (reaction.partial) {
    await reaction.fetch().catch(() => null);
  }
  if (reaction.message.partial) {
    await reaction.message.fetch().catch(() => null);
  }
  const guild = reaction.message.guild;
  if (!guild) {
    return;
  }
  const key = reaction.emoji.id || reaction.emoji.name;
  const entry = (await readGuild(guild.id)).reactionRoles.find(
    (item) => item.messageId === reaction.message.id && item.emoji === key,
  );
  if (!entry) {
    return;
  }
  const member = await guild.members.fetch(user.id).catch(() => null);
  const role = guild.roles.cache.get(entry.roleId);
  if (!member || !role?.editable) {
    return;
  }
  if (add) {
    await member.roles.add(role, "Reaction role").catch(() => {});
  } else {
    await member.roles.remove(role, "Reaction role retiré").catch(() => {});
  }
}

module.exports = {
  handleReactionRole,
  handleReactionRoleCommand,
  handleRulesButton,
  handleRulesCommand,
  normalizeRulesOrder,
  parseColor,
  reactionEmojiKey,
  rulesComponents,
};
