const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  Collection,
  MessageFlags,
  PermissionFlagsBits: P,
  PermissionsBitField,
  TextInputStyle,
} = require("discord.js");

const storePath = require.resolve("../src/persistence/guild-store");
const advancedPath = require.resolve("../src/modules/advanced-features");

const CASES = [
  "Bonjour à tous !\n\nBienvenue sur Chill Hub.\n\n📢 N'oubliez pas de lire le règlement.",
  "\n  Espaces conservés  \n\n\n- premier\n  - sous-élément\nDernière ligne  \n",
  "**gras**\n*italique*\n> citation\n```js\nconsole.log('test');\n```\n🌊",
  "Première\r\n\r\nDeuxième\rTroisième\nFin",
];

function fixture() {
  require.cache[storePath] = {
    id: storePath,
    filename: storePath,
    loaded: true,
    exports: {
      readGuild: async () => ({ announcements: [] }),
      mutateGuild: async () => {},
    },
  };
  delete require.cache[advancedPath];
  const handlers = require(advancedPath);
  const user = { id: "333333333333333333", tag: "Auteur#0001" };
  const member = {
    id: user.id,
    permissions: new PermissionsBitField(P.ManageMessages),
  };
  const bot = { id: "999999999999999999" };
  const channel = {
    id: "222222222222222222",
    sent: [],
    isTextBased: () => true,
    toString: () => "<#222222222222222222>",
    permissionsFor: () => new PermissionsBitField(P.ViewChannel | P.SendMessages | P.EmbedLinks),
    async send(payload) { this.sent.push(payload); return payload; },
  };
  const guild = {
    id: "111111111111111111",
    channels: { cache: new Collection([[channel.id, channel]]), fetch: async () => channel },
    members: { me: bot },
  };
  const client = { guilds: { cache: new Collection([[guild.id, guild]]) } };

  function command(text = null, prefix = false) {
    return {
      commandName: "annonce",
      guild,
      guildId: guild.id,
      client,
      user,
      member,
      memberPermissions: member.permissions,
      isPrefixCommand: prefix,
      deferred: false,
      replied: false,
      replies: [],
      options: {
        getSubcommand: () => "envoyer",
        getChannel: () => channel,
        getString: (name) => ({ texte: text, titre: "Information", couleur: "5865F2", image: null, bouton_label: null, bouton_url: null }[name] ?? null),
        getInteger: () => null,
      },
      isButton: () => false,
      isModalSubmit: () => false,
      async reply(payload) { this.replied = true; this.replies.push(payload); },
      async editReply(payload) { this.replied = true; this.replies.push(payload); },
      async deferReply(payload) { this.deferred = true; this.deferPayload = payload; },
      async showModal(modal) { this.modal = modal; },
    };
  }

  function button(commandInteraction) {
    const customId = commandInteraction.replies[0].components[0].toJSON().components[0].custom_id;
    return {
      ...command(),
      customId,
      isButton: () => true,
      async showModal(modal) { this.modal = modal; },
    };
  }

  function submission(openInteraction, text) {
    return {
      ...command(),
      customId: openInteraction.modal.toJSON().custom_id,
      isModalSubmit: () => true,
      fields: {
        getTextInputValue(name) { assert.equal(name, "texte"); return text; },
      },
    };
  }

  return { handlers, channel, command, button, submission };
}

test("/annonce always uses a Paragraph modal and preserves every submitted character", async () => {
  for (const text of CASES) {
    const f = fixture();
    const open = f.command(text);
    await f.handlers.handleAnnouncementCommand(open);
    const input = open.modal.toJSON().components[0].components[0];
    assert.equal(input.style, TextInputStyle.Paragraph);
    assert.equal(input.value, text);
    assert.equal(f.channel.sent.length, 0);

    const submit = f.submission(open, text);
    assert.equal(await f.handlers.handleAnnouncementInteraction(submit), true);
    const payload = f.channel.sent[0];
    assert.equal(payload.embeds[0].toJSON().description, text);
    assert.deepEqual(payload.allowedMentions, { parse: [] });
    assert.equal(submit.deferPayload.flags, MessageFlags.Ephemeral);
  }
});

test("/annonce accepts an empty prefill and still opens the multiline composer", async () => {
  const f = fixture();
  const open = f.command();
  await f.handlers.handleAnnouncementCommand(open);
  const input = open.modal.toJSON().components[0].components[0];
  assert.equal(input.style, TextInputStyle.Paragraph);
  assert.equal(input.value, undefined);
  assert.equal(f.channel.sent.length, 0);
});

test("+annonce returns a personal button which opens the same Paragraph modal", async () => {
  const f = fixture();
  const prefix = f.command(CASES[0], true);
  await f.handlers.handleAnnouncementCommand(prefix);
  assert.equal(prefix.modal, undefined);
  assert.equal(prefix.replies[0].flags, MessageFlags.Ephemeral);
  assert.equal(f.channel.sent.length, 0);

  const click = f.button(prefix);
  assert.equal(await f.handlers.handleAnnouncementInteraction(click), true);
  const input = click.modal.toJSON().components[0].components[0];
  assert.equal(input.style, TextInputStyle.Paragraph);
  assert.equal(input.value, CASES[0]);

  const submit = f.submission(click, CASES[1]);
  await f.handlers.handleAnnouncementInteraction(submit);
  assert.equal(f.channel.sent[0].embeds[0].toJSON().description, CASES[1]);
});

test("announcement forms are personal and single-use", async () => {
  const f = fixture();
  const open = f.command();
  await f.handlers.handleAnnouncementCommand(open);
  const impostor = f.submission(open, CASES[0]);
  impostor.user = { id: "444444444444444444" };
  await f.handlers.handleAnnouncementInteraction(impostor);
  assert.equal(f.channel.sent.length, 0);

  await f.handlers.handleAnnouncementInteraction(f.submission(open, CASES[0]));
  const duplicate = f.submission(open, CASES[0]);
  await f.handlers.handleAnnouncementInteraction(duplicate);
  assert.equal(f.channel.sent.length, 1);
  assert.match(duplicate.replies[0].content, /expiré/);
});

test("unrelated components are ignored", async () => {
  const f = fixture();
  const interaction = f.command();
  interaction.customId = "tickets:close";
  interaction.isButton = () => true;
  assert.equal(await f.handlers.handleAnnouncementInteraction(interaction), false);
});
