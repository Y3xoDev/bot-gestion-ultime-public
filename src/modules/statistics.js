const crypto = require("node:crypto");
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, Events, GatewayIntentBits,
  MessageFlags, ModalBuilder, PermissionFlagsBits: P, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle,
} = require("discord.js");
const { readGuild, mutateGuild } = require("../persistence/guild-store");
const { enforceCommandAccess } = require("./legacy-features");
const { TYPES, MIN_INTERVAL, MAX_COUNTERS, RENAME_DELAY, normalizeStatistics,
  defaultEntries, validateTemplate, renderName } = require("./statistics-config");

const busy = new Set();
const sessions = new Map();
const memberFetches = new Map();
const presenceSnapshots = new WeakMap();
const voiceRefreshTimers = new Map();
const ONLINE_STATUSES = new Set(["online", "idle", "dnd"]);
const maintenance = new WeakMap();
const SESSION_TTL = 15 * 60_000;
const BOT_PERMISSIONS = [P.ManageChannels, P.ManageRoles, P.ViewChannel];
const readConfig = async (id) => normalizeStatistics((await readGuild(id)).statistics);
const saveConfig = (id, fn) => mutateGuild(id, data => {
  data.statistics = normalizeStatistics(data.statistics);
  return fn(data.statistics);
});

async function exclusive(guildId, operation) {
  if (busy.has(guildId)) throw new Error("Une opération statistiques est déjà en cours. Réessaie dans quelques instants.");
  busy.add(guildId);
  try { return await operation(); } finally { busy.delete(guildId); }
}

async function managedChannel(guild, id, type) {
  if (!id) return null;
  let channel;
  try { channel = await guild.channels.fetch(id); } catch (error) {
    if (error.code === 10003) return null;
    throw error;
  }
  if (channel && (channel.guild.id !== guild.id || channel.type !== type)) {
    throw new Error("Un salon enregistré ne correspond plus à une statistique. Aucune modification effectuée sur ce salon.");
  }
  return channel;
}

function permissionOverwrites(guild, config) {
  const everyoneDeny = [P.Connect, P.SendMessages];
  if (config.visibleRoleId) everyoneDeny.push(P.ViewChannel);
  const result = [
    { id: guild.id, allow: config.visibleRoleId ? [] : [P.ViewChannel], deny: everyoneDeny },
    { id: guild.client.user.id, allow: BOT_PERMISSIONS, deny: [P.Connect] },
  ];
  if (config.visibleRoleId) result.push({ id: config.visibleRoleId, allow: [P.ViewChannel], deny: [P.Connect, P.SendMessages] });
  return result;
}

async function botPermissions(guild) {
  const me = guild.members.me || await guild.members.fetchMe();
  if (!me.permissions.has(BOT_PERMISSIONS)) throw new Error("Le bot doit avoir Voir les salons, Gérer les salons et Gérer les rôles (permissions des salons).");
}

async function collectCounts(guild, config) {
  const hasMembers = guild.client.options.intents.has(GatewayIntentBits.GuildMembers);
  const hasPresences = guild.client.options.intents.has(GatewayIntentBits.GuildPresences);
  const needsOnline = config.entries.some(e => e.type === "enligne");
  let presenceSnapshot = presenceSnapshots.get(guild);
  if (!presenceSnapshot) {
    presenceSnapshot = { ready: false };
    presenceSnapshots.set(guild, presenceSnapshot);
  }
  const needsMembers = config.entries.some(e => ["membres", "humains", "bots", "role", "enligne"].includes(e.type));
  const needsPresenceSnapshot = needsOnline && hasPresences && !presenceSnapshot.ready;
  if (needsMembers && hasMembers && (guild.members.cache.size !== guild.memberCount || needsPresenceSnapshot)
      && Date.now() - (memberFetches.get(guild.id) || 0) >= 30 * 60_000) {
    memberFetches.set(guild.id, Date.now());
    const withPresences = needsOnline && hasPresences;
    if (withPresences) {
      presenceSnapshot.ready = false;
      // A fresh snapshot omits offline users. Remove stale presences left by a disconnect.
      guild.presences.cache.clear();
    }
    const fetched = await guild.members.fetch({ time: 15_000, withPresences }).catch(() => null);
    if (withPresences && fetched?.size === guild.memberCount && presenceSnapshots.get(guild) === presenceSnapshot) {
      presenceSnapshot.ready = true;
    }
  }
  const memberCount = guild.memberCount;
  const complete = hasMembers && guild.members.cache.size === memberCount;
  const humans = complete ? guild.members.cache.filter(m => m.user.bot === false).size : null;
  const excluded = new Set([config.categoryId, ...config.entries.map(e => e.channelId)]);
  const counts = {
    membres: humans,
    humains: humans,
    bots: complete ? guild.members.cache.filter(m => m.user.bot).size : null,
    enligne: complete && hasPresences && presenceSnapshot.ready && presenceSnapshots.get(guild) === presenceSnapshot
      ? guild.members.cache.filter(m => m.user.bot === false && ONLINE_STATUSES.has(guild.presences.cache.get(m.id)?.status)).size
      : null,
    vocal: guild.voiceStates.cache.filter(s => Boolean(s.channelId) && s.member?.user?.bot !== true).size,
    boosts: guild.premiumSubscriptionCount ?? 0,
    roles: guild.roles.cache.filter(r => r.id !== guild.id).size,
    salons: guild.channels.cache.filter(c => !excluded.has(c.id) && c.type !== ChannelType.GuildCategory && !c.isThread()).size,
    texte: "",
  };
  for (const entry of config.entries.filter(e => e.type === "role")) {
    counts[`role:${entry.roleId}`] = complete && guild.roles.cache.has(entry.roleId)
      ? guild.members.cache.filter(m => m.roles.cache.has(entry.roleId)).size : null;
  }
  return counts;
}

// Caller holds the guild lock. IDs are saved after each creation so retries never adopt unrelated channels.
async function syncStatistics(guild, { install = false, configure = false } = {}) {
  let config = await readConfig(guild.id);
  if (!config.enabled && !install && !configure) return { paused: true };
  const now = Date.now();
  await saveConfig(guild.id, c => { c.nextRunAt = now + c.intervalMinutes * 60_000; });
  try {
    await botPermissions(guild);
    const overwrites = permissionOverwrites(guild, config);
    let category = await managedChannel(guild, config.categoryId, ChannelType.GuildCategory);
    if (!category && !install) throw new Error("Catégorie absente : lance /statistiques setup pour réparer.");
    if (!category) {
      category = await guild.channels.create({ name: config.categoryName, type: ChannelType.GuildCategory,
        position: config.categoryPosition, permissionOverwrites: overwrites, reason: "Installation des statistiques" });
      await saveConfig(guild.id, c => { c.categoryId = category.id; c.categoryRenamedAt = now; c.layoutPending = true; });
      config = await readConfig(guild.id);
    }
    let queued = 0;
    if (category.name !== config.categoryName) {
      if (now - config.categoryRenamedAt >= RENAME_DELAY) {
        await category.setName(config.categoryName, "Personnalisation des statistiques");
        await saveConfig(guild.id, c => { c.categoryRenamedAt = now; });
      } else queued++;
    }
    if (config.layoutPending || install) {
      await category.permissionOverwrites.set(overwrites, "Visibilité des statistiques");
      if (category.rawPosition !== config.categoryPosition) await category.setPosition(config.categoryPosition);
    }
    const counts = await collectCounts(guild, config);
    const positions = [];
    let created = 0, renamed = 0;
    const missing = [];
    for (const entry of config.entries) {
      let channel = await managedChannel(guild, entry.channelId, ChannelType.GuildVoice);
      const name = renderName(entry, guild, counts);
      if (!channel && install) {
        channel = await guild.channels.create({ name, type: ChannelType.GuildVoice, parent: category.id,
          permissionOverwrites: overwrites, reason: "Création d'un compteur statistiques" });
        await saveConfig(guild.id, c => { const e = c.entries.find(e => e.id === entry.id); e.channelId = channel.id; e.renamedAt = entry.type === "vocal" ? 0 : now; });
        created++;
      } else if (!channel) { missing.push(entry.id); continue; }
      if (channel.name !== name) {
        if (now - (entry.renamedAt || 0) >= RENAME_DELAY) {
          await channel.setName(name, "Actualisation des statistiques");
          await saveConfig(guild.id, c => { c.entries.find(e => e.id === entry.id).renamedAt = now; });
          renamed++;
        } else queued++;
      }
      if (config.layoutPending || install) {
        if (channel.parentId !== category.id) await channel.setParent(category.id, { lockPermissions: false });
        await channel.permissionOverwrites.set(overwrites, "Compteur visible mais non rejoignable");
        positions.push({ channel: channel.id, position: positions.length });
      }
    }
    if (positions.length) await guild.channels.setPositions(positions);
    await saveConfig(guild.id, c => {
      c.lastSyncAt = now; c.layoutPending = false;
      c.lastError = missing.length ? `Salons manquants (${missing.join(", ")}) : lance /statistiques setup.` : null;
    });
    return { created, renamed, queued, missing };
  } catch (error) {
    await saveConfig(guild.id, c => { c.lastError = error.code ? `Erreur Discord ${error.code} : vérifie les permissions puis relance setup.` : error.message; });
    throw error;
  }
}

async function installStatistics(guild) {
  await botPermissions(guild);
  await saveConfig(guild.id, c => {
    if (!c.entries.length) c.entries = defaultEntries();
    c.enabled = true;
  });
  return syncStatistics(guild, { install: true });
}

async function validateRole(guild, id) {
  if (!id) return null;
  if (!/^\d{17,20}$/.test(id)) throw new Error("Indique un ID de rôle valide, ou laisse le champ vide.");
  const role = await guild.roles.fetch(id);
  if (!role || role.guild.id !== guild.id) throw new Error("Ce rôle n'existe pas sur ce serveur.");
  return id;
}

function integer(value, min, max, label) {
  const result = Number(value);
  if (!Number.isInteger(result) || result < min || result > max) throw new Error(`${label} doit être un entier entre ${min} et ${max}.`);
  return result;
}

async function editCounter(guild, { id, type, template, roleId, position }) {
  const config = await readConfig(guild.id);
  const old = config.entries.find(e => e.id === id);
  if (id && !old) throw new Error("Compteur introuvable. Rouvre le panneau.");
  if (!old && config.entries.length >= MAX_COUNTERS) throw new Error(`Maximum ${MAX_COUNTERS} compteurs.`);
  type ||= old?.type;
  validateTemplate(template, type);
  roleId = type === "role" ? (roleId ?? old?.roleId) : null;
  if (type === "role" && !roleId) throw new Error("Le type role nécessite un rôle à compter.");
  await validateRole(guild, roleId);
  const newPosition = position == null ? (old ? config.entries.indexOf(old) : config.entries.length)
    : integer(position, 1, Math.max(1, config.entries.length + (old ? 0 : 1)), "Position") - 1;
  const entry = { id: old?.id || crypto.randomBytes(4).toString("hex"), channelId: null, renamedAt: 0,
    ...old, type, template, roleId };
  await saveConfig(guild.id, c => {
    c.entries = c.entries.filter(e => e.id !== entry.id);
    c.entries.splice(newPosition, 0, entry); c.layoutPending = true; c.nextRunAt = 0;
  });
  // Do not install the whole system as a side effect of editing an uninstalled/paused config.
  if (config.enabled && config.categoryId) await syncStatistics(guild, { install: true });
  return entry.id;
}

async function editOptions(guild, changes) {
  const patch = {};
  if (changes.categoryName != null) patch.categoryName = validateTemplate(changes.categoryName, "texte");
  if (changes.intervalMinutes != null) patch.intervalMinutes = integer(changes.intervalMinutes, MIN_INTERVAL, 60, "Intervalle");
  if (changes.categoryPosition != null) patch.categoryPosition = integer(changes.categoryPosition, 0, 499, "Position de la catégorie");
  if (changes.visibleRoleId !== undefined) {
    patch.visibleRoleId = await validateRole(guild, changes.visibleRoleId);
    if (patch.visibleRoleId === guild.id) patch.visibleRoleId = null;
  }
  if (changes.color != null) {
    patch.color = changes.color.replace(/^#/, "").toUpperCase();
    if (!/^[0-9A-F]{6}$/.test(patch.color)) throw new Error("Couleur invalide, exemple : 5865F2.");
  }
  await saveConfig(guild.id, c => { Object.assign(c, patch); c.layoutPending = true; c.nextRunAt = 0; });
  const config = await readConfig(guild.id);
  // Visibility changes must also take effect while automatic updates are paused.
  if (config.categoryId) await syncStatistics(guild, { configure: true });
}

function snapshot(config) { return JSON.stringify([config.categoryId, config.entries.map(e => [e.id, e.channelId])]); }

async function deleteStatistics(guild, entryId = null) {
  await botPermissions(guild);
  const config = await readConfig(guild.id);
  const targets = entryId ? config.entries.filter(e => e.id === entryId) : config.entries;
  if (entryId && !targets.length) throw new Error("Compteur introuvable.");
  if (!entryId) await saveConfig(guild.id, c => { c.enabled = false; });
  let removed = 0;
  const failures = [];
  for (const entry of targets) {
    try {
      const channel = await managedChannel(guild, entry.channelId, ChannelType.GuildVoice);
      if (channel) { await channel.delete("Suppression des statistiques confirmée"); removed++; }
      await saveConfig(guild.id, c => { c.entries = c.entries.filter(e => e.id !== entry.id); });
    } catch { failures.push(entry.id); }
  }
  let categoryKept = false;
  if (!entryId && !failures.length) {
    try {
      const category = await managedChannel(guild, config.categoryId, ChannelType.GuildCategory);
      if (category) {
        const channels = await guild.channels.fetch();
        categoryKept = channels.some(c => c?.parentId === category.id);
        if (!categoryKept) await category.delete("Catégorie statistiques vide, suppression confirmée");
      }
      await saveConfig(guild.id, c => { c.categoryId = null; c.categoryRenamedAt = 0; c.layoutPending = false; });
    } catch { failures.push("catégorie"); }
  }
  await saveConfig(guild.id, c => { c.lastError = failures.length ? `Suppression incomplète : ${failures.join(", ")}. Relance la suppression après correction des permissions.` : null; });
  return `${removed} salon(s) supprimé(s).${categoryKept ? " Catégorie conservée : elle contient d'autres salons." : ""}${failures.length ? ` Échec pour ${failures.join(", ")} ; références conservées pour réessayer.` : ""}`;
}

function newSession(interaction) {
  for (const [id, s] of sessions) if (s.expiresAt <= Date.now()) sessions.delete(id);
  const id = crypto.randomBytes(8).toString("hex");
  sessions.set(id, { guildId: interaction.guild.id, userId: interaction.user.id, expiresAt: Date.now() + SESSION_TTL });
  return id;
}
const button = (id, action, label, style = ButtonStyle.Secondary) => new ButtonBuilder()
  .setCustomId(`statistics:${id}:${action}`).setLabel(label).setStyle(style);
const row = (...components) => new ActionRowBuilder().addComponents(...components);

function panelPayload(config, id, selected = null, note = null) {
  const entry = config.entries.find(e => e.id === selected);
  const color = parseInt(config.color, 16);
  const embed = new EmbedBuilder().setColor(Number.isFinite(color) ? color : 0x5865f2)
    .setTitle(entry ? "📊 Personnaliser un compteur" : "📊 Configuration des statistiques")
    .setDescription(entry ? `ID : \`${entry.id}\`\nType : ${TYPES[entry.type]}\nNom : ${entry.template}\nPosition : ${config.entries.indexOf(entry) + 1}\nRôle : ${entry.roleId ? `<@&${entry.roleId}>` : "aucun"}`
      : `État : **${config.enabled ? "activé" : "en pause / non installé"}**\nCatégorie : ${config.categoryName}\n${config.categoryId ? `<#${config.categoryId}>` : "Non installée — bouton Installer"}\nActualisation : **${config.intervalMinutes} min**\nVisibilité : ${config.visibleRoleId ? `<@&${config.visibleRoleId}> et administrateurs` : "tout le monde"}`)
    .setFooter({ text: "Compteurs vocaux non rejoignables • panneau personnel valable 15 min" });
  embed.addFields({ name: "Personnalisation", value: "Noms et emojis libres. Variables : `{compteur}`, `{serveur}`, `{nom_role}`.\nEn ligne : humains uniquement (en ligne, inactifs, ne pas déranger), sans bots. GuildMembers + GuildPresences requis ; données non chargées = indisponible.\nRenommages espacés d'au moins 10 min, même après Actualiser." });
  if (!entry) {
    for (let i = 0; i < config.entries.length; i += 5) embed.addFields({ name: `Compteurs ${i + 1}–${Math.min(i + 5, config.entries.length)} / ${MAX_COUNTERS}`,
      value: config.entries.slice(i, i + 5).map((e, j) => `${i + j + 1}. \`${e.id}\` — ${e.template}${e.channelId ? ` <#${e.channelId}>` : " (à installer)"}`).join("\n") });
    embed.addFields({ name: "Dernière actualisation", value: config.lastSyncAt ? `<t:${Math.floor(config.lastSyncAt / 1000)}:R>` : "Aucune" });
  }
  if (config.lastError) embed.addFields({ name: "À vérifier", value: config.lastError.slice(0, 1000) });
  if (note) embed.addFields({ name: "Résultat", value: note.slice(0, 1000) });
  let components;
  if (entry) components = [row(button(id, `edit-${entry.id}`, "Modifier", ButtonStyle.Primary), button(id, `up-${entry.id}`, "Monter"),
    button(id, `down-${entry.id}`, "Descendre"), button(id, `remove-${entry.id}`, "Retirer", ButtonStyle.Danger), button(id, "home", "Retour"))];
  else {
    components = [row(button(id, "setup", "Installer / réparer", ButtonStyle.Success), button(id, "options", "Options"),
      button(id, "add", "Ajouter", ButtonStyle.Primary), button(id, "refresh", "Actualiser"), button(id, config.enabled ? "pause" : "resume", config.enabled ? "Pause" : "Activer"))];
    if (config.entries.length) components.push(row(new StringSelectMenuBuilder().setCustomId(`statistics:${id}:select`)
      .setPlaceholder("Personnaliser un compteur").addOptions(config.entries.map((e, i) => ({ label: `${i + 1}. ${e.template}`.slice(0, 100), value: e.id, description: TYPES[e.type] })))));
    components.push(row(button(id, "delete", "Supprimer le système", ButtonStyle.Danger)));
  }
  return { content: "", embeds: [embed], components, allowedMentions: { parse: [] } };
}

function textInput(id, label, value = "", required = true, maximum = 100) {
  const input = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(TextInputStyle.Short).setRequired(required).setMaxLength(maximum);
  if (value !== "") input.setValue(String(value));
  return row(input);
}
function counterModal(id, entry, type) {
  return new ModalBuilder().setCustomId(`statistics:${id}:save-${entry?.id || "new"}`).setTitle("Personnaliser le compteur").addComponents(
    textInput("type", "Type du compteur", type),
    textInput("template", "Nom / emojis — nombre avec {compteur}", entry?.template || (type === "texte" ? "🪐 › .gg/ton-code" : "📊 › {compteur}")),
    textInput("role", "ID du rôle (obligatoire pour type role)", entry?.roleId || "", false, 20),
    textInput("position", "Position (vide = conserver / à la fin)", "", false, 2),
  );
}
function optionsModal(config, id) {
  return new ModalBuilder().setCustomId(`statistics:${id}:save-options`).setTitle("Options des statistiques").addComponents(
    textInput("category", "Nom de la catégorie", config.categoryName),
    textInput("interval", "Actualisation (10 à 60 minutes)", config.intervalMinutes, true, 2),
    textInput("position", "Position catégorie (0 = tout en haut)", config.categoryPosition, true, 3),
    textInput("visibility", "ID rôle visible (vide = tout le monde)", config.visibleRoleId || "", false, 20),
    textInput("color", "Couleur du panneau (hexadécimal)", config.color, true, 7),
  );
}

async function authorize(interaction) {
  if (!interaction.guild) return false;
  const actor = await interaction.guild.members.fetch(interaction.user.id);
  if (!actor.permissions.has(P.ManageGuild)) {
    await interaction.reply({ content: "Tu dois avoir la permission Gérer le serveur.", flags: MessageFlags.Ephemeral });
    return false;
  }
  return enforceCommandAccess(interaction);
}

async function confirmation(config, sessionId, entryId = null) {
  const session = sessions.get(sessionId);
  session.confirm = { entryId, snapshot: snapshot(config), expiresAt: Date.now() + 60_000 };
  return { content: entryId ? "Supprimer ce compteur et son salon vocal ? Cette suppression n'est pas récupérable automatiquement."
    : "Supprimer uniquement les salons enregistrés par ce système ? Les autres salons sont conservés. Suppression non récupérable automatiquement.", embeds: [],
    components: [row(button(sessionId, "confirm", "Confirmer la suppression", ButtonStyle.Danger), button(sessionId, "home", "Annuler"))], allowedMentions: { parse: [] } };
}

function syncNote(result) {
  if (result.paused) return "Système en pause. Clique sur Activer / Installer.";
  return `${result.created} créé(s), ${result.renamed} renommé(s).${result.queued ? ` ${result.queued} renommage(s) enregistré(s), appliqué(s) après le délai de 10 min.` : ""}`;
}

async function handleStatisticsCommand(interaction) {
  if (!(await authorize(interaction))) return;
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const id = newSession(interaction);
  try {
    let note;
    const sub = interaction.options.getSubcommand();
    await exclusive(interaction.guild.id, async () => {
      const guild = interaction.guild;
      if (sub === "setup") note = syncNote(await installStatistics(guild));
      if (sub === "actualiser") note = syncNote(await syncStatistics(guild));
      if (["activer", "desactiver"].includes(sub)) {
        await saveConfig(guild.id, c => { c.enabled = sub === "activer"; c.nextRunAt = 0; });
        if (sub === "activer") note = syncNote(await syncStatistics(guild));
      }
      if (["ajouter", "modifier"].includes(sub)) await editCounter(guild, {
        id: interaction.options.getString("id"), type: interaction.options.getString("type"),
        template: interaction.options.getString("nom", true), roleId: interaction.options.getRole("role")?.id,
        position: interaction.options.getInteger("position"),
      });
      if (sub === "options") {
        if (interaction.options.getBoolean("public") === false && !interaction.options.getRole("visible_role")) throw new Error("Indique visible_role pour restreindre la visibilité.");
        if (interaction.options.getBoolean("public") === true && interaction.options.getRole("visible_role")) throw new Error("Choisis public:oui OU visible_role, pas les deux.");
        await editOptions(guild, { categoryName: interaction.options.getString("categorie"), intervalMinutes: interaction.options.getInteger("intervalle"),
          categoryPosition: interaction.options.getInteger("position"), color: interaction.options.getString("couleur"),
          visibleRoleId: interaction.options.getBoolean("public") === true ? null : interaction.options.getRole("visible_role")?.id });
      }
    });
    const config = await readConfig(interaction.guild.id);
    if (["supprimer", "retirer"].includes(sub)) {
      const entryId = interaction.options.getString("id");
      if (entryId && !config.entries.some(e => e.id === entryId)) throw new Error("Compteur introuvable.");
      await interaction.editReply(await confirmation(config, id, entryId));
    } else await interaction.editReply(panelPayload(config, id, null, note));
  } catch (error) {
    await interaction.editReply({ content: error.code ? `Erreur Discord ${error.code}. Vérifie les permissions et réessaie.` : error.message, embeds: [], components: [] });
  }
}

async function handleStatisticsInteraction(interaction) {
  if (!interaction.customId?.startsWith("statistics:")) return false;
  const [, id, action] = interaction.customId.split(":");
  const session = sessions.get(id);
  if (!session || session.expiresAt <= Date.now() || session.userId !== interaction.user.id || session.guildId !== interaction.guild?.id) {
    await interaction.reply({ content: "Panneau expiré ou réservé à son auteur. Relance /statistiques configurer.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!(await authorize(interaction))) return true;
  try {
    const config = await readConfig(session.guildId);
    if (action === "options") { await interaction.showModal(optionsModal(config, id)); return true; }
    if (action === "add") {
      await interaction.update({ content: "Choisis le type de compteur à ajouter.", embeds: [], components: [row(new StringSelectMenuBuilder()
        .setCustomId(`statistics:${id}:type`).setPlaceholder("Type du compteur").addOptions(Object.entries(TYPES).map(([value, label]) => ({ value, label })))), row(button(id, "home", "Retour"))] });
      return true;
    }
    if (action === "type" || action.startsWith("edit-")) {
      const entry = config.entries.find(e => e.id === action.slice(5));
      if (action.startsWith("edit-") && !entry) throw new Error("Compteur introuvable.");
      await interaction.showModal(counterModal(id, entry, entry?.type || interaction.values[0])); return true;
    }
    await interaction.deferUpdate();
    let note, selected = null, confirmPayload = null;
    await exclusive(session.guildId, async () => {
      const guild = interaction.guild;
      const current = await readConfig(guild.id);
      if (action === "home") delete session.confirm;
      if (action === "select") selected = interaction.values[0];
      if (action === "setup") note = syncNote(await installStatistics(guild));
      if (action === "refresh") note = syncNote(await syncStatistics(guild));
      if (action === "pause" || action === "resume") {
        await saveConfig(guild.id, c => { c.enabled = action === "resume"; c.nextRunAt = 0; });
        if (action === "resume") note = syncNote(await syncStatistics(guild));
      }
      if (action === "save-options") {
        const field = key => interaction.fields.getTextInputValue(key);
        await editOptions(guild, { categoryName: field("category"), intervalMinutes: field("interval"), categoryPosition: field("position"),
          visibleRoleId: field("visibility").trim() || null, color: field("color") });
      } else if (action.startsWith("save-")) {
        const field = key => interaction.fields.getTextInputValue(key);
        selected = await editCounter(guild, { id: action === "save-new" ? null : action.slice(5), type: field("type").trim(),
          template: field("template"), roleId: field("role").trim() || null, position: field("position").trim() || null });
        note = "Configuration enregistrée. Les renommages respectent un délai d'au moins 10 min.";
      }
      if (action.startsWith("up-") || action.startsWith("down-")) {
        selected = action.replace(/^(up|down)-/, "");
        const index = current.entries.findIndex(e => e.id === selected);
        if (index < 0) throw new Error("Compteur introuvable.");
        const position = Math.max(1, Math.min(current.entries.length, index + 1 + (action.startsWith("up-") ? -1 : 1)));
        await editCounter(guild, { ...current.entries[index], position });
      }
      if (action === "delete" || action.startsWith("remove-")) {
        const entryId = action === "delete" ? null : action.slice(7);
        if (entryId && !current.entries.some(e => e.id === entryId)) throw new Error("Compteur introuvable.");
        confirmPayload = await confirmation(current, id, entryId);
      }
      if (action === "confirm") {
        const confirmation = session.confirm;
        delete session.confirm;
        if (!confirmation || confirmation.expiresAt <= Date.now() || confirmation.snapshot !== snapshot(current)) {
          throw new Error("Confirmation expirée ou configuration modifiée. Demande une nouvelle confirmation.");
        }
        note = await deleteStatistics(guild, confirmation.entryId);
      }
    });
    await interaction.editReply(confirmPayload || panelPayload(await readConfig(session.guildId), id, selected, note));
  } catch (error) {
    const payload = { content: error.code ? `Erreur Discord ${error.code}. Vérifie les permissions du bot.` : error.message, embeds: [], components: [row(button(id, "home", "Retour au panneau"))] };
    if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
    else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
  }
  return true;
}

async function tickStatistics(client) {
  for (const guild of client.guilds.cache.values()) {
    if (!guild.available || busy.has(guild.id)) continue;
    const config = await readConfig(guild.id);
    if (!config.enabled || config.nextRunAt > Date.now()) continue;
    await exclusive(guild.id, () => syncStatistics(guild)).catch(error => {
      console.warn(`Statistiques ${guild.id} : ${error.code || error.message}`);
    });
  }
}

function scheduleVoiceStatisticsRefresh(guild, delay = 1_500) {
  if (!guild?.id) return;
  const dueAt = Date.now() + Math.max(250, delay);
  const current = voiceRefreshTimers.get(guild.id);
  if (current?.dueAt <= dueAt) return;
  if (current) clearTimeout(current.timer);
  const timer = setTimeout(() => {
    voiceRefreshTimers.delete(guild.id);
    void refreshVoiceStatistics(guild).catch(error => {
      console.warn(`Statistiques vocales ${guild.id} : ${error.code || error.message}`);
    });
  }, Math.max(250, delay));
  timer.unref?.();
  voiceRefreshTimers.set(guild.id, { timer, dueAt });
}

async function refreshVoiceStatistics(guild) {
  if (!guild?.available) return { skipped: true };
  if (busy.has(guild.id)) {
    scheduleVoiceStatisticsRefresh(guild, 2_000);
    return { queued: 1, renamed: 0 };
  }
  return exclusive(guild.id, async () => {
    const config = await readConfig(guild.id);
    const entries = config.entries.filter(entry => entry.type === "vocal" && entry.channelId);
    if (!config.enabled || !entries.length) return { skipped: true };
    const now = Date.now();
    const count = guild.voiceStates.cache.filter(state => Boolean(state.channelId) && state.member?.user?.bot !== true).size;
    let renamed = 0;
    let queued = 0;
    let nextDelay = Infinity;
    for (const entry of entries) {
      const channel = await managedChannel(guild, entry.channelId, ChannelType.GuildVoice);
      if (!channel) continue;
      const name = renderName(entry, guild, { vocal: count });
      if (channel.name === name) continue;
      const remaining = RENAME_DELAY - (now - (entry.renamedAt || 0));
      if (remaining <= 0) {
        await channel.setName(name, "Actualisation après changement vocal");
        await saveConfig(guild.id, current => {
          const saved = current.entries.find(item => item.id === entry.id);
          if (saved) saved.renamedAt = Date.now();
          current.lastSyncAt = Date.now();
          current.lastError = null;
        });
        renamed += 1;
      } else {
        queued += 1;
        nextDelay = Math.min(nextDelay, remaining + 250);
      }
    }
    if (Number.isFinite(nextDelay)) scheduleVoiceStatisticsRefresh(guild, nextDelay);
    return { queued, renamed };
  });
}

function handleStatisticsVoiceState(oldState, newState) {
  if (oldState.channelId === newState.channelId) return;
  scheduleVoiceStatisticsRefresh(newState.guild || oldState.guild);
}

function invalidateStatisticsPresence(guild) {
  presenceSnapshots.delete(guild);
  memberFetches.delete(guild.id);
}

function startStatisticsMaintenance(client) {
  if (maintenance.has(client)) return;
  const resetShard = shardId => {
    for (const guild of client.guilds.cache.values()) if (guild.shardId === shardId) invalidateStatisticsPresence(guild);
  };
  client.on(Events.ShardReady, resetShard);
  client.on(Events.ShardResume, resetShard);
  client.on(Events.ShardDisconnect, (_, shardId) => resetShard(shardId));
  client.on(Events.GuildUnavailable, invalidateStatisticsPresence);
  client.on(Events.GuildCreate, invalidateStatisticsPresence);
  client.on(Events.GuildDelete, invalidateStatisticsPresence);
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await tickStatistics(client); } catch (error) { console.warn("Maintenance statistiques :", error.code || error.message); }
    finally { running = false; }
  };
  const timer = setInterval(() => { void run(); }, 60_000);
  timer.unref(); maintenance.set(client, timer); void run();
  for (const guild of client.guilds.cache.values()) scheduleVoiceStatisticsRefresh(guild, 2_000);
}

module.exports = { collectCounts, syncStatistics, installStatistics, editCounter, editOptions, deleteStatistics,
  permissionOverwrites, panelPayload, counterModal, optionsModal, exclusive, tickStatistics,
  startStatisticsMaintenance, invalidateStatisticsPresence, handleStatisticsCommand, handleStatisticsInteraction,
  handleStatisticsVoiceState, refreshVoiceStatistics, scheduleVoiceStatisticsRefresh };
