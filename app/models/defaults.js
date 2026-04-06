import crypto from "node:crypto";

export function createApiKey() {
  return `ws_${crypto.randomBytes(24).toString("hex")}`;
}

export function normalizeAllowedDomainsInput(value) {
  return String(value || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((entry) => {
      try {
        if (entry.startsWith("http://") || entry.startsWith("https://")) {
          return new URL(entry).origin;
        }

        const isLocalhost =
          entry.startsWith("localhost:") ||
          entry.startsWith("127.0.0.1:") ||
          entry === "localhost" ||
          entry === "127.0.0.1";

        return new URL(`${isLocalhost ? "http" : "https"}://${entry}`).origin;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function defaultChatbotConfig(workspaceId = null, overrides = {}) {
  const overrideConfig =
    overrides && typeof overrides.config === "object" ? overrides.config : {};

  return {
    workspaceId: workspaceId ? String(workspaceId) : null,
    apiKey: overrides.apiKey || createApiKey(),
    name: overrides.name || "chat",
    enabled:
      typeof overrides.enabled === "boolean" ? overrides.enabled : true,
    scriptUrl:
      overrides.scriptUrl || "https://api.sitekraken.com/public/lib/chat.js",
    module: typeof overrides.module === "boolean" ? overrides.module : false,
    allowedDomains: Array.isArray(overrides.allowedDomains)
      ? overrides.allowedDomains
      : [],
    config: {
      title: overrideConfig.title || "Assistant",
      subtitle: overrideConfig.subtitle || "AI Chatbot",
      initialMessage:
        overrideConfig.initialMessage || "Hi, How can I help you today?",
      additionalInstructions: overrideConfig.additionalInstructions || "",
      quickMessages: Array.isArray(overrideConfig.quickMessages)
        ? overrideConfig.quickMessages
        : [],
      footerLinks: Array.isArray(overrideConfig.footerLinks)
        ? overrideConfig.footerLinks
        : [],
      allowedDomains: Array.isArray(overrideConfig.allowedDomains)
        ? overrideConfig.allowedDomains
        : Array.isArray(overrides.allowedDomains)
          ? overrides.allowedDomains
          : [],

      logoUrl: overrideConfig.logoUrl || "",

      accent: overrideConfig.accent || "#111827",
      accentText: overrideConfig.accentText || "#ffffff",
      border: overrideConfig.border || "#e5e7eb",
      panelBg: overrideConfig.panelBg || "#ffffff",
      muted: overrideConfig.muted || "#6b7280",
      bubbleUserBg: overrideConfig.bubbleUserBg || "#111827",
      bubbleUserText: overrideConfig.bubbleUserText || "#ffffff",
      bubbleBotBg: overrideConfig.bubbleBotBg || "#ffffff",
      bubbleBotText: overrideConfig.bubbleBotText || "#111827",

      launcherSize:
        typeof overrideConfig.launcherSize === "number"
          ? overrideConfig.launcherSize
          : 70,
      bottom:
        typeof overrideConfig.bottom === "number" ? overrideConfig.bottom : 20,
      right:
        typeof overrideConfig.right === "number" ? overrideConfig.right : 20,
      maxWidth:
        typeof overrideConfig.maxWidth === "number"
          ? overrideConfig.maxWidth
          : 420,
      panelWidth:
        overrideConfig.panelWidth || "min(420px, calc(100vw - 20px))",
      panelHeight:
        overrideConfig.panelHeight || "min(600px, calc(100vh - 110px))",
    },
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

export function defaultWorkspaceChatbot(workspaceId = null, overrides = {}) {
  const defaults = defaultChatbotConfig(workspaceId, overrides);

  return {
    apiKey: defaults.apiKey,
    allowedDomains: defaults.allowedDomains,
    chatbot: {
      name: defaults.name,
      enabled: defaults.enabled,
      scriptUrl: defaults.scriptUrl,
      module: defaults.module,
      config: defaults.config,
    },
  };
}

export function ensureWorkspaceChatbotDefaults(workspace = {}) {
  const workspaceAllowedDomains = Array.isArray(workspace?.allowedDomains)
    ? workspace.allowedDomains
    : [];

  const defaults = defaultChatbotConfig(workspace?._id || null, {
    apiKey: workspace?.apiKey,
    name: workspace?.chatbot?.name,
    enabled: workspace?.chatbot?.enabled,
    scriptUrl: workspace?.chatbot?.scriptUrl,
    module: workspace?.chatbot?.module,
    allowedDomains: workspaceAllowedDomains,
    config: workspace?.chatbot?.config || {},
  });

  const existingConfig =
    workspace?.chatbot?.config && typeof workspace.chatbot.config === "object"
      ? workspace.chatbot.config
      : {};

  return {
    ...workspace,
    apiKey: workspace?.apiKey || defaults.apiKey,
    allowedDomains:
      workspaceAllowedDomains.length > 0
        ? workspaceAllowedDomains
        : defaults.allowedDomains,
    chatbot: {
      ...(workspace?.chatbot || {}),
      name: workspace?.chatbot?.name || defaults.name,
      enabled:
        typeof workspace?.chatbot?.enabled === "boolean"
          ? workspace.chatbot.enabled
          : defaults.enabled,
      scriptUrl: workspace?.chatbot?.scriptUrl || defaults.scriptUrl,
      module:
        typeof workspace?.chatbot?.module === "boolean"
          ? workspace.chatbot.module
          : defaults.module,
      config: {
        ...defaults.config,
        ...existingConfig,

        quickMessages: Array.isArray(existingConfig.quickMessages)
          ? existingConfig.quickMessages
          : defaults.config.quickMessages,

        footerLinks: Array.isArray(existingConfig.footerLinks)
          ? existingConfig.footerLinks
          : defaults.config.footerLinks,

        allowedDomains: Array.isArray(existingConfig.allowedDomains)
          ? existingConfig.allowedDomains
          : workspaceAllowedDomains.length > 0
            ? workspaceAllowedDomains
            : defaults.config.allowedDomains,

        launcherSize:
          typeof existingConfig.launcherSize === "number"
            ? existingConfig.launcherSize
            : defaults.config.launcherSize,

        bottom:
          typeof existingConfig.bottom === "number"
            ? existingConfig.bottom
            : defaults.config.bottom,

        right:
          typeof existingConfig.right === "number"
            ? existingConfig.right
            : defaults.config.right,

        maxWidth:
          typeof existingConfig.maxWidth === "number"
            ? existingConfig.maxWidth
            : defaults.config.maxWidth,
      },
    },
  };
}