const {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require("discord.js");
const { mutateGuild, readGuild } = require("../persistence/guild-store");
const { sendLog } = require("./server-events");

const recentSecurityAlerts = new Map();
const SUSPICIOUS_MESSAGE_PATTERNS = [
  /free\s+nitro|nitro\s+gratuit|steam\s+gift|cadeau\s+discord/i,
  /https?:\/\/(?:bit\.ly|tinyurl\.com|t\.co|cutt\.ly)\//i,
  /https?:\/\/[^\s]*xn--/i,
  /discord(?:app)?\.(?:gift|click)|discord-gift/i,
];

async function securityChannel(guild, config) {
  return config.channelId
    ? guild.channels.cache.get(config.channelId) ||
        (await guild.channels.fetch(config.channelId).catch(() => null))
    : null;
}

async function handleSecurityCommand(interaction) {
  if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: "Tu dois avoir la permission Gérer le serveur.", flags: MessageFlags.Ephemeral });
    return;
  }
  const botMember = interaction.guild.members.me || (await interaction.guild.members.fetchMe());
  if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
    await interaction.reply({ content: "Le bot a besoin de la permission Gérer les salons.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const current = (await readGuild(interaction.guild.id)).security;
  let channel = await securityChannel(interaction.guild, current);
  const staffRole = interaction.options.getRole("role_staff");
  const category = interaction.options.getChannel("categorie");
  if (!channel) {
    const overwrites = [
      {
        id: interaction.guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: interaction.guild.ownerId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
      {
        id: botMember.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
    ];
    if (staffRole) {
      overwrites.push({
        id: staffRole.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      });
    }
    channel = await interaction.guild.channels.create({
      name: "🔐・sécurité",
      type: ChannelType.GuildText,
      parent: category?.id,
      permissionOverwrites: overwrites,
      reason: `Salon de sécurité créé par ${interaction.user.tag}`,
    });
  }
  const minimumAccountAgeDays = interaction.options.getInteger("anciennete_jours") || 7;
  await mutateGuild(interaction.guild.id, (data) => {
    data.security = {
      enabled: true,
      channelId: channel.id,
      staffRoleId: staffRole?.id || current.staffRoleId,
      minimumAccountAgeDays,
    };
  });
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle("🛡️ SÉCURITÉ DU SERVEUR")
        .setDescription(
          [
            "Ce salon protège le serveur contre les faux comptes, comptes potentiellement compromis, scams, phishing et comportements suspects.",
            "",
            "🔎 Signaux surveillés :",
            "• comptes très récents ou sans avatar personnalisé",
            "• messages évoquant des cadeaux frauduleux ou contenant des liens suspects",
            "• actions automatiques de sécurité et alertes anti-raid",
            "",
            "⚠️ Une alerte n'est pas une preuve. Le staff doit toujours vérifier avant de sanctionner.",
            "🔐 Ne partage jamais ton mot de passe, ton token Discord ou tes codes de connexion.",
          ].join("\n"),
        )
        .setTimestamp(),
    ],
  });
  await interaction.editReply({ content: `Système de sécurité actif dans ${channel}.` });
}

async function sendSecurityAlert(guild, embed) {
  const config = (await readGuild(guild.id)).security;
  if (!config.enabled) {
    return;
  }
  const channel = await securityChannel(guild, config);
  if (channel?.isTextBased()) {
    await channel.send({ embeds: [embed] }).catch(() => {});
  }
  await sendLog(guild, "antiraid", embed);
}

async function handleSecurityMemberJoin(member) {
  if (member.user.bot) {
    return;
  }
  const config = (await readGuild(member.guild.id)).security;
  if (!config.enabled) {
    return;
  }
  const accountAgeDays = (Date.now() - member.user.createdTimestamp) / 86_400_000;
  const signals = [];
  if (accountAgeDays < config.minimumAccountAgeDays) {
    signals.push(`Compte créé il y a moins de ${config.minimumAccountAgeDays} jour(s).`);
  }
  if (!member.user.avatar) {
    signals.push("Aucun avatar personnalisé.");
  }
  if (!signals.length) {
    return;
  }
  await sendSecurityAlert(
    member.guild,
    new EmbedBuilder()
      .setColor(0xfaa61a)
      .setTitle("Compte à vérifier")
      .setDescription(`${member} (${member.id}) a rejoint le serveur.\n${signals.map((signal) => `• ${signal}`).join("\n")}`)
      .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
      .setTimestamp(),
  );
}

async function handleSecurityMessage(message) {
  if (!message.inGuild() || message.author.bot || !message.content) {
    return;
  }
  if (!SUSPICIOUS_MESSAGE_PATTERNS.some((pattern) => pattern.test(message.content))) {
    return;
  }
  const config = (await readGuild(message.guild.id)).security;
  if (!config.enabled) {
    return;
  }
  const key = `${message.guild.id}:${message.author.id}`;
  if ((recentSecurityAlerts.get(key) || 0) > Date.now() - 60_000) {
    return;
  }
  recentSecurityAlerts.set(key, Date.now());
  await sendSecurityAlert(
    message.guild,
    new EmbedBuilder()
      .setColor(0xed4245)
      .setTitle("Message potentiellement dangereux")
      .addFields(
        { name: "Auteur", value: `${message.author} (${message.author.id})` },
        { name: "Salon", value: `${message.channel}` },
        { name: "Contenu", value: message.content.slice(0, 1000) },
      )
      .setTimestamp(),
  );
}

module.exports = {
  handleSecurityCommand,
  handleSecurityMemberJoin,
  handleSecurityMessage,
  sendSecurityAlert,
};
