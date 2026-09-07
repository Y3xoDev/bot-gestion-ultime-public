const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
} = require("discord.js");
const { commands } = require("../commands");
const helpPageCache = new Map();

const HELP_CATEGORIES = [
  {
    key: "moderation",
    label: "Modération",
    emoji: "🔨",
    description: "Sanctions, messages, salons et avertissements",
    commands: new Set([
      "purger",
      "timeout",
      "untimeout",
      "expulser",
      "bannir",
      "debannir",
      "verrouiller",
      "deverrouiller",
      "avertir",
      "avertissements",
      "avertissement-retirer",
      "slowmode",
      "role",
      "dire",
      "snipe",
      "renew",
      "renouveler",
    ]),
  },
  {
    key: "securite",
    label: "Sécurité",
    emoji: "🛡️",
    description: "AutoMod, anti-invitations, anti-raid et listes d'accès",
    commands: new Set([
      "automod",
      "antilink",
      "antiraid",
      "security",
      "blacklist",
      "whitelist",
      "owners",
      "listes",
      "protection-vocale",
    ]),
  },
  {
    key: "configuration",
    label: "Configuration",
    emoji: "⚙️",
    description: "Logs, accueil, tickets et panneaux interactifs",
    commands: new Set([
      "accueil",
      "logs",
      "unlogs",
      "join",
      "leave",
      "tickets",
      "rules",
      "react-role",
      "role-bouton",
      "modmail",
      "unmodmail",
      "suggestions",
      "reponses",
      "tempvocal",
      "presence",
      "statistiques",
      "backup",
      "annonce",
      "onboarding",
      "questions-anonymes",
      "levels",
    ]),
  },
  {
    key: "communaute",
    label: "Communauté",
    emoji: "🎉",
    description: "Sondages, suggestions, giveaways et rappels",
    commands: new Set([
      "sondage",
      "suggerer",
      "giveaway",
      "rappel",
      "rappels",
      "rappel-annuler",
      "reponse",
      "event",
      "croissance",
      "absence",
      "question-anonyme",
      "classement",
    ]),
  },
  {
    key: "informations",
    label: "Informations",
    emoji: "ℹ️",
    description: "Serveur, membres, bot, administration et statistiques",
    commands: new Set([
      "userinfo",
      "serverinfo",
      "admin",
      "banner",
      "boosters",
      "botinfo",
      "stats",
      "ownerbot",
      "ping",
      "avatar",
      "profil",
    ]),
  },
  {
    key: "detente",
    label: "Détente et vocal",
    emoji: "🎲",
    description: "Jeux rapides, choix aléatoires et gestion vocale",
    commands: new Set([
      "pile-ou-face",
      "de",
      "choisir",
      "huitball",
      "vocal",
    ]),
  },
  {
    key: "specialises",
    label: "Modules spécialisés",
    emoji: "🤖",
    description: "Avis, boutique, protections, gestion avancée et rôles automatiques",
    commands: new Set(["vouch", "boutique", "protect", "crow", "autorank"]),
  },
  {
    key: "aide",
    label: "Aide",
    emoji: "❓",
    description: "Accès aux panneaux d'aide",
    commands: new Set(["help", "aide-gestion"]),
  },
];

function prefixValue() {
  return process.env.BOT_PREFIX?.trim() || "+";
}

function commandSummary(command, prefix = prefixValue()) {
  return `\`/${command.name}\` · \`${prefix}${command.name}\` — ${command.description}`;
}

function splitLines(lines, maximumLength = 1800) {
  const pages = [];
  let current = [];
  let currentLength = 0;

  for (const line of lines) {
    const nextLength = currentLength + line.length + 1;
    if (current.length > 0 && nextLength > maximumLength) {
      pages.push(current.join("\n"));
      current = [];
      currentLength = 0;
    }
    current.push(line);
    currentLength += line.length + 1;
  }

  if (current.length > 0) {
    pages.push(current.join("\n"));
  }
  return pages;
}

function commandsForView(view) {
  if (view === "all") {
    return [...commands];
  }
  const category = HELP_CATEGORIES.find((item) => item.key === view);
  if (!category) {
    return [];
  }
  return commands.filter((command) => category.commands.has(command.name));
}

function categoryForView(view) {
  return HELP_CATEGORIES.find((item) => item.key === view) || null;
}

function helpPages(view, prefix = prefixValue()) {
  const cacheKey = `${prefix}:${view}`;
  const cached = helpPageCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const pages = splitLines(
    commandsForView(view)
      .sort((left, right) => left.name.localeCompare(right.name, "fr"))
      .map((command) => commandSummary(command, prefix)),
    3500,
  );
  helpPageCache.set(cacheKey, pages);
  return pages;
}

function buildHelpEmbeds(prefix = prefixValue()) {
  const pages = helpPages("all", prefix);
  return pages.map((description, index) =>
    new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(
        index === 0
          ? `Bot Gestion Ultime — ${commands.length} commandes`
          : `Toutes les commandes — ${index + 1}/${pages.length}`,
      )
      .setDescription(description)
      .setFooter({
        text: `Page ${index + 1}/${pages.length} • Préfixe : ${prefix} • Mets les textes entre guillemets.`,
      }),
  );
}

function helpSelect(userId, currentView) {
  const options = [
    {
      label: "Toutes les commandes",
      value: "all",
      description: `Les ${commands.length} commandes disponibles`,
      emoji: "📚",
      default: currentView === "all",
    },
    ...HELP_CATEGORIES.map((category) => ({
      label: category.label,
      value: category.key,
      description: category.description.slice(0, 100),
      emoji: category.emoji,
      default: currentView === category.key,
    })),
  ];
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`help:select:${userId}`)
      .setPlaceholder("Choisis une catégorie de commandes")
      .addOptions(options),
  );
}

function helpButtons(userId, view, page, pageCount) {
  const hasPages = view !== "home" && pageCount > 1;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`help:home:${userId}`)
      .setLabel("Accueil")
      .setEmoji("🏠")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(view === "home"),
    new ButtonBuilder()
      .setCustomId(`help:view:${userId}:all:0`)
      .setLabel("Tout afficher")
      .setEmoji("📚")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(view === "all" && page === 0),
    new ButtonBuilder()
      .setCustomId(`help:page:${userId}:previous:${view}:${Math.max(0, page - 1)}`)
      .setLabel("Précédent")
      .setEmoji("⬅️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasPages || page === 0),
    new ButtonBuilder()
      .setCustomId(`help:page:${userId}:next:${view}:${Math.min(pageCount - 1, page + 1)}`)
      .setLabel("Suivant")
      .setEmoji("➡️")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasPages || page >= pageCount - 1),
  );
}

function helpHomeEmbed(prefix = prefixValue()) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("Bot Gestion Ultime — panneau d'aide")
    .setDescription(
      [
        `Le bot possède **${commands.length} commandes**, utilisables en slash et avec le préfixe \`${prefix}\`.`,
        "Choisis une catégorie dans le menu ou affiche toutes les commandes avec les boutons.",
        "Les commandes sensibles restent protégées par les permissions Discord.",
      ].join("\n\n"),
    )
    .addFields(
      HELP_CATEGORIES.map((category) => ({
        name: `${category.emoji} ${category.label}`,
        value: `${category.commands.size} commande(s) — ${category.description}`,
        inline: true,
      })),
    )
    .setFooter({ text: `Exemples : /ping • ${prefix}ping • /logs setup • ${prefix}logs setup` })
    .setTimestamp();
}

function helpPanelPayload(userId, view = "home", requestedPage = 0, prefix = prefixValue()) {
  if (view === "home") {
    return {
      embeds: [helpHomeEmbed(prefix)],
      components: [helpSelect(userId, view), helpButtons(userId, view, 0, 1)],
    };
  }

  const pages = helpPages(view, prefix);
  const safeView = pages.length ? view : "all";
  const safePages = pages.length ? pages : helpPages("all", prefix);
  const page = Math.max(0, Math.min(requestedPage, safePages.length - 1));
  const category = categoryForView(safeView);
  const title =
    safeView === "all"
      ? `📚 Toutes les commandes (${commands.length})`
      : `${category.emoji} ${category.label} (${commandsForView(safeView).length})`;
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(title)
    .setDescription(safePages[page])
    .setFooter({
      text: `Page ${page + 1}/${safePages.length} • Chaque commande existe en / et en ${prefix}`,
    })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      helpSelect(userId, safeView),
      helpButtons(userId, safeView, page, safePages.length),
    ],
  };
}

async function handleHelp(interaction) {
  await interaction.reply({
    ...helpPanelPayload(interaction.user.id),
    flags: MessageFlags.Ephemeral,
  });
}

async function handleHelpInteraction(interaction) {
  if (!interaction.customId?.startsWith("help:")) {
    return false;
  }
  const parts = interaction.customId.split(":");
  const ownerId = parts[2];
  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "Ce panneau d'aide appartient à une autre personne. Utilise `/help` ou `+help` pour ouvrir le tien.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (parts[1] === "select" && interaction.isStringSelectMenu()) {
    await interaction.update(helpPanelPayload(ownerId, interaction.values[0], 0));
    return true;
  }
  if (parts[1] === "home" && interaction.isButton()) {
    await interaction.update(helpPanelPayload(ownerId));
    return true;
  }
  if (parts[1] === "view" && interaction.isButton()) {
    const page = Number.parseInt(parts[4], 10) || 0;
    await interaction.update(helpPanelPayload(ownerId, parts[3], page));
    return true;
  }
  if (parts[1] === "page" && interaction.isButton()) {
    const page = Number.parseInt(parts[5], 10) || 0;
    await interaction.update(helpPanelPayload(ownerId, parts[4], page));
    return true;
  }
  return false;
}

module.exports = {
  HELP_CATEGORIES,
  buildHelpEmbeds,
  commandSummary,
  handleHelp,
  handleHelpInteraction,
  helpPanelPayload,
  splitLines,
};
