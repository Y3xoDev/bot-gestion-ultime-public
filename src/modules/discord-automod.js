const {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleKeywordPresetType,
  AutoModerationRuleTriggerType,
} = require("discord.js");

const RULE_PREFIX = "GestionBot • ";
const RULE_NAMES = {
  keywords: `${RULE_PREFIX}Mots interdits`,
  mentions: `${RULE_PREFIX}Anti-mentions`,
  presets: `${RULE_PREFIX}Contenu inapproprié`,
  spam: `${RULE_PREFIX}Anti-spam`,
};

const RULE_LIMITS = new Map([
  [AutoModerationRuleTriggerType.Keyword, 6],
  [AutoModerationRuleTriggerType.Spam, 1],
  [AutoModerationRuleTriggerType.KeywordPreset, 1],
  [AutoModerationRuleTriggerType.MentionSpam, 1],
]);

const TRIGGER_LABELS = new Map([
  [AutoModerationRuleTriggerType.Keyword, "mots personnalisés"],
  [AutoModerationRuleTriggerType.Spam, "anti-spam Discord"],
  [AutoModerationRuleTriggerType.KeywordPreset, "filtres prédéfinis Discord"],
  [AutoModerationRuleTriggerType.MentionSpam, "anti-mentions"],
]);

function parseKeywords(input) {
  if (!input?.trim()) {
    return { keywords: [], rejected: [] };
  }

  const seen = new Set();
  const keywords = [];
  const rejected = [];

  for (const rawKeyword of input.split(/[\n,]/)) {
    const keyword = rawKeyword.trim();
    const normalized = keyword.toLocaleLowerCase("fr");

    if (!keyword) {
      continue;
    }

    if (keyword.length > 60) {
      rejected.push(keyword);
      continue;
    }

    if (!seen.has(normalized) && keywords.length < 1000) {
      seen.add(normalized);
      keywords.push(keyword);
    }
  }

  return { keywords, rejected };
}

function baseActions(alertChannelId) {
  return [
    {
      type: AutoModerationActionType.BlockMessage,
      metadata: {
        customMessage: "Message bloqué par l'AutoMod du serveur.",
      },
    },
    {
      type: AutoModerationActionType.SendAlertMessage,
      metadata: { channel: alertChannelId },
    },
  ];
}

function buildRuleSpecs({ alertChannelId, keywords, mentionLimit, timeoutMinutes }) {
  const actions = baseActions(alertChannelId);
  const specs = [
    {
      name: RULE_NAMES.presets,
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.KeywordPreset,
      triggerMetadata: {
        presets: [
          AutoModerationRuleKeywordPresetType.Profanity,
          AutoModerationRuleKeywordPresetType.SexualContent,
          AutoModerationRuleKeywordPresetType.Slurs,
        ],
        allowList: [],
      },
      actions,
      enabled: true,
    },
    {
      name: RULE_NAMES.spam,
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Spam,
      actions,
      enabled: true,
    },
    {
      name: RULE_NAMES.mentions,
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.MentionSpam,
      triggerMetadata: {
        mentionTotalLimit: mentionLimit,
        mentionRaidProtectionEnabled: true,
      },
      actions: [
        ...actions,
        {
          type: AutoModerationActionType.Timeout,
          metadata: { durationSeconds: timeoutMinutes * 60 },
        },
      ],
      enabled: true,
    },
  ];

  if (keywords.length > 0) {
    specs.push({
      name: RULE_NAMES.keywords,
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Keyword,
      triggerMetadata: {
        keywordFilter: keywords,
        regexPatterns: [],
        allowList: [],
      },
      actions: [
        ...actions,
        {
          type: AutoModerationActionType.Timeout,
          metadata: { durationSeconds: timeoutMinutes * 60 },
        },
      ],
      enabled: true,
    });
  }

  return specs;
}

async function configureNativeAutoMod(guild, options, moderatorTag) {
  const rules = await guild.autoModerationRules.fetch();
  const specs = buildRuleSpecs(options);
  const results = [];
  const reason = `Configuration AutoMod par ${moderatorTag}`;

  for (const spec of specs) {
    const sameName = rules.find((rule) => rule.name === spec.name);
    const existing =
      sameName?.creatorId === guild.client.user.id ? sameName : undefined;

    if (sameName && !existing) {
      results.push({
        name: spec.name,
        status: "ignorée",
        detail: "ce nom est déjà utilisé par une règle qui n'appartient pas au bot",
      });
      continue;
    }

    if (existing) {
      if (existing.triggerType !== spec.triggerType) {
        results.push({
          name: spec.name,
          status: "erreur",
          detail: "le type de la règle existante ne correspond pas",
        });
        continue;
      }

      const { triggerType: _triggerType, ...editOptions } = spec;
      const updated = await existing.edit({ ...editOptions, reason });
      rules.set(updated.id, updated);
      results.push({ name: spec.name, status: "mise à jour" });
      continue;
    }

    const limit = RULE_LIMITS.get(spec.triggerType) ?? 1;
    const sameTypeCount = rules.filter(
      (rule) => rule.triggerType === spec.triggerType,
    ).size;

    if (sameTypeCount >= limit) {
      results.push({
        name: spec.name,
        status: "ignorée",
        detail: `limite Discord atteinte pour ${TRIGGER_LABELS.get(spec.triggerType)}`,
      });
      continue;
    }

    const created = await guild.autoModerationRules.create({ ...spec, reason });
    rules.set(created.id, created);
    results.push({ name: spec.name, status: "créée" });
  }

  return results;
}

async function configureManagedMentionRule(guild, { alertChannelId, mentionLimit, timeoutMinutes }, moderatorTag) {
  const rules = await guild.autoModerationRules.fetch();
  const spec = buildRuleSpecs({
    alertChannelId,
    keywords: [],
    mentionLimit,
    timeoutMinutes,
  }).find((item) => item.name === RULE_NAMES.mentions);
  const sameName = rules.find((rule) => rule.name === spec.name);
  const reason = `Configuration anti-mentions par ${moderatorTag}`;

  if (sameName && sameName.creatorId !== guild.client.user.id) {
    return { name: spec.name, status: "ignorée", detail: "le nom est utilisé par une règle qui n'appartient pas au bot" };
  }
  if (sameName) {
    if (sameName.triggerType !== spec.triggerType) {
      return { name: spec.name, status: "erreur", detail: "le type de la règle existante ne correspond pas" };
    }
    const { triggerType: _triggerType, ...editOptions } = spec;
    await sameName.edit({ ...editOptions, reason });
    return { name: spec.name, status: "mise à jour" };
  }

  const sameTypeCount = rules.filter((rule) => rule.triggerType === spec.triggerType).size;
  if (sameTypeCount >= (RULE_LIMITS.get(spec.triggerType) ?? 1)) {
    return { name: spec.name, status: "ignorée", detail: "limite Discord atteinte pour l'anti-mentions" };
  }
  await guild.autoModerationRules.create({ ...spec, reason });
  return { name: spec.name, status: "créée" };
}

async function getAutoModStatus(guild) {
  const rules = await guild.autoModerationRules.fetch();
  const managed = rules
    .filter(
      (rule) =>
        rule.name.startsWith(RULE_PREFIX) && rule.creatorId === guild.client.user.id,
    )
    .sort((left, right) => left.name.localeCompare(right.name, "fr"));

  return { managed, total: rules.size };
}

async function setManagedRulesEnabled(guild, enabled, moderatorTag) {
  const { managed } = await getAutoModStatus(guild);
  const reason = `${enabled ? "Activation" : "Désactivation"} AutoMod par ${moderatorTag}`;

  for (const rule of managed.values()) {
    await rule.setEnabled(enabled, reason);
  }

  return managed.size;
}

async function deleteManagedRules(guild, moderatorTag) {
  const { managed } = await getAutoModStatus(guild);
  const reason = `Désinstallation AutoMod par ${moderatorTag}`;

  for (const rule of managed.values()) {
    await rule.delete(reason);
  }

  return managed.size;
}

module.exports = {
  RULE_PREFIX,
  buildRuleSpecs,
  configureManagedMentionRule,
  configureNativeAutoMod,
  deleteManagedRules,
  getAutoModStatus,
  parseKeywords,
  setManagedRulesEnabled,
};
