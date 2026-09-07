const fs = require("node:fs");
const path = require("node:path");
const {
  ApplicationCommandOptionType,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");
const { commands } = require("../src/commands");
const { HELP_CATEGORIES } = require("../src/modules/help");

const outputFile = path.join(__dirname, "..", "docs", "COMMANDES.md");
const optionTypeLabels = new Map([
  [ApplicationCommandOptionType.String, "Texte"],
  [ApplicationCommandOptionType.Integer, "Nombre entier"],
  [ApplicationCommandOptionType.Boolean, "Oui/non"],
  [ApplicationCommandOptionType.User, "Utilisateur"],
  [ApplicationCommandOptionType.Channel, "Salon"],
  [ApplicationCommandOptionType.Role, "Rôle"],
  [ApplicationCommandOptionType.Mentionable, "Mention"],
  [ApplicationCommandOptionType.Number, "Nombre"],
  [ApplicationCommandOptionType.Attachment, "Fichier"],
]);
const channelTypeLabels = new Map([
  [ChannelType.GuildText, "textuel"],
  [ChannelType.GuildVoice, "vocal"],
  [ChannelType.GuildCategory, "catégorie"],
  [ChannelType.GuildAnnouncement, "annonces"],
  [ChannelType.GuildStageVoice, "stage"],
  [ChannelType.GuildForum, "forum"],
  [ChannelType.GuildMedia, "média"],
]);
const permissionLabels = [
  [PermissionFlagsBits.Administrator, "Administrateur"],
  [PermissionFlagsBits.ManageGuild, "Gérer le serveur"],
  [PermissionFlagsBits.ManageChannels, "Gérer les salons"],
  [PermissionFlagsBits.ManageRoles, "Gérer les rôles"],
  [PermissionFlagsBits.ManageMessages, "Gérer les messages"],
  [PermissionFlagsBits.ModerateMembers, "Exclure temporairement des membres"],
  [PermissionFlagsBits.KickMembers, "Expulser des membres"],
  [PermissionFlagsBits.BanMembers, "Bannir des membres"],
  [PermissionFlagsBits.MoveMembers, "Déplacer des membres"],
];

function escapeTable(value) {
  return String(value ?? "—").replaceAll("|", "\\|").replaceAll("\n", "<br>");
}

function permissionDescription(command) {
  if (command.name === "tickets") {
    return "Configuration : Gérer le serveur ; gestion : rôle support du ticket ou Gérer les salons ; closeall : Administrateur ; créateur : transcript, notation et fermeture si autorisée ; stars : moyenne publique, commentaires privés pour le support";
  }
  if (!command.default_member_permissions) {
    return "Aucune restriction Discord par défaut";
  }
  const required = BigInt(command.default_member_permissions);
  const labels = permissionLabels
    .filter(([bit]) => (required & bit) === bit)
    .map(([, label]) => label);
  return labels.length ? labels.join(", ") : `Bitfield \`${required}\``;
}

function optionToken(option) {
  const open = option.required ? "<" : "[";
  const close = option.required ? ">" : "]";
  return `${open}${option.name}${close}`;
}

function syntax(command, subcommand, prefix) {
  const options = subcommand?.options || command.options || [];
  const args = options
    .filter((option) => option.type !== ApplicationCommandOptionType.Subcommand)
    .map(optionToken)
    .join(" ");
  const base = `${prefix}${command.name}${subcommand ? ` ${subcommand.name}` : ""}`;
  return `${base}${args ? ` ${args}` : ""}`;
}

function optionConstraints(option) {
  const constraints = [];
  if (option.min_value !== undefined) constraints.push(`minimum ${option.min_value}`);
  if (option.max_value !== undefined) constraints.push(`maximum ${option.max_value}`);
  if (option.min_length !== undefined) constraints.push(`au moins ${option.min_length} caractères`);
  if (option.max_length !== undefined) constraints.push(`au plus ${option.max_length} caractères`);
  if (option.choices?.length) {
    constraints.push(
      `choix : ${option.choices.map((choice) => `\`${choice.name}\` = \`${choice.value}\``).join(", ")}`,
    );
  }
  if (option.channel_types?.length) {
    constraints.push(
      `types : ${option.channel_types.map((type) => channelTypeLabels.get(type) || type).join(", ")}`,
    );
  }
  return constraints.join(" ; ") || "—";
}

function optionsTable(options) {
  if (!options?.length) {
    return "Aucune option.\n";
  }
  const rows = options.map(
    (option) =>
      `| \`${option.name}\` | ${escapeTable(optionTypeLabels.get(option.type) || option.type)} | ${
        option.required ? "Oui" : "Non"
      } | ${escapeTable(option.description)} | ${escapeTable(optionConstraints(option))} |`,
  );
  return [
    "| Option | Type | Obligatoire | Description | Limites et valeurs |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

function commandSection(command) {
  const subcommands = (command.options || []).filter(
    (option) => option.type === ApplicationCommandOptionType.Subcommand,
  );
  const lines = [
    `### \`/${command.name}\` · \`+${command.name}\``,
    "",
    command.description,
    "",
    `- Permission utilisateur : **${permissionDescription(command)}**`,
    `- Utilisable en message privé : **${command.dm_permission === false ? "non" : "oui"}**`,
    "",
  ];

  if (!subcommands.length) {
    lines.push(`Syntaxes : \`${syntax(command, null, "/")}\` et \`${syntax(command, null, "+")}\``, "");
    lines.push(optionsTable(command.options));
    return lines.join("\n");
  }

  lines.push(`Sous-commandes : **${subcommands.length}**`, "");
  for (const subcommand of subcommands) {
    lines.push(
      `#### \`${subcommand.name}\``,
      "",
      subcommand.description,
      "",
      `Syntaxes : \`${syntax(command, subcommand, "/")}\` et \`${syntax(command, subcommand, "+")}\``,
      "",
      optionsTable(subcommand.options),
    );
  }
  return lines.join("\n");
}

const commandByName = new Map(commands.map((command) => [command.name, command]));
const documented = new Set();
const sections = [];

for (const category of HELP_CATEGORIES) {
  const categoryCommands = [...category.commands]
    .map((name) => commandByName.get(name))
    .filter(Boolean)
    .sort((left, right) => left.name.localeCompare(right.name, "fr"));
  sections.push(
    `## ${category.emoji} ${category.label} (${categoryCommands.length})`,
    "",
    category.description,
    "",
  );
  for (const command of categoryCommands) {
    documented.add(command.name);
    sections.push(commandSection(command));
  }
}

const missing = commands
  .filter((command) => !documented.has(command.name))
  .sort((left, right) => left.name.localeCompare(right.name, "fr"));
if (missing.length) {
  sections.push("## Autres commandes", "");
  for (const command of missing) sections.push(commandSection(command));
}

const header = `# Catalogue exhaustif des commandes

> Documentation générée automatiquement depuis le registre utilisé par Discord. Elle décrit exactement la version actuelle du code.

- Nombre de commandes racines : **${commands.length}**
- Interfaces : commandes slash \`/\` et commandes préfixées \`+\`
- Préfixe par défaut : \`+\`, modifiable avec \`BOT_PREFIX\`
- Serveur : les commandes sont enregistrées sur le serveur défini par \`GUILD_ID\`
- Arguments préfixés : les textes avec espaces doivent être placés entre guillemets
- Options préfixées nommées : \`option=valeur\` ou \`--option valeur\`

Exemples :

\`/timeout membre:@Utilisateur minutes:10 raison:spam\`

\`+timeout @Utilisateur minutes=10 raison="spam répété"\`

Les permissions indiquées sont celles définies dans Discord pour afficher la commande. Le code refait également les contrôles au moment de l'exécution, vérifie les permissions du bot et respecte la hiérarchie des rôles.

[Retour au README](../README.md)
`;

const document = `${header}\n${sections.join("\n")}`.trimEnd() + "\n";
if (process.argv.includes("--check")) {
  const current = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, "utf8") : "";
  if (current !== document) {
    console.error("docs/COMMANDES.md n'est plus synchronisé. Exécute npm run docs.");
    process.exitCode = 1;
  } else {
    console.log(`Documentation synchronisée avec les ${commands.length} commandes.`);
  }
} else {
  fs.writeFileSync(outputFile, document, "utf8");
  console.log(`${commands.length} commandes documentées dans ${path.relative(process.cwd(), outputFile)}.`);
}
