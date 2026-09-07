const assert = require("node:assert/strict");
const { test } = require("node:test");
const { EventEmitter } = require("node:events");
const { Collection, ChannelType, PermissionsBitField, PermissionFlagsBits: P } = require("discord.js");

function fixture() {
  const connections = new Map(), calls = [];
  const Status = { Ready: "ready", Destroyed: "destroyed", Disconnected: "disconnected", Signalling: "signalling", Connecting: "connecting" };
  const behavior = {};
  const api = {
    VoiceConnectionStatus: Status,
    getVoiceConnection: id => connections.get(id),
    joinVoiceChannel: options => {
      calls.push(options);
      let connection = connections.get(options.guildId);
      if (!connection) {
        connection = new EventEmitter(); connection.state = { status: Status.Connecting };
        connection.destroy = () => { connection.state.status = Status.Destroyed; connections.delete(options.guildId); };
        connections.set(options.guildId, connection);
      }
      connection.joinConfig = options; return connection;
    },
    entersState: async (connection, state, timeout) => {
      assert.ok(timeout <= 20000);
      if (behavior.fail || (behavior.failRecovery && state !== Status.Ready)) throw new Error("Timeout");
      if (behavior.wait && connection.joinConfig.guildId === "111111111111111111") await behavior.wait;
      connection.state.status = state; return connection;
    },
  };
  const voicePath = require.resolve("@discordjs/voice");
  require.cache[voicePath] = { id: voicePath, filename: voicePath, loaded: true, exports: api };
  const data = { statistics: { entries: [] } };
  const storePath = require.resolve("../src/persistence/guild-store");
  require.cache[storePath] = { id: storePath, filename: storePath, loaded: true, exports: { readGuild: async () => data } };
  const modulePath = require.resolve("../src/modules/bot-voice"); delete require.cache[modulePath];
  const handlers = require(modulePath);
  const client = { guilds: { cache: new Collection() } };
  function createGuild(id = "111111111111111111") {
    const guild = { id, client, voiceAdapterCreator: () => {}, channels: { cache: new Collection() } };
    const actor = { id: "222222222222222222", permissions: new PermissionsBitField(P.ManageGuild), voice: { channelId: "333333333333333333" } };
    const bot = { id: "999999999999999999" };
    guild.actor = actor;
    guild.members = { me: bot, fetch: async () => actor, fetchMe: async () => bot };
    guild.channels.fetch = async id => guild.channels.cache.get(id) || null;
    function channel(channelId = "333333333333333333", type = ChannelType.GuildVoice) {
      const value = { id: channelId, guild, type, userLimit: 0, members: new Collection(),
        actorBits: P.ViewChannel | P.Connect, botBits: P.ViewChannel | P.Connect,
        permissionsFor: m => new PermissionsBitField(m.id === bot.id ? value.botBits : value.actorBits) };
      guild.channels.cache.set(channelId, value); return value;
    }
    guild.makeChannel = channel; guild.voice = channel(); client.guilds.cache.set(guild.id, guild); return guild;
  }
  const guild = createGuild();
  function interaction(target = null, context = guild) {
    return { guild: context, client, user: { id: context.actor.id }, options: { getChannel: () => target }, replies: [],
      async reply(payload) { this.replies.push(payload); }, async deferReply(payload) { this.deferred = payload; },
      async editReply(payload) { this.replies.push(payload); } };
  }
  return { handlers, guild, createGuild, client, interaction, behavior, calls, connections, Status, data };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test("joins the author's current voice using a real adapter contract, muted and deafened", async () => {
  const f = fixture(); const i = f.interaction(); await f.handlers.handleJoinVoice(i);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].channelId, f.guild.voice.id);
  assert.equal(f.calls[0].adapterCreator, f.guild.voiceAdapterCreator);
  assert.equal(f.calls[0].selfMute, true); assert.equal(f.calls[0].selfDeaf, true);
  assert.match(i.replies[0].content, /Connecté/); assert.ok(i.deferred);
});
test("selected channels override the author's current voice; stages remain muted", async () => {
  const f = fixture(); f.guild.actor.voice.channelId = null;
  const channel = f.guild.makeChannel("444444444444444444", ChannelType.GuildStageVoice);
  const i = f.interaction(channel); await f.handlers.handleJoinVoice(i);
  assert.equal(f.calls[0].channelId, channel.id); assert.equal(f.calls[0].selfMute, true);
});
test("already-connected calls are idempotent; moving keeps one connection and one set of listeners", async () => {
  const f = fixture(); await f.handlers.handleJoinVoice(f.interaction());
  const same = f.interaction(); await f.handlers.handleJoinVoice(same); assert.match(same.replies[0].content, /déjà connecté/);
  assert.equal(f.calls.length, 1);
  const connection = f.connections.get(f.guild.id);
  const second = f.guild.makeChannel("444444444444444444"); await f.handlers.handleJoinVoice(f.interaction(second));
  assert.equal(f.connections.size, 1); assert.equal(connection.joinConfig.channelId, second.id); assert.equal(connection.listenerCount("error"), 1);
});
test("missing voice, invalid channels, other guilds and statistics counters never connect", async () => {
  for (const scenario of ["missing", "text", "deleted", "foreign", "counter"]) {
    const f = fixture(); let channel = null;
    if (scenario === "missing") f.guild.actor.voice.channelId = null;
    if (scenario === "text") f.guild.voice.type = ChannelType.GuildText;
    if (scenario === "deleted") f.guild.channels.cache.clear();
    if (scenario === "foreign") channel = f.createGuild("666666666666666666").voice;
    if (scenario === "counter") f.data.statistics.entries.push({ channelId: f.guild.voice.id });
    const i = f.interaction(channel); await f.handlers.handleJoinVoice(i);
    assert.equal(f.calls.length, 0, scenario); assert.ok(i.replies[0].content);
  }
});
test("ManageGuild and both actor/bot channel permissions are checked", async () => {
  for (const scenario of ["manager", "actorView", "actorConnect", "botView", "botConnect"]) {
    const f = fixture();
    if (scenario === "manager") f.guild.actor.permissions = new PermissionsBitField(0n);
    if (scenario === "actorView") f.guild.voice.actorBits = P.Connect;
    if (scenario === "actorConnect") f.guild.voice.actorBits = P.ViewChannel;
    if (scenario === "botView") f.guild.voice.botBits = P.Connect;
    if (scenario === "botConnect") f.guild.voice.botBits = P.ViewChannel;
    await f.handlers.handleJoinVoice(f.interaction()); assert.equal(f.calls.length, 0, scenario);
  }
});
test("full channels are rejected unless the bot may bypass their member limit", async () => {
  const f = fixture(); f.guild.voice.userLimit = 1; f.guild.voice.members.set("user", {});
  const denied = f.interaction(); await f.handlers.handleJoinVoice(denied); assert.match(denied.replies[0].content, /plein/);
  f.guild.voice.botBits |= P.MoveMembers; await f.handlers.handleJoinVoice(f.interaction()); assert.equal(f.calls.length, 1);
});
test("failed readiness destroys the attempted connection and releases the guild lock", async () => {
  const f = fixture(); f.behavior.fail = true;
  const i = f.interaction(); await f.handlers.handleJoinVoice(i); assert.equal(f.connections.size, 0);
  assert.match(i.replies[0].content, /Impossible/); delete f.behavior.fail;
  await f.handlers.handleJoinVoice(f.interaction()); assert.equal(f.connections.size, 1);
});
test("concurrent joins are blocked per guild but not across servers", async () => {
  const f = fixture(); let release; f.behavior.wait = new Promise(resolve => { release = resolve; });
  const first = f.handlers.handleJoinVoice(f.interaction()); await flush();
  const repeated = f.interaction(); await f.handlers.handleJoinVoice(repeated); assert.match(repeated.replies[0].content, /déjà en cours/);
  const other = f.createGuild("666666666666666666"); await f.handlers.handleJoinVoice(f.interaction(null, other));
  assert.equal(f.calls.length, 2); release(); await first; assert.equal(f.connections.size, 2);
});
test("errors and unrecoverable disconnects destroy the session without fighting a staff kick", async () => {
  const f = fixture(); await f.handlers.handleJoinVoice(f.interaction());
  let connection = f.connections.get(f.guild.id); connection.emit("error", new Error("voice error")); assert.equal(f.connections.size, 0);
  await f.handlers.handleJoinVoice(f.interaction()); connection = f.connections.get(f.guild.id);
  f.behavior.failRecovery = true; connection.emit(f.Status.Disconnected); await flush();
  assert.equal(f.connections.size, 0); assert.equal(f.calls.length, 2);
});
test("shutdown closes existing voice connections without creating new ones", async () => {
  const f = fixture(); await f.handlers.handleJoinVoice(f.interaction());
  f.handlers.destroyBotVoiceConnections(f.client); assert.equal(f.connections.size, 0); assert.equal(f.calls.length, 1);
});
