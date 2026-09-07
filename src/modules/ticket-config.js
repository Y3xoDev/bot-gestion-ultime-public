const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const { mutateGuild, readGuild } = require("../persistence/guild-store");
const { parseColor } = require("./interactive-panels");
const { publishTicketPanel } = require("./ticket-runtime");

function sortedChoices(config) {
  return [...config.choices].sort(
    (left, right) => (left.order || 999) - (right.order || 999),
  );
}

function normalizeChoiceOrder(choices) {
  choices.sort((left, right) => (left.order || 999) - (right.order || 999));
  choices.forEach((choice, index) => {
    choice.order = index + 1;
  });
}

function dashboardEmbed(config) {
  const choices = sortedChoices(config);
  return new EmbedBuilder()
    .setColor(parseColor(config.panelColor))
    .setTitle("🎫 Configuration interactive des tickets")
    .setDescription(
      "Utilise les menus et boutons sous cet embed. Chaque modification est enregistrée immédiatement.",
    )
    .addFields(
      {
        name: "Configuration générale",
        value: [
          `Catégorie : ${config.categoryId ? `<#${config.categoryId}>` : "❌ non configurée"}`,
          `Rôle support : ${config.staffRoleId ? `<@&${config.staffRoleId}>` : "❌ non configuré"}`,
          `Confirmation : **${config.confirmationEnabled ? "activée" : "désactivée"}**`,
          `Dernier panneau : ${config.panelChannelId ? `<#${config.panelChannelId}>` : "aucun"}`,
          `Message du panneau : ${config.panelMessageId || "aucun"}`,
          `Interface : **${config.interactionType === "SelectMenu" ? "menu déroulant" : "boutons"}**`,
          `Prise en charge : **${config.claimEnabled ? "ON" : "OFF"}** • automatique : **${config.autoClaimEnabled ? "ON" : "OFF"}**`,
          `Bouton claim : **${config.claimButtonEnabled ? "ON" : "OFF"}** • fermeture : **${config.closeButtonEnabled !== false ? "ON" : "OFF"}**`,
          `Suppression après fermeture : **${config.autoDeleteClosed ? "ON (après transcript livré)" : "OFF (salon conservé)"}**`,
        ].join("\n"),
      },
      {
        name: "Apparence du panneau",
        value: [
          `Titre : **${config.panelTitle}**`,
          `Couleur : **#${config.panelColor}**`,
          `Description : ${config.panelDescription.slice(0, 500)}`,
        ].join("\n"),
      },
      {
        name: "Options et transcripts",
        value: [
          `Transcript en MP : **${config.transcriptDmEnabled ? "activé" : "désactivé"}**`,
          `Archive staff : ${config.transcriptChannelId ? `<#${config.transcriptChannelId}>` : "non configurée"}`,
          `Mention du support : **${config.mentionStaffEnabled ? "activée" : "désactivée"}**`,
          `Fermeture par le membre : **${config.allowUserClose ? "autorisée" : "staff uniquement"}**`,
          `Tickets simultanés par membre : **${config.maxOpenTicketsPerUser}**`,
        ].join("\n"),
      },
      {
        name: `Choix et boutons (${choices.length}/25)`,
        value: choices.length
          ? choices
              .map(
                (choice) =>
                  `**${choice.order}. ${choice.emoji || "🎫"} ${choice.label}** — \`${choice.id}\``,
              )
              .join("\n")
              .slice(0, 1024)
          : "Aucun choix personnalisé : un bouton général sera utilisé.",
      },
    )
    .setFooter({ text: "Les panneaux déjà publiés ne sont pas modifiés automatiquement." });
}

function menuRow(id, placeholder, options) {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder()
    .setCustomId(id).setPlaceholder(placeholder).addOptions(options.map(([value, label]) => ({ value, label }))));
}
function backRow() {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("ticket-config:back")
    .setLabel("Retour aux paramètres").setStyle(ButtonStyle.Secondary));
}
function dashboardComponents(config) {
  const rows = [
    menuRow("ticket-config:settings-menu", "⚙️ Paramètres des tickets", [
      ["general", "📂 Catégorie et rôle du support"],
      ["publish", "📤 Envoyer / actualiser le panneau"],
      ["appearance", "🎨 Titre, description et couleur"],
      ["toggle-type", "🔄 Boutons / menu déroulant"],
      ["toggle-claim", "🙋 Activer / désactiver la prise en charge"],
      ["toggle-auto-claim", "⚡ Prise en charge au premier message du staff"],
      ["toggle-auto-delete", "🗑️ Suppression automatique après fermeture"],
      ["toggle-claim-button", "🔘 Afficher / masquer le bouton de prise en charge"],
      ["toggle-close-button", "🔒 Afficher / masquer le bouton de fermeture"],
      ["toggle-transcript-dm", "📩 Activer / désactiver les transcripts en MP"],
      ["advanced", "🔢 Limite de tickets et textes"],
      ["options", "⚙️ Archives, mentions et autorisations"],
    ]),
    menuRow("ticket-config:choices-menu", "🎫 Gérer les options du panneau", [
      ["add-choice", "➕ Ajouter une option"],
      ["choose-edit", "✏️ Modifier une option (catégorie, rôle, style…)"],
      ["choose-delete", "🗑️ Supprimer une option"],
      ["order", "↕️ Changer l'ordre des options"],
      ["reset-choices", "🔄 Réinitialiser les options (confirmation)"],
    ]),
  ];
  if (config.choices.length) rows.push(menuRow("ticket-config:select-choice", "Sélectionner une option à personnaliser",
    sortedChoices(config).slice(0, 25).map((choice) => [choice.id, `${choice.order}. ${choice.label}`.slice(0, 100)])));
  return rows;
}
function generalPayload(config) {
  return { embeds: [dashboardEmbed(config)], components: [
    new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId("ticket-config:category")
      .setPlaceholder("Catégorie par défaut des tickets").addChannelTypes(ChannelType.GuildCategory)),
    new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId("ticket-config:staff-role")
      .setPlaceholder("Rôle du support (pas @everyone)")),
    backRow(),
  ] };
}
function choicePayload(config, id) {
  const choice = config.choices.find((item) => item.id === id);
  if (!choice) return dashboardPayload(config);
  return { embeds: [new EmbedBuilder().setColor(parseColor(config.panelColor)).setTitle(`🎫 ${choice.label}`)
    .setDescription(`Identifiant : \`${choice.id}\`\nCatégorie : ${choice.categoryId ? `<#${choice.categoryId}>` : "par défaut"}\nSupport : ${choice.staffRoleId ? `<@&${choice.staffRoleId}>` : "par défaut"}\nStyle : ${({1:"Bleu",2:"Gris",3:"Vert",4:"Rouge"})[choice.style || 1]}\nOrdre : ${choice.order}`)],
    components: [
      new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId(`ticket-config:choice-category:${id}`)
        .setPlaceholder("Catégorie de cette option (vider = défaut)").addChannelTypes(ChannelType.GuildCategory).setMinValues(0).setMaxValues(1)),
      new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId(`ticket-config:choice-role:${id}`)
        .setPlaceholder("Rôle support de cette option (vider = défaut)").setMinValues(0).setMaxValues(1)),
      menuRow(`ticket-config:choice-style:${id}`, "Couleur du bouton", [["1","Bleu"],["2","Gris"],["3","Vert"],["4","Rouge"]]),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ticket-config:edit-choice:${id}`).setLabel("✏️ Texte / emoji / ordre").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`ticket-config:delete-choice:${id}`).setLabel("🗑️ Supprimer").setStyle(ButtonStyle.Danger)),
      backRow(),
    ] };
}

function dashboardPayload(config, selectedChoiceId = null) {
  return {
    embeds: [dashboardEmbed(config)],
    components: dashboardComponents(config, selectedChoiceId),
  };
}

async function showTicketDashboard(interaction) {
  const config = (await readGuild(interaction.guild.id)).tickets;
  await interaction.reply({
    ...dashboardPayload(config),
    flags: MessageFlags.Ephemeral,
  });
}

function appearanceModal(config) {
  return new ModalBuilder()
    .setCustomId("ticket-config:appearance-modal")
    .setTitle("Apparence du panneau")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("title")
          .setLabel("Titre")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setValue(config.panelTitle)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("Description")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(2000)
          .setValue(config.panelDescription)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("color")
          .setLabel("Couleur hexadécimale")
          .setPlaceholder("5865F2")
          .setStyle(TextInputStyle.Short)
          .setMinLength(6)
          .setMaxLength(7)
          .setValue(config.panelColor)
          .setRequired(true),
      ),
    );
}

function choiceModal(choice = null) {
  const withValue = (input, value) => (value ? input.setValue(value) : input);
  return new ModalBuilder()
    .setCustomId(`ticket-config:choice-modal:${choice?.id || "__new__"}`)
    .setTitle(choice ? "Modifier un choix" : "Ajouter un choix")
    .addComponents(
      new ActionRowBuilder().addComponents(
        withValue(
          new TextInputBuilder()
            .setCustomId("id")
            .setLabel("Identifiant sans espace")
            .setPlaceholder("support-technique")
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(25)
            .setRequired(true),
          choice?.id,
        ),
      ),
      new ActionRowBuilder().addComponents(
        withValue(
          new TextInputBuilder()
            .setCustomId("label")
            .setLabel("Texte du bouton")
            .setPlaceholder("Support technique")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(80)
            .setRequired(true),
          choice?.label,
        ),
      ),
      new ActionRowBuilder().addComponents(
        withValue(
          new TextInputBuilder()
            .setCustomId("emoji")
            .setLabel("Emoji du bouton")
            .setPlaceholder("🛠️")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(100)
            .setRequired(false),
          choice?.emoji,
        ),
      ),
      new ActionRowBuilder().addComponents(
        withValue(
          new TextInputBuilder()
            .setCustomId("description")
            .setLabel("Message affiché dans le ticket")
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(1000)
            .setRequired(false),
          choice?.description,
        ),
      ),
      new ActionRowBuilder().addComponents(
        withValue(
          new TextInputBuilder()
            .setCustomId("order")
            .setLabel("Position du bouton")
            .setPlaceholder("1")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(2)
            .setRequired(false),
          choice?.order ? String(choice.order) : null,
        ),
      ),
    );
}

function orderModal(config) {
  return new ModalBuilder()
    .setCustomId("ticket-config:order-modal")
    .setTitle("Ordre des boutons")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("ids")
          .setLabel("Identifiants séparés par des virgules")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setValue(sortedChoices(config).map((choice) => choice.id).join(", "))
          .setRequired(true),
      ),
    );
}

function publishComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("ticket-config:publish-channel")
        .setPlaceholder("Choisir le salon où publier le panneau")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(1)
        .setMaxValues(1),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket-config:back")
        .setLabel("Retour à la configuration")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function optionsEmbed(config) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle("⚙️ Options des tickets et transcripts")
    .setDescription(
      "Configure l'envoi du transcript, les autorisations et les textes utilisés lors de l'ouverture et de la fermeture.",
    )
    .addFields(
      {
        name: "Transcript",
        value: [
          `Envoi au créateur en MP : **${config.transcriptDmEnabled ? "oui" : "non"}**`,
          `Salon d'archive du staff : ${config.transcriptChannelId ? `<#${config.transcriptChannelId}>` : "aucun"}`,
        ].join("\n"),
      },
      {
        name: "Comportement",
        value: [
          `Confirmation de création : **${config.confirmationEnabled ? "oui" : "non"}**`,
          `Mention du rôle support : **${config.mentionStaffEnabled ? "oui" : "non"}**`,
          `Le membre peut fermer : **${config.allowUserClose ? "oui" : "non"}**`,
          `Tickets ouverts par membre : **${config.maxOpenTicketsPerUser}**`,
          `Préfixe des salons : **${config.channelNamePrefix}**`,
        ].join("\n"),
      },
      {
        name: "Textes",
        value: `Ouverture : ${config.ticketOpenMessage.slice(0, 350)}\nFermeture : ${config.closeMessage.slice(0, 350)}`,
      },
    );
}

function optionsComponents(config) {
  return [
    new ActionRowBuilder().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId("ticket-config:transcript-channel")
        .setPlaceholder("Salon staff des transcripts — facultatif")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setMinValues(0)
        .setMaxValues(1),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket-config:toggle-transcript-dm")
        .setLabel(config.transcriptDmEnabled ? "MP transcript ON" : "MP transcript OFF")
        .setStyle(config.transcriptDmEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("ticket-config:toggle-confirmation")
        .setLabel(config.confirmationEnabled ? "Confirmation ON" : "Confirmation OFF")
        .setStyle(config.confirmationEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("ticket-config:toggle-mention")
        .setLabel(config.mentionStaffEnabled ? "Mention staff ON" : "Mention staff OFF")
        .setStyle(config.mentionStaffEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("ticket-config:toggle-user-close")
        .setLabel(config.allowUserClose ? "Fermeture membre ON" : "Fermeture membre OFF")
        .setStyle(config.allowUserClose ? ButtonStyle.Success : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId("ticket-config:advanced")
        .setLabel("Textes et limites")
        .setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket-config:back")
        .setLabel("Retour à la configuration")
        .setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function optionsPayload(config) {
  return { embeds: [optionsEmbed(config)], components: optionsComponents(config) };
}

function advancedOptionsModal(config) {
  return new ModalBuilder()
    .setCustomId("ticket-config:advanced-modal")
    .setTitle("Textes et limites des tickets")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("maximum")
          .setLabel("Tickets simultanés par membre (1 à 5)")
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(1)
          .setValue(String(config.maxOpenTicketsPerUser))
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("prefix")
          .setLabel("Préfixe du nom des salons")
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(25)
          .setValue(config.channelNamePrefix)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("open_message")
          .setLabel("Message d'ouverture")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setValue(config.ticketOpenMessage)
          .setRequired(true),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("close_message")
          .setLabel("Message de fermeture")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(500)
          .setValue(config.closeMessage)
          .setRequired(true),
      ),
    );
}

async function updateDashboard(interaction, selectedChoiceId = null) {
  const config = (await readGuild(interaction.guild.id)).tickets;
  const payload = selectedChoiceId ? choicePayload(config, selectedChoiceId) : dashboardPayload(config);
  if (interaction.deferred) await interaction.editReply(payload);
  else await interaction.update(payload);
}

async function handleTicketConfigInteraction(interaction) {
  const isActionMenu = ["ticket-config:settings-menu", "ticket-config:choices-menu"].includes(interaction.customId);
  const actionId = isActionMenu ? `ticket-config:${interaction.values[0]}` : interaction.customId;
  if (!actionId?.startsWith("ticket-config:")) {
    return false;
  }
  if (!interaction.inCachedGuild() || !interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: "Tu dois avoir la permission Gérer le serveur.", flags: MessageFlags.Ephemeral });
    return true;
  }
  const config = (await readGuild(interaction.guild.id)).tickets;

  if (actionId === "ticket-config:general") {
    await interaction.update(generalPayload(config));
    return true;
  }
  const toggleSettings = {
    "toggle-claim": "claimEnabled", "toggle-auto-claim": "autoClaimEnabled",
    "toggle-claim-button": "claimButtonEnabled", "toggle-close-button": "closeButtonEnabled",
  };
  const toggle = toggleSettings[actionId?.split(":")[1]];
  if (toggle) {
    await mutateGuild(interaction.guild.id, (data) => {
      data.tickets[toggle] = !data.tickets[toggle];
      if ((toggle === "autoClaimEnabled" || toggle === "claimButtonEnabled") && data.tickets[toggle]) data.tickets.claimEnabled = true;
    });
    await updateDashboard(interaction); return true;
  }
  if (actionId === "ticket-config:toggle-type") {
    await mutateGuild(interaction.guild.id, (data) => { data.tickets.interactionType = data.tickets.interactionType === "SelectMenu" ? "Buttons" : "SelectMenu"; });
    await updateDashboard(interaction); return true;
  }
  if (actionId === "ticket-config:toggle-auto-delete" && !config.autoDeleteClosed) {
    await interaction.update({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("Activer la suppression automatique ?")
      .setDescription("Les prochains tickets fermés seront supprimés environ 30 secondes après livraison d'un transcript complet en MP ou dans le salon d'archives. Le salon sera conservé si aucun transcript n'a été livré ou si l'export a été tronqué. Un salon supprimé est irrécupérable.")],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("ticket-config:confirm-auto-delete").setLabel("Activer la suppression").setStyle(ButtonStyle.Danger)), backRow()] });
    return true;
  }
  if (["ticket-config:confirm-auto-delete", "ticket-config:toggle-auto-delete"].includes(actionId)) {
    await mutateGuild(interaction.guild.id, (data) => { data.tickets.autoDeleteClosed = actionId.endsWith("confirm-auto-delete"); });
    await updateDashboard(interaction); return true;
  }
  if (actionId === "ticket-config:reset-choices") {
    await interaction.update({ embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("Réinitialiser les options ?")
      .setDescription("Le panneau reviendra au choix général. Les tickets existants et leurs messages seront conservés. Il faudra republier le panneau.")],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("ticket-config:confirm-reset").setLabel("Réinitialiser les options").setStyle(ButtonStyle.Danger)), backRow()] });
    return true;
  }
  if (actionId === "ticket-config:confirm-reset") {
    await mutateGuild(interaction.guild.id, (data) => { data.tickets.choices = []; });
    await updateDashboard(interaction); return true;
  }
  if (["ticket-config:choose-edit", "ticket-config:choose-delete"].includes(actionId)) {
    if (!config.choices.length) await interaction.reply({ content: "Ajoute d'abord une option.", flags: MessageFlags.Ephemeral });
    else await interaction.update({ embeds: [dashboardEmbed(config)], components: [dashboardComponents(config).at(-1), backRow()] });
    return true;
  }
  if (/^ticket-config:choice-(category|role|style):/.test(actionId)) {
    const [, field, id] = actionId.split(":");
    const value = interaction.values[0];
    if (!config.choices.some((c) => c.id === id)) { await updateDashboard(interaction); return true; }
    if (field === "choice-role" && value === interaction.guild.id) {
      await interaction.reply({ content: "@everyone ne peut pas être le support d'un ticket privé.", flags: MessageFlags.Ephemeral }); return true;
    }
    if (field === "choice-style" && !["1", "2", "3", "4"].includes(value)) return true;
    await mutateGuild(interaction.guild.id, (data) => {
      const choice = data.tickets.choices.find((c) => c.id === id);
      if (choice) choice[{"choice-category": "categoryId", "choice-role": "staffRoleId", "choice-style": "style"}[field]] = field === "choice-style" ? Number(value) : value || null;
    });
    await updateDashboard(interaction, id); return true;
  }
  if (interaction.isChannelSelectMenu()) {
    const channelId = interaction.values[0];
    if (actionId === "ticket-config:category") {
      await mutateGuild(interaction.guild.id, (data) => {
        data.tickets.categoryId = channelId;
      });
      await updateDashboard(interaction);
      return true;
    }
    if (actionId === "ticket-config:transcript-channel") {
      if (channelId) {
        const archive = await interaction.guild.channels.fetch(channelId);
        if (archive.permissionsFor(interaction.guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel)) {
          await interaction.reply({ content: "Choisis un salon d'archives privé : @everyone ne doit pas pouvoir le voir.", flags: MessageFlags.Ephemeral }); return true;
        }
      }
      await mutateGuild(interaction.guild.id, (data) => {
        data.tickets.transcriptChannelId = channelId || null;
      });
      const updated = (await readGuild(interaction.guild.id)).tickets;
      await interaction.update(optionsPayload(updated));
      return true;
    }
    if (actionId === "ticket-config:publish-channel") {
      if (!config.categoryId || !config.staffRoleId) {
        await interaction.reply({ content: "Choisis d'abord la catégorie et le rôle support.", flags: MessageFlags.Ephemeral });
        return true;
      }
      await interaction.deferUpdate();
      const channel = await interaction.guild.channels.fetch(channelId);
      await publishTicketPanel(interaction.guild, channel);
      await updateDashboard(interaction);
      await interaction.followUp({ content: `Panneau publié dans ${channel}.`, flags: MessageFlags.Ephemeral });
      return true;
    }
  }

  if (interaction.isRoleSelectMenu() && actionId === "ticket-config:staff-role") {
    if (interaction.values[0] === interaction.guild.id) {
      await interaction.reply({ content: "Choisis un rôle support autre que @everyone.", flags: MessageFlags.Ephemeral }); return true;
    }
    await mutateGuild(interaction.guild.id, (data) => {
      data.tickets.staffRoleId = interaction.values[0];
    });
    await updateDashboard(interaction);
    return true;
  }

  if (interaction.isStringSelectMenu() && actionId === "ticket-config:select-choice") {
    await updateDashboard(interaction, interaction.values[0]);
    return true;
  }

  if (interaction.isButton() || isActionMenu) {
    if (actionId === "ticket-config:appearance") {
      await interaction.showModal(appearanceModal(config));
      return true;
    }
    if (actionId === "ticket-config:add-choice") {
      if (config.choices.length >= 25) {
        await interaction.reply({ content: "Limite de 25 options atteinte.", flags: MessageFlags.Ephemeral }); return true;
      }
      await interaction.showModal(choiceModal());
      return true;
    }
    if (actionId.startsWith("ticket-config:edit-choice:")) {
      const id = actionId.split(":")[2];
      const choice = config.choices.find((item) => item.id === id);
      if (!choice) {
        await interaction.reply({ content: "Choix introuvable.", flags: MessageFlags.Ephemeral });
      } else {
        await interaction.showModal(choiceModal(choice));
      }
      return true;
    }
    if (actionId.startsWith("ticket-config:delete-choice:")) {
      const id = actionId.split(":")[2];
      await interaction.reply({
        content: `Confirme la suppression du choix **${id}**.`,
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(`ticket-config:confirm-delete:${id}`)
              .setLabel("Supprimer définitivement")
              .setStyle(ButtonStyle.Danger),
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (actionId.startsWith("ticket-config:confirm-delete:")) {
      const id = actionId.split(":")[2];
      await mutateGuild(interaction.guild.id, (data) => {
        data.tickets.choices = data.tickets.choices.filter((choice) => choice.id !== id);
        normalizeChoiceOrder(data.tickets.choices);
      });
      await interaction.update({ content: `Le choix **${id}** a été supprimé.`, components: [] });
      return true;
    }
    if (actionId === "ticket-config:order") {
      if (!config.choices.length) { await interaction.reply({ content: "Ajoute d'abord une option.", flags: MessageFlags.Ephemeral }); return true; }
      await interaction.showModal(orderModal(config));
      return true;
    }
    if (actionId === "ticket-config:options") {
      await interaction.update(optionsPayload(config));
      return true;
    }
    if (actionId === "ticket-config:toggle-transcript-dm") {
      await mutateGuild(interaction.guild.id, (data) => {
        data.tickets.transcriptDmEnabled = !data.tickets.transcriptDmEnabled;
      });
      const updated = (await readGuild(interaction.guild.id)).tickets;
      await interaction.update(optionsPayload(updated));
      return true;
    }
    if (actionId === "ticket-config:toggle-confirmation") {
      await mutateGuild(interaction.guild.id, (data) => {
        data.tickets.confirmationEnabled = !data.tickets.confirmationEnabled;
      });
      const updated = (await readGuild(interaction.guild.id)).tickets;
      await interaction.update(optionsPayload(updated));
      return true;
    }
    if (actionId === "ticket-config:toggle-mention") {
      await mutateGuild(interaction.guild.id, (data) => {
        data.tickets.mentionStaffEnabled = !data.tickets.mentionStaffEnabled;
      });
      const updated = (await readGuild(interaction.guild.id)).tickets;
      await interaction.update(optionsPayload(updated));
      return true;
    }
    if (actionId === "ticket-config:toggle-user-close") {
      await mutateGuild(interaction.guild.id, (data) => {
        data.tickets.allowUserClose = !data.tickets.allowUserClose;
      });
      const updated = (await readGuild(interaction.guild.id)).tickets;
      await interaction.update(optionsPayload(updated));
      return true;
    }
    if (actionId === "ticket-config:advanced") {
      await interaction.showModal(advancedOptionsModal(config));
      return true;
    }
    if (actionId === "ticket-config:publish") {
      await interaction.update({
        embeds: [
          new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle("Publier le panneau")
            .setDescription("Sélectionne le salon dans lequel envoyer le panneau de tickets."),
        ],
        components: publishComponents(),
      });
      return true;
    }
    if (actionId === "ticket-config:back") {
      await updateDashboard(interaction);
      return true;
    }
  }

  if (interaction.isModalSubmit()) {
    if (actionId === "ticket-config:appearance-modal") {
      const color = interaction.fields.getTextInputValue("color").replace(/^#/, "");
      if (!/^[0-9a-f]{6}$/i.test(color)) {
        await interaction.reply({ content: "La couleur doit contenir exactement 6 caractères hexadécimaux.", flags: MessageFlags.Ephemeral });
        return true;
      }
      await mutateGuild(interaction.guild.id, (data) => {
        data.tickets.panelTitle = interaction.fields.getTextInputValue("title");
        data.tickets.panelDescription = interaction.fields.getTextInputValue("description");
        data.tickets.panelColor = color.toUpperCase();
      });
      await updateDashboard(interaction);
      return true;
    }

    if (actionId.startsWith("ticket-config:choice-modal:")) {
      const previousId = actionId.split(":")[2];
      const id = interaction.fields.getTextInputValue("id").trim().toLowerCase();
      if (config.choices.some((choice) => choice.id === id && choice.id !== previousId)) {
        await interaction.reply({ content: "Cet identifiant est déjà utilisé par une autre option.", flags: MessageFlags.Ephemeral }); return true;
      }
      if (!config.choices.some((choice) => choice.id === previousId) && config.choices.length >= 25) {
        await interaction.reply({ content: "Limite de 25 options atteinte.", flags: MessageFlags.Ephemeral }); return true;
      }
      if (!/^[a-z0-9-]{1,25}$/.test(id)) {
        await interaction.reply({ content: "L'identifiant accepte seulement a-z, 0-9 et les tirets.", flags: MessageFlags.Ephemeral });
        return true;
      }
      const orderText = interaction.fields.getTextInputValue("order").trim();
      const requestedOrder = orderText ? Number(orderText) : null;
      if (orderText && (!Number.isInteger(requestedOrder) || requestedOrder < 1 || requestedOrder > 25)) {
        await interaction.reply({ content: "La position doit être un entier entre 1 et 25.", flags: MessageFlags.Ephemeral });
        return true;
      }
      await mutateGuild(interaction.guild.id, (data) => {
        const existing = data.tickets.choices.find((choice) => choice.id === previousId) || {};
        if (data.tickets.choices.some((choice) => choice.id === id && choice.id !== previousId)) throw new Error("Identifiant déjà utilisé.");
        if (!existing.id && data.tickets.choices.length >= 25) throw new Error("Limite de 25 options atteinte.");
        data.tickets.choices = data.tickets.choices.filter(
          (choice) => choice.id !== previousId && choice.id !== id,
        );
        data.tickets.choices.push({
          ...existing,
          id,
          label: interaction.fields.getTextInputValue("label"),
          emoji: interaction.fields.getTextInputValue("emoji").trim() || null,
          description: interaction.fields.getTextInputValue("description").trim() || null,
          order: requestedOrder || existing.order || data.tickets.choices.length + 1,
        });
        normalizeChoiceOrder(data.tickets.choices);
      });
      await updateDashboard(interaction, id);
      return true;
    }

    if (actionId === "ticket-config:order-modal") {
      const ids = interaction.fields
        .getTextInputValue("ids")
        .split(",")
        .map((id) => id.trim().toLowerCase())
        .filter(Boolean);
      const known = new Set(config.choices.map((choice) => choice.id));
      if (new Set(ids).size !== ids.length || ids.length !== known.size || ids.some((id) => !known.has(id))) {
        await interaction.reply({ content: `Indique chaque identifiant exactement une fois : ${[...known].join(", ")}.`, flags: MessageFlags.Ephemeral });
        return true;
      }
      await mutateGuild(interaction.guild.id, (data) => {
        data.tickets.choices.forEach((choice) => {
          choice.order = ids.indexOf(choice.id) + 1;
        });
      });
      await updateDashboard(interaction);
      return true;
    }

    if (actionId === "ticket-config:advanced-modal") {
      const maximum = Number(interaction.fields.getTextInputValue("maximum"));
      const prefix = interaction.fields.getTextInputValue("prefix").trim().toLowerCase();
      if (!Number.isInteger(maximum) || maximum < 1 || maximum > 5) {
        await interaction.reply({ content: "La limite doit être un entier entre 1 et 5.", flags: MessageFlags.Ephemeral });
        return true;
      }
      if (!/^[a-z0-9-]+$/.test(prefix)) {
        await interaction.reply({ content: "Le préfixe accepte seulement a-z, 0-9 et les tirets.", flags: MessageFlags.Ephemeral });
        return true;
      }
      await mutateGuild(interaction.guild.id, (data) => {
        data.tickets.maxOpenTicketsPerUser = maximum;
        data.tickets.channelNamePrefix = prefix;
        data.tickets.ticketOpenMessage = interaction.fields.getTextInputValue("open_message");
        data.tickets.closeMessage = interaction.fields.getTextInputValue("close_message");
      });
      const updated = (await readGuild(interaction.guild.id)).tickets;
      await interaction.update(optionsPayload(updated));
      return true;
    }
  }
  return true;
}

module.exports = {
  advancedOptionsModal,
  appearanceModal,
  choiceModal,
  dashboardComponents,
  dashboardEmbed,
  dashboardPayload,
  handleTicketConfigInteraction,
  normalizeChoiceOrder,
  optionsComponents,
  optionsEmbed,
  optionsPayload,
  showTicketDashboard,
};
