const {
  ApplicationCommandOptionType,
  MessageFlags,
} = require("discord.js");
const { commands } = require("../commands");
const { readGuild } = require("../persistence/guild-store");
const { handleInteraction } = require("./command-router");
const commandByName = new Map(commands.map((command) => [command.name, command]));

const PREFIX_ALIASES = new Map([
  ["ticket-config", { commandName: "tickets", prepend: ["configurer"] }],
  ["setup-ticket", { commandName: "tickets", prepend: ["configurer"] }],
  ["claim", { commandName: "tickets", prepend: ["claim"] }],
  ["unclaim", { commandName: "tickets", prepend: ["unclaim"] }],
  ["add", { commandName: "tickets", prepend: ["ajouter"] }],
  ["remove", { commandName: "tickets", prepend: ["retirer"] }],
  ["rename", { commandName: "tickets", prepend: ["renommer"] }],
  ["close", { commandName: "tickets", prepend: ["fermer"] }],
  ["closeall", { commandName: "tickets", prepend: ["closeall"] }],
  ["stars", { commandName: "tickets", prepend: ["stars"] }],
  ["autoclose", { commandName: "tickets", prepend: ["autoclose"] }],
  ["transcript", { commandName: "tickets", prepend: ["transcript"] }],
  ["addrole", { commandName: "role", prepend: ["ajouter"] }],
  ["ban", { commandName: "bannir" }],
  ["booster", { commandName: "boosters" }],
  ["clear", { commandName: "purger" }],
  ["helpall", { commandName: "help" }],
  ["kick", { commandName: "expulser" }],
  ["lists", { commandName: "listes" }],
  ["lock", { commandName: "verrouiller" }],
  ["move", { commandName: "vocal", prepend: ["deplacer"] }],
  ["mv", { commandName: "vocal", prepend: ["deplacer"] }],
  ["renew", { commandName: "renouveler" }],
  ["say", { commandName: "dire" }],
  ["unban", { commandName: "debannir" }],
  ["unlock", { commandName: "deverrouiller" }],
  ["vc", { commandName: "stats" }],
  ["welcome", { commandName: "accueil", prepend: ["configurer"] }],
  ["payment", { commandName: "boutique", prepend: ["paiement"] }],
  ["setup-customer", { commandName: "boutique", prepend: ["client-configurer"] }],
  ["customer", { commandName: "boutique", prepend: ["client"] }],
  ["setup-verification", { commandName: "boutique", prepend: ["verification-configurer"] }],
  ["verify", { commandName: "boutique", prepend: ["verifier"] }],
  ["setup-suggestion", { commandName: "boutique", prepend: ["suggestion-configurer"] }],
  ["setup-vouch", { commandName: "vouch", prepend: ["configurer"] }],
  ["profile", { commandName: "vouch", prepend: ["profil"] }],
  ["mass-role", { commandName: "crow", prepend: ["massrole"] }],
  ["massiverole", { commandName: "crow", prepend: ["massrole", "ajouter"] }],
  ["unmassiverole", { commandName: "crow", prepend: ["massrole", "retirer"] }],
  ["derank", { commandName: "crow", prepend: ["derank"] }],
  ["hide", { commandName: "crow", prepend: ["masquer"] }],
  ["unhide", { commandName: "crow", prepend: ["afficher"] }],
  ["alladmins", { commandName: "crow", prepend: ["listes", "admins"] }],
  ["allbot", { commandName: "crow", prepend: ["listes", "bots"] }],
  ["allbots", { commandName: "crow", prepend: ["listes", "bots"] }],
  ["botadmins", { commandName: "crow", prepend: ["listes", "bots-admin"] }],
  ["rolemembers", { commandName: "crow", prepend: ["listes", "role"] }],
  ["channel", { commandName: "crow", prepend: ["saloninfo"] }],
  ["emoji", { commandName: "crow", prepend: ["emoji"] }],
  ["voctime", { commandName: "protect", prepend: ["voctime"] }],
  ["voctimelist", { commandName: "protect", prepend: ["voicetop"] }],
  ["vocalreset", { commandName: "protect", prepend: ["vocalreset"] }],
  ["antibot", { commandName: "protect", prepend: ["antibot"] }],
  ["antighostping", { commandName: "protect", prepend: ["antighostping"] }],
  ["autorole", { commandName: "autorank", prepend: ["configurer"] }],
  ["joinvoc", { commandName: "join", prepend: ["voc"] }],
  ["play", { commandName: "presence", prepend: ["activite", "jouer"] }],
  ["stream", { commandName: "presence", prepend: ["activite", "stream"] }],
  ["listen", { commandName: "presence", prepend: ["activite", "ecouter"] }],
  ["watch", { commandName: "presence", prepend: ["activite", "regarder"] }],
  ["online", { commandName: "presence", prepend: ["statut", "en_ligne"] }],
  ["idle", { commandName: "presence", prepend: ["statut", "inactif"] }],
  ["dnd", { commandName: "presence", prepend: ["statut", "ne_pas_deranger"] }],
  ["invisible", { commandName: "presence", prepend: ["statut", "invisible"] }],
  ["warn", { commandName: "avertir" }],
  ["warnlist", { commandName: "avertissements" }],
  ["8ball", { commandName: "huitball" }],
  ["mixname", { commandName: "protect", prepend: ["mixnom"] }],
  ["qi", { commandName: "protect", prepend: ["qi"] }],
  ["pendu", { commandName: "protect", prepend: ["pendu"] }],
  ["invite", { commandName: "protect", prepend: ["invitation"] }],
  ["invitebot", { commandName: "protect", prepend: ["invitation"] }],
  ["level_add_xp", { commandName: "protect", prepend: ["xp-ajouter"] }],
  ["level-reset", { commandName: "protect", prepend: ["xp-reset"] }],
  ["level_reset", { commandName: "protect", prepend: ["xp-reset"] }],
  ["warnclear", { commandName: "protect", prepend: ["warns-effacer"] }],
  ["clearblacklist", { commandName: "protect", prepend: ["acces-effacer", "blacklist"] }],
  ["clearwl", { commandName: "protect", prepend: ["acces-effacer", "whitelist"] }],
  ["clearowner", { commandName: "protect", prepend: ["acces-effacer", "owners"] }],
  ["antimassmention", { commandName: "protect", prepend: ["antimentions"] }],
  ["antijoins", { commandName: "protect", prepend: ["antiraid"] }],
  ["banlist", { commandName: "crow", prepend: ["bans"] }],
  ["mutelist", { commandName: "crow", prepend: ["timeouts"] }],
  ["antieveryone", { commandName: "crow", prepend: ["anti-everyone"] }],
  ["antitoken", { commandName: "crow", prepend: ["anti-token"] }],
  ["antiphoto", { commandName: "crow", prepend: ["fichiers"] }],
  ["prefix", { commandName: "crow", prepend: ["prefix"] }],
  ["secur", { commandName: "crow", prepend: ["securite"] }],
  ["roleall", { commandName: "crow", prepend: ["massrole", "ajouter"] }],
  ["rolleall", { commandName: "crow", prepend: ["massrole", "ajouter"] }],
  ["setup_logs", { commandName: "logs", prepend: ["setup"] }],
  ["level", { commandName: "profil" }],
  ["level_top", { commandName: "classement" }],
  ["level_setup", { commandName: "levels", prepend: ["configurer"] }],
  ["list_blacklist", { commandName: "blacklist", prepend: ["liste"] }],
  ["list_wl", { commandName: "whitelist", prepend: ["liste"] }],
  ["list_owner", { commandName: "owners", prepend: ["liste"] }],
  ["wl", { commandName: "whitelist", prepend: ["ajouter"] }],
  ["unwl", { commandName: "whitelist", prepend: ["retirer"] }],
  ["unwhitelist", { commandName: "whitelist", prepend: ["retirer"] }],
  ["setowner", { commandName: "owners", prepend: ["ajouter"] }],
  ["owner", { commandName: "owners", prepend: ["ajouter"] }],
  ["removeowner", { commandName: "owners", prepend: ["retirer"] }],
  ["unowner", { commandName: "owners", prepend: ["retirer"] }],
  ["unblacklist", { commandName: "blacklist", prepend: ["retirer"] }],
  ["mute", { commandName: "timeout" }],
  ["unmute", { commandName: "untimeout" }],
  ["delrole", { commandName: "role", prepend: ["retirer"] }],
  ["cleanup", { commandName: "purger" }],
  ["serveur", { commandName: "serverinfo" }],
  ["server", { commandName: "serverinfo" }],
  ["sanctions", { commandName: "avertissements" }],
  ["rolemenu", { commandName: "role-bouton" }],
  ["antispam", { commandName: "automod", prepend: ["all"] }],
  ["voiceallkick", { commandName: "crow", prepend: ["vocal", "deconnecter"] }],
  ["voiceallmoov", { commandName: "crow", prepend: ["vocal", "deplacer"] }],
  ["voicemove", { commandName: "crow", prepend: ["vocal", "deplacer"] }],
  ["voicecasque", { commandName: "crow", prepend: ["vocal", "deaf"] }],
]);

function configuredPrefix() {
  return process.env.BOT_PREFIX?.trim() || "+";
}

function prefixCommandNames() {
  return [...commandByName.keys()];
}

function tokenizeArguments(input) {
  const tokens = [];
  let current = "";
  let quote = null;
  let escaped = false;

  for (const character of input) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) {
        quote = null;
      } else {
        current += character;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += character;
  }
  if (escaped) {
    current += "\\";
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

function optionUsage(option) {
  const value = option.required ? `<${option.name}>` : `[${option.name}]`;
  return option.type === ApplicationCommandOptionType.String ? `"${value}"` : value;
}

function commandUsage(command, prefix = configuredPrefix()) {
  const subcommands = (command.options || []).filter(
    (option) => option.type === ApplicationCommandOptionType.Subcommand,
  );
  if (subcommands.length > 0) {
    return subcommands
      .map(
        (subcommand) =>
          `${prefix}${command.name} ${subcommand.name}${(subcommand.options || [])
            .map((option) => ` ${optionUsage(option)}`)
            .join("")}`,
      )
      .join("\n");
  }
  return `${prefix}${command.name}${(command.options || [])
    .map((option) => ` ${optionUsage(option)}`)
    .join("")}`;
}

function extractId(value) {
  return value?.match(/\d{17,20}/)?.[0] || null;
}

function parseBoolean(value) {
  const normalized = value?.toLowerCase();
  if (["true", "1", "oui", "on", "activer", "active"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "non", "off", "desactiver", "desactive"].includes(normalized)) {
    return false;
  }
  return null;
}

function separateNamedArguments(tokens, optionDefinitions) {
  const optionNames = new Set(optionDefinitions.map((option) => option.name));
  const named = new Map();
  const positional = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const equals = token.match(/^--?([\w-]+)=(.*)$/) || token.match(/^([\w-]+)=(.*)$/);
    if (equals && optionNames.has(equals[1])) {
      named.set(equals[1], equals[2]);
      continue;
    }

    const flag = token.match(/^--?([\w-]+)$/);
    if (flag && optionNames.has(flag[1]) && index + 1 < tokens.length) {
      named.set(flag[1], tokens[index + 1]);
      index += 1;
      continue;
    }
    positional.push(token);
  }

  return { named, positional };
}

async function resolveOption(message, option, rawValue) {
  if (rawValue === undefined) {
    return null;
  }

  if (option.type === ApplicationCommandOptionType.String) {
    if (option.choices?.length && !option.choices.some((choice) => choice.value === rawValue)) {
      throw new Error(
        `\`${option.name}\` doit être l'une de ces valeurs : ${option.choices.map((choice) => choice.value).join(", ")}.`,
      );
    }
    if (option.min_length && rawValue.length < option.min_length) {
      throw new Error(`\`${option.name}\` doit contenir au moins ${option.min_length} caractère(s).`);
    }
    if (option.max_length && rawValue.length > option.max_length) {
      throw new Error(`\`${option.name}\` ne peut pas dépasser ${option.max_length} caractères.`);
    }
    return rawValue;
  }

  if (option.type === ApplicationCommandOptionType.Integer) {
    const value = Number(rawValue);
    if (!Number.isInteger(value)) {
      throw new Error(`\`${option.name}\` doit être un nombre entier.`);
    }
    if (option.min_value !== undefined && value < option.min_value) {
      throw new Error(`\`${option.name}\` doit être au minimum ${option.min_value}.`);
    }
    if (option.max_value !== undefined && value > option.max_value) {
      throw new Error(`\`${option.name}\` doit être au maximum ${option.max_value}.`);
    }
    return value;
  }

  if (option.type === ApplicationCommandOptionType.Boolean) {
    const value = parseBoolean(rawValue);
    if (value === null) {
      throw new Error(`\`${option.name}\` doit valoir oui/non ou true/false.`);
    }
    return value;
  }

  const id = extractId(rawValue);
  if (!id) {
    throw new Error(`\`${option.name}\` doit être une mention ou un identifiant Discord.`);
  }

  if (option.type === ApplicationCommandOptionType.User) {
    return message.client.users.fetch(id).catch(() => null);
  }
  if (option.type === ApplicationCommandOptionType.Channel) {
    return message.guild.channels.fetch(id).catch(() => null);
  }
  if (option.type === ApplicationCommandOptionType.Role) {
    return message.guild.roles.fetch(id).catch(() => null);
  }
  return null;
}

async function parsePrefixCommand(message, content, prefix = configuredPrefix()) {
  const tokens = tokenizeArguments(content.slice(prefix.length).trim());
  const requestedName = tokens.shift()?.toLowerCase();
  if (!requestedName) {
    return null;
  }

  // Preserve the timed reminder while accepting the ticket shorthand.
  const ticketReminder = requestedName === "rappel" && (
    (tokens.length === 0 && /^ticket-(owner|closed):\d{17,20}(?::[a-z0-9-]+)?$/.test(message.channel?.topic || "")) ||
    (tokens.length === 1 && /^(?:<#\d{17,20}>|\d{17,20})$/.test(tokens[0]))
  );
  const alias = ticketReminder
    ? { commandName: "tickets", prepend: ["rappel"] }
    : PREFIX_ALIASES.get(requestedName);
  const commandName = alias?.commandName || requestedName;
  if (alias?.prepend?.length) {
    tokens.unshift(...alias.prepend);
  }
  // Keep the old +join <server ID> syntax alongside +join voc and +join serveur.
  if (commandName === "join" && (/^\d{17,20}$/.test(tokens[0] || "") || /^(?:--?)?serveur_id(?:=|$)/.test(tokens[0] || ""))) {
    tokens.unshift("serveur");
  }

  const command = commandByName.get(commandName);
  if (!command) {
    return { error: `Commande inconnue. Utilise \`${prefix}help\`.` };
  }

  const subcommands = (command.options || []).filter(
    (option) => option.type === ApplicationCommandOptionType.Subcommand,
  );
  let subcommand = null;
  let optionDefinitions = command.options || [];
  if (subcommands.length > 0) {
    const subcommandName = tokens.shift()?.toLowerCase() || (["tickets", "statistiques"].includes(commandName) ? "configurer" : null);
    subcommand = subcommands.find((item) => item.name === subcommandName);
    if (!subcommand) {
      return { error: `Sous-commande manquante ou inconnue.\n\`${commandUsage(command, prefix)}\`` };
    }
    optionDefinitions = subcommand.options || [];
  }

  // Keep the former +annonce programmer <salon> <texte> <minutes> order working
  // after moving the required delay before the optional modal prefill.
  if (
    commandName === "annonce" &&
    subcommand?.name === "programmer" &&
    !tokens.some((token) => /^(?:--?)?(?:minutes|texte)(?:=|$)/.test(token)) &&
    tokens.length >= 3 &&
    !/^\d+$/.test(tokens[1]) &&
    /^\d+$/.test(tokens[2])
  ) {
    [tokens[1], tokens[2]] = [tokens[2], tokens[1]];
  }

  // Preserve the old +vocalreset <member> oui order while Discord requires
  // required slash options to be declared before optional options.
  if (
    commandName === "protect" &&
    subcommand?.name === "vocalreset" &&
    /^(?:<@!?\d{17,20}>|\d{17,20})$/.test(tokens[0] || "") &&
    parseBoolean(tokens[1]) !== null
  ) {
    [tokens[0], tokens[1]] = [tokens[1], tokens[0]];
  }

  const { named, positional } = separateNamedArguments(tokens, optionDefinitions);
  const values = new Map();
  let position = 0;

  for (let index = 0; index < optionDefinitions.length; index += 1) {
    const option = optionDefinitions[index];
    let rawValue = named.get(option.name);
    if (rawValue === undefined && position < positional.length) {
      const isLastOption = index === optionDefinitions.length - 1;
      rawValue =
        isLastOption && option.type === ApplicationCommandOptionType.String
          ? positional.slice(position).join(" ")
          : positional[position];
      position = isLastOption ? positional.length : position + 1;
    }

    if (rawValue === undefined && option.required) {
      return { error: `Option requise manquante : \`${option.name}\`.\n\`${commandUsage(command, prefix)}\`` };
    }

    try {
      const value = await resolveOption(message, option, rawValue);
      if (rawValue !== undefined && value === null) {
        return { error: `Impossible de trouver la valeur de \`${option.name}\`.` };
      }
      values.set(option.name, value);
    } catch (error) {
      return { error: `${error.message}\n\`${commandUsage(command, prefix)}\`` };
    }
  }

  if (position < positional.length) {
    return { error: `Trop d'arguments.\n\`${commandUsage(command, prefix)}\`` };
  }

  return { command, commandName, subcommand: subcommand?.name || null, values };
}

function cleanReplyPayload(payload) {
  if (typeof payload === "string") {
    return { content: payload };
  }
  const clean = { ...payload };
  if (clean.flags === MessageFlags.Ephemeral || clean.flags !== undefined) {
    delete clean.flags;
  }
  return clean;
}

function createPrefixInteraction(message, parsed) {
  const sendReply = (payload) =>
    message.deleted
      ? message.channel.send({ ...payload, allowedMentions: payload.allowedMentions || { parse: [] } })
      : message.reply(payload);
  const interaction = {
    commandName: parsed.commandName,
    guild: message.guild,
    guildId: message.guildId,
    channel: message.channel,
    channelId: message.channelId,
    client: message.client,
    user: message.author,
    member: message.member,
    memberPermissions: message.member.permissions,
    createdTimestamp: message.createdTimestamp,
    isPrefixCommand: true,
    deferred: false,
    replied: false,
    _replyMessage: null,
    options: {
      getSubcommand(required = true) {
        if (!parsed.subcommand && required) {
          throw new Error("Sous-commande manquante.");
        }
        return parsed.subcommand;
      },
      getString: (name, required = false) => getOption(parsed.values, name, required),
      getInteger: (name, required = false) => getOption(parsed.values, name, required),
      getBoolean: (name, required = false) => getOption(parsed.values, name, required),
      getUser: (name, required = false) => getOption(parsed.values, name, required),
      getChannel: (name, required = false) => getOption(parsed.values, name, required),
      getRole: (name, required = false) => getOption(parsed.values, name, required),
    },
    inGuild: () => true,
    isButton: () => false,
    isChatInputCommand: () => true,
    isStringSelectMenu: () => false,
    async deferReply() {
      this.deferred = true;
    },
    async reply(payload) {
      this._replyMessage = await sendReply(cleanReplyPayload(payload));
      this.replied = true;
      return this._replyMessage;
    },
    async editReply(payload) {
      const clean = cleanReplyPayload(payload);
      if (this._replyMessage) {
        this._replyMessage = await this._replyMessage.edit(clean);
      } else {
        this._replyMessage = await sendReply(clean);
      }
      this.replied = true;
      return this._replyMessage;
    },
    async fetchReply() {
      return this._replyMessage;
    },
  };
  return interaction;
}

function getOption(values, name, required) {
  const value = values.get(name);
  if ((value === null || value === undefined) && required) {
    throw new Error(`Option requise manquante : ${name}`);
  }
  return value ?? null;
}

async function handlePrefixMessage(message) {
  if (message.author.bot || !message.guild) {
    return false;
  }
  const permanentPrefix = "+";
  const environmentPrefix = configuredPrefix();
  let prefix = message.content.startsWith(permanentPrefix)
    ? permanentPrefix
    : environmentPrefix !== permanentPrefix && message.content.startsWith(environmentPrefix)
      ? environmentPrefix
      : null;
  if (!prefix && /^[!#$%&*?.~-]/.test(message.content)) {
    const data = await readGuild(message.guildId);
    const secondary = data.multiBot.crow.secondaryPrefix;
    if (secondary && message.content.startsWith(secondary)) prefix = secondary;
  }
  if (!prefix) return false;

  const parsed = await parsePrefixCommand(message, message.content, prefix);
  if (!parsed) {
    return false;
  }
  if (parsed.error) {
    const payload = { content: parsed.error, allowedMentions: { repliedUser: false, parse: [] } };
    if (message.deleted) await message.channel.send(payload);
    else await message.reply(payload);
    return true;
  }

  if (
    parsed.command.default_member_permissions &&
    !message.member.permissions.has(BigInt(parsed.command.default_member_permissions))
  ) {
    await message.reply({
      content: "Tu n'as pas la permission nécessaire pour cette commande.",
      allowedMentions: { repliedUser: false },
    });
    return true;
  }

  const interaction = createPrefixInteraction(message, parsed);
  try {
    await handleInteraction(interaction);
  } catch (error) {
    console.error(`Erreur avec ${prefix}${parsed.commandName} :`, error);
    const content = "Une erreur est survenue. Vérifie les arguments et les permissions du bot.";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(content).catch(() => {});
    } else {
      await interaction.reply(content).catch(() => {});
    }
  }
  return true;
}

module.exports = {
  PREFIX_ALIASES,
  commandUsage,
  configuredPrefix,
  createPrefixInteraction,
  handlePrefixMessage,
  parseBoolean,
  parsePrefixCommand,
  prefixCommandNames,
  tokenizeArguments,
};
