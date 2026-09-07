const { ChannelType, MessageFlags, PermissionFlagsBits: P } = require("discord.js");
const {
  entersState, getVoiceConnection, joinVoiceChannel, VoiceConnectionStatus: Status,
} = require("@discordjs/voice");
const { readGuild } = require("../persistence/guild-store");

const joining = new Set();
const watched = new WeakSet();
const recovering = new WeakSet();
const READY_TIMEOUT = 20_000;

function destroyConnection(connection) {
  if (connection && connection.state.status !== Status.Destroyed) connection.destroy();
}

function watchConnection(connection, guildId) {
  if (watched.has(connection)) return;
  watched.add(connection);
  connection.on("error", error => {
    console.warn(`Connexion vocale ${guildId} : ${error.code || error.name}`);
    destroyConnection(connection);
  });
  connection.on(Status.Disconnected, () => {
    if (recovering.has(connection)) return;
    recovering.add(connection);
    // Let the library handle brief network interruptions or a server move.
    // A kick/manual disconnect without a new signalling phase is not undone.
    void Promise.race([
      entersState(connection, Status.Signalling, 5_000),
      entersState(connection, Status.Connecting, 5_000),
    ]).then(() => entersState(connection, Status.Ready, READY_TIMEOUT))
      .catch(() => destroyConnection(connection))
      .finally(() => recovering.delete(connection));
  });
}

async function handleJoinVoice(interaction) {
  if (!interaction.guild) {
    await interaction.reply({ content: "Cette commande fonctionne uniquement dans un serveur.", flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guild = interaction.guild;
  if (joining.has(guild.id)) {
    await interaction.editReply({ content: "Une connexion vocale est déjà en cours sur ce serveur. Patiente un instant." });
    return;
  }
  joining.add(guild.id);
  let connection;
  try {
    const actor = await guild.members.fetch(interaction.user.id);
    if (!actor.permissions.has(P.ManageGuild)) throw new Error("Tu dois avoir la permission Gérer le serveur pour déplacer le bot en vocal.");
    const selected = interaction.options.getChannel("salon");
    if (selected && selected.guild?.id !== guild.id) throw new Error("Le salon doit appartenir à ce serveur.");
    const channelId = selected?.id || actor.voice.channelId;
    if (!channelId) throw new Error("Rejoins un salon vocal ou précise l'option salon : /join voc salon:ton-vocal.");
    const channel = await guild.channels.fetch(channelId);
    if (!channel || channel.guild.id !== guild.id || ![ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)) {
      throw new Error("Choisis un salon vocal ou une scène de ce serveur.");
    }
    const config = await readGuild(guild.id);
    if (config.statistics?.entries?.some(e => e.channelId === channel.id)) {
      throw new Error("Ce salon est un compteur de statistiques : choisis un vrai salon vocal.");
    }
    const access = [P.ViewChannel, P.Connect];
    if (!channel.permissionsFor(actor)?.has(access)) throw new Error("Tu dois pouvoir voir et rejoindre ce salon vocal.");
    const bot = guild.members.me || await guild.members.fetchMe();
    if (!channel.permissionsFor(bot)?.has(access)) throw new Error("Il me manque Voir le salon ou Se connecter dans ce vocal.");
    if (channel.userLimit && channel.members.size >= channel.userLimit && !channel.permissionsFor(bot).has(P.MoveMembers)) {
      throw new Error("Ce salon vocal est plein.");
    }
    const existing = getVoiceConnection(guild.id);
    if (existing?.joinConfig.channelId === channel.id && existing.state.status === Status.Ready) {
      await interaction.editReply({ content: `Je suis déjà connecté dans <#${channel.id}>.`, allowedMentions: { parse: [] } });
      return;
    }
    connection = joinVoiceChannel({ guildId: guild.id, channelId: channel.id, adapterCreator: guild.voiceAdapterCreator,
      selfDeaf: true, selfMute: true });
    watchConnection(connection, guild.id);
    await entersState(connection, Status.Ready, READY_TIMEOUT);
    if (connection.joinConfig.channelId !== channel.id) throw new Error("Le bot a été déplacé pendant la connexion. Relance la commande si nécessaire.");
    await interaction.editReply({ content: `Connecté dans <#${channel.id}>. Je reste muet et sourd, sans enregistrer ni diffuser d'audio.`,
      allowedMentions: { parse: [] } });
  } catch (error) {
    if (connection) destroyConnection(connection);
    const content = connection
      ? "Impossible de terminer la connexion vocale. Vérifie les permissions et l'accès réseau UDP, puis réessaie."
      : error.code ? `Connexion vocale refusée par Discord (${error.code}). Vérifie le salon et les permissions.` : error.message;
    await interaction.editReply({ content, allowedMentions: { parse: [] } });
  } finally { joining.delete(guild.id); }
}

function destroyBotVoiceConnections(client) {
  for (const guild of client.guilds.cache.values()) destroyConnection(getVoiceConnection(guild.id));
}

module.exports = { handleJoinVoice, destroyBotVoiceConnections };
