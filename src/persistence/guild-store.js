const fs = require("node:fs/promises");
const path = require("node:path");
const { newStatistics, normalizeStatistics } = require("../modules/statistics-config");

const configuredStorageDirectory = process.env.BOT_STORAGE_DIRECTORY?.trim();
const dataDirectory = configuredStorageDirectory
  ? path.resolve(configuredStorageDirectory)
  : path.join(__dirname, "..", "..", "storage");
const dataFile = path.join(dataDirectory, "bot-data.json");
const previousDataFile = path.join(dataDirectory, "guilds.json");
const legacyDataFile = configuredStorageDirectory
  ? path.join(dataDirectory, "store.json")
  : path.join(__dirname, "..", "..", "data", "store.json");
let cache;
let writeQueue = Promise.resolve();

function newBotData() {
  return {
    modmailRoutes: {},
    presence: {
      status: "online",
      activityEnabled: true,
      activityType: "playing",
      activityText: null,
      streamUrl: null,
    },
  };
}

function ensureBotShape(value) {
  const defaults = newBotData();
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    ...defaults,
    ...source,
    modmailRoutes: source.modmailRoutes && typeof source.modmailRoutes === "object" && !Array.isArray(source.modmailRoutes)
      ? source.modmailRoutes : {},
    presence: { ...defaults.presence, ...source.presence },
  };
}

function newGuildData() {
  return {
    nextCaseNumber: 1,
    statistics: newStatistics(),
    warnings: [],
    welcome: {
      enabled: false,
      channelId: null,
      goodbyeChannelId: null,
      autoRoleId: null,
      message: "Bienvenue {user} sur **{server}** ! Tu es notre {count}e membre.",
    },
    logs: {
      channelId: null,
      categoryId: null,
      channels: {},
    },
    tickets: {
      categoryId: null,
      staffRoleId: null,
      logChannelId: null,
      nextNumber: 1,
      panelTitle: "Besoin d'aide ?",
      panelDescription: "Choisis le type de demande pour ouvrir un ticket privé avec l'équipe.",
      panelColor: "5865F2",
      confirmationEnabled: true,
      transcriptDmEnabled: true,
      transcriptChannelId: null,
      mentionStaffEnabled: true,
      allowUserClose: true,
      maxOpenTicketsPerUser: 1,
      channelNamePrefix: "ticket",
      ticketOpenMessage: "Décris précisément ta demande. L'équipe te répondra ici.",
      closeMessage: "Ticket fermé et archivé.",
      choices: [],
      panelChannelId: null,
      panelMessageId: null,
      interactionType: "Buttons",
      claimEnabled: false,
      autoClaimEnabled: false,
      claimButtonEnabled: false,
      closeButtonEnabled: true,
      autoDeleteClosed: false,
      entries: {},
      reviews: {},
    },
    antiRaid: {
      enabled: false,
      maxJoins: 8,
      windowSeconds: 20,
      timeoutMinutes: 30,
    },
    suggestions: { channelId: null, discussionThreads: true },
    levels: {
      enabled: false,
      minimumXp: 15,
      maximumXp: 25,
      cooldownSeconds: 60,
      ignoredChannelIds: [],
      roleRewards: {},
      members: {},
    },
    backups: [],
    announcements: [],
    nextAnnouncementId: 1,
    absences: [],
    nextAbsenceId: 1,
    anonymousQuestions: {
      enabled: false,
      channelId: null,
      nextNumber: 1,
      audit: [],
    },
    giveaways: [],
    reminders: [],
    nextReminderId: 1,
    growth: {
      enabled: false,
      targetMembers: 1000,
      configuredAt: null,
      guideChannelId: null,
      guideMessageId: null,
      staffChannelId: null,
      pollChannelId: null,
      eventsChannelId: null,
      generalChannelId: null,
      memberRoleId: null,
      onboardingRoleIds: [],
      inviteSources: {},
      members: {},
      weeklyRuns: {},
      currentEventId: null,
      currentEventWeek: null,
    },
    multiBot: {
      vouches: {
        channelId: null,
        nextId: 1,
        entries: [],
      },
      shop: {
        paymentText: null,
        customerRoleId: null,
        verificationChannelId: null,
        verificationRoleId: null,
      },
      protect: {
        antiGhostPingEnabled: false,
        antiBotEnabled: false,
        allowedBotIds: [],
        voiceTimeEnabled: true,
        voiceTotals: {},
        voiceSessions: {},
      },
      crow: {
        hiddenChannels: {},
        attachmentChannels: {},
        antiEveryoneEnabled: false,
        antiTokenEnabled: true,
        secondaryPrefix: null,
      },
      autoRank: {
        joinRoleId: null,
        mentionRoleId: null,
      },
    },
    customResponses: {},
    blacklist: [],
    access: {
      whitelistEnabled: false,
      whitelistUserIds: [],
      ownerUserIds: [],
    },
    voiceProtection: { locks: {} },
    tempVoice: {
      enabled: false,
      lobbyId: null,
      categoryId: null,
      createdChannelIds: [],
    },
    rules: {
      enabled: false,
      channelId: null,
      messageId: null,
      memberRoleId: null,
      questionChannelId: null,
      title: "Règlement du serveur",
      description: "Lis attentivement le règlement avant de l'accepter.",
      color: "5865F2",
      confirmationEnabled: true,
      buttons: {
        accept: { label: "Accepter le règlement", emoji: "✅" },
        refuse: { label: "Refuser", emoji: "❌" },
        read: { label: "Relire le règlement", emoji: "📖" },
        question: { label: "Poser une question", emoji: "❓" },
      },
      order: ["accept", "refuse", "read", "question"],
    },
    reactionRoles: [],
    security: {
      enabled: false,
      channelId: null,
      staffRoleId: null,
      minimumAccountAgeDays: 7,
    },
    modmail: {
      enabled: false,
      panelChannelId: null,
      panelMessageId: null,
      categoryId: null,
      staffRoleId: null,
      transcriptChannelId: null,
      claimEnabled: true,
      inactivityHours: 0,
      blockedUserIds: [],
      options: [],
      threads: [],
    },
  };
}

function ensureGuildShape(value) {
  const defaults = newGuildData();
  return {
    ...defaults,
    ...value,
    welcome: { ...defaults.welcome, ...value?.welcome },
    statistics: normalizeStatistics(value?.statistics),
    logs: {
      ...defaults.logs,
      ...value?.logs,
      channels:
        value?.logs?.channels && typeof value.logs.channels === "object"
          ? value.logs.channels
          : {},
    },
    tickets: {
      ...defaults.tickets,
      ...value?.tickets,
      choices: Array.isArray(value?.tickets?.choices) ? value.tickets.choices : [],
      entries: value?.tickets?.entries && typeof value.tickets.entries === "object" && !Array.isArray(value.tickets.entries)
        ? value.tickets.entries : {},
      reviews: value?.tickets?.reviews && typeof value.tickets.reviews === "object" && !Array.isArray(value.tickets.reviews)
        ? value.tickets.reviews : {},
    },
    antiRaid: { ...defaults.antiRaid, ...value?.antiRaid },
    suggestions: { ...defaults.suggestions, ...value?.suggestions },
    levels: {
      ...defaults.levels,
      ...value?.levels,
      ignoredChannelIds: Array.isArray(value?.levels?.ignoredChannelIds)
        ? value.levels.ignoredChannelIds
        : [],
      roleRewards:
        value?.levels?.roleRewards && typeof value.levels.roleRewards === "object" && !Array.isArray(value.levels.roleRewards)
          ? value.levels.roleRewards
          : {},
      members:
        value?.levels?.members && typeof value.levels.members === "object" && !Array.isArray(value.levels.members)
          ? value.levels.members
          : {},
    },
    backups: Array.isArray(value?.backups) ? value.backups : [],
    announcements: Array.isArray(value?.announcements) ? value.announcements : [],
    absences: Array.isArray(value?.absences) ? value.absences : [],
    anonymousQuestions: {
      ...defaults.anonymousQuestions,
      ...value?.anonymousQuestions,
      audit: Array.isArray(value?.anonymousQuestions?.audit)
        ? value.anonymousQuestions.audit
        : [],
    },
    giveaways: Array.isArray(value?.giveaways) ? value.giveaways : [],
    reminders: Array.isArray(value?.reminders) ? value.reminders : [],
    growth: {
      ...defaults.growth,
      ...value?.growth,
      onboardingRoleIds: Array.isArray(value?.growth?.onboardingRoleIds)
        ? value.growth.onboardingRoleIds
        : [],
      inviteSources:
        value?.growth?.inviteSources && typeof value.growth.inviteSources === "object"
          ? value.growth.inviteSources
          : {},
      members:
        value?.growth?.members && typeof value.growth.members === "object"
          ? value.growth.members
          : {},
      weeklyRuns:
        value?.growth?.weeklyRuns && typeof value.growth.weeklyRuns === "object"
          ? value.growth.weeklyRuns
          : {},
    },
    multiBot: {
      ...defaults.multiBot,
      ...value?.multiBot,
      vouches: {
        ...defaults.multiBot.vouches,
        ...value?.multiBot?.vouches,
        entries: Array.isArray(value?.multiBot?.vouches?.entries)
          ? value.multiBot.vouches.entries.slice(-1000)
          : [],
      },
      shop: { ...defaults.multiBot.shop, ...value?.multiBot?.shop },
      protect: {
        ...defaults.multiBot.protect,
        ...value?.multiBot?.protect,
        allowedBotIds: Array.isArray(value?.multiBot?.protect?.allowedBotIds)
          ? [...new Set(value.multiBot.protect.allowedBotIds.filter((id) => /^\d{17,20}$/.test(String(id))))]
          : [],
        voiceTotals:
          value?.multiBot?.protect?.voiceTotals && typeof value.multiBot.protect.voiceTotals === "object"
            ? value.multiBot.protect.voiceTotals
            : {},
        voiceSessions:
          value?.multiBot?.protect?.voiceSessions && typeof value.multiBot.protect.voiceSessions === "object"
            ? value.multiBot.protect.voiceSessions
            : {},
      },
      crow: {
        ...defaults.multiBot.crow,
        ...value?.multiBot?.crow,
        hiddenChannels:
          value?.multiBot?.crow?.hiddenChannels && typeof value.multiBot.crow.hiddenChannels === "object"
            ? value.multiBot.crow.hiddenChannels
            : {},
        attachmentChannels:
          value?.multiBot?.crow?.attachmentChannels && typeof value.multiBot.crow.attachmentChannels === "object"
            ? value.multiBot.crow.attachmentChannels
            : {},
        secondaryPrefix: typeof value?.multiBot?.crow?.secondaryPrefix === "string"
          ? value.multiBot.crow.secondaryPrefix.slice(0, 3)
          : null,
      },
      autoRank: { ...defaults.multiBot.autoRank, ...value?.multiBot?.autoRank },
    },
    customResponses:
      value?.customResponses && typeof value.customResponses === "object"
        ? value.customResponses
        : {},
    blacklist: Array.isArray(value?.blacklist) ? value.blacklist : [],
    access: {
      ...defaults.access,
      ...value?.access,
      whitelistUserIds: Array.isArray(value?.access?.whitelistUserIds)
        ? value.access.whitelistUserIds
        : [],
      ownerUserIds: Array.isArray(value?.access?.ownerUserIds)
        ? value.access.ownerUserIds
        : [],
    },
    voiceProtection: {
      ...defaults.voiceProtection,
      ...value?.voiceProtection,
      locks:
        value?.voiceProtection?.locks && typeof value.voiceProtection.locks === "object"
          ? value.voiceProtection.locks
          : {},
    },
    tempVoice: {
      ...defaults.tempVoice,
      ...value?.tempVoice,
      createdChannelIds: Array.isArray(value?.tempVoice?.createdChannelIds)
        ? value.tempVoice.createdChannelIds
        : [],
    },
    rules: {
      ...defaults.rules,
      ...value?.rules,
      buttons: {
        accept: { ...defaults.rules.buttons.accept, ...value?.rules?.buttons?.accept },
        refuse: { ...defaults.rules.buttons.refuse, ...value?.rules?.buttons?.refuse },
        read: { ...defaults.rules.buttons.read, ...value?.rules?.buttons?.read },
        question: { ...defaults.rules.buttons.question, ...value?.rules?.buttons?.question },
      },
      order: Array.isArray(value?.rules?.order)
        ? value.rules.order
        : defaults.rules.order,
    },
    reactionRoles: Array.isArray(value?.reactionRoles) ? value.reactionRoles : [],
    security: { ...defaults.security, ...value?.security },
    modmail: {
      ...defaults.modmail,
      ...value?.modmail,
      blockedUserIds: Array.isArray(value?.modmail?.blockedUserIds)
        ? value.modmail.blockedUserIds
        : [],
      options: Array.isArray(value?.modmail?.options) ? value.modmail.options : [],
      threads: Array.isArray(value?.modmail?.threads) ? value.modmail.threads : [],
    },
    warnings: Array.isArray(value?.warnings) ? value.warnings : [],
  };
}

async function loadStore() {
  if (cache) {
    return cache;
  }

  await fs.mkdir(dataDirectory, { recursive: true });
  try {
    cache = JSON.parse(await fs.readFile(dataFile, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    try {
      await fs.rename(previousDataFile, dataFile);
      cache = JSON.parse(await fs.readFile(dataFile, "utf8"));
      cache.guilds ||= {};
      await persistStore();
      console.log("Données migrées vers storage/bot-data.json.");
    } catch (previousError) {
      if (previousError.code !== "ENOENT") {
        throw previousError;
      }
      try {
        cache = JSON.parse(await fs.readFile(legacyDataFile, "utf8"));
        cache.guilds ||= {};
        console.log("Anciennes données chargées depuis data/store.json.");
        await persistStore();
      } catch (legacyError) {
        if (legacyError.code !== "ENOENT") {
          throw legacyError;
        }
        cache = { version: 1, updatedAt: null, guilds: {} };
        await persistStore();
      }
    }
  }

  cache.version = 1;
  cache.updatedAt ||= null;
  cache.bot = ensureBotShape(cache.bot);
  cache.guilds ||= {};
  return cache;
}

async function persistStore() {
  cache.version = 1;
  cache.updatedAt = new Date().toISOString();
  const temporaryFile = `${dataFile}.tmp`;
  await fs.writeFile(temporaryFile, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  await fs.rename(temporaryFile, dataFile);
}

async function readGuild(guildId) {
  const store = await loadStore();
  const guild = ensureGuildShape(store.guilds[guildId]);
  return structuredClone(guild);
}

async function mutateGuild(guildId, mutator) {
  let result;
  const operation = writeQueue.catch(() => {}).then(async () => {
    const store = await loadStore();
    const guild = ensureGuildShape(store.guilds[guildId]);
    result = await mutator(guild);
    store.guilds[guildId] = guild;
    await persistStore();
  });
  writeQueue = operation;
  await operation;
  return result;
}

async function readBot() {
  const store = await loadStore();
  return structuredClone(ensureBotShape(store.bot));
}

async function mutateBot(mutator) {
  let result;
  const operation = writeQueue.catch(() => {}).then(async () => {
    const store = await loadStore();
    const bot = ensureBotShape(store.bot);
    result = await mutator(bot);
    store.bot = bot;
    await persistStore();
  });
  writeQueue = operation;
  await operation;
  return result;
}

module.exports = { dataFile, mutateBot, mutateGuild, readBot, readGuild };
