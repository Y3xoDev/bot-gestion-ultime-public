require("dotenv").config();

const {
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
} = require("discord.js");
const { commands } = require("./commands");
const { handleInteraction } = require("./interactions/command-router");
const { handlePrefixMessage } = require("./interactions/prefix-router");
const {
  handleMemberJoin,
  handleMemberRemove,
  handleMessageDelete,
  handleMessageUpdate,
  handleChannelCreate,
  handleChannelDelete,
  handleChannelUpdate,
  handleGuildBan,
  handleGuildMemberUpdate,
  handleRoleCreate,
  handleRoleDelete,
  handleRoleUpdate,
  handleVoiceStateLog,
  sendLog,
} = require("./modules/server-events");
const {
  handleTempVoiceState,
  restoreScheduledTasks,
} = require("./modules/community-tools");
const {
  handleModmailMessage,
  startModmailMaintenance,
} = require("./modules/modmail");
const { ensureModmailPanel } = require("./modules/modmail-routing");
const { handleTicketMessage, startTicketMaintenance } = require("./modules/ticket-runtime");
const { enforceVoiceProtection } = require("./modules/voice-guard");
const { handleReactionRole } = require("./modules/interactive-panels");
const {
  handleSecurityMemberJoin,
  handleSecurityMessage,
} = require("./modules/security");
const {
  refreshManagedAntiLinkRule,
  rememberDeletedMessage,
} = require("./modules/legacy-features");
const { handleStatisticsVoiceState, startStatisticsMaintenance } = require("./modules/statistics");
const {
  handleLevelMessage,
  restoreAdvancedTasks,
} = require("./modules/advanced-features");
const {
  DEFAULT_PRESENCE,
  applyStoredPresence,
  buildPresencePayload,
} = require("./modules/bot-presence");
const {
  handleGrowthMemberJoin,
  handleGrowthMemberRemove,
  handleGrowthMemberUpdate,
  handleGrowthMessage,
  handleGrowthVoiceState,
  startGrowthMaintenance,
  stopGrowthMaintenance,
} = require("./modules/growth");
const {
  handleMultiBotMemberJoin,
  handleMultiBotMessage,
  handleMultiBotMessageDelete,
  handleMultiBotVoiceState,
  startMultiBotRuntime,
} = require("./modules/multi-bot-features");

const token = process.env.BOT_TOKEN?.trim();
const guildId = process.env.GUILD_ID?.trim();
const privilegedGatewayIntents =
  process.env.BOT_PRIVILEGED_INTENTS?.trim().toLowerCase() !== "false";

if (!token || !guildId) {
  console.error(
    "BOT_TOKEN ou GUILD_ID absent. Copie .env.example vers .env puis complète les valeurs.",
  );
  process.exit(1);
}

const intents = [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.AutoModerationConfiguration,
    GatewayIntentBits.AutoModerationExecution,
];
if (privilegedGatewayIntents) {
  intents.push(GatewayIntentBits.GuildMembers, GatewayIntentBits.MessageContent);
  if (process.env.BOT_PRESENCE_INTENT?.trim().toLowerCase() === "true") {
    intents.push(GatewayIntentBits.GuildPresences);
  }
} else {
  console.warn(
    "Mode sans intents privilégiés : les commandes +, l'accueil, l'anti-raid des arrivées et l'analyse des messages sont temporairement limités.",
  );
}

const client = new Client({
  intents,
  partials: [
    Partials.Channel,
    Partials.GuildMember,
    Partials.Message,
    Partials.Reaction,
    Partials.User,
  ],
});

client.once(Events.ClientReady, async (readyClient) => {
  startTicketMaintenance(readyClient);
  startStatisticsMaintenance(readyClient);
  console.log(`Connecté en tant que ${readyClient.user.tag}`);
  console.log("Édition publique sans hébergement de bots.");

  try {
    await applyStoredPresence(readyClient);
  } catch (error) {
    console.error("Impossible de restaurer la présence personnalisée :", error.message);
    readyClient.user.setPresence(buildPresencePayload(DEFAULT_PRESENCE));
  }

  // Discord attribue automatiquement le badge « Application Commands » aux
  // applications qui possèdent une commande globale. Les commandes de serveur
  // restent synchronisées ci-dessous afin que leurs modifications soient immédiates.
  try {
    const globalCommands = await readyClient.application.commands.fetch();
    const helpDefinition = commands.find((command) => command.name === "help");
    const existingHelp = globalCommands.find((command) => command.name === "help");
    if (existingHelp) await existingHelp.edit(helpDefinition);
    else await readyClient.application.commands.create(helpDefinition);
    console.log("Commande /help globale prête pour le badge Application Commands.");
  } catch (error) {
    console.error("Impossible d'enregistrer /help globalement :", error.message);
  }

  // A missing primary guild must not prevent other guilds from receiving commands or ModMail.
  await Promise.allSettled([...readyClient.guilds.cache.values()].map(async (guild) => {
    try {
      const migration = await refreshManagedAntiLinkRule(guild);
      if (migration?.status === "migrée") {
        console.log(`Anti-invitations migré sur ${guild.name} : les autres URL sont autorisées.`);
      }
    } catch (error) {
      console.error(`Impossible de migrer l'anti-invitations sur ${guild.name} :`, error.message);
    }
    try {
      await guild.commands.set(commands);
      console.log(`${commands.length} commandes enregistrées sur ${guild.name}.`);
    } catch (error) {
      console.error(`Impossible de synchroniser ${guild.name} :`, error.message);
    }
    startModmailMaintenance(readyClient, guild.id);
    try {
      const panel = await ensureModmailPanel(guild);
      if (panel) console.log(`Panel ModMail prêt sur ${guild.name} dans #${panel.channel.name}.`);
    } catch (error) {
      console.error(`Panel ModMail indisponible sur ${guild.name} :`, error.message);
    }
  }));
  await restoreScheduledTasks(readyClient).catch((error) =>
    console.error("Impossible de restaurer les tâches programmées :", error.message),
  );
  await restoreAdvancedTasks(readyClient).catch((error) =>
    console.error("Impossible de restaurer les annonces programmées :", error.message),
  );
  await startGrowthMaintenance(readyClient).catch((error) =>
    console.error("Impossible de restaurer le programme de croissance :", error.message),
  );
  await startMultiBotRuntime(readyClient).catch((error) =>
    console.error("Impossible de restaurer les modules spécialisés :", error.message),
  );
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (
    !interaction.isChatInputCommand() &&
    !interaction.isButton() &&
    !interaction.isStringSelectMenu() &&
    !interaction.isChannelSelectMenu() &&
    !interaction.isRoleSelectMenu() &&
    !interaction.isModalSubmit()
  ) {
    return;
  }

  try {
    await handleInteraction(interaction);
  } catch (error) {
    console.error(
      `Erreur avec ${interaction.isChatInputCommand() ? `/${interaction.commandName}` : interaction.customId} :`,
      error,
    );

    const message = "Une erreur est survenue. Vérifie les permissions du bot puis réessaie.";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: message }).catch(() => {});
    } else {
      await interaction
        .reply({ content: message, flags: MessageFlags.Ephemeral })
        .catch(() => {});
    }
  }
});

client.on(Events.AutoModerationActionExecution, (execution) => {
  console.log(
    `[AutoMod] règle=${execution.ruleId} membre=${execution.userId} salon=${execution.channelId || "inconnu"}`,
  );
  const guild = client.guilds.cache.get(execution.guildId);
  if (guild) {
    void sendLog(
      guild,
      "automod",
      new EmbedBuilder()
        .setColor(0xed4245)
        .setTitle("Action AutoMod exécutée")
        .addFields(
          { name: "Membre", value: `<@${execution.userId}>`, inline: true },
          {
            name: "Salon",
            value: execution.channelId ? `<#${execution.channelId}>` : "Inconnu",
            inline: true,
          },
          { name: "Règle", value: execution.ruleId },
        )
        .setTimestamp(),
    );
  }
});

client.on(Events.GuildMemberAdd, (member) => {
  void (async () => {
    const blocked = await handleMultiBotMemberJoin(member);
    if (!blocked) await Promise.all([handleMemberJoin(member), handleSecurityMemberJoin(member), handleGrowthMemberJoin(member)]);
  })().catch((error) => console.error("Erreur lors de l'arrivée d'un membre :", error));
});

client.on(Events.GuildMemberRemove, (member) => {
  void Promise.all([handleMemberRemove(member), handleGrowthMemberRemove(member)]).catch((error) =>
    console.error("Erreur lors du départ d'un membre :", error),
  );
});

client.on(Events.MessageDelete, (message) => {
  rememberDeletedMessage(message);
  void handleMultiBotMessageDelete(message).catch((error) =>
    console.error("Erreur de détection des ghost-pings :", error),
  );
  void handleMessageDelete(message).catch((error) =>
    console.error("Erreur de journalisation d'un message supprimé :", error),
  );
});

client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
  void handleMessageUpdate(oldMessage, newMessage).catch((error) =>
    console.error("Erreur de journalisation d'un message modifié :", error),
  );
});

client.on(Events.GuildCreate, async (guild) => {
  startModmailMaintenance(client, guild.id);
  try {
    await guild.commands.set(commands);
    await ensureModmailPanel(guild);
    console.log(`${commands.length} commandes enregistrées sur le nouveau serveur ${guild.name}.`);
  } catch (error) {
    console.error(
      `Impossible d'enregistrer les commandes sur le nouveau serveur ${guild.name} :`,
      error.message,
    );
  }
});

client.on(Events.MessageCreate, (message) => {
  void (async () => {
    await handleGrowthMessage(message);
    const multiBotHandled = await handleMultiBotMessage(message);
    const handled = multiBotHandled || await handlePrefixMessage(message);
    if (!handled) {
      await Promise.all([
        handleModmailMessage(client, message),
        handleSecurityMessage(message),
        handleTicketMessage(message),
        handleLevelMessage(message),
      ]);
    }
  })().catch((error) => console.error("Erreur de commande préfixée ou modmail :", error));
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  handleStatisticsVoiceState(oldState, newState);
  void handleTempVoiceState(oldState, newState).catch((error) =>
    console.error("Erreur de salon vocal temporaire :", error),
  );
  void enforceVoiceProtection(oldState, newState).catch((error) =>
    console.error("Erreur de protection vocale :", error),
  );
  void handleVoiceStateLog(oldState, newState).catch((error) =>
    console.error("Erreur de journalisation vocale :", error),
  );
  void handleGrowthVoiceState(oldState, newState).catch((error) =>
    console.error("Erreur de suivi d'activité vocale :", error),
  );
  void handleMultiBotVoiceState(oldState, newState).catch((error) =>
    console.error("Erreur du suivi vocal avancé :", error),
  );
});

client.on(Events.GuildBanAdd, (ban) => {
  void handleGuildBan(ban, true).catch((error) => console.error("Erreur de log de bannissement :", error));
});

client.on(Events.GuildBanRemove, (ban) => {
  void handleGuildBan(ban, false).catch((error) => console.error("Erreur de log de débannissement :", error));
});

client.on(Events.GuildRoleCreate, (role) => {
  void handleRoleCreate(role).catch((error) => console.error("Erreur de log de rôle :", error));
});

client.on(Events.GuildRoleDelete, (role) => {
  void handleRoleDelete(role).catch((error) => console.error("Erreur de log de rôle :", error));
});

client.on(Events.GuildRoleUpdate, (oldRole, newRole) => {
  void handleRoleUpdate(oldRole, newRole).catch((error) => console.error("Erreur de log de rôle :", error));
});

client.on(Events.ChannelCreate, (channel) => {
  void handleChannelCreate(channel).catch((error) => console.error("Erreur de log de salon :", error));
});

client.on(Events.ChannelDelete, (channel) => {
  void handleChannelDelete(channel).catch((error) => console.error("Erreur de log de salon :", error));
});

client.on(Events.ChannelUpdate, (oldChannel, newChannel) => {
  void handleChannelUpdate(oldChannel, newChannel).catch((error) => console.error("Erreur de log de salon :", error));
});

client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
  void handleGuildMemberUpdate(oldMember, newMember).catch((error) => console.error("Erreur de log de membre :", error));
  void handleGrowthMemberUpdate(oldMember, newMember).catch((error) => console.error("Erreur de suivi d'Onboarding :", error));
});

client.on(Events.MessageReactionAdd, (reaction, user) => {
  void handleReactionRole(reaction, user, true).catch((error) => console.error("Erreur de reaction role :", error));
});

client.on(Events.MessageReactionRemove, (reaction, user) => {
  void handleReactionRole(reaction, user, false).catch((error) => console.error("Erreur de reaction role :", error));
});

client.on(Events.Error, (error) => {
  console.error("Erreur Discord :", error.message);
});

client.login(token).catch((error) => {
  console.error("Connexion impossible. Vérifie BOT_TOKEN :", error.message);
  process.exit(1);
});

function shutdown(signal) {
  console.log(`${signal} reçu, arrêt du bot…`);
  stopGrowthMaintenance();
  require("./modules/bot-voice").destroyBotVoiceConnections(client);
  client.destroy();
  process.exit(0);
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
