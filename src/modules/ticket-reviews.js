const { randomBytes } = require("node:crypto");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits: P } = require("discord.js");
const { readGuild, mutateGuild } = require("../persistence/guild-store");
const REVIEW_LIFETIME = 7 * 24 * 60 * 60 * 1000;
class ReviewError extends Error {}

function reviewButtons(guildId, reviewId) {
  return [new ActionRowBuilder().addComponents(...[1, 2, 3, 4, 5].map((score) => new ButtonBuilder()
    .setCustomId(`ticket:rate:${guildId}:${reviewId}:${score}`)
    .setLabel(`${score} ⭐`).setStyle(ButtonStyle.Secondary)))];
}
async function prepareReview(channel, entry) {
  if (!entry.claimedBy || entry.claimedBy === entry.ownerId) return null;
  const review = { id: randomBytes(10).toString("hex"), ticketId: channel.id, ownerId: entry.ownerId,
    staffId: entry.claimedBy, createdAt: Date.now(), expiresAt: Date.now() + REVIEW_LIFETIME,
    score: null, comment: null, submittedAt: null };
  let created = false;
  await mutateGuild(channel.guild.id, (data) => {
    data.tickets.reviews ||= {};
    if (Object.values(data.tickets.reviews).some((item) => item.ticketId === channel.id && item.submittedAt)) return;
    for (const [id, item] of Object.entries(data.tickets.reviews)) {
      if (!item.submittedAt && item.ticketId === channel.id) delete data.tickets.reviews[id];
    }
    data.tickets.reviews[review.id] = review;
    created = true;
  });
  return created ? review : null;
}
async function sendReviewPrompt(channel, review) {
  if (!review) return;
  const payload = { embeds: [new EmbedBuilder().setColor(0xffd700).setTitle("⭐ Comment s'est passé ton ticket ?")
    .setDescription(`Ton ticket **${channel.name}** sur **${channel.guild.name}** a été fermé.\nNote la prise en charge de <@${review.staffId}> de 1 à 5 étoiles. Tu disposes de 7 jours et d'un seul vote.\nPour ajouter un commentaire avant de voter, utilise /tickets noter dans le ticket s'il est encore disponible. N'inclus pas d'informations sensibles.`)],
    components: reviewButtons(channel.guild.id, review.id), allowedMentions: { parse: [] } };
  const user = await channel.client.users.fetch(review.ownerId).catch(() => null);
  const delivered = user && await user.send(payload).then(() => true).catch(() => false);
  if (!delivered) await channel.send({ ...payload, content: `<@${review.ownerId}>, tu peux noter la prise en charge ici.` });
}
async function invalidatePendingReview(guildId, reviewId) {
  if (!reviewId) return;
  await mutateGuild(guildId, (data) => {
    if (data.tickets.reviews?.[reviewId] && !data.tickets.reviews[reviewId].submittedAt) delete data.tickets.reviews[reviewId];
  });
}
async function submitReview(guildId, reviewId, userId, score, comment = null) {
  if (!Number.isInteger(score) || score < 1 || score > 5) throw new ReviewError("La note doit être un entier entre 1 et 5.");
  if (comment && comment.length > 500) throw new ReviewError("Le commentaire est limité à 500 caractères.");
  await mutateGuild(guildId, (data) => {
    const review = data.tickets.reviews?.[reviewId];
    if (!review || review.ownerId !== userId) throw new ReviewError("Cette invitation est réservée au créateur du ticket, ou n'est plus valide.");
    if (review.submittedAt) throw new ReviewError("Tu as déjà donné une note pour ce ticket.");
    if (review.expiresAt <= Date.now()) throw new ReviewError("Le délai de 7 jours pour noter ce ticket est dépassé.");
    const entry = data.tickets.entries?.[review.ticketId];
    if (entry && entry.state !== "closed") throw new ReviewError("Ce ticket n'est plus fermé.");
    review.score = score;
    review.comment = comment?.trim() || null;
    review.submittedAt = Date.now();
  });
}
async function showReviews(interaction) {
  const config = (await readGuild(interaction.guild.id)).tickets;
  const user = interaction.options.getUser("utilisateur") || interaction.user;
  const reviews = Object.values(config.reviews || {}).filter((review) =>
    review.staffId === user.id && review.submittedAt && Number.isInteger(review.score) && review.score >= 1 && review.score <= 5);
  const embed = new EmbedBuilder().setColor(0xffd700).setTitle(`Notes de ${user.username || user.tag || user.id}`.slice(0, 256));
  if (!reviews.length) embed.setDescription("Ce membre n'a pas encore reçu de notes de tickets.");
  else {
    const average = reviews.reduce((total, review) => total + review.score, 0) / reviews.length;
    embed.setDescription(`Note moyenne : **${average.toFixed(1)}/5** ⭐ (${reviews.length} avis)`);
    const supportRoles = [config.staffRoleId, ...config.choices.map((choice) => choice.staffRoleId)].filter(Boolean);
    const isSupport = interaction.member.permissions.has(P.ManageChannels) || supportRoles.some((id) => interaction.member.roles.cache.has(id));
    // Prefix replies are public: never publish private ticket feedback in an arbitrary channel.
    if (!interaction.isPrefixCommand && isSupport) {
      embed.addFields(...reviews.sort((a, b) => b.submittedAt - a.submittedAt).slice(0, 5).map((review) => ({
        name: `${review.score} ⭐ — <t:${Math.floor(review.submittedAt / 1000)}:R>`, value: review.comment || "Aucun commentaire",
      })));
    } else embed.setFooter({ text: "Les derniers commentaires sont réservés au support via /tickets stars." });
  }
  await interaction.editReply({ embeds: [embed], allowedMentions: { parse: [] } });
}
module.exports = { ReviewError, reviewButtons, prepareReview, sendReviewPrompt, invalidatePendingReview, submitReview, showReviews };
