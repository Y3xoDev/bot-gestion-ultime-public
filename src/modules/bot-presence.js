const {
  ActivityType,
  EmbedBuilder,
  MessageFlags,
} = require("discord.js");
const { mutateBot, readBot } = require("../persistence/guild-store");

const DEFAULT_PRESENCE = Object.freeze({
  status: "online",
  activityEnabled: true,
  activityType: "playing",
  activityText: null,
  streamUrl: null,
});

const ACTIVITY_TYPES = Object.freeze({
  playing: ActivityType.Playing,
  streaming: ActivityType.Streaming,
  listening: ActivityType.Listening,
  watching: ActivityType.Watching,
  competing: ActivityType.Competing,
});

const ACTIVITY_LABELS = Object.freeze({
  playing: "Joue à",
  streaming: "Stream",
  listening: "Écoute",
  watching: "Regarde",
  competing: "Participe à",
});

const STATUS_LABELS = Object.freeze({
  online: "🟢 En ligne",
  idle: "🟡 Inactif",
  dnd: "🔴 Ne pas déranger",
  invisible: "⚫ Invisible",
});

const ACTIVITY_INPUTS = Object.freeze({
  jouer: "playing",
  stream: "streaming",
  ecouter: "listening",
  regarder: "watching",
  participer: "competing",
});

const STATUS_INPUTS = Object.freeze({
  en_ligne: "online",
  inactif: "idle",
  ne_pas_deranger: "dnd",
  invisible: "invisible",
});

function fallbackActivityText() {
  return process.env.BOT_ACTIVITY?.trim() || "protège le serveur";
}

function normalizeStreamUrl(value) {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const supported =
      hostname === "twitch.tv" ||
      hostname.endsWith(".twitch.tv") ||
      hostname === "youtube.com" ||
      hostname.endsWith(".youtube.com") ||
      hostname === "youtu.be";
    return url.protocol === "https:" && supported ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizePresence(value = {}) {
  const status = STATUS_LABELS[value.status] ? value.status : DEFAULT_PRESENCE.status;
  const activityType = Object.hasOwn(ACTIVITY_TYPES, value.activityType)
    ? value.activityType
    : DEFAULT_PRESENCE.activityType;
  const activityText =
    typeof value.activityText === "string" && value.activityText.trim()
      ? value.activityText.trim().slice(0, 128)
      : null;
  return {
    status,
    activityEnabled: value.activityEnabled !== false,
    activityType,
    activityText,
    streamUrl:
      activityType === "streaming" ? normalizeStreamUrl(value.streamUrl) : null,
  };
}

function buildPresencePayload(value, defaultText = fallbackActivityText()) {
  const presence = normalizePresence(value);
  const activities = [];
  if (presence.activityEnabled) {
    const activity = {
      name: presence.activityText || defaultText,
      type: ACTIVITY_TYPES[presence.activityType],
    };
    if (presence.activityType === "streaming" && presence.streamUrl) {
      activity.url = presence.streamUrl;
    }
    activities.push(activity);
  }
  return { status: presence.status, activities };
}

function presenceEmbed(value) {
  const presence = normalizePresence(value);
  const effectiveText = presence.activityText || fallbackActivityText();
  const activityValue = presence.activityEnabled
    ? `**${ACTIVITY_LABELS[presence.activityType]}** ${effectiveText}`
    : "Aucune activité affichée";
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Présence du bot")
    .addFields(
      { name: "Statut", value: STATUS_LABELS[presence.status], inline: true },
      { name: "Activité", value: activityValue, inline: false },
    )
    .setFooter({ text: "Configuration sauvegardée et restaurée au redémarrage" })
    .setTimestamp();
  if (presence.activityType === "streaming" && presence.streamUrl) {
    embed.addFields({ name: "Lien du stream", value: presence.streamUrl });
  }
  return embed;
}

async function applyPresence(client, value) {
  const presence = normalizePresence(value);
  client.user.setPresence(buildPresencePayload(presence));
  return presence;
}

async function applyStoredPresence(client) {
  const data = await readBot();
  return applyPresence(client, data.presence);
}

async function saveAndApply(client, value) {
  const presence = await applyPresence(client, value);
  await mutateBot((data) => {
    data.presence = presence;
  });
  return presence;
}

async function replyWithPresence(interaction, content, presence) {
  await interaction.reply({
    content,
    embeds: [presenceEmbed(presence)],
    flags: MessageFlags.Ephemeral,
  });
}

async function handlePresenceCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const data = await readBot();

  if (subcommand === "afficher") {
    await replyWithPresence(interaction, "Voici la présence actuelle du bot.", data.presence);
    return;
  }

  if (subcommand === "statut") {
    const status = STATUS_INPUTS[interaction.options.getString("valeur", true)];
    const presence = await saveAndApply(interaction.client, {
      ...data.presence,
      status,
    });
    await replyWithPresence(interaction, "Le statut du bot a été mis à jour.", presence);
    return;
  }

  if (subcommand === "activite") {
    const activityType = ACTIVITY_INPUTS[interaction.options.getString("type", true)];
    const activityText = interaction.options.getString("texte", true).trim();
    const suppliedUrl = interaction.options.getString("url");
    const streamUrl = normalizeStreamUrl(suppliedUrl);

    if (activityType === "streaming" && !streamUrl) {
      await interaction.reply({
        content: "Pour une activité Stream, indique une URL HTTPS Twitch ou YouTube valide.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (activityType !== "streaming" && suppliedUrl) {
      await interaction.reply({
        content: "L'option `url` est réservée au type Stream.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const presence = await saveAndApply(interaction.client, {
      ...data.presence,
      activityEnabled: true,
      activityType,
      activityText,
      streamUrl,
    });
    await replyWithPresence(interaction, "L'activité du bot a été mise à jour.", presence);
    return;
  }

  if (subcommand === "effacer-activite") {
    const presence = await saveAndApply(interaction.client, {
      ...data.presence,
      activityEnabled: false,
      streamUrl: null,
    });
    await replyWithPresence(interaction, "L'activité du bot a été masquée.", presence);
    return;
  }

  const presence = await saveAndApply(interaction.client, DEFAULT_PRESENCE);
  await replyWithPresence(interaction, "La présence par défaut a été restaurée.", presence);
}

module.exports = {
  ACTIVITY_INPUTS,
  ACTIVITY_LABELS,
  ACTIVITY_TYPES,
  DEFAULT_PRESENCE,
  STATUS_LABELS,
  STATUS_INPUTS,
  applyStoredPresence,
  buildPresencePayload,
  handlePresenceCommand,
  normalizePresence,
  normalizeStreamUrl,
  presenceEmbed,
};
