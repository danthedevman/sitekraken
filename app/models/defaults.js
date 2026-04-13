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

export function defaultAnalyticsConfig(overrides = {}) {
  const overrideConfig =
    overrides && typeof overrides.config === "object" ? overrides.config : {};

  return {
    name: overrides.name || "analytics",
    enabled: typeof overrides.enabled === "boolean" ? overrides.enabled : true,
    scriptUrl:
      overrides.scriptUrl || "https://api.sitekraken.com/public/lib/analytics.js",
    module: typeof overrides.module === "boolean" ? overrides.module : false,
    config: {
      trackClicks:
        typeof overrideConfig.trackClicks === "boolean"
          ? overrideConfig.trackClicks
          : true,
      trackLinks:
        typeof overrideConfig.trackLinks === "boolean"
          ? overrideConfig.trackLinks
          : true,
      trackButtons:
        typeof overrideConfig.trackButtons === "boolean"
          ? overrideConfig.trackButtons
          : true,
      trackScrollDepth:
        typeof overrideConfig.trackScrollDepth === "boolean"
          ? overrideConfig.trackScrollDepth
          : true,
      flushEveryMs:
        typeof overrideConfig.flushEveryMs === "number"
          ? overrideConfig.flushEveryMs
          : 7000,
      heartbeatEveryMs:
        typeof overrideConfig.heartbeatEveryMs === "number"
          ? overrideConfig.heartbeatEveryMs
          : 30000,
      allowedDomains: Array.isArray(overrideConfig.allowedDomains)
        ? overrideConfig.allowedDomains
        : Array.isArray(overrides.allowedDomains)
          ? overrides.allowedDomains
          : [],
    }
  };
}

export function defaultLogsConfig(overrides = {}) {
  const overrideConfig =
    overrides && typeof overrides.config === "object" ? overrides.config : {};

  return {
    name: overrides.name || "logs",
    enabled: typeof overrides.enabled === "boolean" ? overrides.enabled : true,
    scriptUrl:
      overrides.scriptUrl || "https://api.sitekraken.com/public/lib/logs.js",
    module: typeof overrides.module === "boolean" ? overrides.module : false,
    config: {
      captureConsoleErrors:
        typeof overrideConfig.captureConsoleErrors === "boolean"
          ? overrideConfig.captureConsoleErrors
          : true,
      flushEveryMs:
        typeof overrideConfig.flushEveryMs === "number"
          ? overrideConfig.flushEveryMs
          : 4000,
      allowedDomains: Array.isArray(overrideConfig.allowedDomains)
        ? overrideConfig.allowedDomains
        : Array.isArray(overrides.allowedDomains)
          ? overrides.allowedDomains
          : [],
    }
  };
}

export function defaultBannersConfig(overrides = {}) {
  const overrideConfig =
    overrides && typeof overrides.config === "object" ? overrides.config : {};

  return {
    name: overrides.name || "banners",
    enabled: typeof overrides.enabled === "boolean" ? overrides.enabled : true,
    scriptUrl:
      overrides.scriptUrl || "https://api.sitekraken.com/public/lib/banners.js",
    module: typeof overrides.module === "boolean" ? overrides.module : false,
    config: {
      type: overrideConfig.type || "top",
      status: overrideConfig.status || "draft",
      title: overrideConfig.title || "",
      message: overrideConfig.message || "",
      confirmLabel: overrideConfig.confirmLabel || "Okay",
      dismissible:
        typeof overrideConfig.dismissible === "boolean"
          ? overrideConfig.dismissible
          : true,
      autoHideMs:
        typeof overrideConfig.autoHideMs === "number"
          ? overrideConfig.autoHideMs
          : 0,
      showOncePerSession:
        typeof overrideConfig.showOncePerSession === "boolean"
          ? overrideConfig.showOncePerSession
          : false,
      scheduleStartAt: overrideConfig.scheduleStartAt || "",
      scheduleEndAt: overrideConfig.scheduleEndAt || "",
      backgroundColor: overrideConfig.backgroundColor || "#1f2937",
      textColor: overrideConfig.textColor || "#ffffff",
      buttonColor: overrideConfig.buttonColor || "#ffffff",
      buttonTextColor: overrideConfig.buttonTextColor || "#111827",
      position: overrideConfig.position || "top",
      fullWidth:
        typeof overrideConfig.fullWidth === "boolean" ? overrideConfig.fullWidth : true,
      shadow:
        typeof overrideConfig.shadow === "boolean" ? overrideConfig.shadow : true,
      borderRadius:
        typeof overrideConfig.borderRadius === "number" ? overrideConfig.borderRadius : 8,
      zIndex: typeof overrideConfig.zIndex === "number" ? overrideConfig.zIndex : 2147483000,
      allowedDomains: Array.isArray(overrideConfig.allowedDomains)
        ? overrideConfig.allowedDomains
        : Array.isArray(overrides.allowedDomains)
          ? overrides.allowedDomains
          : [],
    }
  };
}

export function defaultWorkspaceChatbot(workspaceId = null, overrides = {}) {
  const defaults = defaultChatbotConfig(workspaceId, overrides);

  const analytics = defaultAnalyticsConfig({
    allowedDomains: defaults.allowedDomains,
  });
  const logs = defaultLogsConfig({
    allowedDomains: defaults.allowedDomains,
  });
  const banners = defaultBannersConfig({
    allowedDomains: defaults.allowedDomains,
  });

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
    analytics,
    logs,
    banners,
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

  const analyticsDefaults = defaultAnalyticsConfig({
    name: workspace?.analytics?.name,
    enabled: workspace?.analytics?.enabled,
    scriptUrl: workspace?.analytics?.scriptUrl,
    module: workspace?.analytics?.module,
    allowedDomains: workspaceAllowedDomains,
    config: workspace?.analytics?.config || {},
  });

  const logsDefaults = defaultLogsConfig({
    name: workspace?.logs?.name,
    enabled: workspace?.logs?.enabled,
    scriptUrl: workspace?.logs?.scriptUrl,
    module: workspace?.logs?.module,
    allowedDomains: workspaceAllowedDomains,
    config: workspace?.logs?.config || {},
  });

  const bannersDefaults = defaultBannersConfig({
    name: workspace?.banners?.name,
    enabled: workspace?.banners?.enabled,
    scriptUrl: workspace?.banners?.scriptUrl,
    module: workspace?.banners?.module,
    allowedDomains: workspaceAllowedDomains,
    config: workspace?.banners?.config || {},
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
    analytics: {
      ...(workspace?.analytics || {}),
      name: workspace?.analytics?.name || analyticsDefaults.name,
      enabled:
        typeof workspace?.analytics?.enabled === "boolean"
          ? workspace.analytics.enabled
          : analyticsDefaults.enabled,
      scriptUrl: workspace?.analytics?.scriptUrl || analyticsDefaults.scriptUrl,
      module:
        typeof workspace?.analytics?.module === "boolean"
          ? workspace.analytics.module
          : analyticsDefaults.module,
      config: {
        ...analyticsDefaults.config,
        ...(workspace?.analytics?.config || {}),
        allowedDomains:
          Array.isArray(workspace?.analytics?.config?.allowedDomains)
            ? workspace.analytics.config.allowedDomains
            : workspaceAllowedDomains.length > 0
              ? workspaceAllowedDomains
              : analyticsDefaults.config.allowedDomains,
      },
    },
    logs: {
      ...(workspace?.logs || {}),
      name: workspace?.logs?.name || logsDefaults.name,
      enabled:
        typeof workspace?.logs?.enabled === "boolean"
          ? workspace.logs.enabled
          : logsDefaults.enabled,
      scriptUrl: workspace?.logs?.scriptUrl || logsDefaults.scriptUrl,
      module:
        typeof workspace?.logs?.module === "boolean"
          ? workspace.logs.module
          : logsDefaults.module,
      config: {
        ...logsDefaults.config,
        ...(workspace?.logs?.config || {}),
        allowedDomains:
          Array.isArray(workspace?.logs?.config?.allowedDomains)
            ? workspace.logs.config.allowedDomains
            : workspaceAllowedDomains.length > 0
              ? workspaceAllowedDomains
              : logsDefaults.config.allowedDomains,
      },
    },
    banners: {
      ...(workspace?.banners || {}),
      name: workspace?.banners?.name || bannersDefaults.name,
      enabled:
        typeof workspace?.banners?.enabled === "boolean"
          ? workspace.banners.enabled
          : bannersDefaults.enabled,
      scriptUrl: workspace?.banners?.scriptUrl || bannersDefaults.scriptUrl,
      module:
        typeof workspace?.banners?.module === "boolean"
          ? workspace.banners.module
          : bannersDefaults.module,
      config: {
        ...bannersDefaults.config,
        ...(workspace?.banners?.config || {}),
        allowedDomains:
          Array.isArray(workspace?.banners?.config?.allowedDomains)
            ? workspace.banners.config.allowedDomains
            : workspaceAllowedDomains.length > 0
              ? workspaceAllowedDomains
              : bannersDefaults.config.allowedDomains,
      },
    },
  };
}
