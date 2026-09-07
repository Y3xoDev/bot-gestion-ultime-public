const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Collection, ChannelType, PermissionsBitField, PermissionFlagsBits: P } = require("discord.js");
const storePath = require.resolve("../src/persistence/guild-store");
const eventsPath = require.resolve("../src/modules/server-events");
const runtimePath = require.resolve("../src/modules/ticket-runtime");
const configPath = require.resolve("../src/modules/ticket-config");
const reviewsPath = require.resolve("../src/modules/ticket-reviews");
let sequence = 800000000000000000n;
const nextId = () => String(++sequence);

// No network calls or real bot-data.json access in this suite.
function fixture(overrides = {}) {
  const config = { categoryId: "111111111111111111", staffRoleId: "222222222222222222", nextNumber: 1,
    panelTitle: "Support", panelDescription: "Ouvre un ticket", panelColor: "5865F2", confirmationEnabled: true,
    transcriptDmEnabled: true, transcriptChannelId: null, mentionStaffEnabled: true, allowUserClose: true,
    maxOpenTicketsPerUser: 1, channelNamePrefix: "ticket", ticketOpenMessage: "Décris ta demande", closeMessage: "Ticket fermé.",
    choices: [], panelChannelId: null, panelMessageId: null, interactionType: "Buttons",
    claimEnabled: false, autoClaimEnabled: false, claimButtonEnabled: false, closeButtonEnabled: true,
    autoDeleteClosed: false, entries: {}, reviews: {}, ...overrides };
  const data = { tickets: config };
  let queue = Promise.resolve();
  require.cache[storePath] = { id: storePath, filename: storePath, loaded: true, exports: {
    readGuild: async () => structuredClone(data),
    mutateGuild: async (_id, callback) => { const running = queue.catch(() => {}).then(() => callback(data)); queue = running; return running; },
  } };
  delete require.cache[eventsPath]; delete require.cache[runtimePath]; delete require.cache[configPath]; delete require.cache[reviewsPath];
  const events = require(eventsPath);
  events.sendLog = async () => {};
  const runtime = require(runtimePath);
  const dashboard = require(configPath);
  const client = { user: { id: "999999999999999999", tag: "Bot", bot: true }, guilds: { cache: new Collection() }, users: {} };
  const guild = { id: "333333333333333333", name: "Test", client,
    channels: { cache: new Collection() }, roles: { cache: new Collection() }, members: { cache: new Collection() } };
  client.guilds.cache.set(guild.id, guild);
  guild.roles.everyone = { id: guild.id };
  guild.roles.cache.set(guild.id, guild.roles.everyone);
  guild.roles.cache.set(config.staffRoleId, { id: config.staffRoleId });
  guild.roles.fetch = async (id) => guild.roles.cache.get(id) || null;
  guild.members.fetch = async (id) => guild.members.cache.get(id) || null;
  guild.channels.fetch = async (id) => !id ? guild.channels.cache : guild.channels.cache.get(id) || null;
  function member(role = null, permissions = 0n) {
    const user = { id: nextId(), tag: "Membre", bot: false, sent: [], send: async (payload) => { if (user.dmBlocked) throw new Error("DM blocked"); user.sent.push(payload); return payload; } };
    const m = { id: user.id, user, permissions: new PermissionsBitField(permissions), roles: { cache: new Collection(role ? [[role, { id: role }]] : []) } };
    guild.members.cache.set(m.id, m); return m;
  }
  const owner = member();
  const staff = member(config.staffRoleId);
  const manager = member(null, P.Administrator);
  guild.members.me = { id: client.user.id, user: client.user, permissions: new PermissionsBitField(PermissionsBitField.All), roles: { cache: new Collection() } };
  guild.members.cache.set(client.user.id, guild.members.me);
  client.users.fetch = async (id) => guild.members.cache.get(id)?.user || null;
  function channel(name = "salon", type = ChannelType.GuildText) {
    const messages = new Collection();
    const c = { id: nextId(), guild, client, name, type, topic: null, sent: [],
      isTextBased: () => type === 0 || type === 5,
      toString: () => `<#${c.id}>`,
      permissionsFor: (target) => {
        if (target.permissions?.has(P.Administrator)) return new PermissionsBitField(PermissionsBitField.All);
        const overwrite = c.permissionOverwrites.cache.get(target.id);
        const hasRole = [...(target.roles?.cache.keys() || [])].some((id) => c.permissionOverwrites.cache.get(id)?.ViewChannel);
        return new PermissionsBitField(overwrite?.ViewChannel || hasRole ? PermissionsBitField.All : 0n);
      },
      permissionOverwrites: { cache: new Collection(),
        edit: async (id, value, options = {}) => { if (c.failPermissions) throw new Error("Missing permission"); const current = c.permissionOverwrites.cache.get(id) || {}; c.permissionOverwrites.cache.set(id, { ...current, type: options.type ?? current.type, ...value }); },
        delete: async (id) => { c.permissionOverwrites.cache.delete(id); },
      },
      messages: { fetch: async (query) => {
        if (typeof query === "string") return messages.get(query) || null;
        const sorted = [...messages.values()].sort((a, b) => Number(BigInt(b.id) - BigInt(a.id)));
        return new Collection(sorted.filter((m) => !query.before || BigInt(m.id) < BigInt(query.before)).slice(0, query.limit).map((m) => [m.id, m]));
      } },
      send: async (payload) => {
        const p = typeof payload === "string" ? { content: payload } : payload;
        const m = { id: nextId(), author: client.user, content: p.content || "", embeds: (p.embeds || []).map((e) => e.toJSON?.() || e),
          components: p.components || [], createdTimestamp: Date.now(), attachments: new Collection(),
          edit: async (newPayload) => { Object.assign(m, newPayload); return m; } };
        messages.set(m.id, m); c.sent.push(p); return m;
      },
      setName: async (name) => { c.name = name; }, setTopic: async (topic) => { c.topic = topic; },
      delete: async () => { c.deleted = true; guild.channels.cache.delete(c.id); },
    };
    guild.channels.cache.set(c.id, c); return c;
  }
  const category = channel("Tickets", ChannelType.GuildCategory);
  guild.channels.cache.delete(category.id); category.id = config.categoryId; guild.channels.cache.set(category.id, category);
  guild.channels.create = async (options) => {
    const c = channel(options.name, options.type); c.topic = options.topic; c.parentId = options.parent;
    for (const overwrite of options.permissionOverwrites) {
      const value = { type: overwrite.type };
      for (const name of ["ViewChannel", "SendMessages", "ReadMessageHistory", "AttachFiles"]) {
        if (overwrite.allow?.includes(P[name])) value[name] = true;
        if (overwrite.deny?.includes(P[name])) value[name] = false;
      }
      c.permissionOverwrites.cache.set(overwrite.id, value);
    }
    return c;
  };
  const panelChannel = channel("tickets");
  function interaction(actor = owner, c = panelChannel, action = "", values = {}, kind = "command") {
    return { guild, guildId: guild.id, client, channel: c, channelId: c.id, user: actor.user, member: actor,
      memberPermissions: actor.permissions, replies: [],
      customId: kind !== "command" ? action : undefined, values: values.selected || [],
      options: { getSubcommand: () => action, getString: (name) => values[name] ?? null,
        getChannel: (name) => values[name] ?? null, getUser: (name) => values[name] ?? null, getInteger: (name) => values[name] ?? null },
      inCachedGuild: () => true, isButton: () => kind === "button", isStringSelectMenu: () => kind === "select",
      isChannelSelectMenu: () => kind === "channel", isRoleSelectMenu: () => kind === "role", isModalSubmit: () => kind === "modal",
      async deferReply() { this.deferred = true; }, async deferUpdate() { this.deferred = true; },
      async reply(p) { this.replied = true; this.replies.push(p); }, async editReply(p) { this.replies.push(p); },
      async update(p) { this.replies.push(p); }, async followUp(p) { this.replies.push(p); }, async showModal(p) { this.modal = p; },
    };
  }
  const text = (i) => i.replies.map((p) => typeof p === "string" ? p : p.content || "").join("\n");
  const open = async (choiceId = "general") => {
    const i = interaction(owner, panelChannel, `ticket:create:${choiceId}`, {}, "button");
    await runtime.handleTicketInteraction(i);
    const c = guild.channels.cache.find((c) => c.topic?.startsWith(`ticket-owner:${owner.id}:`));
    assert.ok(c, text(i)); return c;
  };
  const action = async (name, c, actor = staff, values = {}) => {
    const i = interaction(actor, c, name, values); await runtime.handleTicketCommand(i); return i;
  };
  return { runtime, dashboard, events, config, client, guild, owner, staff, manager, member, channel, panelChannel, interaction, text, open, action };
}

test("opening is private, persistent and concurrent clicks respect the limit", async () => {
  const f = fixture();
  const interactions = Array.from({ length: 3 }, () => f.interaction(f.owner, f.panelChannel, "ticket:create:general", {}, "button"));
  await Promise.all(interactions.map((i) => f.runtime.handleTicketInteraction(i)));
  const tickets = f.guild.channels.cache.filter((c) => c.topic?.startsWith("ticket-owner:"));
  assert.equal(tickets.size, 1); assert.equal(Object.keys(f.config.entries).length, 1);
  const c = tickets.first();
  assert.equal(c.permissionOverwrites.cache.get(f.guild.id).ViewChannel, false);
  assert.equal(c.permissionOverwrites.cache.get(f.client.user.id).ViewChannel, true);
  assert.equal(interactions.filter((i) => f.text(i).includes("Limite de")).length, 2);
});
test("select-menu openings and per-choice categories/support are honoured", async () => {
  const f = fixture({ interactionType: "SelectMenu" });
  const specialRole = "444444444444444444";
  f.guild.roles.cache.set(specialRole, { id: specialRole });
  const category = f.channel("Technique", ChannelType.GuildCategory);
  f.config.choices = [{ id: "tech", label: "Technique", staffRoleId: specialRole, categoryId: category.id }];
  const i = f.interaction(f.owner, f.panelChannel, "ticket:select", { selected: ["tech"] }, "select");
  await f.runtime.handleTicketInteraction(i);
  const c = f.guild.channels.cache.find((c) => c.topic?.endsWith(":tech"));
  assert.equal(c.parentId, category.id); assert.equal(f.config.entries[c.id].staffRoleId, specialRole);
  assert.equal(c.permissionOverwrites.cache.has(f.config.staffRoleId), false);
});
test("removed panel choices and @everyone support never create a ticket", async () => {
  const f = fixture();
  let i = f.interaction(f.owner, f.panelChannel, "ticket:create:deleted", {}, "button");
  await f.runtime.handleTicketInteraction(i); assert.match(f.text(i), /n'existe plus/);
  f.config.staffRoleId = f.guild.id;
  i = f.interaction(f.owner, f.panelChannel, "ticket:create:general", {}, "button");
  await f.runtime.handleTicketInteraction(i); assert.match(f.text(i), /n'est plus valide/);
  assert.equal(Object.keys(f.config.entries).length, 0);
});
test("claim is persistent, cannot be stolen and does not overwrite ownership", async () => {
  const f = fixture({ claimEnabled: true, claimButtonEnabled: true }); const c = await f.open(); const topic = c.topic;
  await f.action("claim", c); assert.equal(f.config.entries[c.id].claimedBy, f.staff.id); assert.equal(c.topic, topic);
  const other = f.member(f.config.staffRoleId);
  assert.match(f.text(await f.action("claim", c, other)), /déjà pris/);
  assert.match(f.text(await f.action("unclaim", c, other)), /déjà pris/);
  await f.action("unclaim", c); assert.equal(f.config.entries[c.id].claimedBy, null); assert.equal(c.topic, topic);
});
test("auto-claim only accepts a staff message and a still-open unclaimed ticket", async () => {
  const f = fixture({ claimEnabled: true, autoClaimEnabled: true }); const c = await f.open();
  const message = (m) => ({ guild: f.guild, channel: c, author: m.user, member: m });
  assert.equal(await f.runtime.handleTicketMessage(message(f.owner)), false);
  await f.runtime.handleTicketMessage(message(f.staff)); assert.equal(f.config.entries[c.id].claimedBy, f.staff.id);
  assert.equal(await f.runtime.handleTicketMessage(message(f.manager)), false);
});
test("owners cannot claim/add/rename/schedule and ticket actions never touch ModMail", async () => {
  const f = fixture({ claimEnabled: true }); const c = await f.open();
  for (const name of ["claim", "ajouter", "renommer", "autoclose", "supprimer"]) assert.match(f.text(await f.action(name, c, f.owner)), /réservée au support/);
  const mail = f.channel("modmail-test"); mail.topic = `modmail-owner:${f.owner.id}`;
  assert.match(f.text(await f.action("fermer", mail, f.manager)), /pas dans un ModMail/); assert.equal(mail.deleted, undefined);
});
test("add/remove accept multiple users and roles, protecting core participants", async () => {
  const f = fixture(); const c = await f.open(); const extra = f.member(); const role = nextId(); f.guild.roles.cache.set(role, { id: role });
  await f.action("ajouter", c, f.staff, { cibles: `<@${extra.id}> <@&${role}>` });
  assert.deepEqual(f.config.entries[c.id].extraIds, [extra.id, role]);
  for (const id of [f.guild.id, f.client.user.id, f.owner.id, f.config.staffRoleId]) {
    assert.match(f.text(await f.action("retirer", c, f.staff, { cibles: id })), /protégés/);
  }
  await f.action("retirer", c, f.staff, { cibles: `${extra.id} ${role}` }); assert.deepEqual(f.config.entries[c.id].extraIds, []);
  assert.equal(c.permissionOverwrites.cache.has(extra.id), false);
});
test("close sends the creator a transcript, locks writers, and preserves the channel by default", async () => {
  const f = fixture(); const c = await f.open(); const extra = f.member();
  await f.action("ajouter", c, f.staff, { cibles: extra.id }); await c.send("Message de test.");
  await f.action("fermer", c, f.owner);
  assert.equal(f.config.entries[c.id].state, "closed"); assert.equal(c.deleted, undefined);
  assert.equal(c.permissionOverwrites.cache.get(f.owner.id).SendMessages, false);
  assert.equal(c.permissionOverwrites.cache.get(extra.id).SendMessages, false);
  assert.match(f.owner.user.sent[0].files[0].attachment.toString(), /Message de test/);
  assert.equal(f.config.entries[c.id].deleteAt, null);
});
test("disabled owner closure is enforced for legacy close buttons too", async () => {
  const f = fixture({ allowUserClose: false }); const c = await f.open();
  const i = f.interaction(f.owner, c, "ticket:close", {}, "button"); await f.runtime.handleTicketInteraction(i);
  assert.match(f.text(i), /réservée au support/); assert.equal(f.config.entries[c.id].state, "open");
});
test("reopening cancels auto-deletion and restores participants' writing rights", async () => {
  const f = fixture({ autoDeleteClosed: true }); const c = await f.open();
  await f.action("fermer", c); assert.ok(f.config.entries[c.id].deleteAt);
  await f.action("rouvrir", c); assert.equal(f.config.entries[c.id].deleteAt, null);
  assert.equal(c.permissionOverwrites.cache.get(f.owner.id).SendMessages, true);
  await f.runtime.runTicketMaintenance(f.client, Date.now() + 60000); assert.equal(c.deleted, undefined);
});
test("blocked DMs or disabled exports prevent automatic deletion", async () => {
  for (const transcriptDmEnabled of [true, false]) {
    const f = fixture({ autoDeleteClosed: true, transcriptDmEnabled }); const c = await f.open(); f.owner.user.dmBlocked = true;
    await f.action("fermer", c); assert.equal(f.config.entries[c.id].deleteAt, null);
    await f.runtime.runTicketMaintenance(f.client, Date.now() + 60000); assert.equal(c.deleted, undefined);
  }
});
test("an archive cannot be public or be the ticket itself", async () => {
  const f = fixture({ autoDeleteClosed: true, transcriptDmEnabled: false }); const c = await f.open();
  f.config.transcriptChannelId = c.id; await f.action("fermer", c);
  assert.equal(f.config.entries[c.id].deleteAt, null); assert.match(f.config.entries[c.id].transcript.staff, /identique/);
  await f.action("rouvrir", c);
  const archive = f.channel("public"); archive.permissionOverwrites.cache.set(f.guild.id, { ViewChannel: true });
  f.config.transcriptChannelId = archive.id; await f.action("fermer", c);
  assert.equal(archive.sent.length, 0); assert.equal(f.config.entries[c.id].deleteAt, null);
});
test("private staff archive permits auto-deletion even when DMs are blocked", async () => {
  const f = fixture({ autoDeleteClosed: true }); const c = await f.open(); f.owner.user.dmBlocked = true;
  const archive = f.channel("archives-privees"); f.config.transcriptChannelId = archive.id;
  await f.action("fermer", c); assert.equal(archive.sent.length, 1);
  await f.runtime.runTicketMaintenance(f.client, Date.now() + 60000); assert.equal(c.deleted, true); assert.equal(f.config.entries[c.id], undefined);
});
test("autoclose survives module reloads and uses normal transcript closure", async () => {
  const f = fixture(); const c = await f.open();
  await f.action("autoclose", c, f.staff, { duree: "30m" }); const due = f.config.entries[c.id].autoCloseAt;
  delete require.cache[runtimePath]; const reloaded = require(runtimePath);
  await reloaded.runTicketMaintenance(f.client, due + 1);
  assert.equal(f.config.entries[c.id].state, "closed"); assert.equal(f.owner.user.sent.length, 1);
});
test("autoclose can be cancelled and rejects invalid or excessive durations", async () => {
  const f = fixture(); const c = await f.open();
  for (const duree of ["0s", "1s", "31d", "abc", "-1h"]) assert.match(f.text(await f.action("autoclose", c, f.staff, { duree })), /10s à 30d/);
  await f.action("autoclose", c, f.staff, { duree: "1h" }); await f.action("autoclose", c, f.staff, { duree: "annuler" });
  assert.equal(f.config.entries[c.id].autoCloseAt, null);
});
test("manual deletion requires a closed ticket and an author-bound current confirmation", async () => {
  const f = fixture(); const c = await f.open();
  assert.match(f.text(await f.action("supprimer", c)), /Ferme d'abord/);
  await f.action("fermer", c); const prompt = await f.action("supprimer", c);
  const id = prompt.replies.at(-1).components[0].toJSON().components[0].custom_id;
  const wrong = f.interaction(f.manager, c, id, {}, "button"); await f.runtime.handleTicketInteraction(wrong);
  assert.equal(c.deleted, undefined); assert.match(f.text(wrong), /réservée à son auteur/);
  const correct = f.interaction(f.staff, c, id, {}, "button"); await f.runtime.handleTicketInteraction(correct);
  assert.equal(c.deleted, true);
});
test("rename preserves ownership, reminder is rate-limited, transcript stays scoped", async () => {
  const f = fixture(); const c = await f.open(); const original = c.topic;
  await f.action("renommer", c, f.staff, { nom: "Aide technique" }); assert.equal(c.name, "aide-technique"); assert.equal(c.topic, original);
  await f.action("rappel", c); assert.match(f.text(await f.action("rappel", c)), /Attends une minute/);
  const outsider = f.member(); assert.match(f.text(await f.action("transcript", c, outsider)), /pas accès/);
  await f.action("transcript", c, f.owner); assert.equal(f.owner.user.sent.length, 1);
});
test("panel republishing updates its saved message and stays within component limits", async () => {
  const f = fixture();
  const panel = await f.runtime.publishTicketPanel(f.guild, f.panelChannel);
  f.config.interactionType = "SelectMenu";
  f.config.choices = Array.from({ length: 25 }, (_, i) => ({ id: `option-${i}`, label: `Option ${i}`, order: 25-i, style: 3 }));
  const again = await f.runtime.publishTicketPanel(f.guild, f.panelChannel);
  assert.equal(again.id, panel.id); assert.equal(f.panelChannel.sent.length, 1);
  const select = again.components[0].toJSON().components[0]; assert.equal(select.type, 3); assert.equal(select.options.length, 25);
  assert.equal(select.options[0].value, "option-24");
  f.config.interactionType = "Buttons"; const buttons = f.events.ticketButtons(f.config); assert.equal(buttons.length, 5); assert.equal(buttons[0].toJSON().components[0].style, 3);
});
test("dashboard exposes both menus and protects configuration from non-managers", async () => {
  const f = fixture(); const components = f.dashboard.dashboardPayload(f.config).components.map((r) => r.toJSON());
  assert.deepEqual(components.map((r) => r.components[0].custom_id), ["ticket-config:settings-menu", "ticket-config:choices-menu"]);
  const denied = f.interaction(f.staff, f.panelChannel, "ticket-config:settings-menu", { selected: ["toggle-type"] }, "select");
  await f.dashboard.handleTicketConfigInteraction(denied); assert.match(f.text(denied), /Gérer le serveur/); assert.equal(f.config.interactionType, "Buttons");
  const allowed = f.interaction(f.manager, f.panelChannel, "ticket-config:settings-menu", { selected: ["toggle-type"] }, "select");
  await f.dashboard.handleTicketConfigInteraction(allowed); assert.equal(f.config.interactionType, "SelectMenu");
});
test("config choice details persist separately and reject @everyone", async () => {
  const f = fixture({ choices: [{ id: "tech", label: "Technique", order: 1 }] });
  const role = nextId(); f.guild.roles.cache.set(role, { id: role });
  let i = f.interaction(f.manager, f.panelChannel, "ticket-config:choice-role:tech", { selected: [role] }, "role");
  await f.dashboard.handleTicketConfigInteraction(i); assert.equal(f.config.choices[0].staffRoleId, role);
  i = f.interaction(f.manager, f.panelChannel, "ticket-config:choice-role:tech", { selected: [f.guild.id] }, "role");
  await f.dashboard.handleTicketConfigInteraction(i); assert.match(f.text(i), /@everyone/); assert.equal(f.config.choices[0].staffRoleId, role);
  i = f.interaction(f.manager, f.panelChannel, "ticket-config:choice-style:tech", { selected: ["4"] }, "select");
  await f.dashboard.handleTicketConfigInteraction(i); assert.equal(f.config.choices[0].style, 4);
});
test("auto-delete and option reset require an extra confirmation", async () => {
  const f = fixture({ choices: [{ id: "tech", label: "Technique" }] });
  const enable = f.interaction(f.manager, f.panelChannel, "ticket-config:settings-menu", { selected: ["toggle-auto-delete"] }, "select");
  await f.dashboard.handleTicketConfigInteraction(enable); assert.equal(f.config.autoDeleteClosed, false);
  const confirm = f.interaction(f.manager, f.panelChannel, "ticket-config:confirm-auto-delete", {}, "button");
  await f.dashboard.handleTicketConfigInteraction(confirm); assert.equal(f.config.autoDeleteClosed, true);
  const reset = f.interaction(f.manager, f.panelChannel, "ticket-config:choices-menu", { selected: ["reset-choices"] }, "select");
  await f.dashboard.handleTicketConfigInteraction(reset); assert.equal(f.config.choices.length, 1);
});

test("truncated transcripts are marked and prevent auto-deletion", async () => {
  const f = fixture({ autoDeleteClosed: true }); const c = await f.open();
  for (let index = 0; index < 1005; index++) await c.send(`Message ${index}`);
  await f.action("fermer", c);
  assert.equal(f.config.entries[c.id].transcript.incomplete, true);
  assert.equal(f.config.entries[c.id].deleteAt, null);
  const transcript = f.owner.user.sent[0].files[0].attachment.toString();
  assert.match(transcript, /Limite atteinte/); assert.match(transcript, /Message 1004/);
});
test("legacy ticket markers migrate on action while arbitrary IDs never qualify", async () => {
  const f = fixture({ claimEnabled: true }); const c = await f.open(); delete f.config.entries[c.id];
  await f.action("claim", c); assert.equal(f.config.entries[c.id].ownerId, f.owner.id);
  const foreign = f.channel("ticket-other-bot"); foreign.topic = f.owner.id;
  assert.equal(f.runtime.ticketFrom(foreign, f.config), null);
});
test("the former default support role cannot manage a per-choice ticket", async () => {
  const f = fixture({ claimEnabled: true }); const specific = nextId(); f.guild.roles.cache.set(specific, { id: specific });
  f.config.choices = [{ id: "private", label: "Privé", staffRoleId: specific }];
  const c = await f.open("private"); const specificStaff = f.member(specific);
  assert.match(f.text(await f.action("claim", c, f.staff)), /pas accès/);
  await f.action("claim", c, specificStaff); assert.equal(f.config.entries[c.id].claimedBy, specificStaff.id);
});
test("disabling auto-delete cancels scheduled deletions instead of removing channels", async () => {
  const f = fixture({ autoDeleteClosed: true }); const c = await f.open();
  await f.action("fermer", c); f.config.autoDeleteClosed = false;
  await f.runtime.runTicketMaintenance(f.client, Date.now() + 60000);
  assert.equal(c.deleted, undefined); assert.equal(f.config.entries[c.id].deleteAt, null);
});

test("closeall requires administrator approval and closes only its original ticket snapshot", async () => {
  const f = fixture({ maxOpenTicketsPerUser: 3 }); const first = await f.open(); await f.open();
  const originals = [...f.guild.channels.cache.values()].filter((c) => c.topic?.startsWith("ticket-owner:"));
  const other = f.channel("ticket-not-ours"); other.topic = f.owner.id;
  const modmail = f.channel("modmail-test"); modmail.topic = `modmail-owner:${f.owner.id}`;
  assert.match(f.text(await f.action("closeall", f.panelChannel, f.staff)), /Administrateur/);
  const prompt = await f.action("closeall", f.panelChannel, f.manager, { raison: "Fin du support" });
  assert.equal(f.config.entries[first.id].state, "open");
  const confirmId = prompt.replies.at(-1).components[0].toJSON().components[0].custom_id;
  const stranger = f.member(null, P.Administrator);
  const invalid = f.interaction(stranger, f.panelChannel, confirmId, {}, "button");
  await f.runtime.handleTicketInteraction(invalid); assert.match(f.text(invalid), /réservée à son auteur/);
  await f.open();
  const latest = [...f.guild.channels.cache.values()].find((c) => c.topic?.startsWith("ticket-owner:") && !originals.includes(c));
  const confirm = f.interaction(f.manager, f.panelChannel, confirmId, {}, "button");
  await f.runtime.handleTicketInteraction(confirm);
  assert.match(f.text(confirm), /2 fermé\(s\)/);
  for (const c of originals) { assert.equal(f.config.entries[c.id].state, "closed"); assert.equal(f.config.entries[c.id].closeReason, "Fin du support"); }
  assert.equal(f.config.entries[latest.id].state, "open"); assert.equal(other.deleted, undefined); assert.equal(modmail.deleted, undefined);
  assert.equal(f.owner.user.sent.length, 2);
  const replay = f.interaction(f.manager, f.panelChannel, confirmId, {}, "button");
  await f.runtime.handleTicketInteraction(replay); assert.match(f.text(replay), /expiré ou a déjà/);
});
test("bulk cancellation, expiry, wrong guild and lost permissions cannot close tickets", async () => {
  const f = fixture(); const c = await f.open();
  const prompt = await f.action("closeall", f.panelChannel, f.manager);
  const buttons = prompt.replies.at(-1).components[0].toJSON().components;
  const wrongGuild = f.interaction(f.manager, f.panelChannel, buttons[0].custom_id, {}, "button");
  wrongGuild.guild = { ...f.guild, id: "444444444444444444" };
  await f.runtime.handleTicketInteraction(wrongGuild); assert.match(f.text(wrongGuild), /serveur concerné/);
  f.manager.permissions = new PermissionsBitField(P.ManageChannels);
  const revoked = f.interaction(f.manager, f.panelChannel, buttons[0].custom_id, {}, "button");
  await f.runtime.handleTicketInteraction(revoked); assert.match(f.text(revoked), /Administrateur/);
  f.manager.permissions = new PermissionsBitField(P.Administrator);
  const cancel = f.interaction(f.manager, f.panelChannel, buttons[1].custom_id, {}, "button");
  await f.runtime.handleTicketInteraction(cancel); assert.equal(f.config.entries[c.id].state, "open");
  const another = await f.action("closeall", f.panelChannel, f.manager);
  const id = another.replies.at(-1).components[0].toJSON().components[0].custom_id;
  const originalNow = Date.now;
  try {
    const future = originalNow() + 121000; Date.now = () => future;
    const expired = f.interaction(f.manager, f.panelChannel, id, {}, "button");
    await f.runtime.handleTicketInteraction(expired); assert.match(f.text(expired), /expiré/);
  } finally { Date.now = originalNow; }
  assert.equal(f.config.entries[c.id].state, "open");
});
test("a bulk error does not prevent other closures and reopened tickets are excluded", async () => {
  const f = fixture({ maxOpenTicketsPerUser: 3 }); await f.open(); await f.open(); await f.open();
  const [first, second, third] = [...f.guild.channels.cache.values()].filter((c) => c.topic?.startsWith("ticket-owner:"));
  const prompt = await f.action("closeall", f.panelChannel, f.manager);
  const id = prompt.replies.at(-1).components[0].toJSON().components[0].custom_id;
  first.failPermissions = true;
  await f.action("fermer", second); await f.action("rouvrir", second);
  f.config.entries[second.id].reopenedAt = Date.now() + 1;
  const confirm = f.interaction(f.manager, f.panelChannel, id, {}, "button");
  await f.runtime.handleTicketInteraction(confirm);
  assert.match(f.text(confirm), /1 fermé\(s\).*1 ignoré\(s\).*1 échec\(s\)/);
  assert.equal(f.config.entries[first.id].state, "open"); assert.equal(f.config.entries[second.id].state, "open"); assert.equal(f.config.entries[third.id].state, "closed");
});
test("transcripts and reminders may target another ticket but never leak to the invoking channel", async () => {
  const f = fixture(); const c = await f.open(); await c.send("Contenu privé du ticket"); f.staff.user.dmBlocked = true;
  const transcript = f.interaction(f.staff, f.panelChannel, "transcript", { salon: c }); transcript.isPrefixCommand = true;
  await f.runtime.handleTicketCommand(transcript);
  assert.equal(f.panelChannel.sent.length, 0); assert.match(f.text(transcript), /déposé dans le ticket privé/);
  assert.ok(c.sent.at(-1).files); assert.equal(transcript.replies.some((p) => p.files), false);
  await f.action("rappel", f.panelChannel, f.staff, { salon: c }); assert.match(c.sent.at(-1).content, /support attend/);
  const outsider = f.member(); assert.match(f.text(await f.action("transcript", f.panelChannel, outsider, { salon: c })), /pas accès/);
  const foreign = { ...c, guild: { ...f.guild, id: "444444444444444444" } };
  assert.match(f.text(await f.action("transcript", f.panelChannel, f.manager, { salon: foreign })), /de ce serveur/);
  const modmail = f.channel("modmail"); modmail.topic = `modmail-owner:${f.owner.id}`;
  assert.match(f.text(await f.action("transcript", f.panelChannel, f.manager, { salon: modmail })), /pas dans un ModMail/);
});
test("a public ticket never receives a prefix transcript fallback", async () => {
  const f = fixture(); const c = await f.open(); f.staff.user.dmBlocked = true;
  c.permissionOverwrites.cache.set(f.guild.id, { ViewChannel: true });
  const i = f.interaction(f.staff, f.panelChannel, "transcript", { salon: c }); i.isPrefixCommand = true;
  await f.runtime.handleTicketCommand(i); assert.match(f.text(i), /réponse privée/); assert.equal(c.sent.some((p) => p.files), false);
});
test("autoclose keeps its reason after reload and includes it in the closure message", async () => {
  const f = fixture(); const c = await f.open();
  await f.action("autoclose", c, f.staff, { duree: "1h", raison: "Demande résolue" });
  delete require.cache[runtimePath]; const reloaded = require(runtimePath);
  await reloaded.runTicketMaintenance(f.client, f.config.entries[c.id].autoCloseAt + 1);
  assert.equal(f.config.entries[c.id].closeReason, "Demande résolue");
  assert.ok(c.sent.some((p) => p.content?.includes("Raison : Demande résolue")));
});
test("add/remove resolve exact cached names and refuse ambiguous names", async () => {
  const f = fixture(); const c = await f.open(); const user = f.member(); user.user.username = "Alice";
  const roleId = nextId(); f.guild.roles.cache.set(roleId, { id: roleId, name: "Equipe technique" });
  await f.action("ajouter", c, f.staff, { cibles: "Alice, Equipe technique" });
  assert.deepEqual(f.config.entries[c.id].extraIds, [user.id, roleId]);
  await f.action("retirer", c, f.staff, { cibles: "Equipe technique" });
  assert.deepEqual(f.config.entries[c.id].extraIds, [user.id]);
  const duplicate = f.member(); duplicate.user.username = "Alice";
  assert.match(f.text(await f.action("retirer", c, f.staff, { cibles: "Alice" })), /Nom ambigu/);
});

async function ratedTicketFixture() {
  const f = fixture({ claimEnabled: true }); const c = await f.open();
  await f.action("claim", c); await f.action("fermer", c);
  return { ...f, c, reviewId: f.config.entries[c.id].reviewId };
}
test("only the creator can submit one real review and stars computes the average", async () => {
  const f = await ratedTicketFixture();
  assert.ok(f.reviewId); assert.equal(f.owner.user.sent.length, 2);
  assert.match(f.text(await f.action("noter", f.c, f.staff, { note: 5 })), /Seul le créateur/);
  assert.match(f.text(await f.action("noter", f.c, f.owner, { note: 6 })), /entre 1 et 5/);
  await f.action("noter", f.c, f.owner, { note: 4, commentaire: "Très bon suivi" });
  const review = f.config.reviews[f.reviewId]; assert.equal(review.score, 4); assert.equal(review.staffId, f.staff.id);
  assert.match(f.text(await f.action("noter", f.c, f.owner, { note: 1 })), /déjà donné une note/);
  const stats = await f.action("stars", f.panelChannel, f.staff, { utilisateur: f.staff.user });
  const embed = stats.replies.at(-1).embeds[0].toJSON(); assert.match(embed.description, /4.0\/5.*1 avis/); assert.equal(embed.fields[0].value, "Très bon suivi");
});
test("DM rating buttons survive restart and deletion, but reject other users and servers", async () => {
  const f = await ratedTicketFixture(); const payload = f.owner.user.sent.at(-1);
  const customId = payload.components[0].toJSON().components[4].custom_id;
  const impostor = f.interaction(f.staff, f.panelChannel, customId, {}, "button"); impostor.guild = null; impostor.member = null;
  await f.runtime.handleTicketInteraction(impostor); assert.match(f.text(impostor), /réservée au créateur/);
  const wrongServer = f.interaction(f.owner, f.panelChannel, customId, {}, "button"); wrongServer.guild = { id: "444444444444444444" };
  await f.runtime.handleTicketInteraction(wrongServer); assert.match(f.text(wrongServer), /pas ce serveur/);
  delete f.config.entries[f.c.id]; await f.c.delete();
  delete require.cache[runtimePath]; delete require.cache[reviewsPath]; const reloaded = require(runtimePath);
  const dm = f.interaction(f.owner, f.panelChannel, customId, {}, "button"); dm.guild = null; dm.member = null;
  await reloaded.handleTicketInteraction(dm); assert.equal(f.config.reviews[f.reviewId].score, 5);
  assert.match(f.text(dm), /note a été enregistrée/);
  const replay = f.interaction(f.owner, f.panelChannel, customId, {}, "button"); replay.guild = null; replay.member = null;
  await reloaded.handleTicketInteraction(replay); assert.match(f.text(replay), /déjà donné une note/);
});
test("reopening invalidates pending notes and a ticket can receive at most one completed review", async () => {
  const f = await ratedTicketFixture(); const id = f.owner.user.sent.at(-1).components[0].toJSON().components[0].custom_id;
  await f.action("rouvrir", f.c); assert.equal(f.config.reviews[f.reviewId], undefined);
  const invalid = f.interaction(f.owner, f.c, id, {}, "button"); await f.runtime.handleTicketInteraction(invalid); assert.match(f.text(invalid), /plus valide/);
  await f.action("fermer", f.c); await f.action("noter", f.c, f.owner, { note: 5 });
  await f.action("rouvrir", f.c); await f.action("fermer", f.c);
  assert.equal(f.config.entries[f.c.id].reviewId, null);
  assert.equal(Object.values(f.config.reviews).filter((r) => r.submittedAt).length, 1);
});
test("expired, self-claimed and unclaimed tickets do not generate usable ratings", async () => {
  const f = await ratedTicketFixture(); f.config.reviews[f.reviewId].expiresAt = Date.now() - 1;
  assert.match(f.text(await f.action("noter", f.c, f.owner, { note: 5 })), /délai de 7 jours/);
  const plain = fixture(); const c = await plain.open(); await plain.action("fermer", c);
  assert.equal(plain.config.entries[c.id].reviewId, null);
  const own = fixture({ claimEnabled: true }); const ownChannel = await own.open(); own.owner.permissions = new PermissionsBitField(P.Administrator);
  await own.action("claim", ownChannel, own.owner); await own.action("fermer", ownChannel);
  assert.equal(own.config.entries[ownChannel.id].reviewId, null);
});
test("concurrent votes are counted once and private comments never appear in prefix reports", async () => {
  const f = await ratedTicketFixture();
  const one = f.interaction(f.owner, f.c, "noter", { note: 5, commentaire: "Information privée" });
  const two = f.interaction(f.owner, f.c, "noter", { note: 1 });
  await Promise.all([f.runtime.handleTicketCommand(one), f.runtime.handleTicketCommand(two)]);
  assert.equal(f.config.reviews[f.reviewId].score, 5); assert.match(f.text(two), /déjà donné/);
  const report = f.interaction(f.staff, f.panelChannel, "stars"); report.isPrefixCommand = true;
  await f.runtime.handleTicketCommand(report);
  assert.equal(report.replies.at(-1).embeds[0].toJSON().fields, undefined);
  const outsider = f.member();
  const publicReport = await f.action("stars", f.panelChannel, outsider, { utilisateur: f.staff.user });
  assert.equal(publicReport.replies.at(-1).embeds[0].toJSON().fields, undefined);
});
