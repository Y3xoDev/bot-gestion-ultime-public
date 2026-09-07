const TYPES = {
  membres: "Membres (sans bots)", humains: "Membres humains", bots: "Bots",
  enligne: "Humains en ligne (sans bots)", vocal: "Membres en vocal",
  boosts: "Boosts", roles: "Rôles", salons: "Salons hors statistiques",
  role: "Membres d'un rôle", texte: "Texte libre / invitation",
};
const MIN_INTERVAL = 10;
const MAX_COUNTERS = 20;
const RENAME_DELAY = MIN_INTERVAL * 60_000;

function newStatistics() {
  return { enabled: false, categoryId: null, categoryName: "📊 // Espace Statistiques",
    categoryPosition: 0, categoryRenamedAt: 0, intervalMinutes: MIN_INTERVAL,
    visibleRoleId: null, color: "5865F2", entries: [], layoutPending: false,
    lastSyncAt: 0, nextRunAt: 0, lastError: null };
}

function normalizeStatistics(value = {}) {
  return { ...newStatistics(), ...value,
    intervalMinutes: Math.max(MIN_INTERVAL, Math.min(60, Number(value.intervalMinutes) || MIN_INTERVAL)),
    entries: Array.isArray(value.entries) ? value.entries : [] };
}

function defaultEntries() {
  return [
    ["membres", "🌍 › Membres : {compteur}"],
    ["enligne", "⭐ › En ligne : {compteur}"],
    ["vocal", "🔊 › Vocal : {compteur}"],
    ["texte", "🪐 › {serveur}"],
  ].map(([type, template]) => ({ id: type, type, template, roleId: null, channelId: null, renamedAt: 0 }));
}

function validateTemplate(template, type) {
  if (!Object.hasOwn(TYPES, type)) throw new Error("Type de compteur inconnu.");
  if (typeof template !== "string" || !template.trim() || template.length > 100 || /[\r\n\u0000-\u001f]/.test(template)) {
    throw new Error("Le nom doit contenir de 1 à 100 caractères sur une seule ligne.");
  }
  if (type !== "texte" && !template.includes("{compteur}")) throw new Error("Ajoute {compteur} dans le nom pour afficher le nombre.");
  if (/\{[^{}]*\}/g.test(template.replace(/\{(?:compteur|serveur|nom_role)\}/g, ""))) {
    throw new Error("Variables autorisées : {compteur}, {serveur}, {nom_role}.");
  }
  return template;
}

function renderName(entry, guild, counts) {
  const value = counts[entry.type === "role" ? `role:${entry.roleId}` : entry.type];
  const variables = { compteur: value === null || value === undefined ? "indisponible" : String(value),
    serveur: guild.name, nom_role: guild.roles.cache.get(entry.roleId)?.name || "rôle supprimé" };
  // One replacement pass: braces inside a server/role name cannot inject other variables.
  let name = entry.template.replace(/\{(compteur|serveur|nom_role)\}/g, (_, key) => variables[key]);
  name = name.replace(/[\r\n\u0000-\u001f]/g, " ").slice(0, 100);
  if (/[\uD800-\uDBFF]$/.test(name)) name = name.slice(0, -1);
  return name.trim() || "Statistiques";
}

module.exports = { TYPES, MIN_INTERVAL, MAX_COUNTERS, RENAME_DELAY, newStatistics, normalizeStatistics,
  defaultEntries, validateTemplate, renderName };
