const assert = require("node:assert/strict");
const path = require("node:path");
const {
  ActivityType,
  ApplicationCommandOptionType,
  AutoModerationActionType,
  Collection,
  PermissionFlagsBits,
} = require("discord.js");
const { commands } = require("../src/commands");
const { buildRuleSpecs, parseKeywords } = require("../src/modules/discord-automod");
const { dataFile, readGuild } = require("../src/persistence/guild-store");
const {
  advancedOptionsModal,
  choiceModal,
  dashboardPayload,
  optionsPayload,
} = require("../src/modules/ticket-config");
const {
  buildTicketTranscript,
  LOG_DEFINITIONS,
  unlogsConfirmationPayload,
} = require("../src/modules/server-events");

async function main() {

assert.equal(path.basename(dataFile), "bot-data.json");
assert.deepEqual(
  LOG_DEFINITIONS.map(({ name }) => name),
  [
    "🔨・logs-bannissements",
    "🔇・logs-mutes",
    "🚪・logs-expulsions",
    "⚠️・logs-warns",
    "🛡️・logs-anti-raid",
    "🎭・logs-rôles",
    "🏠・logs-salons",
    "💬・logs-messages",
    "🤖・logs-bots",
    "🔐・logs-permissions",
    "🔊・logs-vocaux",
    "⚙️・logs-automod",
    "📨・logs-modmail",
  ],
);
assert.equal(new Set(LOG_DEFINITIONS.map(({ key }) => key)).size, LOG_DEFINITIONS.length);

const expectedCommands = [
  "accueil",
  "absence",
  "admin",
  "annonce",
  "aide-gestion",
  "antilink",
  "antiraid",
  "autorank",
  "avatar",
  "automod",
  "avertir",
  "avertissement-retirer",
  "avertissements",
  "bannir",
  "banner",
  "blacklist",
  "backup",
  "boosters",
  "boutique",
  "botinfo",
  "choisir",
  "classement",
  "croissance",
  "crow",
  "de",
  "debannir",
  "deverrouiller",
  "dire",
  "expulser",
  "event",
  "logs",
  "listes",
  "levels",
  "modmail",
  "onboarding",
  "owners",
  "ownerbot",
  "presence",
  "protect",
  "profil",
  "protection-vocale",
  "purger",
  "question-anonyme",
  "questions-anonymes",
  "react-role",
  "renew",
  "renouveler",
  "rappel",
  "rappel-annuler",
  "rappels",
  "reponse",
  "reponses",
  "role",
  "role-bouton",
  "rules",
  "security",
  "serverinfo",
  "slowmode",
  "snipe",
  "sondage",
  "stats",
  "statistiques",
  "suggerer",
  "suggestions",
  "tempvocal",
  "tickets",
  "timeout",
  "untimeout",
  "unlogs",
  "unmodmail",
  "userinfo",
  "verrouiller",
  "vocal",
  "vouch",
  "whitelist",
  "giveaway",
  "help",
  "huitball",
  "join",
  "leave",
  "pile-ou-face",
  "ping",
];

assert.deepEqual(
  commands.map((command) => command.name).sort(),
  expectedCommands.sort(),
);
assert.equal(new Set(commands.map((command) => command.name)).size, commands.length);

const {
  HELP_CATEGORIES,
  buildHelpEmbeds,
  helpPanelPayload,
} = require("../src/modules/help");
const {
  PREFIX_ALIASES,
  commandUsage,
  parseBoolean,
  parsePrefixCommand,
  prefixCommandNames,
  tokenizeArguments,
} = require("../src/interactions/prefix-router");
const {
  buildPresencePayload,
  normalizePresence,
  normalizeStreamUrl,
} = require("../src/modules/bot-presence");
const {
  levelFromXp,
  parseLocalDate,
  xpForLevel,
} = require("../src/modules/advanced-features");
const {
  ADDITIONAL_BOT_OWNER_IDS,
  buildBotInviteUrl,
  isBotOwner,
  leaveConfirmationPayload,
  normalizeGuildId,
  parseBotOwnerIds,
} = require("../src/modules/guild-access");
const {
  buildAntiLinkRuleOptions,
  LINK_FILTER,
  refreshManagedAntiLinkRule,
} = require("../src/modules/legacy-features");
const {
  containsDiscordToken,
  formatMilliseconds,
  safeHttpsUrl,
} = require("../src/modules/multi-bot-features");
const {
  automaticModmailOptions,
  generateModmailVerificationCode,
  modmailVerificationCodeHash,
  modmailVerificationPayload,
  unmodmailConfirmationPayload,
} = require("../src/modules/modmail");

assert.deepEqual(
  prefixCommandNames().sort(),
  commands.map((command) => command.name).sort(),
);
assert.deepEqual(parseBotOwnerIds("22222222222222222, 33333333333333333;22222222222222222 invalide"), [
  "22222222222222222",
  "33333333333333333",
]);
assert.equal(Object.isFrozen(ADDITIONAL_BOT_OWNER_IDS), true);
assert.equal(
  await isBotOwner(
    { application: { fetch: async () => ({ owner: { id: "11111111111111111" } }) } },
    "11111111111111111",
  ),
  true,
);
assert.equal(
  await isBotOwner(
    { application: { fetch: async () => ({ owner: { id: "11111111111111111" } }) } },
    "22222222222222222",
  ),
  false,
);
for (const { commandName } of PREFIX_ALIASES.values()) {
  assert.ok(prefixCommandNames().includes(commandName));
}

assert.deepEqual(tokenizeArguments('+avertir <@12345678901234567> "raison avec espaces"'), [
  "+avertir",
  "<@12345678901234567>",
  "raison avec espaces",
]);
assert.deepEqual(tokenizeArguments('+timeout <@12345678901234567> minutes=10 raison="spam répété"'), [
  "+timeout",
  "<@12345678901234567>",
  "minutes=10",
  "raison=spam répété",
]);
assert.equal(parseBoolean("oui"), true);
assert.equal(parseBoolean("non"), false);
assert.equal(parseBoolean("invalide"), null);
const fakeMessage = {
  client: { users: { fetch: async (id) => ({ id }) } },
  guild: {
    channels: { fetch: async (id) => ({ id }) },
    roles: { fetch: async (id) => ({ id }) },
  },
};
assert.equal((await parsePrefixCommand(fakeMessage, "+statistiques", "+")).subcommand, "configurer");
assert.equal((await parsePrefixCommand(fakeMessage, "+statistiques setup", "+")).subcommand, "setup");
const parsedStats = await parsePrefixCommand(fakeMessage, '+statistiques ajouter membres "🌊 › Membres : {compteur}" position=1', "+");
assert.equal(parsedStats.values.get("nom"), "🌊 › Membres : {compteur}");
assert.equal(parsedStats.values.get("position"), 1);
const parsedStatsOptions = await parsePrefixCommand(fakeMessage, '+statistiques options categorie="📊 Statistiques" intervalle=20 public=oui', "+");
assert.equal(parsedStatsOptions.values.get("public"), true);
assert.equal(parsedStatsOptions.values.get("categorie"), "📊 Statistiques");
const parsedRulesPrefix = await parsePrefixCommand(
  fakeMessage,
  '+rules creer <#12345678901234567> <@&22345678901234567> "Respecte les autres membres" couleur=FFAA00',
  "+",
);
assert.equal(parsedRulesPrefix.commandName, "rules");
assert.equal(parsedRulesPrefix.subcommand, "creer");
assert.equal(parsedRulesPrefix.values.get("description"), "Respecte les autres membres");
assert.equal(parsedRulesPrefix.values.get("couleur"), "FFAA00");
const sayDefinition = commands.find((command) => command.name === "dire");
assert.equal(sayDefinition.options.find((option) => option.name === "contenu").required, false);
assert.equal(sayDefinition.options.find((option) => option.name === "contenu").max_length, 2000);
const directSayPrefix = await parsePrefixCommand(fakeMessage, '+dire "Bienvenue sur le serveur" salon=12345678901234567 embed=oui', "+");
assert.equal(directSayPrefix.values.get("contenu"), "Bienvenue sur le serveur");
assert.equal(directSayPrefix.values.get("salon").id, "12345678901234567");
assert.equal(directSayPrefix.values.get("embed"), true);
const renewDefinition = commands.find((command) => command.name === "renew");
assert.ok(renewDefinition);
assert.equal(renewDefinition.default_member_permissions, PermissionFlagsBits.ManageChannels.toString());
assert.equal((await parsePrefixCommand(fakeMessage, "+renew", "+")).commandName, "renouveler");
const announcementDefinition = commands.find((command) => command.name === "annonce");
const sendAnnouncementDefinition = announcementDefinition.options.find((option) => option.name === "envoyer");
assert.equal(sendAnnouncementDefinition.options.find((option) => option.name === "texte").required, false);
const emptyAnnouncementPrefix = await parsePrefixCommand(fakeMessage, "+ annonce envoyer <#12345678901234567>", "+");
assert.equal(emptyAnnouncementPrefix.commandName, "annonce");
assert.equal(emptyAnnouncementPrefix.values.get("texte"), null);
const oldScheduledAnnouncementPrefix = await parsePrefixCommand(
  fakeMessage,
  '+annonce programmer <#12345678901234567> "Ancien ordre" 10',
  "+",
);
assert.equal(oldScheduledAnnouncementPrefix.values.get("minutes"), 10);
assert.equal(oldScheduledAnnouncementPrefix.values.get("texte"), "Ancien ordre");
const newScheduledAnnouncementPrefix = await parsePrefixCommand(
  fakeMessage,
  '+annonce programmer <#12345678901234567> 10 "Nouveau texte"',
  "+",
);
assert.equal(newScheduledAnnouncementPrefix.values.get("minutes"), 10);
assert.equal(newScheduledAnnouncementPrefix.values.get("texte"), "Nouveau texte");
assert.match(
  commandUsage(commands.find((command) => command.name === "automod"), "+"),
  /^\+automod configurer/m,
);
const parsedLegacyAlias = await parsePrefixCommand(
  fakeMessage,
  "+mv <@12345678901234567> <#22345678901234567>",
  "+",
);
assert.equal(parsedLegacyAlias.commandName, "vocal");
assert.equal(parsedLegacyAlias.subcommand, "deplacer");
const parsedBareTickets = await parsePrefixCommand(fakeMessage, "+tickets", "+");
assert.equal(parsedBareTickets.subcommand, "configurer");
const parsedTicketAdd = await parsePrefixCommand(fakeMessage, "+tickets ajouter <@12345678901234567> <@&22345678901234567>", "+");
assert.equal(parsedTicketAdd.values.get("cibles"), "<@12345678901234567> <@&22345678901234567>");
const parsedTicketClaim = await parsePrefixCommand(fakeMessage, "+claim", "+");
assert.equal(parsedTicketClaim.commandName, "tickets");
assert.equal(parsedTicketClaim.subcommand, "claim");
const parsedTicketClose = await parsePrefixCommand(fakeMessage, "+tickets autoclose 2h", "+");
assert.equal(parsedTicketClose.values.get("duree"), "2h");
const parsedAutoCloseReason = await parsePrefixCommand(fakeMessage, "+autoclose 30m demande résolue", "+");
assert.equal(parsedAutoCloseReason.values.get("raison"), "demande résolue");
assert.equal((await parsePrefixCommand(fakeMessage, "+closeall fin du support", "+")).subcommand, "closeall");
assert.equal((await parsePrefixCommand(fakeMessage, "+stars <@12345678901234567>", "+")).values.get("utilisateur").id, "12345678901234567");
assert.equal((await parsePrefixCommand(fakeMessage, "+transcript <#12345678901234567>", "+")).values.get("salon").id, "12345678901234567");
assert.equal((await parsePrefixCommand(fakeMessage, "+rappel <#12345678901234567>", "+")).commandName, "tickets");
const ticketMessage = { ...fakeMessage, channel: { topic: "ticket-owner:12345678901234567:general" } };
assert.equal((await parsePrefixCommand(ticketMessage, "+rappel", "+")).subcommand, "rappel");
assert.equal((await parsePrefixCommand(ticketMessage, "+rappel 10 pense à vérifier", "+")).commandName, "rappel");
assert.equal((await parsePrefixCommand(fakeMessage, "+tickets noter 5 très bon suivi", "+")).values.get("note"), 5);
const parsedPresencePrefix = await parsePrefixCommand(
  fakeMessage,
  '+presence activite regarder "les nouveaux tickets"',
  "+",
);
assert.equal(parsedPresencePrefix.commandName, "presence");
assert.equal(parsedPresencePrefix.subcommand, "activite");
assert.equal(parsedPresencePrefix.values.get("type"), "regarder");
assert.equal(parsedPresencePrefix.values.get("texte"), "les nouveaux tickets");
const parsedPaymentAlias = await parsePrefixCommand(fakeMessage, "+payment", "+");
assert.equal(parsedPaymentAlias.commandName, "boutique");
assert.equal(parsedPaymentAlias.subcommand, "paiement");
const parsedVouchAlias = await parsePrefixCommand(fakeMessage, "+setup-vouch <#12345678901234567>", "+");
assert.equal(parsedVouchAlias.commandName, "vouch");
assert.equal(parsedVouchAlias.subcommand, "configurer");
assert.equal(parsedVouchAlias.values.get("salon").id, "12345678901234567");
const parsedBotsAlias = await parsePrefixCommand(fakeMessage, "+allbots", "+");
assert.equal(parsedBotsAlias.commandName, "crow");
assert.equal(parsedBotsAlias.subcommand, "listes");
assert.equal(parsedBotsAlias.values.get("type"), "bots");
const parsedVoiceTimeAlias = await parsePrefixCommand(fakeMessage, "+voctime <@12345678901234567>", "+");
assert.equal(parsedVoiceTimeAlias.commandName, "protect");
assert.equal(parsedVoiceTimeAlias.subcommand, "voctime");
assert.equal(parsedVoiceTimeAlias.values.get("membre").id, "12345678901234567");
const parsedVoiceResetAlias = await parsePrefixCommand(fakeMessage, "+vocalreset <@12345678901234567> oui", "+");
assert.equal(parsedVoiceResetAlias.commandName, "protect");
assert.equal(parsedVoiceResetAlias.subcommand, "vocalreset");
assert.equal(parsedVoiceResetAlias.values.get("confirmation"), true);
assert.equal(parsedVoiceResetAlias.values.get("membre").id, "12345678901234567");
const parsedAutoRoleAlias = await parsePrefixCommand(fakeMessage, "+autorole <@&22345678901234567>", "+");
assert.equal(parsedAutoRoleAlias.commandName, "autorank");
assert.equal(parsedAutoRoleAlias.subcommand, "configurer");
assert.equal(parsedAutoRoleAlias.values.get("role_arrivee").id, "22345678901234567");
const parsedMassRoleAlias = await parsePrefixCommand(fakeMessage, "+massiverole <@&22345678901234567> oui", "+");
assert.equal(parsedMassRoleAlias.commandName, "crow");
assert.equal(parsedMassRoleAlias.subcommand, "massrole");
assert.equal(parsedMassRoleAlias.values.get("action"), "ajouter");
assert.equal(parsedMassRoleAlias.values.get("confirmation"), true);
const parsedMixNameAlias = await parsePrefixCommand(fakeMessage, "+mixname <@12345678901234567> <@22345678901234567>", "+");
assert.equal(parsedMixNameAlias.commandName, "protect");
assert.equal(parsedMixNameAlias.subcommand, "mixnom");
assert.equal(parsedMixNameAlias.values.get("membre_2").id, "22345678901234567");
const parsedAntiTokenAlias = await parsePrefixCommand(fakeMessage, "+antitoken oui", "+");
assert.equal(parsedAntiTokenAlias.commandName, "crow");
assert.equal(parsedAntiTokenAlias.subcommand, "anti-token");
assert.equal(parsedAntiTokenAlias.values.get("actif"), true);
const parsedClearOwnersAlias = await parsePrefixCommand(fakeMessage, "+clearowner oui", "+");
assert.equal(parsedClearOwnersAlias.commandName, "protect");
assert.equal(parsedClearOwnersAlias.subcommand, "acces-effacer");
assert.equal(parsedClearOwnersAlias.values.get("liste"), "owners");
assert.equal(parsedClearOwnersAlias.values.get("confirmation"), true);
const parsedAutoModAllPrefix = await parsePrefixCommand(fakeMessage, "+automod all", "+");
assert.equal(parsedAutoModAllPrefix.commandName, "automod");
assert.equal(parsedAutoModAllPrefix.subcommand, "all");
assert.equal(parsedAutoModAllPrefix.values.get("salon_alertes"), null);
const parsedUnlogsPrefix = await parsePrefixCommand(fakeMessage, "+unlogs", "+");
assert.equal(parsedUnlogsPrefix.commandName, "unlogs");
assert.equal(parsedUnlogsPrefix.subcommand, null);
const parsedJoinPrefix = await parsePrefixCommand(
  fakeMessage,
  "+join 12345678901234567",
  "+",
);
assert.equal(parsedJoinPrefix.commandName, "join");
assert.equal(parsedJoinPrefix.subcommand, "serveur");
assert.equal(parsedJoinPrefix.values.get("serveur_id"), "12345678901234567");
assert.equal((await parsePrefixCommand(fakeMessage, "+join serveur 12345678901234567", "+")).values.get("serveur_id"), "12345678901234567");
assert.equal((await parsePrefixCommand(fakeMessage, "+join serveur_id=12345678901234567", "+")).subcommand, "serveur");
assert.equal((await parsePrefixCommand(fakeMessage, "+join --serveur_id 12345678901234567", "+")).subcommand, "serveur");
assert.equal((await parsePrefixCommand(fakeMessage, "+join voc", "+")).subcommand, "voc");
assert.equal((await parsePrefixCommand(fakeMessage, "+join voc <#12345678901234567>", "+")).values.get("salon").id, "12345678901234567");
assert.deepEqual(commands.find(c => c.name === "join").options.map(o => o.name), ["voc", "serveur"]);
const parsedLeavePrefix = await parsePrefixCommand(
  fakeMessage,
  "+leave 12345678901234567",
  "+",
);
assert.equal(parsedLeavePrefix.commandName, "leave");
assert.equal(parsedLeavePrefix.values.get("serveur_id"), "12345678901234567");
const parsedModmailAllPrefix = await parsePrefixCommand(fakeMessage, "+modmail all", "+");
assert.equal(parsedModmailAllPrefix.commandName, "modmail");
assert.equal(parsedModmailAllPrefix.subcommand, "all");
const parsedModmailPanel = await parsePrefixCommand(fakeMessage, "+modmail panel <#12345678901234567>", "+");
assert.equal(parsedModmailPanel.commandName, "modmail");
assert.equal(parsedModmailPanel.subcommand, "panel");
assert.equal(parsedModmailPanel.values.get("salon").id, "12345678901234567");
const parsedUnmodmailPrefix = await parsePrefixCommand(fakeMessage, "+unmodmail", "+");
assert.equal(parsedUnmodmailPrefix.commandName, "unmodmail");
assert.equal(parsedUnmodmailPrefix.subcommand, null);
const parsedModmailVerificationPrefix = await parsePrefixCommand(
  fakeMessage,
  "+modmail verif 123456 12345678901234567",
  "+",
);
assert.equal(parsedModmailVerificationPrefix.commandName, "modmail");
assert.equal(parsedModmailVerificationPrefix.subcommand, "verif");
assert.equal(parsedModmailVerificationPrefix.values.get("code"), "123456");
assert.equal(
  parsedModmailVerificationPrefix.values.get("serveur_id"),
  "12345678901234567",
);
const helpEmbeds = buildHelpEmbeds("+");
const helpText = helpEmbeds.map((embed) => embed.data.description).join("\n");
for (const command of commands) {
  assert.match(helpText, new RegExp(`\\/${command.name}(?:\\\`|\\s)`));
  assert.match(helpText, new RegExp(`\\+${command.name}(?:\\\`|\\s)`));
}
const categorizedCommands = HELP_CATEGORIES.flatMap((category) => [...category.commands]);
assert.equal(new Set(categorizedCommands).size, commands.length);
assert.deepEqual(new Set(categorizedCommands), new Set(commands.map((command) => command.name)));
const helpHome = helpPanelPayload("12345678901234567", "home", 0, "+");
assert.equal(helpHome.embeds.length, 1);
assert.equal(helpHome.components.length, 2);
assert.equal(helpHome.components[0].toJSON().components[0].options.length, HELP_CATEGORIES.length + 1);
assert.equal(helpHome.components[1].toJSON().components.length, 4);
const helpHomeCustomIds = helpHome.components
  .flatMap((row) => row.toJSON().components)
  .map((component) => component.custom_id);
assert.equal(new Set(helpHomeCustomIds).size, helpHomeCustomIds.length);
const helpAll = helpPanelPayload("12345678901234567", "all", 0, "+");
assert.match(helpAll.embeds[0].data.description, /\/accueil/);
assert.equal(helpAll.components.length, 2);
const helpAllCustomIds = helpAll.components
  .flatMap((row) => row.toJSON().components)
  .map((component) => component.custom_id);
assert.equal(new Set(helpAllCustomIds).size, helpAllCustomIds.length);

function subcommandsOf(commandName) {
  const command = commands.find((item) => item.name === commandName);
  return command.options
    .filter((option) => option.type === ApplicationCommandOptionType.Subcommand)
    .map((option) => option.name)
    .sort();
}

assert.deepEqual(subcommandsOf("giveaway"), [
  "lancer",
  "liste",
  "pause",
  "relancer",
  "reprendre",
  "terminer",
]);
assert.deepEqual(subcommandsOf("blacklist"), [
  "ajouter",
  "info",
  "liste",
  "retablir",
  "retirer",
]);
assert.deepEqual(subcommandsOf("protection-vocale"), [
  "autoriser",
  "deverrouiller",
  "retirer",
  "statut",
  "verrouiller",
]);
assert.deepEqual(subcommandsOf("modmail"), [
  "activer",
  "all",
  "bloquer",
  "configurer",
  "debloquer",
  "desactiver",
  "option-ajouter",
  "option-supprimer",
  "panel",
  "statut",
  "verif",
]);
const verificationCode = generateModmailVerificationCode();
assert.match(verificationCode, /^\d{6}$/);
const verificationHash = modmailVerificationCodeHash(
  verificationCode,
  "22345678901234567",
);
assert.match(verificationHash, /^[a-f0-9]{64}$/);
assert.notEqual(
  verificationHash,
  modmailVerificationCodeHash(
    verificationCode,
    "32345678901234567",
  ),
);
const verificationPayload = modmailVerificationPayload(verificationCode);
assert.match(
  verificationPayload.embeds[0].data.description,
  /serveur destinataire/i,
);
assert.match(verificationPayload.embeds[0].data.fields[0].value, new RegExp(verificationCode));
const unmodmailPayload = unmodmailConfirmationPayload("abcdef1234567890", {
  name: "Serveur test",
});
assert.match(unmodmailPayload.embeds[0].data.title, /Supprimer entièrement le ModMail/i);
assert.deepEqual(
  unmodmailPayload.components[0]
    .toJSON()
    .components.map((component) => component.custom_id),
  [
    "modmail:uninstall:confirm:abcdef1234567890",
    "modmail:uninstall:cancel:abcdef1234567890",
  ],
);
const automaticOptions = automaticModmailOptions(
  "12345678901234567",
  "22345678901234567",
);
assert.deepEqual(
  automaticOptions.map((option) => option.name),
  ["💬 Question générale", "🚨 Signalement", "🤝 Partenariat"],
);
assert.equal(
  automaticOptions.every(
    (option) =>
      option.categoryId === "12345678901234567" &&
      option.staffRoleId === "22345678901234567",
  ),
  true,
);
assert.deepEqual(subcommandsOf("logs"), ["configurer", "desactiver", "installer", "setup", "statut"]);
assert.deepEqual(subcommandsOf("tickets"), [
  "ajouter",
  "autoclose",
  "choix-ajouter",
  "choix-supprimer",
  "claim",
  "closeall",
  "configurer",
  "fermer",
  "noter",
  "ordre",
  "panneau",
  "rappel",
  "renommer",
  "retirer",
  "rouvrir",
  "stars",
  "statut",
  "supprimer",
  "transcript",
  "unclaim",
]);
assert.deepEqual(subcommandsOf("rules"), ["creer", "desactiver", "statut"]);
assert.deepEqual(subcommandsOf("react-role"), ["creer", "liste", "supprimer"]);
assert.deepEqual(subcommandsOf("automod"), [
  "activer",
  "all",
  "configurer",
  "desactiver",
  "desinstaller",
  "statut",
]);
assert.deepEqual(subcommandsOf("presence"), [
  "activite",
  "afficher",
  "effacer-activite",
  "reinitialiser",
  "statut",
]);
assert.deepEqual(subcommandsOf("event"), ["annuler", "creer", "liste"]);
assert.deepEqual(subcommandsOf("levels"), ["activer", "configurer", "desactiver", "statut"]);
assert.deepEqual(subcommandsOf("backup"), ["creer", "liste", "restaurer", "supprimer"]);
assert.deepEqual(subcommandsOf("annonce"), ["annuler", "envoyer", "liste", "programmer"]);
assert.deepEqual(subcommandsOf("absence"), ["declarer", "liste", "terminer"]);
assert.deepEqual(subcommandsOf("onboarding"), ["activer", "ajouter", "desactiver", "statut"]);
assert.deepEqual(subcommandsOf("croissance"), ["activer", "desactiver", "invitations", "rapport", "setup", "statut"]);
assert.deepEqual(subcommandsOf("questions-anonymes"), ["configurer", "desactiver", "statut"]);
assert.deepEqual(subcommandsOf("vouch"), ["configurer", "envoyer", "profil", "supprimer"]);
assert.deepEqual(subcommandsOf("boutique"), [
  "client",
  "client-configurer",
  "paiement",
  "paiement-configurer",
  "statut",
  "suggestion-configurer",
  "verification-configurer",
  "verifier",
]);
assert.deepEqual(subcommandsOf("protect"), [
  "acces-effacer",
  "antibot",
  "antighostping",
  "antimentions",
  "antiraid",
  "bot-autoriser",
  "bot-retirer",
  "invitation",
  "mixnom",
  "pendu",
  "qi",
  "statut",
  "tout",
  "vocalreset",
  "voctime",
  "voicetop",
  "warns-effacer",
  "xp-ajouter",
  "xp-reset",
]);
assert.deepEqual(subcommandsOf("crow"), [
  "afficher",
  "anti-everyone",
  "anti-token",
  "bans",
  "derank",
  "emoji",
  "fichiers",
  "listes",
  "masquer",
  "massrole",
  "prefix",
  "roleinfo",
  "saloninfo",
  "securite",
  "timeouts",
  "vocal",
]);
assert.deepEqual(subcommandsOf("autorank"), ["configurer", "desactiver", "statut"]);

const watchingPresence = buildPresencePayload(
  {
    status: "idle",
    activityEnabled: true,
    activityType: "watching",
    activityText: "les nouveaux tickets",
  },
  "activité par défaut",
);
assert.equal(watchingPresence.status, "idle");
assert.deepEqual(watchingPresence.activities, [
  {
    name: "les nouveaux tickets",
    type: ActivityType.Watching,
  },
]);
assert.equal(
  normalizeStreamUrl("https://www.twitch.tv/exemple"),
  "https://www.twitch.tv/exemple",
);
assert.equal(normalizeStreamUrl("https://example.com/live"), null);
assert.equal(normalizePresence({ status: "incorrect" }).status, "online");

assert.equal(levelFromXp(0), 0);
assert.equal(levelFromXp(400), 2);
assert.equal(xpForLevel(3), 900);
assert.ok(parseLocalDate("2030-12-31 23:59") instanceof Date);
assert.equal(parseLocalDate("2030-99-31 23:59"), null);

assert.equal(normalizeGuildId("12345678901234567"), "12345678901234567");
assert.equal(normalizeGuildId("serveur-invalide"), null);
const inviteUrl = new URL(buildBotInviteUrl("22345678901234567", "12345678901234567"));
assert.equal(inviteUrl.hostname, "discord.com");
assert.equal(inviteUrl.searchParams.get("client_id"), "22345678901234567");
assert.equal(inviteUrl.searchParams.get("guild_id"), "12345678901234567");
assert.equal(inviteUrl.searchParams.get("disable_guild_select"), "true");
assert.match(inviteUrl.searchParams.get("scope"), /applications\.commands/);
const leaveConfirmation = leaveConfirmationPayload("test-nonce", {
  id: "12345678901234567",
  name: "Serveur test",
});
assert.deepEqual(
  leaveConfirmation.components[0].toJSON().components.map(({ custom_id }) => custom_id),
  ["guild-access:leave:confirm:test-nonce", "guild-access:leave:cancel:test-nonce"],
);

const unlogsConfirmation = unlogsConfirmationPayload("test-nonce");
assert.equal(unlogsConfirmation.embeds.length, 1);
assert.equal(unlogsConfirmation.components.length, 1);
assert.deepEqual(
  unlogsConfirmation.components[0].toJSON().components.map(({ custom_id }) => custom_id),
  ["unlogs:confirm:test-nonce", "unlogs:cancel:test-nonce"],
);
const singleLogConfirmation = unlogsConfirmationPayload("single-nonce", "modmail");
assert.match(singleLogConfirmation.embeds[0].data.title, /logs-modmail/);
assert.match(singleLogConfirmation.embeds[0].data.description, /salon externe/i);
assert.deepEqual(
  singleLogConfirmation.components[0].toJSON().components.map(({ custom_id }) => custom_id),
  ["unlogs:confirm:single-nonce", "unlogs:cancel:single-nonce"],
);

const allNativeSpecs = buildRuleSpecs({
  alertChannelId: "12345678901234567",
  keywords: [],
  mentionLimit: 5,
  timeoutMinutes: 10,
});
assert.equal(allNativeSpecs.length, 3);
assert.equal(allNativeSpecs.every((spec) => spec.enabled), true);
const antiLinkSpec = buildAntiLinkRuleOptions({
  alertChannelId: "12345678901234567",
  timeoutMinutes: 10,
});
assert.equal(antiLinkSpec.enabled, true);
assert.deepEqual(antiLinkSpec.triggerMetadata.keywordFilter, [
  "*discord.gg/*",
  "*discord.com/invite/*",
  "*discordapp.com/invite/*",
]);
assert.deepEqual(LINK_FILTER, antiLinkSpec.triggerMetadata.keywordFilter);
assert.equal(LINK_FILTER.some((entry) => /https?|www|cdn\.discordapp\.com/i.test(entry)), false);
assert.equal(
  antiLinkSpec.actions.some((action) => action.type === AutoModerationActionType.Timeout),
  true,
);
let migratedAntiLinkPayload = null;
const legacyAntiLinkRule = {
  name: "GestionBot • Anti-liens",
  creatorId: "998877665544332211",
  triggerMetadata: {
    keywordFilter: ["*http://*", "*https://*", "*www.*"],
    allowList: ["https://example.com/*"],
  },
  async edit(payload) {
    migratedAntiLinkPayload = payload;
  },
};
const migrationResult = await refreshManagedAntiLinkRule({
  client: { user: { id: "998877665544332211" } },
  autoModerationRules: {
    fetch: async () => new Collection([["legacy", legacyAntiLinkRule]]),
  },
});
assert.equal(migrationResult.status, "migrée");
assert.equal(migratedAntiLinkPayload.name, "GestionBot • Anti-invitations");
assert.deepEqual(migratedAntiLinkPayload.triggerMetadata.keywordFilter, LINK_FILTER);
assert.deepEqual(migratedAntiLinkPayload.triggerMetadata.allowList, ["https://example.com/*"]);

const ticketCommand = commands.find((command) => command.name === "tickets");
const ticketConfigurer = ticketCommand.options.find((option) => option.name === "configurer");
assert.equal(ticketConfigurer.options.every((option) => option.required !== true), true);

const ticketDashboard = dashboardPayload({
  categoryId: null,
  staffRoleId: null,
  confirmationEnabled: true,
  panelChannelId: null,
  panelTitle: "Tickets",
  panelDescription: "Choisis une catégorie.",
  panelColor: "5865F2",
  choices: Array.from({ length: 25 }, (_, index) => ({
    id: `choix-${index}`,
    label: `Choix ${index}`,
    order: index + 1,
  })),
});
assert.equal(ticketDashboard.embeds.length, 1);
assert.equal(ticketDashboard.components.length, 3);
assert.deepEqual(
  ticketDashboard.components.map((row) => row.toJSON().components.length),
  [1, 1, 1],
);
assert.equal(choiceModal().toJSON().components.length, 5);
const ticketOptions = optionsPayload({
  transcriptDmEnabled: true,
  transcriptChannelId: null,
  confirmationEnabled: true,
  mentionStaffEnabled: true,
  allowUserClose: true,
  maxOpenTicketsPerUser: 1,
  channelNamePrefix: "ticket",
  ticketOpenMessage: "Décris ta demande.",
  closeMessage: "Ticket fermé.",
});
assert.deepEqual(
  ticketOptions.components.map((row) => row.toJSON().components.length),
  [1, 5, 1],
);
assert.equal(
  advancedOptionsModal({
    maxOpenTicketsPerUser: 1,
    channelNamePrefix: "ticket",
    ticketOpenMessage: "Décris ta demande.",
    closeMessage: "Ticket fermé.",
  }).toJSON().components.length,
  4,
);

const fakeTranscriptChannel = {
  id: "32345678901234567",
  name: "ticket-test-0001",
  guild: { id: "12345678901234567", name: "Serveur test" },
  messages: {
    fetch: async () =>
      new Collection([
        [
          "2",
          {
            author: { tag: "Deux#0002", id: "22345678901234567" },
            content: "Deuxième message",
            createdTimestamp: 2,
            attachments: new Collection(),
            embeds: [],
          },
        ],
        [
          "1",
          {
            author: { tag: "Un#0001", id: "12345678901234567" },
            content: "Premier message",
            createdTimestamp: 1,
            attachments: new Collection([
              ["fichier", { url: "https://cdn.discordapp.com/test.png" }],
            ]),
            embeds: [],
          },
        ],
      ]),
  },
};
const transcriptText = await buildTicketTranscript(fakeTranscriptChannel);
assert.ok(transcriptText.indexOf("Premier message") < transcriptText.indexOf("Deuxième message"));
assert.match(transcriptText, /https:\/\/cdn\.discordapp\.com\/test\.png/);

const parsed = parseKeywords("spam, arnaque, spam, *lien douteux*");
assert.deepEqual(parsed.keywords, ["spam", "arnaque", "*lien douteux*"]);
assert.deepEqual(parsed.rejected, []);

const tooLong = parseKeywords("x".repeat(61));
assert.equal(tooLong.keywords.length, 0);
assert.equal(tooLong.rejected.length, 1);

const freshGuild = await readGuild("000000000000000000");
assert.equal(freshGuild.statistics.enabled, false);
assert.equal(freshGuild.levels.enabled, false);
assert.deepEqual(freshGuild.backups, []);
assert.deepEqual(freshGuild.announcements, []);
assert.deepEqual(freshGuild.absences, []);
assert.equal(freshGuild.anonymousQuestions.enabled, false);
assert.equal(freshGuild.statistics.intervalMinutes, 10);
assert.deepEqual(freshGuild.statistics.entries, []);
assert.deepEqual(freshGuild.voiceProtection, { locks: {} });
assert.equal(freshGuild.modmail.enabled, false);
assert.deepEqual(freshGuild.modmail.threads, []);
assert.deepEqual(freshGuild.logs.channels, {});
assert.equal(freshGuild.rules.enabled, false);
assert.deepEqual(freshGuild.reactionRoles, []);
assert.equal(freshGuild.security.enabled, false);
assert.equal(freshGuild.tickets.transcriptDmEnabled, true);
assert.equal(freshGuild.tickets.transcriptChannelId, null);
assert.deepEqual(freshGuild.access, {
  whitelistEnabled: false,
  whitelistUserIds: [],
  ownerUserIds: [],
});
assert.deepEqual(freshGuild.multiBot.vouches.entries, []);
assert.deepEqual(freshGuild.multiBot.protect.allowedBotIds, []);
assert.deepEqual(freshGuild.multiBot.protect.voiceTotals, {});
assert.deepEqual(freshGuild.multiBot.crow.attachmentChannels, {});
assert.equal(freshGuild.multiBot.crow.antiEveryoneEnabled, false);
assert.equal(freshGuild.multiBot.crow.antiTokenEnabled, true);
assert.equal(freshGuild.multiBot.crow.secondaryPrefix, null);
assert.equal(freshGuild.multiBot.autoRank.joinRoleId, null);
assert.equal(freshGuild.multiBot.autoRank.mentionRoleId, null);
assert.equal(safeHttpsUrl("https://cdn.discordapp.com/emojis/123.webp?size=48"), "https://cdn.discordapp.com/emojis/123.webp?size=48");
assert.equal(safeHttpsUrl("http://example.com/image.png"), null);
assert.equal(safeHttpsUrl("https://user:secret@example.com/image.png"), null);
assert.equal(formatMilliseconds(90_061_000), "1j 1h 1m 1s");
assert.equal(containsDiscordToken("bonjour tout le monde"), false);
assert.equal(containsDiscordToken(["MTIzNDU2Nzg5MDEyMzQ1Njc4OTA", "Abc123", "abcdefghijklmnopqrstuvwxyz_123"].join(".")), true);
assert.equal(containsDiscordToken(["mfa", "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-abcdefghijklmnopqrstuvwxyz"].join(".")), true);

console.log(
  `${commands.length} commandes, stockage et AutoMod validés.`,
);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
