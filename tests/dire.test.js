const assert = require("node:assert/strict");
const { test } = require("node:test");
const { Collection, PermissionsBitField, PermissionFlagsBits: P, TextInputStyle, MessageFlags } = require("discord.js");
const storePath = require.resolve("../src/persistence/guild-store");
const legacyPath = require.resolve("../src/modules/legacy-features");

// The outbound payload is inspected without sending messages or reading the real store.
const EXAMPLE = "Bonjour à tous !\n\nBienvenue sur Chill Hub.\n\n📢 N'oubliez pas de lire le règlement.";
const CASES = [
  EXAMPLE,
  "\n  Espaces  conservés\n\n\n\tUne tabulation\nDernière ligne  \n",
  "**gras**\n*italique*\n__souligné__\n> citation\n> deuxième ligne",
  "- premier\n  - sous-élément\n\n1. étape une\n2. étape deux",
  "```js\nconst texte = 'C:\\dossier\\fichier';\n  console.log(texte);\n```\n\nAprès le code.",
  "🌊 👩🏽‍💻 ❤️ 🙂\n\n<:custom:123456789012345678>",
  "Première\r\n\r\nDeuxième\rTroisième\nFin",
  "Un littéral \\n reste un littéral.\nUn vrai retour reste un retour.",
  "@everyone <@123456789012345678> <@&223456789012345678>\n**Sans ping automatique**",
];

function fixture() {
  const access = { whitelistEnabled: false, whitelistUserIds: [], ownerUserIds: [] };
  require.cache[storePath] = { id: storePath, filename: storePath, loaded: true, exports: {
    readGuild: async () => ({ access }),
  } };
  delete require.cache[legacyPath];
  const handlers = require(legacyPath);
  const user = { id: "333333333333333333", tag: "Auteur#0001" };
  const actor = { id: user.id, user, permissions: new PermissionsBitField(P.ManageMessages), roles: { cache: new Collection() } };
  const bot = { id: "999999999999999999" };
  const client = { application: { fetch: async () => ({ owner: { id: "888888888888888888" } }) } };
  const guild = { id: "111111111111111111", ownerId: "777777777777777777", client,
    members: { me: bot, cache: new Collection([[actor.id, actor]]), fetch: async () => actor },
    channels: { cache: new Collection() } };
  guild.channels.fetch = async (id) => guild.channels.cache.get(id) || null;
  function makeChannel(id) {
    const channel = { id, guild, sent: [], actorBits: P.ViewChannel | P.SendMessages | P.EmbedLinks,
      botBits: P.ViewChannel | P.SendMessages | P.EmbedLinks,
      isTextBased: () => true, toString: () => `<#${id}>`,
      permissionsFor: (member) => new PermissionsBitField(member.id === bot.id ? channel.botBits : channel.actorBits),
      send: async (payload) => { channel.sent.push(payload); return payload; },
    };
    guild.channels.cache.set(id, channel); return channel;
  }
  const channel = makeChannel("222222222222222222");
  const destination = makeChannel("444444444444444444");
  function command(content = null, target = null, asEmbed = false) {
    return { commandName: "dire", guild, guildId: guild.id, channel, client, user, member: actor,
      replies: [], deferred: false, isPrefixCommand: false,
      options: { getString: () => content, getChannel: () => target, getBoolean: () => asEmbed },
      isModalSubmit: () => false,
      async reply(payload) { this.replies.push(payload); },
      async deferReply(payload) { this.deferred = true; this.deferPayload = payload; },
      async editReply(payload) { this.replies.push(payload); },
      async showModal(modal) { this.modal = modal; },
    };
  }
  function submission(open, content) {
    return { ...command(), commandName: undefined,
      customId: open.modal.toJSON().custom_id, isModalSubmit: () => true,
      fields: { getTextInputValue: (name) => { assert.equal(name, "contenu"); return content; } },
    };
  }
  return { handlers, access, actor, user, guild, channel, destination, command, submission };
}

test("/dire always opens a Paragraph modal and sends its exact submitted value", async () => {
  const f = fixture();
  for (const content of CASES) {
    const sentBeforeOpen = f.channel.sent.length;
    const open = f.command(content);
    assert.equal(await f.handlers.handleLegacyCommand(open), true);
    const input = open.modal.toJSON().components[0].components[0];
    assert.equal(input.style, TextInputStyle.Paragraph);
    assert.equal(input.value, content);
    assert.equal(f.channel.sent.length, sentBeforeOpen);
    const i = f.submission(open, content);
    assert.equal(await f.handlers.handleSayModal(i), true);
    assert.equal(f.channel.sent.at(-1).content, content);
    assert.deepEqual(f.channel.sent.at(-1).allowedMentions, { parse: [] });
    assert.equal(i.deferPayload.flags, MessageFlags.Ephemeral);
    assert.match(i.replies.at(-1).content, /Message envoyé/);
  }
});
test("embed descriptions keep identical whitespace, emojis, lists and code blocks", async () => {
  const f = fixture();
  for (const content of CASES) {
    const open = f.command(content, f.destination, true);
    await f.handlers.handleLegacyCommand(open);
    await f.handlers.handleSayModal(f.submission(open, content));
    const payload = f.destination.sent.at(-1);
    const embed = payload.embeds[0].toJSON();
    assert.equal(embed.description, content); assert.equal(embed.footer.text, `Publié par ${f.user.tag}`);
    assert.equal(embed.color, 0x5865f2); assert.ok(embed.timestamp);
    assert.deepEqual(payload.allowedMentions, { parse: [] });
  }
  assert.equal(f.channel.sent.length, 0);
});
test("omitting contenu opens an empty Paragraph modal without sending or deferring a message", async () => {
  const f = fixture(); const i = f.command(null, f.destination, true);
  await f.handlers.handleLegacyCommand(i);
  const modal = i.modal.toJSON(); const input = modal.components[0].components[0];
  assert.match(modal.custom_id, /^dire:compose:/); assert.equal(input.style, TextInputStyle.Paragraph);
  assert.equal(input.custom_id, "contenu"); assert.equal(input.max_length, 2000);
  assert.equal(input.value, undefined);
  assert.equal(i.deferred, false); assert.equal(f.channel.sent.length + f.destination.sent.length, 0);
});
test("modal submission preserves every character and the original destination/embed choices", async () => {
  const f = fixture();
  for (const asEmbed of [false, true]) {
    for (const content of CASES) {
      const open = f.command(null, f.destination, asEmbed); await f.handlers.handleLegacyCommand(open);
      const submit = f.submission(open, content);
      assert.equal(await f.handlers.handleSayModal(submit), true);
      const payload = f.destination.sent.at(-1);
      assert.equal(asEmbed ? payload.embeds[0].toJSON().description : payload.content, content);
      assert.deepEqual(payload.allowedMentions, { parse: [] });
    }
  }
  assert.equal(f.channel.sent.length, 0);
});
test("forms cannot be submitted by another user, in another guild, or twice", async () => {
  const f = fixture(); const open = f.command(); await f.handlers.handleLegacyCommand(open);
  const impostor = f.submission(open, EXAMPLE); impostor.user = { id: "666666666666666666" };
  await f.handlers.handleSayModal(impostor); assert.equal(f.channel.sent.length, 0);
  const wrongGuild = f.submission(open, EXAMPLE); wrongGuild.guild = { id: "555555555555555555" };
  await f.handlers.handleSayModal(wrongGuild); assert.equal(f.channel.sent.length, 0);
  const valid = f.submission(open, EXAMPLE); await f.handlers.handleSayModal(valid);
  const duplicate = f.submission(open, EXAMPLE); await f.handlers.handleSayModal(duplicate);
  assert.equal(f.channel.sent.length, 1); assert.match(duplicate.replies[0].content, /expiré ou ne t'appartient/);
});
test("expired forms send no message", async () => {
  const f = fixture(); const open = f.command(); await f.handlers.handleLegacyCommand(open);
  const now = Date.now;
  try {
    const future = now() + 16 * 60000; Date.now = () => future;
    const submit = f.submission(open, EXAMPLE); await f.handlers.handleSayModal(submit);
    assert.match(submit.replies[0].content, /expiré/); assert.equal(f.channel.sent.length, 0);
  } finally { Date.now = now; }
});
test("ManageMessages and destination permissions are still required", async () => {
  const f = fixture(); f.actor.permissions = new PermissionsBitField(0n);
  const denied = f.command(EXAMPLE); await f.handlers.handleLegacyCommand(denied);
  assert.equal(f.channel.sent.length, 0); assert.match(denied.replies[0].content, /permission nécessaire/);
  f.actor.permissions = new PermissionsBitField(P.ManageMessages);
  f.destination.actorBits = P.ViewChannel;
  const noSend = f.command(EXAMPLE, f.destination); await f.handlers.handleLegacyCommand(noSend);
  assert.equal(f.destination.sent.length, 0); assert.match(noSend.replies[0].content, /pouvoir voir/);
  f.destination.actorBits = P.ViewChannel | P.SendMessages | P.EmbedLinks;
  f.destination.botBits = P.ViewChannel | P.SendMessages;
  const noEmbed = f.command(EXAMPLE, f.destination, true); await f.handlers.handleLegacyCommand(noEmbed);
  assert.equal(f.destination.sent.length, 0); assert.match(noEmbed.replies[0].content, /permissions nécessaires/);
});
test("permissions, whitelist and channel existence are checked again on submit", async () => {
  for (const change of ["role", "destination", "bot", "deleted", "whitelist"]) {
    const f = fixture(); const open = f.command(null, f.destination); await f.handlers.handleLegacyCommand(open);
    if (change === "role") f.actor.permissions = new PermissionsBitField(0n);
    if (change === "destination") f.destination.actorBits = 0n;
    if (change === "bot") f.destination.botBits = 0n;
    if (change === "deleted") f.guild.channels.cache.delete(f.destination.id);
    if (change === "whitelist") f.access.whitelistEnabled = true;
    await f.handlers.handleSayModal(f.submission(open, EXAMPLE));
    assert.equal(f.destination.sent.length, 0, change);
  }
});
test("2,000-character limit stays unchanged and does not silently truncate", async () => {
  const f = fixture(); const maximum = "a".repeat(1997) + "\n\nZ";
  const open = f.command(maximum); await f.handlers.handleLegacyCommand(open);
  await f.handlers.handleSayModal(f.submission(open, maximum));
  assert.equal(f.channel.sent.at(-1).content, maximum);
  for (const value of ["", "b".repeat(2001)]) {
    const open = f.command(); await f.handlers.handleLegacyCommand(open);
    const submit = f.submission(open, value); await f.handlers.handleSayModal(submit);
    assert.match(submit.replies.at(-1).content, /entre 1 et 2 000/);
  }
  assert.equal(f.channel.sent.length, 1);
});
test("+dire keeps direct sending while preserving real newlines", async () => {
  const f = fixture();
  for (const content of CASES) {
    const i = f.command(content); i.isPrefixCommand = true;
    await f.handlers.handleLegacyCommand(i);
    assert.equal(f.channel.sent.at(-1).content, content);
    assert.equal(i.modal, undefined);
  }
});
test("prefix invocation without text explains the multiline slash entry point", async () => {
  const f = fixture(); const i = f.command(); i.isPrefixCommand = true;
  await f.handlers.handleLegacyCommand(i);
  assert.match(i.replies[0].content, /saisie multiligne/); assert.equal(i.modal, undefined); assert.equal(f.channel.sent.length, 0);
});
test("unrelated modal IDs are ignored", async () => {
  const f = fixture(); const i = f.command(); i.isModalSubmit = () => true; i.customId = "ticket-config:appearance-modal";
  assert.equal(await f.handlers.handleSayModal(i), false); assert.equal(i.replies.length, 0);
});
