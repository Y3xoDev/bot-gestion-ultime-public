const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Collection, ChannelType, PermissionsBitField } = require("discord.js");

// All Discord calls and persistence are mocked. These tests never touch live guilds or bot-data.json.
const storePath = require.resolve("../src/persistence/guild-store");
const logsPath = require.resolve("../src/modules/server-events");
const modulePath = require.resolve("../src/modules/modmail");
const routingPath = require.resolve("../src/modules/modmail-routing");
const A = "111111111111111111";
const B = "222222222222222222";
let nextId = 800000000000000000n;
const id = () => String(++nextId);
const allPermissions = () => new PermissionsBitField(PermissionsBitField.All);

function fixture() {
  const guildData = new Map();
  let botData = { modmailRoutes: {} };
  require.cache[storePath] = { id: storePath, filename: storePath, loaded: true, exports: {
    readBot: async () => structuredClone(botData),
    mutateBot: async (fn) => fn(botData),
    readGuild: async (guildId) => structuredClone(guildData.get(guildId)),
    mutateGuild: async (guildId, fn) => fn(guildData.get(guildId)),
  } };
  require.cache[logsPath] = { id: logsPath, filename: logsPath, loaded: true, exports: {
    sendLog: async () => {}, installLogChannels: async () => ({}),
    uninstallLogChannel: async () => ({ deleted: false }),
  } };
  const client = { user: { id: "999999999999999999" }, guilds: { cache: new Collection() }, users: {} };
  function channel(guild, name, type = 0, parentId = null) {
    const messages = new Collection();
    const result = {
      id: id(), guild, name, type, parentId, sent: [], public: true,
      isTextBased: () => type === 0 || type === 5,
      permissionsFor: (member) => !result.public && member.id === guild.id
        ? new PermissionsBitField(0n) : allPermissions(),
      permissionOverwrites: { edit: async () => {} },
      messages: { fetch: async (messageId) => {
        if (typeof messageId === "object") return messages;
        const value = messages.get(messageId);
        if (!value) throw Object.assign(new Error("Unknown Message"), { code: 10008 });
        return value;
      } },
      send: async (payload) => {
        if (result.failSend) throw new Error("Cannot send");
        const data = typeof payload === "string" ? { content: payload } : payload;
        const message = {
          id: id(), author: client.user, channelId: result.id, createdAt: new Date(),
          attachments: new Collection(), content: data.content,
          embeds: (data.embeds || []).map((embed) => embed.toJSON?.() || embed),
          components: data.components || [],
          edit: async (update) => { Object.assign(message, update); return message; },
          delete: async () => { message.deleted = true; messages.delete(message.id); },
        };
        messages.set(message.id, message);
        result.sent.push(data);
        return message;
      },
      setName: async (name) => { result.name = name; },
      delete: async () => { guild.channels.cache.delete(result.id); },
    };
    if (guild.channels) guild.channels.cache.set(result.id, result);
    return result;
  }
  const user = {
    id: "333333333333333333", username: "membre", tag: "membre#0000", bot: false,
    displayAvatarURL: () => "https://example.com/avatar.png",
  };
  const dmChannel = channel({ id: "dm" }, "DM");
  user.send = async (payload) => {
    if (user.dmBlocked) throw new Error("Cannot send messages to this user");
    return dmChannel.send(payload);
  };
  client.users.fetch = async () => user;
  for (const guildId of [A, B]) {
    const member = { id: user.id, user, displayName: "Membre", roles: { cache: new Collection() }, permissions: allPermissions() };
    const guild = { id: guildId, name: guildId === A ? "Serveur A" : "Serveur B", client,
      roles: { everyone: { id: guildId }, cache: new Collection() },
      members: { me: { id: client.user.id, permissions: allPermissions() }, cache: new Collection([[user.id, member]]),
        fetch: async (request) => {
          const userId = typeof request === "string" ? request : request.user;
          const found = guild.members.cache.get(userId);
          if (!found) throw new Error("Unknown Member");
          return found;
        } },
      channels: { cache: new Collection(), created: [],
        fetch: async (channelId) => {
          const found = guild.channels.cache.get(channelId);
          if (!found) throw Object.assign(new Error("Unknown Channel"), { code: 10003 });
          return found;
        },
        create: async (options) => {
          const created = channel(guild, options.name, options.type, options.parent);
          created.topic = options.topic;
          guild.channels.created.push(created);
          return created;
        },
      },
    };
    const role = { id: id(), name: "Staff" };
    guild.roles.cache.set(role.id, role);
    member.roles.cache.set(role.id, role);
    const category = channel(guild, "MODMAIL", ChannelType.GuildCategory);
    const panel = channel(guild, "📩・contact-staff");
    guildData.set(guildId, { modmail: {
      enabled: true, categoryId: category.id, staffRoleId: role.id,
      transcriptChannelId: null, options: [], threads: [], blockedUserIds: [],
      claimEnabled: true, inactivityHours: 0, panelChannelId: panel.id, panelMessageId: "777777777777777777",
    }, logs: { channels: {} } });
    client.guilds.cache.set(guildId, guild);
  }
  function reload() {
    delete require.cache[modulePath];
    delete require.cache[routingPath];
    return { ...require(modulePath), ...require(routingPath) };
  }
  let api = reload();
  function interaction(customId, guildId = null, actor = user, extra = {}) {
    const guild = client.guilds.cache.get(guildId);
    const config = guildData.get(guildId)?.modmail;
    const replies = [];
    return { customId, guildId, guild, client, user: actor, replies,
      channelId: config?.panelChannelId, member: guild?.members.cache.get(actor.id), memberPermissions: allPermissions(),
      message: { id: config?.panelMessageId, edit: async () => {} },
      isButton: () => !customId.startsWith("modmail:select"),
      isStringSelectMenu: () => customId.startsWith("modmail:select"),
      inCachedGuild: () => Boolean(guild),
      deferReply: async () => {}, deferUpdate: async () => {},
      reply: async (value) => replies.push(value), editReply: async (value) => replies.push(value),
      update: async (value) => replies.push(value), followUp: async (value) => replies.push(value),
      ...extra,
    };
  }
  async function click(guildId) {
    const input = interaction(`modmail:contact:${guildId}`, guildId);
    await api.handleModmailInteraction(input);
    return input;
  }
  async function confirm(input, actor = user, button = 0) {
    const row = input.replies.at(-1).components[0].toJSON();
    const result = interaction(row.components[button].custom_id, null, actor);
    await api.handleModmailInteraction(result);
    return result;
  }
  async function dm(content, extra = {}) {
    const replies = [];
    const message = { author: user, client, guild: null, channel: dmChannel, content,
      attachments: new Collection(), createdTimestamp: Date.now() + 1000,
      reply: async (value) => { replies.push(value); return dmChannel.send(value); },
      react: async () => {}, ...extra,
    };
    await api.handleModmailMessage(client, message);
    return { message, replies };
  }
  function topics(guildId) {
    const config = guildData.get(guildId).modmail;
    config.options = ["Question", "Signalement"].map((name) => ({ name, categoryId: config.categoryId, staffRoleId: config.staffRoleId }));
  }
  function selection(reply, index = "0") {
    return interaction(reply.components[0].components[0].data.custom_id, null, user, { message: reply, values: [index] });
  }
  const threads = (guildId) => guildData.get(guildId).modmail.threads;
  return { get api() { return api; }, client, user, guildData, dmChannel, click, confirm, dm, interaction, topics, selection, threads,
    route: () => botData.modmailRoutes[user.id],
    restart: () => { botData = structuredClone(botData); api = reload(); },
    channel,
  };
}

test("un MP sans choix explicite ne part ni au serveur principal ni au premier serveur", async () => {
  const f = fixture();
  const result = await f.dm("secret sans destination");
  assert.match(result.replies[0].content, /Aucun message n'a été transmis/);
  assert.equal(f.threads(A).length + f.threads(B).length, 0);
});

test("le clic sélectionne A et deux MP simultanés créent une seule conversation", async () => {
  const f = fixture();
  await f.click(A);
  await Promise.all([f.dm("premier"), f.dm("second")]);
  assert.equal(f.route().guildId, A);
  assert.equal(f.threads(A).length, 1);
  assert.equal(f.threads(B).length, 0);
  const channel = f.client.guilds.cache.get(A).channels.cache.get(f.route().channelId);
  assert.deepEqual(channel.sent.slice(1).map(p => p.embeds[0].data.description), ["premier", "second"]);
});

test("changer de serveur exige une confirmation, conserve A en pause et achemine uniquement vers B", async () => {
  const f = fixture();
  await f.click(A);
  await f.dm("secret A");
  const pending = await f.click(B);
  assert.equal(f.route().guildId, A);
  await f.confirm(pending);
  await f.dm("secret B");
  assert.equal(f.route().guildId, B);
  assert.equal(f.threads(A).length, 1);
  assert.equal(f.threads(B).length, 1);
  const a = f.client.guilds.cache.get(A).channels.cache.get(f.threads(A)[0].channelId);
  assert.equal(a.sent.length, 2);
});

test("une confirmation appartient à son auteur, expire après usage et peut être annulée", async () => {
  const f = fixture();
  await f.click(A);
  const pending = await f.click(B);
  const stranger = { ...f.user, id: "444444444444444444" };
  await f.confirm(pending, stranger);
  assert.equal(f.route().guildId, A);
  await f.confirm(pending, f.user, 1);
  assert.equal(f.route().guildId, A);
  await f.confirm(pending);
  assert.equal(f.route().guildId, A);
});

test("un ancien choix de sujet ne peut pas transférer les messages en attente vers une nouvelle destination", async () => {
  const f = fixture();
  f.topics(A);
  await f.click(A);
  await f.dm("contenu privé pour A uniquement");
  const oldMenu = await f.dmChannel.messages.fetch(String(nextId));
  const pending = await f.click(B);
  await f.confirm(pending);
  await f.api.handleModmailInteraction(f.selection(oldMenu));
  assert.equal(f.threads(A).length + f.threads(B).length, 0);
  await f.dm("nouveau message pour B");
  const channel = f.client.guilds.cache.get(B).channels.cache.get(f.route().channelId);
  assert.equal(channel.sent[1].embeds[0].data.description, "nouveau message pour B");
});

test("les options sont liées au menu envoyé, pas à un indice de configuration modifié", async () => {
  const f = fixture();
  f.topics(A);
  await f.click(A);
  await f.dm("demande");
  const menu = await f.dmChannel.messages.fetch(String(nextId));
  const click = f.selection(menu);
  f.guildData.get(A).modmail.options.reverse();
  await f.api.handleModmailInteraction(click);
  assert.equal(f.threads(A)[0].optionName, "Question");
  await f.api.handleModmailInteraction(click);
  assert.equal(f.threads(A).length, 1);
});

for (const reason of ["désactivation", "blocage", "départ", "retrait du rôle autorisé", "bot parti"]) {
  test(`pas de repli vers un autre serveur après ${reason}`, async () => {
    const f = fixture();
    await f.click(A);
    await f.dm("avant");
    const config = f.guildData.get(A).modmail;
    if (reason === "désactivation") config.enabled = false;
    if (reason === "blocage") config.blockedUserIds.push(f.user.id);
    if (reason === "départ") f.client.guilds.cache.get(A).members.cache.delete(f.user.id);
    if (reason === "retrait du rôle autorisé") config.options = [{ name: "Général", allowedRoleId: "555555555555555555" }];
    if (reason === "bot parti") f.client.guilds.cache.delete(A);
    const result = await f.dm("ne pas transférer ailleurs");
    assert.match(result.replies[0].content, /Aucun message n'a été transmis/);
    assert.equal(f.threads(B).length, 0);
  });
}

test("le choix et l'identifiant de conversation survivent au rechargement des modules", async () => {
  const f = fixture();
  await f.click(B);
  await f.dm("avant redémarrage");
  const route = structuredClone(f.route());
  f.restart();
  await f.dm("après redémarrage");
  assert.deepEqual(f.route(), route);
  assert.equal(f.threads(B).length, 1);
  assert.equal(f.threads(A).length, 0);
});

test("les MP fermés du membre empêchent de changer sa destination", async () => {
  const f = fixture();
  await f.click(A);
  const previous = structuredClone(f.route());
  const pending = await f.click(B);
  f.user.dmBlocked = true;
  await f.confirm(pending);
  assert.deepEqual(f.route(), previous);
});

test("un message antérieur au changement et une réponse à l'ancien serveur ne sont pas transférés", async () => {
  const f = fixture();
  await f.click(A);
  await f.dm("ouverture");
  const oldChannel = f.route().channelId;
  const reference = await f.dmChannel.send({ embeds: [{ footer: { text: `ModMail : ${A} / ${oldChannel}` } }] });
  await f.confirm(await f.click(B));
  await f.dm("trop ancien", { createdTimestamp: f.route().selectedAt - 1 });
  await f.dm("réponse à A", { reference: { messageId: reference.id } });
  assert.equal(f.threads(B).length, 0);
});

test("fermer une ancienne conversation A ne retire pas la sélection de B", async () => {
  const f = fixture();
  await f.click(A);
  await f.dm("A");
  const channel = f.client.guilds.cache.get(A).channels.cache.get(f.route().channelId);
  await f.confirm(await f.click(B));
  const close = f.interaction(`modmail:close:${f.user.id}`, A, f.user, { channelId: channel.id, channel });
  await f.api.handleModmailInteraction(close);
  assert.equal(f.threads(A)[0].active, false);
  assert.equal(f.route().guildId, B);
});

test("fermer la conversation sélectionnée empêche une réouverture implicite par MP", async () => {
  const f = fixture();
  await f.click(A);
  await f.dm("A");
  const channel = f.client.guilds.cache.get(A).channels.cache.get(f.route().channelId);
  await f.api.handleModmailInteraction(f.interaction(`modmail:close:${f.user.id}`, A, f.user, { channelId: channel.id, channel }));
  assert.equal(f.route(), undefined);
  await f.dm("après fermeture");
  assert.equal(f.threads(A).length, 1);
  assert.equal(f.threads(B).length, 0);
});

test("le staff d'une conversation non sélectionnée ne peut pas envoyer un MP ambigu", async () => {
  const f = fixture();
  await f.click(A);
  await f.dm("A");
  const guild = f.client.guilds.cache.get(A);
  const channel = guild.channels.cache.get(f.route().channelId);
  await f.confirm(await f.click(B));
  const before = f.dmChannel.sent.length;
  const replies = [];
  await f.api.handleModmailMessage(f.client, { guild, channel, author: f.user,
    member: guild.members.cache.get(f.user.id), content: "réponse du staff A",
    attachments: new Collection(), react: async () => {}, reply: async p => replies.push(p) });
  assert.equal(f.dmChannel.sent.length, before);
  assert.match(replies[0].content, /Message non transmis/);
});

test("publication du panel idempotente et refus d'un salon privé", async () => {
  const f = fixture();
  const guild = f.client.guilds.cache.get(A);
  const first = await f.api.ensureModmailPanel(guild);
  const second = await f.api.ensureModmailPanel(guild);
  assert.equal(first.message.id, second.message.id);
  assert.equal(first.channel.sent.length, 1);
  first.channel.public = false;
  await assert.rejects(() => f.api.ensureModmailPanel(guild, first.channel), /visible par les membres/);
  f.guildData.get(B).modmail.enabled = false;
  assert.equal(await f.api.ensureModmailPanel(f.client.guilds.cache.get(B)), null);
});

test("la désinstallation efface seulement le panel et les routes du serveur concerné", async () => {
  const f = fixture();
  const guild = f.client.guilds.cache.get(A);
  const panel = await f.api.ensureModmailPanel(guild);
  await f.click(A);
  await f.api.uninstallModmail(guild, "test");
  assert.equal(f.route(), undefined);
  assert.equal(panel.message.deleted, true);
  assert(guild.channels.cache.has(panel.channel.id), "Le salon public partagé doit être conservé.");
  assert.equal(f.guildData.get(A).modmail.enabled, false);
  assert.equal(f.guildData.get(B).modmail.enabled, true);
});

test("une confirmation de changement expirée ne modifie pas la destination", async () => {
  const f = fixture();
  await f.click(A);
  const pending = await f.click(B);
  const originalNow = Date.now;
  const expiredAt = originalNow() + 121000;
  try {
    Date.now = () => expiredAt;
    await f.confirm(pending);
    assert.equal(f.route().guildId, A);
  } finally { Date.now = originalNow; }
});

test("un menu de sujet expiré ou utilisé après redémarrage ne transmet rien", async () => {
  const f = fixture();
  f.topics(A);
  await f.click(A);
  await f.dm("message en attente");
  const menu = await f.dmChannel.messages.fetch(String(nextId));
  const originalNow = Date.now;
  const expiredAt = originalNow() + 301000;
  try {
    Date.now = () => expiredAt;
    await f.api.handleModmailInteraction(f.selection(menu));
    assert.equal(f.threads(A).length, 0);
  } finally { Date.now = originalNow; }
  f.restart();
  await f.api.handleModmailInteraction(f.selection(menu));
  assert.equal(f.threads(A).length, 0);
});

test("les accès sont revérifiés au clic sur le sujet", async () => {
  const f = fixture();
  f.topics(A);
  await f.click(A);
  await f.dm("message en attente");
  const menu = await f.dmChannel.messages.fetch(String(nextId));
  f.guildData.get(A).modmail.blockedUserIds.push(f.user.id);
  await f.api.handleModmailInteraction(f.selection(menu));
  assert.equal(f.threads(A).length, 0);
});

test("la suppression d'un salon ne réachemine pas son contenu vers un autre serveur", async () => {
  const f = fixture();
  await f.click(A);
  await f.dm("premier message");
  f.client.guilds.cache.get(A).channels.cache.delete(f.route().channelId);
  await f.dm("salon supprimé");
  assert.equal(f.route(), undefined);
  assert.equal(f.threads(A).length + f.threads(B).length, 0);
});

test("une erreur de lecture temporaire ne supprime pas la conversation enregistrée", async () => {
  const f = fixture();
  await f.click(A);
  await f.dm("premier message");
  const previous = structuredClone(f.route());
  const guild = f.client.guilds.cache.get(A);
  guild.channels.cache.delete(previous.channelId);
  guild.channels.fetch = async () => { throw Object.assign(new Error("Missing Access"), { code: 50001 }); };
  const result = await f.dm("réessai nécessaire");
  assert.match(result.replies[0], /Impossible d'envoyer/);
  assert.deepEqual(f.route(), previous);
  assert.equal(f.threads(A).length, 1);
});

test("une réouverture par le staff ne change pas la destination personnelle", async () => {
  const f = fixture();
  await f.click(A);
  await f.dm("A");
  const channel = f.client.guilds.cache.get(A).channels.cache.get(f.route().channelId);
  const extra = { channelId: channel.id, channel };
  await f.api.handleModmailInteraction(f.interaction(`modmail:close:${f.user.id}`, A, f.user, extra));
  await f.click(B);
  await f.api.handleModmailInteraction(f.interaction(`modmail:reopen:${f.user.id}`, A, f.user, extra));
  assert.equal(f.threads(A)[0].active, true);
  assert.equal(f.route().guildId, B);
});

test("le relais staff sélectionné indique sa conversation et sa réponse arrive au même salon", async () => {
  const f = fixture();
  await f.click(A);
  await f.dm("question");
  const guild = f.client.guilds.cache.get(A);
  const channel = guild.channels.cache.get(f.route().channelId);
  await f.api.handleModmailMessage(f.client, { guild, channel, author: f.user,
    member: guild.members.cache.get(f.user.id), content: "réponse staff",
    attachments: new Collection(), react: async () => {}, reply: async () => {} });
  const answer = await f.dmChannel.messages.fetch(String(nextId));
  assert.equal(answer.embeds[0].footer.text, `ModMail : ${A} / ${channel.id}`);
  await f.dm("merci", { reference: { messageId: answer.id } });
  assert.equal(channel.sent.at(-1).embeds[0].data.description, "merci");
});

test("un panel déplacé est désactivé et un bouton d'un autre serveur est rejeté", async () => {
  const f = fixture();
  const guild = f.client.guilds.cache.get(A);
  const first = await f.api.ensureModmailPanel(guild);
  const target = f.channel(guild, "nouveau-contact");
  const second = await f.api.ensureModmailPanel(guild, target);
  assert.notEqual(first.channel.id, second.channel.id);
  assert.deepEqual(first.message.components, []);
  const oldButton = f.interaction(`modmail:contact:${A}`, A, f.user, { channelId: first.channel.id, message: first.message });
  await f.api.handleModmailInteraction(oldButton);
  assert.equal(f.route(), undefined);
  await f.api.handleModmailInteraction(f.interaction(`modmail:contact:${B}`, A));
  assert.equal(f.route(), undefined);
});
