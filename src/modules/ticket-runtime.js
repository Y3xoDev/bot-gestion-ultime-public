const {
  ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ChannelType,
  EmbedBuilder, MessageFlags, PermissionFlagsBits: P,
} = require("discord.js");
const { readGuild, mutateGuild } = require("../persistence/guild-store");
const { ticketButtons, buildTicketTranscript, deliverTicketTranscript, sendLog } = require("./server-events");
const { randomBytes } = require("node:crypto");
const { ReviewError, prepareReview, sendReviewPrompt, invalidatePendingReview, submitReview, showReviews } = require("./ticket-reviews");

// Ticket workflow backed by the per-guild store and Discord permissions.
const locks = new Map();
const timers = new WeakMap();
const pendingCloseAll = new Map();
const ACTIONS = new Set(["claim", "unclaim", "ajouter", "retirer", "renommer", "rappel", "transcript", "fermer", "rouvrir", "supprimer", "autoclose", "closeall", "stars", "noter"]);
class TicketError extends Error {}
function fail(message) { throw new TicketError(message); }
async function locked(key, work) {
  const previous = locks.get(key) || Promise.resolve();
  const running = previous.catch(() => {}).then(work);
  locks.set(key, running);
  try { return await running; } finally { if (locks.get(key) === running) locks.delete(key); }
}
function ticketFrom(channel, config) {
  if (channel?.type !== ChannelType.GuildText) return null;
  const match = channel.topic?.match(/^ticket-(owner|closed):(\d{17,20})(?::([a-z0-9-]+))?$/);
  if (!match) return null; // Never adopt ModMail, arbitrary topics or name-only matches.
  const saved = config.entries?.[channel.id];
  if (saved && saved.ownerId !== match[2]) return null;
  return saved ? { ...saved, state: match[1] === "closed" ? "closed" : "open" } : {
    ownerId: match[2], choiceId: match[3] || "general",
    state: match[1] === "closed" ? "closed" : "open", claimedBy: null,
    staffRoleId: config.choices.find((c) => c.id === match[3])?.staffRoleId || config.staffRoleId,
    extraIds: [], controlMessageId: null,
  };
}
function isManager(member) { return Boolean(member?.permissions?.has(P.ManageChannels)); }
function isStaff(member, entry) {
  return isManager(member) || Boolean(entry.staffRoleId && member?.roles?.cache?.has(entry.staffRoleId));
}
function mayRead(member, channel) { return Boolean(channel.permissionsFor(member)?.has(P.ViewChannel)); }
async function save(channel, entry) {
  await mutateGuild(channel.guild.id, (data) => { data.tickets.entries[channel.id] = entry; });
}
function controls(config, entry) {
  const buttons = [];
  const add = (action, label, style) => buttons.push(new ButtonBuilder().setCustomId(`ticket:${action}`).setLabel(label).setStyle(style));
  if (entry.state === "closed") {
    add("rouvrir", "🔓 Rouvrir", ButtonStyle.Success);
    add("transcript", "📄 Transcript", ButtonStyle.Secondary);
    add("supprimer", "🗑️ Supprimer", ButtonStyle.Danger);
  } else {
    if (config.closeButtonEnabled !== false) add("fermer", "🔒 Fermer", ButtonStyle.Danger);
    if (config.claimEnabled && config.claimButtonEnabled) {
      add(entry.claimedBy ? "unclaim" : "claim", entry.claimedBy ? "↩️ Libérer" : "🙋 Prendre en charge", ButtonStyle.Primary);
    }
    add("transcript", "📄 Transcript", ButtonStyle.Secondary);
  }
  return [new ActionRowBuilder().addComponents(buttons)];
}
async function updateControls(channel, config, entry) {
  if (!entry.controlMessageId) return;
  const message = await channel.messages.fetch(entry.controlMessageId).catch(() => null);
  if (message) await message.edit({ components: controls(config, entry) }).catch(() => {});
}
async function audit(channel, title, entry) {
  await sendLog(channel.guild, "channels", new EmbedBuilder().setColor(0x5865f2)
    .setTitle(title).setDescription(`Ticket : <#${channel.id}> (${channel.id})\nCréateur : <@${entry.ownerId}>`)
    .setTimestamp()).catch(() => {});
}
async function publishTicketPanel(guild, channel) {
  return locked(`panel:${guild.id}`, async () => {
    const config = (await readGuild(guild.id)).tickets;
    if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel?.type) || channel.guild.id !== guild.id) fail("Choisis un salon textuel de ce serveur.");
    if (!config.categoryId || !config.staffRoleId || config.staffRoleId === guild.id) fail("Configure d'abord une catégorie et un rôle support autre que @everyone.");
    const payload = { embeds: [new EmbedBuilder().setColor(/^[a-f0-9]{6}$/i.test(config.panelColor) ? parseInt(config.panelColor, 16) : 0x5865f2)
      .setTitle(config.panelTitle).setDescription(config.panelDescription)], components: ticketButtons(config), allowedMentions: { parse: [] } };
    let panel;
    if (config.panelChannelId === channel.id && config.panelMessageId) {
      panel = await channel.messages.fetch(config.panelMessageId).catch(() => null);
      if (panel?.author.id !== guild.client.user.id) panel = null;
    }
    panel = panel ? await panel.edit(payload) : await channel.send(payload);
    await mutateGuild(guild.id, (data) => { data.tickets.panelChannelId = channel.id; data.tickets.panelMessageId = panel.id; });
    return panel;
  });
}
async function createTicket(interaction, choiceId) {
  const guild = interaction.guild;
  return locked(`create:${guild.id}:${interaction.user.id}`, async () => {
    const config = (await readGuild(guild.id)).tickets;
    const choice = config.choices.length ? config.choices.find((c) => c.id === choiceId) : choiceId === "general" ? { id: "general", label: "Support" } : null;
    if (!choice) fail("Ce choix n'existe plus. Utilise le panneau actuel du serveur.");
    await guild.channels.fetch();
    const open = guild.channels.cache.filter((channel) => {
      const entry = ticketFrom(channel, config);
      return entry?.ownerId === interaction.user.id && entry.state === "open";
    });
    const maximum = Math.max(1, Math.min(config.maxOpenTicketsPerUser || 1, 5));
    if (open.size >= maximum) fail(`Limite de ${maximum} ticket(s) ouvert(s) atteinte : ${open.map(String).join(", ")}`);
    const categoryId = choice.categoryId || config.categoryId;
    const staffRoleId = choice.staffRoleId || config.staffRoleId;
    const category = categoryId && await guild.channels.fetch(categoryId).catch(() => null);
    const role = staffRoleId && await guild.roles.fetch(staffRoleId).catch(() => null);
    if (category?.type !== ChannelType.GuildCategory || !role || role.id === guild.id) fail("La catégorie ou le rôle support n'est plus valide. Demande au staff de reconfigurer les tickets.");
    let number;
    await mutateGuild(guild.id, (data) => { number = data.tickets.nextNumber++; });
    const permissions = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.AttachFiles];
    const channel = await guild.channels.create({
      name: `${config.channelNamePrefix || "ticket"}-${choice.id}-${String(number).padStart(4, "0")}`.slice(0, 100),
      type: ChannelType.GuildText, parent: category.id,
      topic: `ticket-owner:${interaction.user.id}:${choice.id}`,
      permissionOverwrites: [
        { id: guild.id, type: 0, deny: [P.ViewChannel] },
        { id: interaction.user.id, type: 1, allow: permissions },
        { id: guild.client.user.id, type: 1, allow: [...permissions, P.ManageChannels, P.ManageRoles] },
        { id: role.id, type: 0, allow: permissions },
      ], reason: `Ticket ouvert par ${interaction.user.id}`,
    });
    const entry = { ownerId: interaction.user.id, choiceId: choice.id, staffRoleId, number,
      state: "open", claimedBy: null, extraIds: [], createdAt: Date.now(), originalName: channel.name };
    await save(channel, entry); // Persist ownership even if sending the welcome fails.
    try {
      const message = await channel.send({ content: `<@${entry.ownerId}>${config.mentionStaffEnabled ? ` <@&${role.id}>` : ""}`,
        allowedMentions: { users: [entry.ownerId], roles: config.mentionStaffEnabled ? [role.id] : [] },
        embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle(`🎫 Ticket #${number} — ${choice.label}`.slice(0, 256))
          .setDescription(choice.description || config.ticketOpenMessage)], components: controls(config, entry) });
      entry.controlMessageId = message.id;
      await save(channel, entry);
    } catch {
      await interaction.editReply(`Ticket créé : ${channel}. Le message de contrôle n'a pas pu être envoyé ; utilise les commandes /tickets.`);
      return;
    }
    await interaction.editReply(config.confirmationEnabled === false ? `${channel}` : `Ton ticket a été créé : ${channel}`);
    await audit(channel, "🎫 Ticket ouvert", entry);
  });
}
function parseDuration(value) {
  value = value?.trim().toLowerCase();
  if (value === "annuler") return null;
  const match = value?.toLowerCase().match(/^(\d+)(s|m|h|d)$/);
  const ms = match && Number(match[1]) * { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]];
  if (!ms || ms < 10000 || ms > 30 * 86400000) fail("Indique une durée de 10s à 30d (ex. 30m, 2h) ou annuler.");
  return ms;
}
async function closeTicket(channel, config, entry, actor, reason = null) {
  if (entry.state !== "open") fail("Ce ticket est déjà fermé.");
  for (const id of [entry.ownerId, ...(entry.extraIds || [])]) {
    const overwrite = channel.permissionOverwrites.cache.get(id);
    if (overwrite) await channel.permissionOverwrites.edit(id, { SendMessages: false, SendMessagesInThreads: false }, { type: overwrite.type });
  }
  const transcript = await deliverTicketTranscript(channel, entry.ownerId, config, actor);
  entry.state = "closed";
  entry.closedAt = Date.now();
  entry.autoCloseAt = null;
  entry.closeReason = reason;
  entry.autoCloseReason = null;
  entry.transcript = transcript;
  // Never auto-delete the only copy after failed or truncated transcript delivery.
  const delivered = transcript.dm === "envoyé" || transcript.staff === "envoyé";
  entry.deleteAt = config.autoDeleteClosed && delivered && !transcript.incomplete ? Date.now() + 30000 : null;
  await channel.setTopic(`ticket-closed:${entry.ownerId}:${entry.choiceId}`);
  const review = await prepareReview(channel, entry);
  entry.reviewId = review?.id || null;
  await save(channel, entry);
  await channel.setName(`ferme-${channel.name}`.slice(0, 100)).catch(() => {});
  await updateControls(channel, config, entry);
  const notice = `${config.closeMessage}${reason ? `\nRaison : ${reason}` : ""}\nTranscript MP : **${transcript.dm}**. Archive staff : **${transcript.staff}**.\n${entry.deleteAt ? "Suppression automatique dans environ 30 secondes." : "Salon conservé. Le staff peut le rouvrir ou le supprimer après confirmation."}`;
  await channel.send({ content: notice, allowedMentions: { parse: [] } });
  await sendReviewPrompt(channel, review).catch((error) => console.error("Invitation de notation ticket :", error.code || error.name));
  await audit(channel, "🔒 Ticket fermé", entry);
  return notice;
}
function requireBulkAdministrator(interaction) {
  if (!interaction.member?.permissions.has(P.Administrator)) fail("La fermeture globale demande la permission Administrateur.");
}
function ticketVersion(entry) {
  return `${entry.ownerId}:${entry.choiceId}:${entry.reopenedAt || entry.createdAt || 0}`;
}
async function requestCloseAll(interaction) {
  requireBulkAdministrator(interaction);
  const guild = interaction.guild;
  const channels = await guild.channels.fetch();
  const config = (await readGuild(guild.id)).tickets;
  const snapshot = [...channels.values()].flatMap((channel) => {
    const entry = ticketFrom(channel, config);
    return entry?.state === "open" ? [{ id: channel.id, version: ticketVersion(entry) }] : [];
  });
  if (!snapshot.length) return interaction.editReply("Aucun ticket ouvert sur ce serveur.");
  // One current confirmation per administrator/guild; old or expired prompts cannot act.
  for (const [id, request] of pendingCloseAll) {
    if (request.expiresAt <= Date.now() || (request.guildId === guild.id && request.userId === interaction.user.id)) pendingCloseAll.delete(id);
  }
  const id = randomBytes(12).toString("hex");
  const reason = interaction.options.getString("raison") || "Fermeture administrative globale";
  pendingCloseAll.set(id, { guildId: guild.id, userId: interaction.user.id, snapshot, reason, expiresAt: Date.now() + 120000 });
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("🔒 Fermer tous les tickets ?")
    .setDescription(`**${snapshot.length} ticket(s) ouvert(s)** seront fermés avec leurs transcripts configurés.\nRaison : ${reason}\n\nSeuls les tickets présents à cet instant sont concernés. Les ModMails et autres salons sont exclus. La suppression des salons suivra ton réglage de suppression automatique.\nConfirmation valable 2 minutes, réservée à son auteur.`)],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ticket:closeall-confirm:${id}`).setLabel("Fermer ces tickets").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`ticket:closeall-cancel:${id}`).setLabel("Annuler").setStyle(ButtonStyle.Secondary))],
    allowedMentions: { parse: [] } });
}
async function confirmCloseAll(interaction, id, cancel) {
  const request = pendingCloseAll.get(id);
  if (!request || request.expiresAt <= Date.now()) {
    pendingCloseAll.delete(id); fail("Cette confirmation a expiré ou a déjà été utilisée. Relance /tickets closeall.");
  }
  if (request.guildId !== interaction.guild.id || request.userId !== interaction.user.id) fail("Cette confirmation est réservée à son auteur, dans le serveur concerné.");
  requireBulkAdministrator(interaction);
  pendingCloseAll.delete(id);
  if (cancel) return interaction.editReply("Fermeture globale annulée. Aucun ticket n'a été modifié.");
  await interaction.editReply({ content: `Fermeture de ${request.snapshot.length} ticket(s) en cours…`, embeds: [], components: [] });
  const result = { closed: 0, skipped: 0, failed: 0 };
  for (const target of request.snapshot) {
    try {
      await locked(`ticket:${request.guildId}:${target.id}`, async () => {
        const channel = await interaction.guild.channels.fetch(target.id);
        const config = (await readGuild(request.guildId)).tickets;
        const entry = ticketFrom(channel, config);
        if (!entry || entry.state !== "open" || ticketVersion(entry) !== target.version) { result.skipped++; return; }
        await closeTicket(channel, config, entry, interaction.user, request.reason);
        result.closed++;
      });
    } catch (error) {
      result.failed++;
      console.error(`Fermeture globale ticket ${target.id} :`, error.code || error.name);
    }
  }
  await interaction.editReply({ content: `Fermeture globale terminée : **${result.closed} fermé(s)**, **${result.skipped} ignoré(s)** (modifiés ou déjà fermés), **${result.failed} échec(s)**. Les erreurs n'ont pas interrompu les autres tickets.`, components: [], allowedMentions: { parse: [] } }).catch(() => {});
  return result;
}
async function claimTicket(channel, config, entry, member, release = false) {
  if (!config.claimEnabled) fail("Active d'abord la prise en charge dans /tickets configurer.");
  if (entry.state !== "open") fail("Ce ticket est fermé.");
  if (!isStaff(member, entry)) fail("Seul le support de ce ticket peut le prendre en charge.");
  if (entry.claimedBy && entry.claimedBy !== member.id && !isManager(member)) fail("Ce ticket est déjà pris en charge par un autre membre du support.");
  entry.claimedBy = release ? null : member.id;
  await save(channel, entry);
  await updateControls(channel, config, entry);
  await channel.send({ content: release ? "↩️ Ce ticket est à nouveau disponible pour le support." : `🙋 Ticket pris en charge par <@${member.id}>.`, allowedMentions: { parse: [] } });
}
function namedTargets(guild, text) {
  const normalized = text.toLowerCase();
  const users = [...guild.members.cache.values()].filter((member) =>
    [member.user.username, member.displayName, member.user.tag].some((name) => name?.toLowerCase() === normalized));
  const roles = [...guild.roles.cache.values()].filter((role) => role.name?.toLowerCase() === normalized);
  return [...users.map((member) => ({ id: member.id, type: 1 })), ...roles.map((role) => ({ id: role.id, type: 0 }))];
}
async function resolveTargets(guild, text) {
  const raw = text.includes(",") ? text.split(",") : namedTargets(guild, text.trim()).length ? [text] : text.split(/\s+/);
  const tokens = [...new Set(raw.map((value) => value.trim()).filter(Boolean))];
  if (!tokens.length || tokens.length > 10) fail("Indique entre 1 et 10 membres/rôles (mentions ou identifiants).");
  const targets = [];
  for (const token of tokens) {
    const match = token.match(/^(?:<@([!&]?)(\d{17,20})>|(\d{17,20}))$/);
    if (!match) {
      const candidates = namedTargets(guild, token);
      if (candidates.length !== 1) fail(`${candidates.length ? "Nom ambigu" : "Membre ou rôle introuvable"} : ${token.slice(0, 80)}. Utilise sa mention ou son identifiant.`);
      targets.push(candidates[0]); continue;
    }
    const id = match[2] || match[3];
    let role = match[1] !== "!" && await guild.roles.fetch(id).catch(() => null);
    if (match[1] === "&" && !role) fail("Ce rôle n'existe pas sur le serveur.");
    const member = !role && await guild.members.fetch(id).catch(() => null);
    if (!role && !member) fail("Un membre ou rôle indiqué est introuvable sur ce serveur.");
    targets.push({ id, type: role ? 0 : 1 });
  }
  return [...new Map(targets.map((target) => [target.id, target])).values()];
}
async function act(interaction, action) {
  const target = ["transcript", "rappel"].includes(action) ? interaction.options?.getChannel?.("salon") : null;
  const channel = target || interaction.channel;
  if (!channel || channel.guild?.id !== interaction.guild.id) fail("Choisis un ticket de ce serveur.");
  return locked(`ticket:${interaction.guild.id}:${channel.id}`, async () => {
    const config = (await readGuild(interaction.guild.id)).tickets;
    const entry = ticketFrom(channel, config);
    if (!entry) fail("Cette commande s'utilise dans un ticket de ce bot, pas dans un ModMail.");
    if (!mayRead(interaction.member, channel)) fail("Tu n'as pas accès à ce ticket.");
    const staff = isStaff(interaction.member, entry);
    const owner = entry.ownerId === interaction.user.id;
    if (action === "noter") {
      if (!owner || entry.state !== "closed") fail("Seul le créateur peut noter son ticket fermé.");
      if (!entry.reviewId) fail("Ce ticket n'a pas de demande de notation active : il doit avoir été pris en charge par un membre du support.");
      await submitReview(interaction.guild.id, entry.reviewId, interaction.user.id,
        interaction.options.getInteger("note", true), interaction.options.getString("commentaire"));
      return interaction.editReply("⭐ Merci, ton avis a été enregistré.");
    }
    if (!staff && !(owner && (action === "transcript" || (action === "fermer" && config.allowUserClose)))) fail("Cette action est réservée au support de ce ticket.");
    if (action === "fermer") {
      await closeTicket(channel, config, entry, interaction.user);
      return interaction.editReply("🔒 Ticket fermé. Le résultat de l'archivage est affiché dans le salon.");
    }
    if (action === "claim" || action === "unclaim") {
      await claimTicket(channel, config, entry, interaction.member, action === "unclaim");
      return interaction.editReply(action === "claim" ? "Ticket pris en charge." : "Prise en charge libérée.");
    }
    if (action === "transcript") {
      const text = await buildTicketTranscript(channel);
      const file = new AttachmentBuilder(Buffer.from(text, "utf8"), { name: `transcript-${channel.id}.txt` });
      const sent = await interaction.user.send({ content: `Transcript du ticket ${channel.name} sur ${channel.guild.name}.`, files: [file] }).then(() => true).catch(() => false);
      if (sent) return interaction.editReply("📄 Transcript envoyé dans tes MP.");
      if (!interaction.isPrefixCommand) return interaction.editReply({ content: "Tes MP sont fermés. Voici le transcript dans cette réponse privée.", files: [file] });
      if (channel.permissionsFor(channel.guild.roles.everyone)?.has(P.ViewChannel)) fail("Tes MP sont fermés. Utilise /tickets transcript pour recevoir le fichier dans une réponse privée.");
      await channel.send({ content: `Transcript demandé par <@${interaction.user.id}> (MP fermés).`, files: [file], allowedMentions: { parse: [] } });
      return interaction.editReply(`📄 Transcript déposé dans le ticket privé ${channel}.`);
    }
    if (action === "supprimer") {
      if (entry.state !== "closed") fail("Ferme d'abord le ticket pour générer son transcript.");
      return interaction.editReply({ content: "⚠️ Supprimer définitivement ce salon et son historique ? Vérifie que tu as récupéré le transcript.", components: [new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId(`ticket:delete-confirm:${interaction.user.id}:${channel.id}:${Date.now()}`)
        .setLabel("Supprimer définitivement").setStyle(ButtonStyle.Danger))] });
    }
    if (action === "delete-confirm") {
      const [, , userId, channelId, created] = interaction.customId.split(":");
      if (!staff || userId !== interaction.user.id || channelId !== channel.id || Date.now() - Number(created) > 120000 || !Number.isFinite(Number(created))) fail("Confirmation expirée ou réservée à son auteur. Relance /tickets supprimer.");
      if (entry.state !== "closed") fail("Le ticket a été rouvert ; suppression annulée.");
      await interaction.editReply("Suppression du ticket confirmée.");
      await channel.delete(`Ticket supprimé par ${interaction.user.id}`);
      await mutateGuild(channel.guild.id, (data) => { delete data.tickets.entries[channel.id]; });
      return;
    }
    if (action === "rouvrir") {
      if (entry.state !== "closed") fail("Ce ticket est déjà ouvert.");
      for (const id of [entry.ownerId, ...(entry.extraIds || [])]) {
        const overwrite = channel.permissionOverwrites.cache.get(id);
        if (overwrite) await channel.permissionOverwrites.edit(id, { SendMessages: true, SendMessagesInThreads: null }, { type: overwrite.type });
      }
      await invalidatePendingReview(interaction.guild.id, entry.reviewId);
      entry.reviewId = null;
      entry.reopenedAt = Date.now();
      entry.state = "open"; entry.closedAt = null; entry.deleteAt = null; entry.autoCloseAt = null; entry.autoCloseReason = null;
      await channel.setTopic(`ticket-owner:${entry.ownerId}:${entry.choiceId}`);
      await save(channel, entry);
      await channel.setName(entry.originalName || channel.name.replace(/^ferme-/, "")).catch(() => {});
      await updateControls(channel, config, entry);
      await channel.send("🔓 Ticket rouvert par le support.");
      return interaction.editReply("Ticket rouvert ; suppression automatique annulée.");
    }
    if (entry.state !== "open") fail("Rouvre le ticket avant cette action.");
    if (action === "ajouter" || action === "retirer") {
      const targets = await resolveTargets(channel.guild, interaction.options.getString("cibles", true));
      const protectedIds = new Set([channel.guild.id, channel.client.user.id, entry.ownerId, entry.staffRoleId]);
      if (targets.some(({ id }) => protectedIds.has(id))) fail("Le créateur, le bot, @everyone et le rôle support sont protégés.");
      entry.extraIds ||= [];
      if (action === "retirer" && targets.some(({ id }) => !entry.extraIds.includes(id))) fail("Tu peux retirer uniquement les participants ajoutés avec cette commande.");
      for (const target of targets) {
        if (action === "ajouter") {
          await channel.permissionOverwrites.edit(target.id, { ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true }, { type: target.type });
          entry.extraIds = [...new Set([...entry.extraIds, target.id])];
        } else {
          await channel.permissionOverwrites.delete(target.id);
          entry.extraIds = entry.extraIds.filter((id) => id !== target.id);
        }
        await save(channel, entry); // Partial API failures must not lose successful changes.
      }
      return interaction.editReply(`${targets.length} participant(s) ${action === "ajouter" ? "ajouté(s)" : "retiré(s)"}.`);
    }
    if (action === "renommer") {
      const name = interaction.options.getString("nom", true).trim().toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 90);
      if (!name) fail("Indique un nom de salon valide.");
      await channel.setName(name); entry.originalName = name; await save(channel, entry);
      return interaction.editReply("Nom du ticket modifié.");
    }
    if (action === "rappel") {
      if (entry.lastReminderAt && Date.now() - entry.lastReminderAt < 60000) fail("Attends une minute entre deux rappels.");
      entry.lastReminderAt = Date.now(); await save(channel, entry);
      await channel.send({ content: `🔔 <@${entry.ownerId}>, le support attend ta réponse dans ce ticket.`, allowedMentions: { users: [entry.ownerId] } });
      return interaction.editReply("Rappel envoyé.");
    }
    if (action === "autoclose") {
      const duration = parseDuration(interaction.options.getString("duree", true));
      entry.autoCloseAt = duration ? Date.now() + duration : null;
      entry.autoCloseReason = duration ? interaction.options.getString("raison") || "Fermeture automatique" : null;
      await save(channel, entry);
      return interaction.editReply({ content: duration ? `Fermeture prévue <t:${Math.floor(entry.autoCloseAt / 1000)}:R>, avec transcript. Ce délai est conservé après redémarrage.\nRaison : ${entry.autoCloseReason}` : "Fermeture programmée annulée.", allowedMentions: { parse: [] } });
    }
  });
}
async function guarded(interaction, work) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try { await work(); } catch (error) {
    const expected = error instanceof TicketError || error instanceof ReviewError;
    if (!expected) console.error("Action ticket impossible :", error.code || error.name);
    await interaction.editReply({ content: expected ? error.message : "Action impossible. Vérifie les permissions du bot (salons, rôles, historique, fichiers), puis réessaie.", allowedMentions: { parse: [] } }).catch(() => {});
  }
}
async function handleTicketCommand(interaction) {
  const action = interaction.options.getSubcommand();
  if (!ACTIONS.has(action)) return false;
  await guarded(interaction, () => action === "closeall" ? requestCloseAll(interaction)
    : action === "stars" ? showReviews(interaction) : act(interaction, action));
  return true;
}
async function handleTicketInteraction(interaction) {
  if (!interaction.customId?.startsWith("ticket:")) return false;
  if (interaction.customId.startsWith("ticket:rate:")) {
    await guarded(interaction, async () => {
      const [, , guildId, reviewId, rawScore] = interaction.customId.split(":");
      if (!/^[0-9]{17,20}$/.test(guildId) || !/^[a-f0-9]{20}$/.test(reviewId) || !/^[1-5]$/.test(rawScore)) fail("Invitation de notation invalide.");
      if (interaction.guild && interaction.guild.id !== guildId) fail("Cette invitation ne concerne pas ce serveur.");
      if (!interaction.client.guilds.cache.has(guildId)) fail("Le bot n'est plus sur ce serveur.");
      await submitReview(guildId, reviewId, interaction.user.id, Number(rawScore));
      await interaction.editReply("⭐ Merci, ta note a été enregistrée.");
    });
    return true;
  }
  if (!interaction.guild || !interaction.member) return false;
  await guarded(interaction, async () => {
    const [, name, choiceId] = interaction.customId.split(":");
    if (name === "closeall-confirm" || name === "closeall-cancel") return confirmCloseAll(interaction, choiceId, name === "closeall-cancel");
    if (name === "create" || name === "select") return createTicket(interaction, name === "select" ? interaction.values[0] : choiceId || "general");
    const action = name === "close" ? "fermer" : name;
    if (!ACTIONS.has(action) && action !== "delete-confirm") fail("Ce bouton n'est plus disponible.");
    return act(interaction, action);
  });
  return true;
}
async function handleTicketMessage(message) {
  if (!message.guild || message.author.bot || !message.member) return false;
  const config = (await readGuild(message.guild.id)).tickets;
  const entry = ticketFrom(message.channel, config);
  if (!config.claimEnabled || !config.autoClaimEnabled || !entry || entry.state !== "open" || entry.claimedBy || !isStaff(message.member, entry)) return false;
  await locked(`ticket:${message.guild.id}:${message.channel.id}`, async () => {
    const latest = (await readGuild(message.guild.id)).tickets;
    const current = ticketFrom(message.channel, latest);
    if (current?.state === "open" && !current.claimedBy && latest.autoClaimEnabled && latest.claimEnabled) await claimTicket(message.channel, latest, current, message.member);
  });
  return true;
}
async function runTicketMaintenance(client, now = Date.now()) {
  for (const guild of client.guilds.cache.values()) {
    const config = (await readGuild(guild.id)).tickets;
    for (const [id, saved] of Object.entries(config.entries || {})) {
      if (!(saved.autoCloseAt && saved.autoCloseAt <= now) && !(saved.deleteAt && saved.deleteAt <= now)) continue;
      await locked(`ticket:${guild.id}:${id}`, async () => {
        const latest = (await readGuild(guild.id)).tickets;
        const channel = await guild.channels.fetch(id).catch((error) => { if (error.code === 10003) return null; throw error; });
        if (!channel) { await mutateGuild(guild.id, (data) => { delete data.tickets.entries[id]; }); return; }
        const entry = ticketFrom(channel, latest);
        if (!entry) return;
        if (entry.state === "open" && entry.autoCloseAt && entry.autoCloseAt <= now) await closeTicket(channel, latest, entry, client.user, entry.autoCloseReason || "Fermeture automatique");
        else if (entry.state === "closed" && entry.deleteAt && entry.deleteAt <= now) {
          if (!latest.autoDeleteClosed) { entry.deleteAt = null; await save(channel, entry); return; }
          await channel.delete("Suppression automatique du ticket archivé");
          await mutateGuild(guild.id, (data) => { delete data.tickets.entries[id]; });
        }
      }).catch((error) => console.error(`Maintenance ticket ${id} :`, error.code || error.name));
    }
  }
}
function startTicketMaintenance(client) {
  if (timers.has(client)) return;
  let running = false;
  const tick = async () => { if (running) return; running = true; try { await runTicketMaintenance(client); } catch (error) { console.error("Maintenance tickets :", error.code || error.name); } finally { running = false; } };
  const timer = setInterval(tick, 15000); timer.unref(); timers.set(client, timer); void tick();
}
module.exports = { controls, ticketFrom, isStaff, parseDuration, createTicket, closeTicket, claimTicket,
  publishTicketPanel, handleTicketCommand, handleTicketInteraction, handleTicketMessage, runTicketMaintenance, startTicketMaintenance };
