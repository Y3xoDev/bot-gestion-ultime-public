const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Collection, PermissionsBitField, IntentsBitField, GatewayIntentBits, ChannelType, PermissionFlagsBits: P } = require("discord.js");
const { newStatistics, normalizeStatistics, defaultEntries, validateTemplate, renderName, RENAME_DELAY } = require("../src/modules/statistics-config");

function fixture() {
  const data = new Map();
  const read = id => { if (!data.has(id)) data.set(id, { statistics: newStatistics() }); return data.get(id); };
  const storePath = require.resolve("../src/persistence/guild-store");
  require.cache[storePath] = { id: storePath, filename: storePath, loaded: true, exports: {
    readGuild: async id => structuredClone(read(id)), mutateGuild: async (id, fn) => fn(read(id)),
  } };
  const legacyPath = require.resolve("../src/modules/legacy-features");
  require.cache[legacyPath] = { id: legacyPath, filename: legacyPath, loaded: true, exports: {
    enforceCommandAccess: async i => {
      if (i.guild.whitelistDenied) { await i.reply({ content: "Liste blanche" }); return false; }
      return true;
    },
  } };
  const modulePath = require.resolve("../src/modules/statistics"); delete require.cache[modulePath];
  const stats = require(modulePath);
  const calls = [];
  const client = { user: { id: "999999999999999999" }, options: { intents: new IntentsBitField([GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildPresences]) },
    guilds: { cache: new Collection() } };
  client.guilds.fetch = async ({ guild: id }) => {
    const guild = client.guilds.cache.get(id); calls.push(["counts", id]);
    if (guild.failCounts) throw new Error("network");
    guild.approximateMemberCount = guild.memberCount; guild.approximatePresenceCount = 3; return guild;
  };
  let sequence = 100000000000000000n;
  function createGuild(id = "111111111111111111") {
    const guild = { id, name: "Chill Hub", available: true, client, memberCount: 4, premiumSubscriptionCount: 2,
      roles: { cache: new Collection() }, members: { cache: new Collection() }, channels: { cache: new Collection() },
      presences: { cache: new Collection() },
      presenceStatuses: new Map([["333333333333333333", "online"], [client.user.id, "online"], ["444444444444444444", "idle"], ["555555555555555555", "offline"]]),
      voiceStates: { cache: new Collection([["a", { channelId: "voice" }], ["b", { channelId: "stage" }], ["c", { channelId: null }]]) } };
    const role = { id: "222222222222222222", name: "Membre", guild }; guild.roles.cache.set(role.id, role);
    guild.roles.cache.set(guild.id, { id: guild.id, name: "@everyone", guild });
    guild.roles.fetch = async id => guild.roles.cache.get(id) || null;
    const actor = { id: "333333333333333333", user: { bot: false }, roles: { cache: new Collection([[role.id, role]]) }, permissions: new PermissionsBitField(P.ManageGuild) };
    guild.members.me = { id: client.user.id, user: { bot: true }, roles: { cache: new Collection() }, permissions: new PermissionsBitField(P.Administrator) };
    guild.members.cache.set(actor.id, actor).set(client.user.id, guild.members.me);
    for (const id of ["444444444444444444", "555555555555555555"]) guild.members.cache.set(id, { id, user: { bot: false }, roles: { cache: new Collection() } });
    guild.members.fetch = async value => {
      if (typeof value === "string") return guild.members.cache.get(value);
      calls.push(["members", guild.id, value]);
      if (guild.failMemberFetch) throw new Error("Member fetch failed");
      if (value.withPresences) for (const [id, status] of guild.presenceStatuses) {
        if (status !== "offline" && status !== "invisible" && status !== undefined) guild.presences.cache.set(id, { status });
      }
      return guild.members.cache;
    };
    guild.members.fetchMe = async () => guild.members.me;
    guild.channels.fetch = async id => id ? guild.channels.cache.get(id) || null : guild.channels.cache;
    guild.channels.setPositions = async positions => { calls.push(["positions", guild.id]); for (const p of positions) guild.channels.cache.get(p.channel).rawPosition = p.position; };
    guild.channels.create = async options => {
      if (guild.failCreateType === options.type) throw Object.assign(new Error("Missing Permissions"), { code: 50013 });
      const channel = { id: String(++sequence), guild, type: options.type, name: options.name, parentId: options.parent || null,
        rawPosition: options.position || 0, isThread: () => false, overwrites: options.permissionOverwrites,
        async setName(name) { calls.push(["rename", this.id]); this.name = name; },
        async setPosition(value) { this.rawPosition = value; },
        async setParent(value) { this.parentId = value; },
        async delete() { if (this.failDelete) throw new Error("Missing Permissions"); calls.push(["delete", this.id]); guild.channels.cache.delete(this.id); },
      };
      channel.permissionOverwrites = { set: async values => { channel.overwrites = values; } };
      guild.channels.cache.set(channel.id, channel); calls.push(["create", channel.id]); return channel;
    };
    guild.actor = actor; client.guilds.cache.set(id, guild); return guild;
  }
  const guild = createGuild();
  function interaction(sub = "configurer", options = {}, target = guild) {
    const i = { guild: target, client, user: { id: target.actor.id }, member: target.actor,
      commandName: "statistiques", replies: [], deferred: false, replied: false,
      options: { getSubcommand: () => sub, getString: name => options[name] ?? null, getInteger: name => options[name] ?? null,
        getBoolean: name => options[name] ?? null, getRole: name => options[name] ?? null },
      async reply(payload) { this.replied = true; this.replies.push(payload); },
      async editReply(payload) { this.replies.push(payload); },
      async update(payload) { this.replied = true; this.replies.push(payload); },
      async deferReply() { this.deferred = true; }, async deferUpdate() { this.deferred = true; },
      async showModal(modal) { this.modal = modal; },
    };
    return i;
  }
  function component(panel, action) {
    const i = interaction();
    const prefix = panel.replies.at(-1).components[0].toJSON().components[0].custom_id.split(":").slice(0, 2).join(":");
    i.customId = `${prefix}:${action}`; return i;
  }
  return { stats, guild, client, calls, data, createGuild, config: id => read(id || guild.id).statistics, interaction, component };
}

test("new configurations are isolated, safely migrated and bounded", () => {
  const a = newStatistics(), b = newStatistics(); a.entries.push({}); assert.equal(b.entries.length, 0);
  assert.equal(normalizeStatistics({ intervalMinutes: 1, entries: {} }).intervalMinutes, 10);
  assert.equal(normalizeStatistics({ intervalMinutes: 900 }).intervalMinutes, 60);
  assert.deepEqual(normalizeStatistics().entries, []);
});
test("custom names validate variables, line limits and Unicode without double substitution", () => {
  assert.equal(validateTemplate("🌊 › {compteur}", "membres"), "🌊 › {compteur}");
  for (const [template, type] of [["bad", "membres"], ["x\ny", "texte"], ["{inconnu}", "texte"], ["x", "wrong"]]) assert.throws(() => validateTemplate(template, type));
  const guild = { name: "{compteur}", roles: { cache: new Collection() } };
  assert.equal(renderName({ type: "texte", template: "{serveur}" }, guild, {}), "{compteur}");
  assert.equal(renderName({ type: "membres", template: "{compteur}" }, guild, { membres: null }), "indisponible");
  assert.ok(renderName({ type: "texte", template: "a".repeat(99) + "🌊" }, guild, {}).length <= 100);
});
test("setup creates category and four locked counters; retries are idempotent", async () => {
  const f = fixture(); await f.stats.installStatistics(f.guild); const ids = f.config().entries.map(e => e.channelId);
  assert.equal(f.guild.channels.cache.size, 5); assert.equal(f.config().enabled, true);
  for (const id of ids) {
    const channel = f.guild.channels.cache.get(id); assert.equal(channel.parentId, f.config().categoryId);
    const everyone = channel.overwrites.find(o => o.id === f.guild.id);
    assert.ok(everyone.deny.includes(P.Connect)); assert.ok(everyone.allow.includes(P.ViewChannel));
  }
  assert.equal(f.guild.channels.cache.get(ids[1]).name, "⭐ › En ligne : 2");
  await f.stats.installStatistics(f.guild); assert.equal(f.guild.channels.cache.size, 5);
  assert.deepEqual(f.config().entries.map(e => e.channelId), ids);
});
test("partial setup persists created IDs and can resume without duplicates", async () => {
  const f = fixture(); f.guild.failCreateType = ChannelType.GuildVoice;
  await assert.rejects(f.stats.installStatistics(f.guild)); assert.ok(f.config().categoryId);
  assert.equal(f.guild.channels.cache.size, 1); delete f.guild.failCreateType;
  await f.stats.installStatistics(f.guild); assert.equal(f.guild.channels.cache.size, 5);
});
test("creation permission errors create no channels", async () => {
  const f = fixture(); f.guild.members.me.permissions = new PermissionsBitField(P.ViewChannel);
  await assert.rejects(f.stats.installStatistics(f.guild), /Gérer les salons/); assert.equal(f.guild.channels.cache.size, 0);
});
test("all counters use complete caches or show unknown; role counts are scoped to the guild", async () => {
  const f = fixture(); const c = newStatistics(); c.entries = defaultEntries().concat([{ type: "role", roleId: "222222222222222222" }, { type: "bots" }]);
  let counts = await f.stats.collectCounts(f.guild, c);
  assert.equal(counts.membres, 3); assert.equal(counts.bots, 1); assert.equal(counts.humains, 3);
  assert.equal(counts.vocal, 2); assert.equal(counts.boosts, 2); assert.equal(counts.roles, 1); assert.equal(counts["role:222222222222222222"], 1);
  f.guild.members.cache.delete("444444444444444444"); f.guild.failCounts = true;
  counts = await f.stats.collectCounts(f.guild, c); await f.stats.collectCounts(f.guild, c);
  assert.equal(counts.bots, null); assert.equal(counts.enligne, null);
  assert.equal(f.calls.filter(c => c[0] === "members").length, 1);
});
test("voice counters refresh immediately after a voice-state change and exclude bots", async () => {
  const f = fixture(); await f.stats.installStatistics(f.guild);
  const entry = f.config().entries.find(item => item.type === "vocal");
  const channel = f.guild.channels.cache.get(entry.channelId);
  f.guild.voiceStates.cache.set("new-human", { channelId: "voice", member: { user: { bot: false } } });
  f.guild.voiceStates.cache.set("new-bot", { channelId: "voice", member: { user: { bot: true } } });
  const result = await f.stats.refreshVoiceStatistics(f.guild);
  assert.equal(result.renamed, 1);
  assert.equal(channel.name, "🔊 › Vocal : 3");
});
test("without privileged members intent human counts never use mixed REST estimates", async () => {
  const f = fixture(); f.client.options.intents = new IntentsBitField();
  const counts = await f.stats.collectCounts(f.guild, { entries: [{ type: "bots" }] });
  assert.equal(counts.membres, null); assert.equal(counts.bots, null);
  assert.equal(f.calls.filter(c => c[0] === "counts").length, 0);
});
test("periodic refresh skips paused/not-due guilds and unchanged names", async () => {
  const f = fixture(); await f.stats.tickStatistics(f.client); assert.equal(f.calls.length, 0);
  await f.stats.installStatistics(f.guild); f.calls.length = 0;
  await f.stats.tickStatistics(f.client); assert.equal(f.calls.length, 0);
  f.config().nextRunAt = 0; await f.stats.tickStatistics(f.client);
  assert.equal(f.calls.filter(c => c[0] === "rename").length, 0);
  assert.equal(f.calls.filter(c => c[0] === "positions").length, 0);
});
test("renames are delayed at least ten minutes, and the delay survives a config reload", async () => {
  const f = fixture(); await f.stats.installStatistics(f.guild);
  const entry = f.config().entries[0]; const channel = f.guild.channels.cache.get(entry.channelId);
  await f.stats.editCounter(f.guild, { id: entry.id, template: "💜 › {compteur}" }); assert.match(channel.name, /Membres/);
  const previousNow = Date.now; const later = previousNow() + RENAME_DELAY + 1;
  try { Date.now = () => later; await f.stats.syncStatistics(f.guild); assert.equal(channel.name, "💜 › 3");
    f.guild.memberCount = 5;
    f.guild.members.cache.set("777777777777777777", { id: "777777777777777777", user: { bot: false }, roles: { cache: new Collection() } });
    const result = await f.stats.syncStatistics(f.guild); assert.equal(result.queued, 1); assert.equal(channel.name, "💜 › 3");
  } finally { Date.now = previousNow; }
});
test("deleted counters are not recreated by the timer, only by setup", async () => {
  const f = fixture(); await f.stats.installStatistics(f.guild); const entry = f.config().entries[0];
  f.guild.channels.cache.delete(entry.channelId); await f.stats.syncStatistics(f.guild);
  assert.match(f.config().lastError, /setup/); assert.equal(f.guild.channels.cache.size, 4);
  await f.stats.installStatistics(f.guild); assert.equal(f.guild.channels.cache.size, 5); assert.equal(f.config().lastError, null);
});
test("names, order, type, counted role and category options are editable independently", async () => {
  const f = fixture(); await f.stats.installStatistics(f.guild);
  const id = await f.stats.editCounter(f.guild, { type: "role", template: "🎭 {nom_role} : {compteur}", roleId: "222222222222222222", position: 1 });
  assert.equal(f.config().entries[0].id, id);
  await f.stats.editOptions(f.guild, { categoryName: "🌊 Statistiques", intervalMinutes: 30, categoryPosition: 2, color: "#AA22FF" });
  assert.equal(f.config().categoryName, "🌊 Statistiques"); assert.equal(f.config().intervalMinutes, 30); assert.equal(f.config().color, "AA22FF");
  await assert.rejects(f.stats.editOptions(f.guild, { intervalMinutes: 1 }), /Intervalle/);
  await assert.rejects(f.stats.editCounter(f.guild, { type: "role", template: "{compteur}" }), /nécessite/);
  await assert.rejects(f.stats.editCounter(f.guild, { id: "missing", template: "{compteur}" }), /introuvable/);
});
test("role visibility changes apply while paused and can be restored to public", async () => {
  const f = fixture(); await f.stats.installStatistics(f.guild); f.config().enabled = false;
  await f.stats.editOptions(f.guild, { visibleRoleId: "222222222222222222" });
  const channel = f.guild.channels.cache.get(f.config().entries[0].channelId);
  assert.ok(channel.overwrites.find(o => o.id === f.guild.id).deny.includes(P.ViewChannel));
  assert.ok(channel.overwrites.find(o => o.id === "222222222222222222").allow.includes(P.ViewChannel));
  assert.equal(f.config().enabled, false);
  await f.stats.editOptions(f.guild, { visibleRoleId: null }); assert.equal(channel.overwrites.length, 2);
});
test("configurations for different guilds and manually created same-name channels are untouched", async () => {
  const f = fixture(); const second = f.createGuild("666666666666666666");
  const manual = await f.guild.channels.create({ name: "📊 // Espace Statistiques", type: ChannelType.GuildCategory });
  await f.stats.installStatistics(f.guild); assert.notEqual(f.config().categoryId, manual.id);
  assert.equal(f.config(second.id).entries.length, 0); assert.equal(second.channels.cache.size, 0);
});
test("deletion keeps unrelated channels and non-empty categories, then detaches them", async () => {
  const f = fixture(); await f.stats.installStatistics(f.guild); const category = f.config().categoryId;
  const manual = await f.guild.channels.create({ name: "Ne pas supprimer", type: ChannelType.GuildText, parent: category });
  const result = await f.stats.deleteStatistics(f.guild);
  assert.match(result, /Catégorie conservée/); assert.ok(f.guild.channels.cache.has(manual.id)); assert.ok(f.guild.channels.cache.has(category));
  assert.equal(f.config().categoryId, null); assert.equal(f.config().enabled, false);
});
test("delete failures keep references for retry; wrong channel types are never deleted", async () => {
  const f = fixture(); await f.stats.installStatistics(f.guild); const entry = f.config().entries[0];
  const channel = f.guild.channels.cache.get(entry.channelId); channel.failDelete = true;
  assert.match(await f.stats.deleteStatistics(f.guild), /Échec/); assert.equal(f.config().entries.length, 1);
  channel.failDelete = false; channel.type = ChannelType.GuildText;
  await f.stats.deleteStatistics(f.guild); assert.ok(f.guild.channels.cache.has(channel.id));
  channel.type = ChannelType.GuildVoice; await f.stats.deleteStatistics(f.guild); assert.equal(f.guild.channels.cache.size, 0);
});
test("20-counter panels and all modal builders serialize within Discord limits", () => {
  const f = fixture(); const config = newStatistics(); config.entries = Array.from({ length: 20 }, (_, i) => ({ ...defaultEntries()[0], id: String(i), template: "🌊 {compteur} " + "x".repeat(80) }));
  const panel = f.stats.panelPayload(config, "session"); assert.ok(panel.components.length <= 5);
  for (const embed of panel.embeds) { const json = embed.toJSON(); for (const field of json.fields) assert.ok(field.value.length <= 1024); assert.ok(embed.length <= 6000); }
  f.stats.counterModal("session", null, "membres").toJSON(); f.stats.optionsModal(config, "session").toJSON();
});
test("commands require ManageGuild and whitelist access; opening a panel creates no channels", async () => {
  const f = fixture(); const denied = f.interaction("setup"); f.guild.actor.permissions = new PermissionsBitField(0n);
  await f.stats.handleStatisticsCommand(denied); assert.match(denied.replies[0].content, /Gérer le serveur/);
  f.guild.actor.permissions = new PermissionsBitField(P.ManageGuild); f.guild.whitelistDenied = true;
  const blocked = f.interaction("setup"); await f.stats.handleStatisticsCommand(blocked); assert.match(blocked.replies[0].content, /Liste blanche/);
  f.guild.whitelistDenied = false; const panel = f.interaction(); await f.stats.handleStatisticsCommand(panel);
  assert.equal(f.guild.channels.cache.size, 0); assert.ok(panel.replies[0].embeds.length);
});
test("prefix-style public panels are bound to author/guild and check permissions on every click", async () => {
  const f = fixture(); const panel = f.interaction(); panel.isPrefixCommand = true; await f.stats.handleStatisticsCommand(panel);
  const other = f.component(panel, "setup"); other.user = { id: "444444444444444444" }; await f.stats.handleStatisticsInteraction(other);
  assert.match(other.replies[0].content, /réservé/); assert.equal(f.guild.channels.cache.size, 0);
  const wrongGuild = f.component(panel, "setup"); wrongGuild.guild = f.createGuild("666666666666666666"); await f.stats.handleStatisticsInteraction(wrongGuild);
  assert.equal(wrongGuild.guild.channels.cache.size, 0);
  f.guild.actor.permissions = new PermissionsBitField(0n); await f.stats.handleStatisticsInteraction(f.component(panel, "setup")); assert.equal(f.guild.channels.cache.size, 0);
});
test("deletion requires an unexpired, single-use confirmation matching the current config", async () => {
  const f = fixture(); await f.stats.installStatistics(f.guild);
  const panel = f.interaction(); await f.stats.handleStatisticsCommand(panel);
  const unconfirmed = f.component(panel, "confirm"); await f.stats.handleStatisticsInteraction(unconfirmed); assert.equal(f.guild.channels.cache.size, 5);
  await f.stats.handleStatisticsInteraction(f.component(panel, "delete"));
  f.config().entries[0].id = "changed";
  await f.stats.handleStatisticsInteraction(f.component(panel, "confirm")); assert.equal(f.guild.channels.cache.size, 5);
  await f.stats.handleStatisticsInteraction(f.component(panel, "delete"));
  await f.stats.handleStatisticsInteraction(f.component(panel, "confirm")); assert.equal(f.guild.channels.cache.size, 0);
  const duplicate = f.component(panel, "confirm"); await f.stats.handleStatisticsInteraction(duplicate); assert.match(duplicate.replies.at(-1).content, /Confirmation expirée/);
});
test("button-to-modal flow edits configuration and rejects expired sessions", async () => {
  const f = fixture(); const panel = f.interaction(); await f.stats.handleStatisticsCommand(panel);
  const button = f.component(panel, "options"); await f.stats.handleStatisticsInteraction(button); assert.ok(button.modal);
  const submit = f.component(panel, "save-options");
  const values = { category: "🌊 Mes stats", interval: "20", position: "0", visibility: "", color: "FFFFFF" };
  submit.fields = { getTextInputValue: key => values[key] }; await f.stats.handleStatisticsInteraction(submit);
  assert.equal(f.config().categoryName, "🌊 Mes stats"); assert.equal(f.guild.channels.cache.size, 0);
  const oldNow = Date.now, future = oldNow() + 16 * 60_000;
  try { Date.now = () => future; const expired = f.component(panel, "setup"); await f.stats.handleStatisticsInteraction(expired); assert.match(expired.replies[0].content, /expiré/); }
  finally { Date.now = oldNow; }
});
test("guild locks prevent overlapping creations and always release on failure", async () => {
  const f = fixture(); let release;
  const first = f.stats.exclusive(f.guild.id, () => new Promise(resolve => { release = resolve; }));
  await assert.rejects(f.stats.exclusive(f.guild.id, () => f.stats.installStatistics(f.guild)), /déjà en cours/);
  release(); await first;
  await assert.rejects(f.stats.exclusive(f.guild.id, async () => { throw new Error("test"); }));
  await f.stats.exclusive(f.guild.id, () => f.stats.installStatistics(f.guild)); assert.equal(f.guild.channels.cache.size, 5);
});
test("an expired deletion confirmation leaves channels and configuration intact", async () => {
  const f = fixture(); await f.stats.installStatistics(f.guild);
  const panel = f.interaction(); await f.stats.handleStatisticsCommand(panel);
  await f.stats.handleStatisticsInteraction(f.component(panel, "delete"));
  const oldNow = Date.now, future = oldNow() + 61_000;
  try { Date.now = () => future; const confirm = f.component(panel, "confirm"); await f.stats.handleStatisticsInteraction(confirm);
    assert.match(confirm.replies.at(-1).content, /Confirmation expirée/); assert.equal(f.guild.channels.cache.size, 5); assert.equal(f.config().enabled, true);
  } finally { Date.now = oldNow; }
});
test("counter limits and black panel colors are honored without installing anything", async () => {
  const f = fixture();
  for (let index = 0; index < 20; index++) await f.stats.editCounter(f.guild, { type: "texte", template: `Ligne ${index}` });
  await assert.rejects(f.stats.editCounter(f.guild, { type: "texte", template: "Une de trop" }), /Maximum 20/);
  await f.stats.editOptions(f.guild, { color: "000000" });
  assert.equal(f.stats.panelPayload(f.config(), "session").embeds[0].toJSON().color, 0);
  assert.equal(f.guild.channels.cache.size, 0);
});
test("online counts include online/idle/dnd humans and exclude all bots, offline, invisible and unknown statuses", async () => {
  const f = fixture(); f.guild.members.cache.clear(); f.guild.presenceStatuses.clear();
  let id = 800000000000000000n;
  for (const bot of [false, true]) for (const status of ["online", "idle", "dnd", "offline", "invisible", undefined]) {
    const key = String(++id); f.guild.members.cache.set(key, { id: key, user: { bot }, roles: { cache: new Collection() } });
    f.guild.presenceStatuses.set(key, status);
  }
  f.guild.memberCount = f.guild.members.cache.size;
  const config = { entries: [{ type: "enligne" }] };
  assert.equal((await f.stats.collectCounts(f.guild, config)).enligne, 3);
  assert.equal(f.calls.filter(c => c[0] === "counts").length, 0, "The mixed REST approximation must not be used");
  assert.equal(f.calls.find(c => c[0] === "members")[2].withPresences, true);
  // Presence events update the cache without a member fetch on each refresh.
  for (const member of f.guild.members.cache.values()) if (!member.user.bot) f.guild.presences.cache.set(member.id, { status: "offline" });
  assert.equal((await f.stats.collectCounts(f.guild, config)).enligne, 0);
  assert.equal(f.calls.filter(c => c[0] === "members").length, 1);
});
test("missing presence intent never falls back to a mixed human/bot estimate", async () => {
  const f = fixture(); f.client.options.intents.remove(GatewayIntentBits.GuildPresences);
  f.guild.approximatePresenceCount = 999;
  assert.equal((await f.stats.collectCounts(f.guild, { entries: [{ type: "enligne" }] })).enligne, null);
  assert.equal(f.calls.filter(c => c[0] === "members").length, 0);
});
test("a failed presence bootstrap does not masquerade as zero and retries are rate-limited", async () => {
  const f = fixture(); f.guild.failMemberFetch = true;
  const config = { entries: [{ type: "enligne" }] };
  assert.equal((await f.stats.collectCounts(f.guild, config)).enligne, null);
  delete f.guild.failMemberFetch;
  assert.equal((await f.stats.collectCounts(f.guild, config)).enligne, null);
  assert.equal(f.calls.filter(c => c[0] === "members").length, 1);
  const oldNow = Date.now, future = oldNow() + 31 * 60_000;
  try { Date.now = () => future; assert.equal((await f.stats.collectCounts(f.guild, config)).enligne, 2); }
  finally { Date.now = oldNow; }
});
test("reconnection invalidates the presence snapshot and removes stale online members", async () => {
  const f = fixture(); const config = { entries: [{ type: "enligne" }] };
  assert.equal((await f.stats.collectCounts(f.guild, config)).enligne, 2);
  f.guild.presenceStatuses.set(f.guild.actor.id, "offline");
  f.stats.invalidateStatisticsPresence(f.guild);
  assert.equal((await f.stats.collectCounts(f.guild, config)).enligne, 1);
  assert.equal(f.calls.filter(c => c[0] === "members").length, 2);
});
test("the members-only counter fetches incomplete membership without requesting presences", async () => {
  const f = fixture(); f.client.options.intents.remove(GatewayIntentBits.GuildPresences);
  const missing = f.guild.members.cache.get("444444444444444444"); f.guild.members.cache.delete(missing.id);
  f.guild.members.fetch = async options => {
    assert.equal(options.withPresences, false); f.guild.members.cache.set(missing.id, missing); return f.guild.members.cache;
  };
  const counts = await f.stats.collectCounts(f.guild, { entries: [{ type: "membres" }] });
  assert.equal(counts.membres, 3); assert.equal(counts.humains, 3); assert.equal(counts.bots, 1);
  assert.equal(counts.enligne, null);
});
test("members counts are unknown with incomplete data, zero with only bots, and isolated per guild", async () => {
  const f = fixture(); const config = { entries: [{ type: "membres" }] };
  const second = f.createGuild("666666666666666666");
  f.guild.memberCount = 5; f.guild.failMemberFetch = true;
  assert.equal((await f.stats.collectCounts(f.guild, config)).membres, null);
  assert.equal((await f.stats.collectCounts(second, config)).membres, 3);
  second.members.cache.clear(); second.members.cache.set(second.members.me.id, second.members.me); second.memberCount = 1;
  assert.equal((await f.stats.collectCounts(second, config)).membres, 0);
});
test("legacy /stats shows the same human-only members count", async () => {
  const f = fixture(); f.guild.iconURL = () => null;
  const legacyPath = require.resolve("../src/modules/legacy-features"); delete require.cache[legacyPath];
  const { handleLegacyCommand } = require(legacyPath);
  const i = f.interaction(); i.commandName = "stats";
  await handleLegacyCommand(i);
  const fields = i.replies.at(-1).embeds[0].toJSON().fields;
  assert.equal(fields.find(field => field.name === "Membres (hors bots)").value, "3");
});
