const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  GuildFeature,
  GuildOnboardingPromptType,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  GuildVerificationLevel,
  MessageFlags,
  PollLayoutType,
} = require("discord.js");
const { mutateGuild, readGuild } = require("../persistence/guild-store");

const TIME_ZONE = "Europe/Paris";
const GROWTH_DESCRIPTION =
  "Communauté gaming francophone : événements chaque semaine, vocaux chill et créateurs à découvrir.";
const MANAGED_ONBOARDING_TITLES = new Set([
  "À quels jeux joues-tu ?",
  "Quels contenus veux-tu suivre ?",
  "Créateur ou artiste ?",
]);
const INVITE_SOURCE_LABELS = {
  tiktok: "TikTok",
  youtube: "YouTube Shorts",
  partenaires: "Partenariats Discord",
  createurs: "Créateurs partenaires",
};
const inviteUseCache = new Map();
const activityThrottle = new Map();
let maintenanceTimer = null;

function normalizeName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findNamed(items, wanted, predicate = () => true) {
  const target = normalizeName(wanted);
  const candidates = [...items.values()].filter(predicate);
  return (
    candidates.find((item) => normalizeName(item.name) === target) ||
    candidates.find((item) => normalizeName(item.name).endsWith(` ${target}`)) ||
    candidates.find((item) => normalizeName(item.name).includes(target)) ||
    null
  );
}

function textChannel(guild, name) {
  return findNamed(
    guild.channels.cache,
    name,
    (channel) =>
      [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type) &&
      !normalizeName(channel.name).startsWith("logs "),
  );
}

function voiceChannel(guild, name) {
  return findNamed(
    guild.channels.cache,
    name,
    (channel) => [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type),
  );
}

function guildRole(guild, name) {
  return findNamed(guild.roles.cache, name, (role) => !role.managed && role.id !== guild.id);
}

function serializeOnboarding(onboarding) {
  return {
    prompts: [...onboarding.prompts.values()].map((prompt) => ({
      id: prompt.id,
      title: prompt.title,
      singleSelect: prompt.singleSelect,
      required: prompt.required,
      inOnboarding: prompt.inOnboarding,
      type: prompt.type,
      options: [...prompt.options.values()].map((option) => ({
        id: option.id,
        title: option.title,
        description: option.description,
        emoji: option.emoji,
        channels: [...option.channels.values()].filter(Boolean).map((channel) => channel.id),
        roles: [...option.roles.values()].filter(Boolean).map((role) => role.id),
      })),
    })),
    defaultChannels: [...onboarding.defaultChannels.values()]
      .filter(Boolean)
      .map((channel) => channel.id),
    mode: onboarding.mode,
  };
}

function option(title, emoji, role, channel) {
  return {
    title,
    description: null,
    emoji,
    roles: role ? [role.id] : [],
    channels: channel ? [channel.id] : [],
  };
}

function onboardingPrompt(title, options) {
  return {
    title,
    singleSelect: false,
    required: false,
    inOnboarding: true,
    type: GuildOnboardingPromptType.MultipleChoice,
    options: options.filter((entry) => entry.roles.length || entry.channels.length),
  };
}

function resolveGrowthResources(guild) {
  const channels = {
    announcements: textChannel(guild, "annonces"),
    rules: textChannel(guild, "reglement"),
    welcome: textChannel(guild, "bienvenue"),
    roles: textChannel(guild, "roles"),
    polls: textChannel(guild, "sondages"),
    general: textChannel(guild, "general"),
    memes: textChannel(guild, "memes"),
    photos: textChannel(guild, "photos"),
    creations: textChannel(guild, "creations"),
    music: textChannel(guild, "musique"),
    discussions: textChannel(guild, "discussions"),
    gaming: textChannel(guild, "gaming"),
    events: textChannel(guild, "evenements"),
    suggestions: textChannel(guild, "suggestions"),
    minecraft: textChannel(guild, "minecraft"),
    fortnite: textChannel(guild, "fortnite"),
    rocketLeague: textChannel(guild, "rocket league"),
    valorant: textChannel(guild, "valorant"),
    otherGames: textChannel(guild, "autres jeux"),
    staff: textChannel(guild, "staff annonces") || textChannel(guild, "staff info"),
    voice: voiceChannel(guild, "vocal general") || voiceChannel(guild, "gaming 1"),
  };
  const roles = {
    member: guildRole(guild, "membre"),
    minecraft: guildRole(guild, "minecraft"),
    fortnite: guildRole(guild, "fortnite"),
    rocketLeague: guildRole(guild, "rocket league"),
    valorant: guildRole(guild, "valorant"),
    otherGames: guildRole(guild, "autres jeux"),
    streamer: guildRole(guild, "streamer"),
    youtube: guildRole(guild, "youtubeur"),
    artist: guildRole(guild, "artiste"),
    musician: guildRole(guild, "musicien"),
  };
  return { channels, roles };
}

function assertGrowthResources(resources) {
  const requiredChannels = ["welcome", "roles", "polls", "general", "gaming", "events", "suggestions", "staff", "voice"];
  const missingChannels = requiredChannels.filter((key) => !resources.channels[key]);
  if (!resources.roles.member) missingChannels.push("rôle Membre");
  if (missingChannels.length) {
    throw new Error(`Configuration impossible, éléments introuvables : ${missingChannels.join(", ")}.`);
  }
}

function guidePayload(guild, resources) {
  const { channels } = resources;
  const link = (channel) => `https://discord.com/channels/${guild.id}/${channel.id}`;
  return {
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🌊 Bienvenue sur Chill Hub")
        .setDescription(
          "**La communauté gaming francophone où il y a toujours un événement, un vocal ou un créateur à découvrir.**\n\n" +
            "Commence avec ces trois actions :\n" +
            `1. Choisis tes jeux et tes centres d'intérêt dans ${channels.roles}.\n` +
            `2. Présente-toi et viens discuter dans ${channels.general}.\n` +
            `3. Consulte le prochain rendez-vous dans ${channels.events}.`,
        )
        .addFields(
          { name: "🎮 Événement hebdomadaire", value: "Vote le lundi, puis rejoins la soirée communautaire du vendredi." },
          { name: "🎥 Créateurs", value: "Partage tes clips, créations et meilleurs moments avec la communauté." },
        )
        .setFooter({ text: "Respect • Bonne ambiance • Fun" }),
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Choisir mes rôles").setEmoji("🎭").setURL(link(channels.roles)),
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Me présenter").setEmoji("💬").setURL(link(channels.general)),
        new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Voir les événements").setEmoji("📅").setURL(link(channels.events)),
      ),
    ],
  };
}

async function ensureGuide(guild, resources, storedMessageId) {
  const channel = resources.channels.welcome;
  let message = storedMessageId
    ? await channel.messages.fetch(storedMessageId).catch(() => null)
    : null;
  const payload = guidePayload(guild, resources);
  if (message) await message.edit(payload);
  else message = await channel.send(payload);
  await message.pin("Guide de croissance Chill Hub").catch(() => {});
  return message;
}

async function ensureSourceInvites(guild, channel, storedSources = {}) {
  const current = await guild.invites.fetch();
  const result = {};
  for (const [key, label] of Object.entries(INVITE_SOURCE_LABELS)) {
    const stored = storedSources[key];
    let invite = stored?.code ? current.get(stored.code) : null;
    if (!invite || invite.maxAge !== 0 || invite.maxUses !== 0) {
      invite = await channel.createInvite({
        maxAge: 0,
        maxUses: 0,
        temporary: false,
        unique: true,
        reason: `Suivi de croissance : ${label}`,
      });
    }
    result[key] = {
      code: invite.code,
      url: invite.url,
      channelId: invite.channelId,
      uses: invite.uses || 0,
      createdAt: stored?.createdAt || new Date().toISOString(),
    };
  }
  inviteUseCache.set(guild.id, new Map(current.map((invite) => [invite.code, invite.uses || 0])));
  for (const entry of Object.values(result)) {
    inviteUseCache.get(guild.id).set(entry.code, entry.uses || 0);
  }
  return result;
}

function parisParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const pseudo = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
  const weekday = (pseudo.getUTCDay() + 6) % 7;
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    weekday,
  };
}

function parisDateToUtc(year, month, day, hour, minute = 0) {
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let guess = desired;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const actual = parisParts(new Date(guess));
    const represented = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    guess += desired - represented;
  }
  return new Date(guess);
}

function weekKey(date = new Date()) {
  const local = parisParts(date);
  const pseudo = new Date(Date.UTC(local.year, local.month - 1, local.day));
  pseudo.setUTCDate(pseudo.getUTCDate() - local.weekday);
  return pseudo.toISOString().slice(0, 10);
}

function nextFridayAt20(date = new Date()) {
  const local = parisParts(date);
  let days = 4 - local.weekday;
  if (days < 0 || (days === 0 && local.hour >= 20)) days += 7;
  const target = new Date(Date.UTC(local.year, local.month - 1, local.day + days));
  return parisDateToUtc(target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate(), 20, 0);
}

async function ensureWeeklyEvent(guild, data, resources, now = new Date()) {
  const currentWeek = weekKey(now);
  if (data.growth.currentEventWeek === currentWeek && data.growth.currentEventId) {
    const existing = await guild.scheduledEvents.fetch(data.growth.currentEventId).catch(() => null);
    if (existing) return existing;
  }
  const start = nextFridayAt20(now);
  const event = await guild.scheduledEvents.create({
    name: "🎮 Soirée gaming communautaire • Chill Hub",
    description: "Le jeu est choisi par le sondage du lundi. Rejoins le vocal pour jouer, discuter et créer les meilleurs clips de la semaine.",
    scheduledStartTime: start,
    scheduledEndTime: new Date(start.getTime() + 2 * 60 * 60_000),
    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
    entityType: GuildScheduledEventEntityType.Voice,
    channel: resources.channels.voice.id,
    reason: "Calendrier de croissance Chill Hub",
  });
  await mutateGuild(guild.id, (stored) => {
    stored.growth.currentEventId = event.id;
    stored.growth.currentEventWeek = currentWeek;
  });
  return event;
}

async function sendWeeklyPoll(guild, resources, event) {
  return resources.channels.polls.send({
    content: event ? `📅 Prochaine soirée : ${event.url}` : undefined,
    poll: {
      question: { text: "À quel jeu veux-tu jouer vendredi soir ?" },
      answers: [
        { text: "Minecraft", emoji: "⛏️" },
        { text: "Fortnite", emoji: "🎯" },
        { text: "Rocket League", emoji: "🚗" },
        { text: "Valorant", emoji: "🔫" },
        { text: "Autre jeu", emoji: "🎮" },
      ],
      allowMultiselect: false,
      duration: 24,
      layoutType: PollLayoutType.Default,
    },
    allowedMentions: { parse: [] },
  });
}

function computeGrowthMetrics(growth, now = Date.now()) {
  const members = Object.values(growth?.members || {}).filter((member) => !member.bot);
  const activeSince = now - 7 * 24 * 60 * 60_000;
  const recentSince = now - 30 * 24 * 60 * 60_000;
  const retentionSince = now - 90 * 24 * 60 * 60_000;
  const active = members.filter((member) => !member.leftAt && new Date(member.lastActivityAt || 0).getTime() >= activeSince);
  const recentJoins = members.filter((member) => new Date(member.joinedAt || 0).getTime() >= recentSince);
  const onboarding = recentJoins.filter((member) => member.onboardingAt);
  const eligibleRetention = members.filter((member) => {
    const joined = new Date(member.joinedAt || 0).getTime();
    return joined >= retentionSince && joined <= now - 7 * 24 * 60 * 60_000;
  });
  const retained = eligibleRetention.filter((member) => {
    const joined = new Date(member.joinedAt || 0).getTime();
    return new Date(member.lastActivityAt || 0).getTime() >= joined + 7 * 24 * 60 * 60_000;
  });
  const bySource = {};
  for (const member of members) {
    const source = member.source || "inconnue";
    bySource[source] = (bySource[source] || 0) + 1;
  }
  return {
    trackedMembers: members.length,
    active7Days: active.length,
    recentJoins: recentJoins.length,
    onboardingRate: recentJoins.length ? Math.round((onboarding.length / recentJoins.length) * 100) : null,
    retentionRate: eligibleRetention.length ? Math.round((retained.length / eligibleRetention.length) * 100) : null,
    retentionSample: eligibleRetention.length,
    bySource,
  };
}

async function humanMemberCount(guild) {
  const members = await guild.members.fetch().catch(() => guild.members.cache);
  return members.filter((member) => !member.user.bot).size;
}

async function growthReportEmbed(guild, data = null) {
  const stored = data || (await readGuild(guild.id));
  const metrics = computeGrowthMetrics(stored.growth);
  const humans = await humanMemberCount(guild);
  const target = stored.growth.targetMembers || 1000;
  const progress = Math.min(100, Math.round((humans / target) * 100));
  const sources = Object.entries(INVITE_SOURCE_LABELS)
    .map(([key, label]) => `• ${label} : **${metrics.bySource[key] || 0}** arrivée(s) suivie(s)`)
    .join("\n");
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("📈 Rapport de croissance • Chill Hub")
    .setDescription(`**${humans} / ${target} membres humains** — ${progress}% de l'objectif`)
    .addFields(
      { name: "Actifs sur 7 jours", value: String(metrics.active7Days), inline: true },
      { name: "Arrivées sur 30 jours", value: String(metrics.recentJoins), inline: true },
      { name: "Onboarding estimé", value: metrics.onboardingRate === null ? "Pas encore mesurable" : `${metrics.onboardingRate}%`, inline: true },
      { name: "Rétention à 7 jours", value: metrics.retentionRate === null ? "Pas encore mesurable" : `${metrics.retentionRate}% (${metrics.retentionSample})`, inline: true },
      { name: "Objectifs", value: "Onboarding ≥ 60% • Rétention ≥ 25% • Membres actifs ≥ 15%", inline: false },
      { name: "Sources", value: sources || "Aucune arrivée suivie.", inline: false },
    )
    .setTimestamp();
}

async function weeklyTask(guild, task, now = new Date()) {
  const data = await readGuild(guild.id);
  if (!data.growth.enabled) return false;
  const currentWeek = weekKey(now);
  const resources = resolveGrowthResources(guild);
  assertGrowthResources(resources);
  if (data.growth.weeklyRuns[task] === currentWeek) return false;

  if (task === "monday") {
    const event = await ensureWeeklyEvent(guild, data, resources, now);
    await sendWeeklyPoll(guild, resources, event);
  } else if (task === "wednesday") {
    await resources.channels.staff.send({
      embeds: [new EmbedBuilder()
        .setColor(0xfee75c)
        .setTitle("🎥 Mission croissance du mercredi")
        .setDescription("• Publier un clip TikTok/Shorts\n• Présenter un membre ou créateur\n• Contacter 5 serveurs compatibles\n• Contacter 2 petits créateurs\n• Préparer l'événement de vendredi")
        .setFooter({ text: "Temps conseillé : 2 heures" })],
      allowedMentions: { parse: [] },
    });
  } else if (task === "friday") {
    const event = await ensureWeeklyEvent(guild, data, resources, now);
    await resources.channels.events.send({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("🎮 Soirée Chill Hub ce soir")
        .setDescription(`Rendez-vous à **20 h** dans ${resources.channels.voice}.\n\n${event.url}\n\nInvite tes amis et prépare tes meilleurs clips !`)],
      allowedMentions: { parse: [] },
    });
  } else if (task === "sunday") {
    await resources.channels.staff.send({ embeds: [await growthReportEmbed(guild, data)] });
  }

  await mutateGuild(guild.id, (stored) => {
    stored.growth.weeklyRuns[task] = currentWeek;
    const entries = Object.entries(stored.growth.weeklyRuns);
    if (entries.length > 40) stored.growth.weeklyRuns = Object.fromEntries(entries.slice(-40));
  });
  return true;
}

async function runDueGrowthTasks(client, now = new Date()) {
  const local = parisParts(now);
  const schedule = [
    { key: "monday", weekday: 0, hour: 18 },
    { key: "wednesday", weekday: 2, hour: 18 },
    { key: "friday", weekday: 4, hour: 18 },
    { key: "sunday", weekday: 6, hour: 18 },
  ];
  for (const guild of client.guilds.cache.values()) {
    const data = await readGuild(guild.id);
    if (!data.growth.enabled) continue;
    for (const task of schedule) {
      const due = local.weekday > task.weekday || (local.weekday === task.weekday && local.hour >= task.hour);
      if (due) await weeklyTask(guild, task.key, now).catch((error) => console.error(`[Croissance] ${guild.name}/${task.key} :`, error.message));
    }
  }
}

async function refreshInviteCache(guild) {
  const invites = await guild.invites.fetch();
  inviteUseCache.set(guild.id, new Map(invites.map((invite) => [invite.code, invite.uses || 0])));
  return invites;
}

async function startGrowthMaintenance(client) {
  for (const guild of client.guilds.cache.values()) {
    const data = await readGuild(guild.id);
    if (data.growth.enabled) await refreshInviteCache(guild).catch(() => {});
  }
  await runDueGrowthTasks(client);
  if (maintenanceTimer) clearInterval(maintenanceTimer);
  maintenanceTimer = setInterval(() => {
    void runDueGrowthTasks(client).catch((error) => console.error("[Croissance] Calendrier :", error.message));
  }, 5 * 60_000);
  maintenanceTimer.unref?.();
}

function stopGrowthMaintenance() {
  if (maintenanceTimer) clearInterval(maintenanceTimer);
  maintenanceTimer = null;
}

async function setupGrowthGuild(guild, actorTag = "administrateur") {
  await guild.channels.fetch();
  await guild.roles.fetch();
  if (!guild.features.includes(GuildFeature.Community)) {
    throw new Error("Active d'abord le mode Serveur communautaire dans les paramètres Discord.");
  }
  const resources = resolveGrowthResources(guild);
  assertGrowthResources(resources);
  const previous = await readGuild(guild.id);

  if (guild.verificationLevel < GuildVerificationLevel.Medium) {
    await guild.setVerificationLevel(GuildVerificationLevel.Medium, `Sécurisation de la croissance par ${actorTag}`);
  }
  if (guild.description !== GROWTH_DESCRIPTION) {
    await guild.edit(
      { description: GROWTH_DESCRIPTION },
      `Positionnement communautaire par ${actorTag}`,
    ).catch(() => {});
  }

  const onboarding = await guild.fetchOnboarding();
  const serialized = serializeOnboarding(onboarding);
  const managedPrompts = [
    onboardingPrompt("À quels jeux joues-tu ?", [
      option("Minecraft", "⛏️", resources.roles.minecraft, resources.channels.minecraft),
      option("Fortnite", "🎯", resources.roles.fortnite, resources.channels.fortnite),
      option("Rocket League", "🚗", resources.roles.rocketLeague, resources.channels.rocketLeague),
      option("Valorant", "🔫", resources.roles.valorant, resources.channels.valorant),
      option("Autres jeux", "🎮", resources.roles.otherGames, resources.channels.otherGames),
    ]),
    onboardingPrompt("Quels contenus veux-tu suivre ?", [
      option("Memes", "😂", null, resources.channels.memes),
      option("Photos", "📸", null, resources.channels.photos),
      option("Créations", "🎨", null, resources.channels.creations),
      option("Musique", "🎵", null, resources.channels.music),
    ]),
    onboardingPrompt("Créateur ou artiste ?", [
      option("Streamer", "📺", resources.roles.streamer, resources.channels.creations),
      option("YouTubeur", "▶️", resources.roles.youtube, resources.channels.creations),
      option("Artiste", "🎨", resources.roles.artist, resources.channels.creations),
      option("Musicien", "🎵", resources.roles.musician, resources.channels.music),
    ]),
  ].filter((prompt) => prompt.options.length);
  const preserved = serialized.prompts.filter((prompt) => !MANAGED_ONBOARDING_TITLES.has(prompt.title));
  const defaultChannels = [
    resources.channels.rules,
    resources.channels.announcements,
    resources.channels.general,
    resources.channels.gaming,
    resources.channels.discussions,
    resources.channels.events,
    resources.channels.suggestions,
  ].filter(Boolean).map((channel) => channel.id);
  await guild.editOnboarding({
    ...serialized,
    prompts: [...preserved, ...managedPrompts],
    defaultChannels,
    enabled: true,
    reason: `Parcours de croissance configuré par ${actorTag}`,
  });

  const guide = await ensureGuide(guild, resources, previous.growth.guideMessageId);
  const inviteSources = await ensureSourceInvites(guild, resources.channels.general, previous.growth.inviteSources);
  const onboardingRoleIds = Object.values(resources.roles).filter(Boolean).map((role) => role.id);
  await mutateGuild(guild.id, (data) => {
    data.growth.enabled = true;
    data.growth.targetMembers = 1000;
    data.growth.configuredAt = new Date().toISOString();
    data.growth.guideChannelId = resources.channels.welcome.id;
    data.growth.guideMessageId = guide.id;
    data.growth.staffChannelId = resources.channels.staff.id;
    data.growth.pollChannelId = resources.channels.polls.id;
    data.growth.eventsChannelId = resources.channels.events.id;
    data.growth.generalChannelId = resources.channels.general.id;
    data.growth.memberRoleId = resources.roles.member.id;
    data.growth.onboardingRoleIds = onboardingRoleIds;
    data.growth.inviteSources = inviteSources;
    data.welcome.enabled = true;
    data.welcome.channelId = resources.channels.welcome.id;
    data.welcome.autoRoleId = resources.roles.member.id;
    data.welcome.message = `👋 Bienvenue {user} sur **{server}** ! Choisis tes rôles dans ${resources.channels.roles}, présente-toi dans ${resources.channels.general} et découvre le prochain rendez-vous dans ${resources.channels.events}.`;
    data.antiRaid.enabled = true;
  });

  const stored = await readGuild(guild.id);
  const event = await ensureWeeklyEvent(guild, stored, resources);
  const currentWeek = weekKey();
  if (stored.growth.weeklyRuns.monday !== currentWeek) {
    await sendWeeklyPoll(guild, resources, event);
    await mutateGuild(guild.id, (data) => { data.growth.weeklyRuns.monday = currentWeek; });
  }
  await resources.channels.staff.send({
    embeds: [new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("✅ Programme de croissance activé")
      .setDescription("L'Onboarding, le guide, l'anti-raid, les invitations suivies et le calendrier hebdomadaire sont prêts.")
      .addFields(
        { name: "Objectif", value: "1 000 membres", inline: true },
        { name: "Événement", value: event.url, inline: true },
        { name: "Action manuelle", value: "Le propriétaire doit activer l'exigence 2FA pour la modération dans les paramètres de sécurité Discord." },
      )],
    allowedMentions: { parse: [] },
  });
  return { guide, event, inviteSources, onboardingEnabled: true, mfaLevel: guild.mfaLevel };
}

async function handleGrowthMemberJoin(member) {
  if (member.user.bot) return;
  const data = await readGuild(member.guild.id);
  if (!data.growth.enabled) return;
  const previous = inviteUseCache.get(member.guild.id) || new Map();
  const current = await member.guild.invites.fetch().catch(() => null);
  let usedInvite = null;
  if (current) {
    usedInvite = current.find((invite) => (invite.uses || 0) > (previous.get(invite.code) || 0)) || null;
    inviteUseCache.set(member.guild.id, new Map(current.map((invite) => [invite.code, invite.uses || 0])));
  }
  const source = Object.entries(data.growth.inviteSources).find(([, invite]) => invite.code === usedInvite?.code)?.[0] || "inconnue";
  const now = new Date().toISOString();
  await mutateGuild(member.guild.id, (stored) => {
    stored.growth.members[member.id] = {
      joinedAt: member.joinedAt?.toISOString() || now,
      inviteCode: usedInvite?.code || null,
      source,
      firstActivityAt: null,
      lastActivityAt: null,
      onboardingAt: null,
      leftAt: null,
      bot: false,
    };
  });
  const staff = member.guild.channels.cache.get(data.growth.staffChannelId);
  if (staff?.isTextBased()) {
    await staff.send({
      content: `📥 ${member} a rejoint via **${INVITE_SOURCE_LABELS[source] || "source inconnue"}**.`,
      allowedMentions: { users: [member.id], parse: [] },
    }).catch(() => {});
  }
}

async function recordGrowthActivity(member, kind) {
  if (!member || member.user?.bot) return;
  const key = `${member.guild.id}:${member.id}`;
  const now = Date.now();
  if ((activityThrottle.get(key) || 0) > now - 15 * 60_000) return;
  const data = await readGuild(member.guild.id);
  if (!data.growth.enabled) return;
  activityThrottle.set(key, now);
  await mutateGuild(member.guild.id, (stored) => {
    const entry = stored.growth.members[member.id] || {
      joinedAt: member.joinedAt?.toISOString() || new Date(now).toISOString(),
      inviteCode: null,
      source: "avant-suivi",
      onboardingAt: null,
      leftAt: null,
      bot: false,
    };
    entry.firstActivityAt ||= new Date(now).toISOString();
    entry.lastActivityAt = new Date(now).toISOString();
    entry.lastActivityType = kind;
    entry.leftAt = null;
    stored.growth.members[member.id] = entry;
  });
}

async function handleGrowthMessage(message) {
  if (!message.guild || message.author.bot) return;
  return recordGrowthActivity(message.member, "message");
}

async function handleGrowthVoiceState(oldState, newState) {
  if (oldState.channelId === newState.channelId) return;
  return recordGrowthActivity(newState.member || oldState.member, "vocal");
}

async function handleGrowthMemberUpdate(oldMember, newMember) {
  if (newMember.user.bot) return;
  const data = await readGuild(newMember.guild.id);
  if (!data.growth.enabled) return;
  const gained = data.growth.onboardingRoleIds.some((roleId) => !oldMember.roles.cache.has(roleId) && newMember.roles.cache.has(roleId));
  if (!gained) return;
  await mutateGuild(newMember.guild.id, (stored) => {
    const entry = stored.growth.members[newMember.id] || {
      joinedAt: newMember.joinedAt?.toISOString() || new Date().toISOString(),
      inviteCode: null,
      source: "avant-suivi",
      firstActivityAt: null,
      lastActivityAt: null,
      leftAt: null,
      bot: false,
    };
    entry.onboardingAt ||= new Date().toISOString();
    stored.growth.members[newMember.id] = entry;
  });
}

async function handleGrowthMemberRemove(member) {
  if (member.user.bot) return;
  const data = await readGuild(member.guild.id);
  if (!data.growth.enabled || !data.growth.members[member.id]) return;
  await mutateGuild(member.guild.id, (stored) => {
    stored.growth.members[member.id].leftAt = new Date().toISOString();
  });
}

function inviteEmbed(data) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("🔗 Invitations de croissance")
    .setDescription(Object.entries(INVITE_SOURCE_LABELS).map(([key, label]) => {
      const invite = data.growth.inviteSources[key];
      return `**${label}**\n${invite?.url || "Non créée"}`;
    }).join("\n\n"))
    .setFooter({ text: "Utilise un lien différent pour mesurer chaque source." });
}

async function privateReply(interaction, payload) {
  if (interaction.isPrefixCommand) {
    const delivered = await interaction.user.send(payload).then(() => true).catch(() => false);
    return interaction.reply(delivered ? "Je t'ai envoyé les informations en message privé." : payload);
  }
  return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

async function handleGrowthCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "setup") {
    if (interaction.options.getBoolean("confirmation", true) !== true) {
      return privateReply(interaction, { content: "La confirmation doit être réglée sur Oui." });
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await setupGrowthGuild(interaction.guild, interaction.user.tag);
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0x57f287)
        .setTitle("✅ Croissance configurée")
        .setDescription("Le guide, l'Onboarding, l'anti-raid, les quatre invitations suivies et le premier événement sont prêts.")
        .addFields(
          { name: "Guide", value: result.guide.url, inline: true },
          { name: "Événement", value: result.event.url, inline: true },
          { name: "2FA du staff", value: result.mfaLevel ? "Activée" : "À activer manuellement par le propriétaire", inline: false },
        )],
    });
  }
  if (subcommand === "activer" || subcommand === "desactiver") {
    const enabled = subcommand === "activer";
    await mutateGuild(interaction.guildId, (data) => { data.growth.enabled = enabled; });
    return privateReply(interaction, { content: `Le calendrier de croissance est **${enabled ? "activé" : "suspendu"}**.` });
  }
  const data = await readGuild(interaction.guildId);
  if (subcommand === "invitations") return privateReply(interaction, { embeds: [inviteEmbed(data)] });
  if (subcommand === "rapport") return privateReply(interaction, { embeds: [await growthReportEmbed(interaction.guild, data)] });
  const metrics = computeGrowthMetrics(data.growth);
  return privateReply(interaction, {
    embeds: [new EmbedBuilder()
      .setColor(data.growth.enabled ? 0x57f287 : 0xed4245)
      .setTitle("🌱 Programme de croissance")
      .addFields(
        { name: "État", value: data.growth.enabled ? "Activé" : "Désactivé", inline: true },
        { name: "Objectif", value: `${data.growth.targetMembers || 1000} membres`, inline: true },
        { name: "Membres suivis", value: String(metrics.trackedMembers), inline: true },
        { name: "Actifs sur 7 jours", value: String(metrics.active7Days), inline: true },
        { name: "Onboarding estimé", value: metrics.onboardingRate === null ? "À mesurer" : `${metrics.onboardingRate}%`, inline: true },
        { name: "Rétention à 7 jours", value: metrics.retentionRate === null ? "À mesurer" : `${metrics.retentionRate}%`, inline: true },
      )],
  });
}

module.exports = {
  computeGrowthMetrics,
  handleGrowthCommand,
  handleGrowthMemberJoin,
  handleGrowthMemberRemove,
  handleGrowthMemberUpdate,
  handleGrowthMessage,
  handleGrowthVoiceState,
  nextFridayAt20,
  runDueGrowthTasks,
  setupGrowthGuild,
  startGrowthMaintenance,
  stopGrowthMaintenance,
  weekKey,
};
