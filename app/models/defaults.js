import crypto from 'node:crypto';

export function createApiKey() {
  return `ws_${crypto.randomBytes(24).toString('hex')}`;
}

export function normalizeAllowedDomainsInput(value) {
  return String(value || '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((entry) => {
      try {
        if (entry.startsWith('http://') || entry.startsWith('https://')) {
          return new URL(entry).origin;
        }

        const isLocalhost =
          entry.startsWith('localhost:') ||
          entry.startsWith('127.0.0.1:') ||
          entry === 'localhost' ||
          entry === '127.0.0.1';

        return new URL(`${isLocalhost ? 'http' : 'https'}://${entry}`).origin;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

export function defaultChatbotConfig(workspaceId = null, overrides = {}) {
  return {
    workspaceId: workspaceId ? String(workspaceId) : null,
    apiKey: overrides.apiKey || createApiKey(),
    name: 'chat',
    enabled: true,
    scriptUrl: 'http://localhost:4001/public/lib/chat.js',
    module: false,
    allowedDomains: Array.isArray(overrides.allowedDomains)
      ? overrides.allowedDomains
      : [],
    config: {
      title: 'Assistant',
      subtitle: 'AI Chatbot',
      initialMessage: 'Hi, How can I help you today?',
      additionalInstructions: '',
      quickMessages: [],
      footerLinks: []
    },
    createdAt: new Date(),
    updatedAt: new Date()
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
      config: defaults.config
    }
  };
}

export function ensureWorkspaceChatbotDefaults(workspace = {}) {
  const defaults = defaultChatbotConfig(workspace?._id || null, {
    allowedDomains: Array.isArray(workspace?.allowedDomains)
      ? workspace.allowedDomains
      : []
  });

  return {
    ...workspace,
    apiKey: workspace?.apiKey || defaults.apiKey,
    allowedDomains: Array.isArray(workspace?.allowedDomains)
      ? workspace.allowedDomains
      : defaults.allowedDomains,
    chatbot: {
      name: workspace?.chatbot?.name || defaults.name,
      enabled:
        typeof workspace?.chatbot?.enabled === 'boolean'
          ? workspace.chatbot.enabled
          : defaults.enabled,
      scriptUrl: workspace?.chatbot?.scriptUrl || defaults.scriptUrl,
      module:
        typeof workspace?.chatbot?.module === 'boolean'
          ? workspace.chatbot.module
          : defaults.module,
      config: {
        title: workspace?.chatbot?.config?.title || defaults.config.title,
        subtitle:
          workspace?.chatbot?.config?.subtitle || defaults.config.subtitle,
        initialMessage:
          workspace?.chatbot?.config?.initialMessage ||
          defaults.config.initialMessage,
        additionalInstructions:
          workspace?.chatbot?.config?.additionalInstructions ||
          defaults.config.additionalInstructions,
        quickMessages: Array.isArray(workspace?.chatbot?.config?.quickMessages)
          ? workspace.chatbot.config.quickMessages
          : defaults.config.quickMessages,
        footerLinks: Array.isArray(workspace?.chatbot?.config?.footerLinks)
          ? workspace.chatbot.config.footerLinks
          : defaults.config.footerLinks
      }
    }
  };
}