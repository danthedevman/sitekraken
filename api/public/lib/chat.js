(() => {

  if (window.__embeddedChatbotLoaded) return;
  window.__embeddedChatbotLoaded = true;

  function getCurrentScript() {
    if (document.currentScript) return document.currentScript;

    const scripts = Array.from(document.getElementsByTagName("script"));
    return (
      scripts.find((s) => s.src && s.src.includes("/public/lib/chat.js")) ||
      scripts[scripts.length - 1]
    );
  }

  const currentScript = getCurrentScript();

  let moduleConfig = {};
  try {
    moduleConfig = currentScript?.getAttribute("data-module-config")
      ? JSON.parse(currentScript.getAttribute("data-module-config"))
      : {};
  } catch {
    moduleConfig = {};
  }

  const inferredScriptOrigin = currentScript?.src
    ? (() => {
        try {
          return new URL(currentScript.src, window.location.href).origin;
        } catch {
          return "";
        }
      })()
    : "";

  const DEFAULTS = {
    apiUrl: "",
    apiKey:
      currentScript?.getAttribute("data-api-key") ||
      window.EmbeddedChatbotConfig?.apiKey ||
      "",
    title: "AI Assist",
    subtitle: "Ask me anything",
    accent: "#111827",
    accentText: "#ffffff",
    border: "#e5e7eb",
    panelBg: "#ffffff",
    muted: "#6b7280",
    bubbleUserBg: "#111827",
    bubbleUserText: "#ffffff",
    bubbleBotBg: "#ffffff",
    bubbleBotText: "#111827",
    launcherSize: 70,
    bottom: 20,
    right: 20,
    maxWidth: 420,
    panelWidth: "min(420px, calc(100vw - 20px))",
    panelHeight: "min(600px, calc(100vh - 110px))",
    initialMessage: "Hi, How can I help you?",
    quickMessages: [],
    footerLinks: [],
    allowedDomains: [],
    logoUrl: "",
  };

  const config = {
    ...DEFAULTS,
    ...(window.EmbeddedChatbotConfig || {}),
    ...(moduleConfig || {}),
    apiUrl:
      moduleConfig.apiUrl ||
      window.EmbeddedChatbotConfig?.apiUrl ||
      inferredScriptOrigin ||
      window.location.origin,
    apiKey:
      currentScript?.getAttribute("data-api-key") ||
      moduleConfig.apiKey ||
      window.EmbeddedChatbotConfig?.apiKey ||
      DEFAULTS.apiKey,
    logoUrl:
      moduleConfig.logoUrl ||
      window.EmbeddedChatbotConfig?.logoUrl ||
      DEFAULTS.logoUrl,
  };

  function createId(prefix) {
    if (window.crypto && window.crypto.randomUUID) {
      return prefix + "_" + window.crypto.randomUUID();
    }
    return (
      prefix + "_" + Date.now() + "_" + Math.random().toString(36).slice(2)
    );
  }


  function normalizeQuickMessages(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map(function (item) {
        return typeof item === "string" ? item.trim() : "";
      })
      .filter(Boolean);
  }

  function normalizeFooterLinks(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map(function (item) {
        if (!item || typeof item !== "object") return null;

        const label = typeof item.label === "string" ? item.label.trim() : "";
        const href = typeof item.href === "string" ? item.href.trim() : "";
        const target = item.target === "_self" ? "_self" : "_blank";

        if (!label || !href) return null;

        return { label, href, target };
      })
      .filter(Boolean);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function sanitizeCssColor(value, fallback) {
    const str = String(value || "").trim();
    if (!str) return fallback;

    if (
      /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(str) ||
      /^rgba?\([\d\s.,%]+\)$/i.test(str) ||
      /^hsla?\([\d\s.,%]+\)$/i.test(str) ||
      /^[a-z]+$/i.test(str)
    ) {
      return str;
    }

    return fallback;
  }

  function sanitizeDimension(value, fallback, options = {}) {
    const str = String(value ?? "").trim();
    if (!str) return fallback;

    const allowCalc = options.allowCalc !== false;

    if (/^\d+(\.\d+)?(px|rem|em|vw|vh|dvw|dvh|%)$/i.test(str)) {
      return str;
    }

    if (allowCalc && /^min\(.+\)$/i.test(str)) {
      return str;
    }

    if (allowCalc && /^max\(.+\)$/i.test(str)) {
      return str;
    }

    if (allowCalc && /^calc\(.+\)$/i.test(str)) {
      return str;
    }

    return fallback;
  }

  function normalizePositiveNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  function sanitizeUrl(value) {
    const str = String(value || "").trim();
    if (!str) return "";

    try {
      const url = new URL(str, window.location.href);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.toString();
      }
      return "";
    } catch {
      return "";
    }
  }

  config.quickMessages = normalizeQuickMessages(config.quickMessages);
  config.footerLinks = normalizeFooterLinks(config.footerLinks);
  config.title = String(config.title || DEFAULTS.title);
  config.subtitle = String(config.subtitle || DEFAULTS.subtitle);
  config.initialMessage = String(
    config.initialMessage || DEFAULTS.initialMessage,
  );
  config.accent = sanitizeCssColor(config.accent, DEFAULTS.accent);
  config.accentText = sanitizeCssColor(config.accentText, DEFAULTS.accentText);
  config.border = sanitizeCssColor(config.border, DEFAULTS.border);
  config.panelBg = sanitizeCssColor(config.panelBg, DEFAULTS.panelBg);
  config.muted = sanitizeCssColor(config.muted, DEFAULTS.muted);
  config.bubbleUserBg = sanitizeCssColor(
    config.bubbleUserBg,
    DEFAULTS.bubbleUserBg,
  );
  config.bubbleUserText = sanitizeCssColor(
    config.bubbleUserText,
    DEFAULTS.bubbleUserText,
  );
  config.bubbleBotBg = sanitizeCssColor(
    config.bubbleBotBg,
    DEFAULTS.bubbleBotBg,
  );
  config.bubbleBotText = sanitizeCssColor(
    config.bubbleBotText,
    DEFAULTS.bubbleBotText,
  );
  config.launcherSize = normalizePositiveNumber(
    config.launcherSize,
    DEFAULTS.launcherSize,
  );
  config.bottom = normalizePositiveNumber(config.bottom, DEFAULTS.bottom);
  config.right = normalizePositiveNumber(config.right, DEFAULTS.right);
  config.maxWidth = normalizePositiveNumber(config.maxWidth, DEFAULTS.maxWidth);
  config.panelWidth = sanitizeDimension(config.panelWidth, DEFAULTS.panelWidth);
  config.panelHeight = sanitizeDimension(
    config.panelHeight,
    DEFAULTS.panelHeight,
  );
  config.logoUrl = sanitizeUrl(config.logoUrl);

  function loadState() {
    return {
      threadId: createId("thread"),
      isOpen: false,
      isLoading: false,
      isFullscreen: false,
      messages: [
        {
          id: createId("msg"),
          role: "assistant",
          text: config.initialMessage,
          html: null,
          createdAt: new Date().toISOString(),
        },
      ],
    };
  }

  const state = loadState();
  let originalBodyOverflowY = null;

  function persistState() {
    return;
  }

  function sanitizeHtml(html) {
    const template = document.createElement("template");
    template.innerHTML = String(html);

    const allowedTags = new Set([
      "A",
      "BR",
      "STRONG",
      "EM",
      "B",
      "I",
      "CODE",
      "P",
      "UL",
      "OL",
      "LI",
      "H1",
      "H2",
      "H3",
    ]);
    const allowedSchemes = new Set(["mailto:", "https:", "http:"]);

    function cleanNode(node) {
      if (node.nodeType === Node.TEXT_NODE) return;

      if (node.nodeType !== Node.ELEMENT_NODE) {
        node.remove();
        return;
      }

      const tag = node.tagName;

      if (!allowedTags.has(tag)) {
        const parent = node.parentNode;
        if (!parent) {
          node.remove();
          return;
        }

        while (node.firstChild) {
          parent.insertBefore(node.firstChild, node);
        }
        node.remove();
        return;
      }

      for (const attr of [...node.attributes]) {
        const name = attr.name.toLowerCase();
        const value = attr.value;

        if (tag === "A" && name === "href") {
          try {
            const url = new URL(value, window.location.origin);
            if (!allowedSchemes.has(url.protocol)) {
              node.removeAttribute("href");
            }
          } catch {
            node.removeAttribute("href");
          }
          continue;
        }

        if (tag === "A" && name === "target") {
          if (value !== "_blank" && value !== "_self") {
            node.removeAttribute(name);
          }
          continue;
        }

        if (tag === "A" && name === "rel") {
          continue;
        }

        node.removeAttribute(name);
      }

      if (tag === "A") {
        const href = node.getAttribute("href");
        if (href) {
          const isExternal = /^https?:/i.test(href);
          if (isExternal) {
            if (!node.getAttribute("target")) {
              node.setAttribute("target", "_blank");
            }
            node.setAttribute("rel", "noopener noreferrer");
          } else {
            node.removeAttribute("rel");
          }
        }
      }

      for (const child of [...node.childNodes]) {
        cleanNode(child);
      }
    }

    for (const child of [...template.content.childNodes]) {
      cleanNode(child);
    }

    return template.innerHTML;
  }

  function renderSafeAssistantHtml(text) {
    const source = String(text || "").replace(/\r\n/g, "\n");
    if (!source.trim()) return "";

    const lines = source.split("\n");
    const htmlParts = [];
    let inList = false;

    function closeListIfNeeded() {
      if (inList) {
        htmlParts.push("</ul>");
        inList = false;
      }
    }

    function inlineFormat(input) {
      const source = String(input || "");

      const parts = [];
      let lastIndex = 0;

      const markdownLinkRegex =
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g;
      let match;

      while ((match = markdownLinkRegex.exec(source)) !== null) {
        const [fullMatch, label, url] = match;
        const start = match.index;

        const before = source.slice(lastIndex, start);
        parts.push(escapeHtml(before));

        const safeLabel = escapeHtml(label);
        const safeUrl = escapeHtml(url);

        parts.push(
          `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeLabel}</a>`,
        );

        lastIndex = start + fullMatch.length;
      }

      parts.push(escapeHtml(source.slice(lastIndex)));

      let html = parts.join("");

      html = html.replace(
        /(^|[\s(>])((https?:\/\/[^\s<]+|mailto:[^\s<]+))/g,
        function (_match, prefix, url) {
          const safeUrl = escapeHtml(url);
          return `${prefix}<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeUrl}</a>`;
        },
      );

      html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
      html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");

      return html;
    }

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (!line) {
        closeListIfNeeded();
        continue;
      }

      if (line.startsWith("### ")) {
        closeListIfNeeded();
        htmlParts.push(`<h3>${inlineFormat(line.slice(4))}</h3>`);
        continue;
      }

      if (line.startsWith("## ")) {
        closeListIfNeeded();
        htmlParts.push(`<h2>${inlineFormat(line.slice(3))}</h2>`);
        continue;
      }

      if (line.startsWith("# ")) {
        closeListIfNeeded();
        htmlParts.push(`<h1>${inlineFormat(line.slice(2))}</h1>`);
        continue;
      }

      if (/^[-*]\s+/.test(line)) {
        if (!inList) {
          htmlParts.push("<ul>");
          inList = true;
        }
        htmlParts.push(
          `<li>${inlineFormat(line.replace(/^[-*]\s+/, ""))}</li>`,
        );
        continue;
      }

      closeListIfNeeded();
      htmlParts.push(`<p>${inlineFormat(line)}</p>`);
    }

    closeListIfNeeded();

    return sanitizeHtml(htmlParts.join(""));
  }

  function formatTime(dateString) {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function shouldLockBodyScroll() {
    return state.isOpen && state.isFullscreen;
  }

  function syncBodyScrollLock() {
    if (!document.body) return;
    if (shouldLockBodyScroll()) {
      if (originalBodyOverflowY === null) {
        originalBodyOverflowY = document.body.style.overflowY || "";
      }
      document.body.style.overflowY = "hidden";
    } else if (originalBodyOverflowY !== null) {
      document.body.style.overflowY = originalBodyOverflowY;
      originalBodyOverflowY = null;
    }
  }

  function shouldRenderQuickMessagesForMessage(message, index) {
    return (
      index === 0 &&
      message &&
      message.role === "assistant" &&
      message.text === config.initialMessage &&
      config.quickMessages.length > 0
    );
  }

  function renderAvatarMarkup() {
    if (config.logoUrl) {
      return `<img class="custom-launcher-image" src="${escapeHtml(config.logoUrl)}" alt="${escapeHtml(config.title)} logo">`;
    }

    return `<span class="avatarFallback" aria-hidden="true">${escapeHtml(
      (config.title || "AI").trim().slice(0, 2).toUpperCase(),
    )}</span>`;
  }

  function renderLauncherMarkup() {
    if (config.logoUrl) {
      return `<img
        class="icon-chat custom-launcher-image"
        src="${escapeHtml(config.logoUrl)}"
        alt="Open chat"
      />`;
    }

    return `
      <svg class="icon-chat" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M8 10h8M8 14h5m6 6-3.6-1.8a3 3 0 0 0-1.34-.32H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v6a4 4 0 0 1-2 3.46Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

  function mount() {
    if (document.getElementById("embedded-chatbot-host")) return;

    const host = document.createElement("div");
    host.id = "embedded-chatbot-host";
    host.style.position = "fixed";
    host.style.right = config.right + "px";
    host.style.bottom = config.bottom + "px";
    host.style.zIndex = "2147483647";
    host.style.width = "auto";
    host.style.height = "auto";
    host.style.pointerEvents = "none";
    host.style.transform = "none";
    host.style.margin = "0";
    host.style.padding = "0";
    host.style.border = "0";
    host.style.background = "transparent";

    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      :host, * {
        box-sizing: border-box;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .wrap { position: relative; pointer-events: auto; }
      .launcher {
        position: relative;
        width: ${config.launcherSize}px;
        height: ${config.launcherSize}px;
        border: none;
        border-radius: 9999px;
        color: ${config.accentText};
        background: ${config.logoUrl ? 'none' :config.accent};
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        overflow: hidden;
        box-shadow: 0 18px 40px rgba(0,0,0,0.18), 0 8px 18px rgba(0,0,0,0.12);
        transition: transform 140ms ease, opacity 140ms ease;
      }
        
      .launcher.open{
       background: ${config.accent};
      }
      .launcher:hover { transform: translateY(-1px); }
      .launcher svg { width: 26px; height: 26px; display: block; }
      .launcher .icon-chat, .launcher .icon-close {
        position: absolute; inset: 0; margin: auto;
        transition: opacity 140ms ease, transform 140ms ease;
      }
      .launcher .icon-chat { opacity: 1; transform: scale(1); }
      .launcher .icon-close { opacity: 0; transform: scale(0.8); }
      .launcher.open .icon-chat { opacity: 0; transform: scale(0.8); }
      .launcher.open .icon-close { opacity: 1; transform: scale(1); }
      .custom-launcher-image {
        width: 100%;
        height: 100%;
        object-fit: cover;
        border-radius: 9999px;
        display: block;
      }

      .panel {
        position: absolute;
        right: 0;
        bottom: ${config.launcherSize + 12}px;
        width: ${config.panelWidth};
        max-width: ${config.maxWidth}px;
        height: ${config.panelHeight};
        max-height: calc(100vh - 100px);
        background: ${config.panelBg};
        border: 1px solid ${config.border};
        border-radius: 22px;
        overflow: hidden;
        display: none;
        flex-direction: column;
        box-shadow: 0 28px 72px rgba(0,0,0,0.20), 0 10px 26px rgba(0,0,0,0.10);
      }
      .panel.open { display: flex; }
      .smooth-scroll { scroll-behavior: smooth !important; }
      .panel.fullscreen {
        position: fixed;
        inset: 0;
        width: 100vw;
        max-width: 100vw;
        height: 100vh;
        max-height: 100vh;
        border-radius: 0;
        border: none;
        z-index: 2147483648;
      }

      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 14px 14px 12px;
        border-bottom: 1px solid ${config.border};
        background: linear-gradient(to bottom, #ffffff, #fcfcfd);
      }
      .headerInfo { min-width: 0; display: flex; align-items: center; gap: 10px; }
      .avatar {
        width: 34px;
        height: 34px;
        border-radius: 9999px;
        color: ${config.accentText};
        background: ${config.logoUrl ? 'none' :config.accent};
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        font-weight: 700;
        flex-shrink: 0;
        overflow: hidden;
      }
      .avatarFallback {
        width: 100%;
        height: 100%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        font-weight: 700;
      }
      .titleWrap { min-width: 0; }
      .title { margin: 0; font-size: 15px; font-weight: 700; color: #111827; line-height: 1.2; }
      .subtitle {
        margin-top: 3px; font-size: 12px; color: ${config.muted};
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }

      .actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
      .btn {
        border: 1px solid ${config.border};
        background: #fff;
        color: #111827;
        cursor: pointer;
        border-radius: 12px;
        height: 36px;
        padding: 0 11px;
        font-size: 12px;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        white-space: nowrap;
        transition: background 140ms ease, transform 140ms ease;
      }
      .btn:hover { background: #f9fafb; }
      .iconBtn { width: 36px; padding: 0; }
      .iconBtn svg { width: 17px; height: 17px; }

      .messages {
        flex: 1;
        overflow: auto;
        padding: 16px 12px;
        background:
          radial-gradient(circle at top left, rgba(0,0,0,0.02), transparent 25%),
          linear-gradient(to bottom, #fafafa, #f8fafc);
        scroll-behavior: auto;
        scrollbar-width: thin;
        scrollbar-color: #888 #f1f1f1;
      }
      .messagesContent { width: 100%; }
      .messageGroup { display: flex; width: 100%; margin-bottom: 14px; }
      .messageGroup.user { justify-content: flex-end; }
      .messageGroup.assistant { justify-content: flex-start; }
      .messageShell {
        width: fit-content;
        max-width: 88%;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .messageLabel { font-size: 11px; color: ${config.muted}; padding: 0 4px; }
      .messageGroup.user .messageLabel { text-align: right; }

      .bubble {
        border-radius: 18px;
        padding: 12px 14px;
        font-size: 14px;
        line-height: 1.5;
        white-space: normal;
        word-break: break-word;
        box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04);
      }
      .bubble p { margin: 0 0 10px; }
      .bubble p:last-child { margin-bottom: 0; }
      .bubble ul, .bubble ol { margin: 0 0 10px 18px; padding: 0; }
      .bubble li { margin: 0 0 4px; }
      .bubble h1, .bubble h2, .bubble h3 {
        margin: 0 0 10px;
        line-height: 1.25;
      }
      .bubble h1 { font-size: 18px; }
      .bubble h2 { font-size: 16px; }
      .bubble h3 { font-size: 15px; }
      .bubble a { color: inherit; text-decoration: underline; }
      .bubble code {
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        background: rgba(0,0,0,0.06);
        padding: 1px 4px;
        border-radius: 6px;
      }

      .messageGroup.assistant .bubble {
        background: ${config.bubbleBotBg};
        color: ${config.bubbleBotText};
        border: 1px solid #e8ebf0;
        border-top-left-radius: 8px;
      }
      .messageGroup.user .bubble {
        background: ${config.bubbleUserBg};
        color: ${config.bubbleUserText};
        border: 1px solid rgba(255,255,255,0.08);
        border-top-right-radius: 8px;
        white-space: pre-wrap;
      }

      .messageMeta { font-size: 11px; color: ${config.muted}; padding: 0 4px; }
      .messageGroup.user .messageMeta { text-align: right; }

      .quickMessagesWrap { margin-top: 8px; padding: 0 2px 2px 2px; }
      .quickMessagesLabel { font-size: 11px; color: ${config.muted}; margin-bottom: 8px; padding: 0 4px; }
      .quickMessages { display: flex; flex-wrap: wrap; gap: 8px; }
      .quickMessageBtn {
        appearance: none;
        border: 1px solid ${config.border};
        background: #ffffff;
        color: #111827;
        border-radius: 9999px;
        padding: 8px 12px;
        font-size: 12px;
        line-height: 1.2;
        cursor: pointer;
        transition: background 140ms ease, border-color 140ms ease, transform 140ms ease;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
      }
      .quickMessageBtn:hover {
        background: #f9fafb;
        border-color: #d1d5db;
        transform: translateY(-1px);
      }
      .quickMessageBtn:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }

      .typingRow { display: none; width: 100%; margin-bottom: 14px; }
      .typingRow.visible { display: flex; justify-content: flex-start; }
      .typingShell {
        width: fit-content; max-width: 88%;
        display: flex; flex-direction: column; gap: 4px;
      }
      .typingBubble {
        background: #ffffff;
        border: 1px solid #e8ebf0;
        border-radius: 18px;
        border-top-left-radius: 8px;
        padding: 14px 16px;
        box-shadow: 0 4px 14px rgba(15, 23, 42, 0.04);
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-width: 66px;
      }
      .typingDot {
        width: 8px; height: 8px; border-radius: 9999px;
        background: #9ca3af; animation: chatbotTyping 1.2s infinite ease-in-out;
      }
      .typingDot:nth-child(2) { animation-delay: 0.15s; }
      .typingDot:nth-child(3) { animation-delay: 0.3s; }

      @keyframes chatbotTyping {
        0%, 80%, 100% { transform: translateY(0); opacity: 0.45; }
        40% { transform: translateY(-4px); opacity: 1; }
      }

      .composer {
        border-top: 1px solid ${config.border};
        padding: 12px;
        background: #fff;
      }
      .composerInner {
        display: flex; align-items: flex-end; gap: 10px;
        border: 1px solid ${config.border};
        border-radius: 18px;
        padding: 10px;
        background: #fff;
        box-shadow: inset 0 1px 1px rgba(15, 23, 42, 0.02);
      }
      textarea {
        flex: 1; border: none; outline: none; resize: none;
        min-height: 42px; max-height: 120px; background: transparent;
        color: #111827; font-size: 14px; line-height: 1.45;
      }
      .sendBtn {
        border: none;
        background: ${config.accent};
        color: ${config.accentText};
        border-radius: 14px;
        padding: 10px 14px;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        flex-shrink: 0;
      }
      .sendBtn:disabled { opacity: 0.6; cursor: not-allowed; }

      .footer {
        border-top: 1px solid ${config.border};
        background: #fff;
        padding: 10px 12px;
      }
      .footer.hidden { display: none; }
      .footerLinks { display: flex; flex-wrap: wrap; gap: 8px 12px; }
      .footerLink { color: ${config.muted}; font-size: 12px; text-decoration: none; }
      .footerLink:hover { text-decoration: underline; }

      .panel.fullscreen .header {
        padding: max(14px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) 12px max(16px, env(safe-area-inset-left));
      }
      .panel.fullscreen .messages {
        padding: 20px max(20px, env(safe-area-inset-right)) 20px max(20px, env(safe-area-inset-left));
      }
      .panel.fullscreen .composer {
        padding: 12px max(16px, env(safe-area-inset-right)) 12px max(16px, env(safe-area-inset-left));
      }
      .panel.fullscreen .footer {
        padding: 10px max(16px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
      }
      .panel.fullscreen .messageShell,
      .panel.fullscreen .typingShell { max-width: min(760px, 100%); }
      .panel.fullscreen .messageGroup.assistant .messageShell { margin-right: auto; }
      .panel.fullscreen .messageGroup.user .messageShell { margin-left: auto; }

      @media (max-width: 768px) {
        .panel, .panel.fullscreen {
          position: fixed;
          inset: 0;
          width: 100vw;
          max-width: 100vw;
          height: 100dvh;
          max-height: 100dvh;
          border-radius: 0;
          border: none;
          z-index: 2147483648;
        }
        .panel .header, .panel.fullscreen .header {
          padding: max(14px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) 12px max(14px, env(safe-area-inset-left));
        }
        .panel .messages, .panel.fullscreen .messages {
          padding: 14px max(14px, env(safe-area-inset-right)) 14px max(14px, env(safe-area-inset-left));
        }
        .panel .composer, .panel.fullscreen .composer {
          padding: 10px max(12px, env(safe-area-inset-right)) 10px max(12px, env(safe-area-inset-left));
        }
        .panel .footer, .panel.fullscreen .footer {
          padding: 10px max(12px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
        }
        .messageShell, .typingShell { max-width: 92%; }
      }
    `;
    shadow.appendChild(style);

    const wrap = document.createElement("div");
    wrap.className = "wrap";
    wrap.innerHTML = `
      <section class="panel" aria-label="Chat panel">
        <div class="header">
          <div class="headerInfo">
            <div class="avatar">
              ${renderAvatarMarkup()}
            </div>
            <div class="titleWrap">
              <div class="title">${escapeHtml(config.title)}</div>
              <div class="subtitle">${escapeHtml(config.subtitle)}</div>
            </div>
          </div>

          <div class="actions">
            <button class="btn iconBtn refreshBtn" type="button" aria-label="Clear chat" title="Clear chat">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M20 11a8 8 0 1 1-2.34-5.66M20 4v6h-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>

            <button class="btn iconBtn downloadBtn" type="button" aria-label="Download transcript" title="Download transcript">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3v11M8 10l4 4 4-4M5 20h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>

            <button class="btn iconBtn fullscreenBtn" type="button" aria-label="Toggle full screen" title="Toggle full screen">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>

            <button class="btn iconBtn closePanelBtn" type="button" aria-label="Close chatbot" title="Close chatbot">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="messages">
          <div class="messagesContent"></div>

          <div class="typingRow" aria-live="polite" aria-label="Assistant is typing">
            <div class="typingShell">
              <div class="messageLabel">${escapeHtml(config.title)}</div>
              <div class="typingBubble">
                <span class="typingDot"></span>
                <span class="typingDot"></span>
                <span class="typingDot"></span>
              </div>
            </div>
          </div>
        </div>

        <div class="composer">
          <div class="composerInner">
            <textarea rows="1" placeholder="Type your message..."></textarea>
            <button class="sendBtn" type="button" disabled>Send</button>
          </div>
        </div>

        <footer class="footer hidden">
          <div class="footerLinks"></div>
        </footer>
      </section>

      <button class="launcher" aria-label="Toggle chatbot" title="Toggle chatbot">
        ${renderLauncherMarkup()}

        <svg class="icon-close" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
        </svg>
      </button>
    `;
    shadow.appendChild(wrap);

    const launcher = shadow.querySelector(".launcher");
    const panel = shadow.querySelector(".panel");
    const closePanelBtn = shadow.querySelector(".closePanelBtn");
    const fullscreenBtn = shadow.querySelector(".fullscreenBtn");
    const downloadBtn = shadow.querySelector(".downloadBtn");
    const refreshBtn = shadow.querySelector(".refreshBtn");
    const messagesEl = shadow.querySelector(".messages");
    const messagesContentEl = shadow.querySelector(".messagesContent");
    const typingRowEl = shadow.querySelector(".typingRow");
    const footerEl = shadow.querySelector(".footer");
    const footerLinksEl = shadow.querySelector(".footerLinks");
    const textarea = shadow.querySelector("textarea");
    const sendBtn = shadow.querySelector(".sendBtn");

    function autoResize() {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
    }

    function scrollMessagesToBottom(forceImmediate) {
      const action = function () {
        messagesEl.scrollTop = messagesEl.scrollHeight;
      };

      if (forceImmediate) {
        action();
        return;
      }

      requestAnimationFrame(function () {
        action();
      });
    }

    function renderQuickMessagesInline(message, index) {
      if (!shouldRenderQuickMessagesForMessage(message, index)) {
        return "";
      }

      return `
        <div class="quickMessagesWrap">
          <div class="quickMessagesLabel">Quick prompts</div>
          <div class="quickMessages">
            ${config.quickMessages
              .map(function (quickMessage) {
                return `
                  <button
                    class="quickMessageBtn"
                    type="button"
                    data-quick-message="${escapeHtml(quickMessage)}"
                    ${state.isLoading ? "disabled" : ""}
                  >
                    ${escapeHtml(quickMessage)}
                  </button>
                `;
              })
              .join("")}
          </div>
        </div>
      `;
    }

    function renderFooterLinks() {
      if (!config.footerLinks.length) {
        footerEl.classList.add("hidden");
        footerLinksEl.innerHTML = "";
        return;
      }

      footerEl.classList.remove("hidden");

      footerLinksEl.innerHTML = config.footerLinks
        .map(function (link) {
          const safeHref = escapeHtml(link.href);
          const safeLabel = escapeHtml(link.label);
          const target = link.target === "_self" ? "_self" : "_blank";
          const rel = target === "_blank" ? ' rel="noopener noreferrer"' : "";

          return `
            <a
              class="footerLink"
              href="${safeHref}"
              target="${target}"
              ${rel}
            >
              ${safeLabel}
            </a>
          `;
        })
        .join("");
    }

    function attachQuickMessageEvents() {
      const buttons = messagesContentEl.querySelectorAll(".quickMessageBtn");

      buttons.forEach(function (button) {
        button.addEventListener("click", function () {
          if (state.isLoading) return;

          const text = button.getAttribute("data-quick-message") || "";
          if (!text.trim()) return;

          textarea.value = text;
          sendBtn.disabled = !text.trim();
          autoResize();
          sendMessage();
        });
      });
    }

    function renderMessages() {
      messagesContentEl.innerHTML = state.messages
        .map(function (m, index) {
          const label = m.role === "assistant" ? config.title : "You";
          const bubbleContent =
            m.role === "assistant" && m.html
              ? sanitizeHtml(m.html)
              : escapeHtml(m.text);

          return `
            <div class="messageGroup ${m.role}">
              <div class="messageShell">
                <div class="messageLabel">${label}</div>
                <div class="bubble">${bubbleContent}</div>
                ${renderQuickMessagesInline(m, index)}
                <div class="messageMeta">${formatTime(m.createdAt)}</div>
              </div>
            </div>
          `;
        })
        .join("");

      renderFooterLinks();
      attachQuickMessageEvents();
      scrollMessagesToBottom(true);
    }

    function updateFullscreenUi() {
      panel.classList.toggle("fullscreen", state.isFullscreen);
      fullscreenBtn.setAttribute(
        "title",
        state.isFullscreen ? "Exit full screen" : "Open full screen",
      );
      fullscreenBtn.setAttribute(
        "aria-label",
        state.isFullscreen ? "Exit full screen" : "Open full screen",
      );

      fullscreenBtn.innerHTML = state.isFullscreen
        ? `
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 3H3v6M15 3h6v6M21 15v6h-6M3 15v6h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        `
        : `
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M8 3H3v5M16 3h5v5M21 16v5h-5M3 16v5h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        `;

      syncBodyScrollLock();
    }

    function setOpen(open) {
      state.isOpen = open;
      panel.classList.toggle("open", open);
      launcher.classList.toggle("open", open);
      launcher.setAttribute(
        "aria-label",
        open ? "Close chatbot" : "Open chatbot",
      );
      launcher.setAttribute("title", open ? "Close chatbot" : "Open chatbot");
      persistState();
      syncBodyScrollLock();

      if (open) {
        setTimeout(function () {
          //textarea.focus();
          scrollMessagesToBottom(true);
        }, 0);
      }
    }

    function setLoading(loading) {
      state.isLoading = loading;
      typingRowEl.classList.toggle("visible", loading);
      sendBtn.disabled = loading || !textarea.value.trim();
      renderMessages();
      scrollMessagesToBottom();
    }

    function pushMessage(role, text, options = {}) {
      state.messages.push({
        id: createId("msg"),
        role: role,
        text: text,
        html: options.html || null,
        createdAt: new Date().toISOString(),
      });
      persistState();
      renderMessages();
    }

    function resetChat() {
      state.threadId = createId("thread");
      state.messages = [
        {
          id: createId("msg"),
          role: "assistant",
          text: config.initialMessage,
          html: renderSafeAssistantHtml(config.initialMessage),
          createdAt: new Date().toISOString(),
        },
      ];
      setLoading(false);
      persistState();
      renderMessages();
      scrollMessagesToBottom(true);
    }

    async function sendMessage() {
      const text = textarea.value.trim();
      if (!text || state.isLoading) return;

      pushMessage("user", text);
      textarea.value = "";
      autoResize();
      messagesEl.classList.add("smooth-scroll");
      setLoading(true);

      try {
        const response = await fetch(`${config.apiUrl}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": config.apiKey,
          },
          body: JSON.stringify({
            apiKey: config.apiKey,
            threadId: state.threadId,
            message: text,
            source: "website-embed",
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data && data.error ? data.error : "Request failed");
        }

        if (data.threadId && data.threadId !== state.threadId) {
          state.threadId = data.threadId;
        }

        const replyText = data.reply || "Sorry, I couldn’t generate a reply.";

        pushMessage("assistant", replyText, {
          html: renderSafeAssistantHtml(replyText),
        });
      } catch (error) {
        const fallbackText =
          "Sorry, Looks like I'm having an issue. Please try again later.";

        pushMessage("assistant", fallbackText, {
          html: renderSafeAssistantHtml(fallbackText),
        });
      } finally {
        messagesEl.classList.remove("smooth-scroll");
        setLoading(false);
        sendBtn.setAttribute("disabled", true);
      }
    }

    function downloadTranscript() {
      const text = state.messages
        .map(function (m) {
          const author = m.role === "assistant" ? config.title : "You";
          return (
            "[" +
            new Date(m.createdAt).toISOString() +
            "] " +
            author +
            ": " +
            m.text
          );
        })
        .join("\n\n");

      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "chat-transcript-" + state.threadId + ".txt";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }

    launcher.addEventListener("click", function () {
      setOpen(!state.isOpen);
    });

    closePanelBtn.addEventListener("click", function () {
      setOpen(false);
    });

    fullscreenBtn.addEventListener("click", function () {
      state.isFullscreen = !state.isFullscreen;
      updateFullscreenUi();
      persistState();
      scrollMessagesToBottom();
    });

    refreshBtn.addEventListener("click", function () {
      resetChat();
    });

    downloadBtn.addEventListener("click", downloadTranscript);
    sendBtn.addEventListener("click", sendMessage);

    textarea.addEventListener("input", function () {
      sendBtn.disabled = state.isLoading || !textarea.value.trim();
      autoResize();
    });

    textarea.addEventListener("keydown", function (event) {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && state.isOpen && state.isFullscreen) {
        state.isFullscreen = false;
        updateFullscreenUi();
        persistState();
        scrollMessagesToBottom();
        return;
      }

      if (event.key === "Escape" && state.isOpen) {
        setOpen(false);
      }
    });

    window.addEventListener("beforeunload", function () {
      if (originalBodyOverflowY !== null && document.body) {
        document.body.style.overflowY = originalBodyOverflowY;
        originalBodyOverflowY = null;
      }
    });

    state.messages = state.messages.map((message) => {
      if (message.role === "assistant" && !message.html) {
        return {
          ...message,
          html: renderSafeAssistantHtml(message.text),
        };
      }
      return message;
    });
    persistState();

    renderMessages();
    updateFullscreenUi();
    setOpen(Boolean(state.isOpen));
    autoResize();
    syncBodyScrollLock();

    window.EmbeddedChatbot = {
      open: function () {
        setOpen(true);
      },
      close: function () {
        setOpen(false);
      },
      toggle: function () {
        setOpen(!state.isOpen);
      },
      reset: function () {
        resetChat();
      },
      getState: function () {
        return JSON.parse(JSON.stringify(state));
      },
    };
  }

  async function checkApiHealth() {
    try {
      const res = await fetch(`${config.apiUrl}/health`, {
        method: "GET",
      });

      return res.ok;
    } catch (err) {
      return false;
    }
  }

  async function init() {
    if (!config.apiKey) {
      console.warn("Chatbot API key missing. Skipping mount.");
      return;
    }

    if (!config.apiUrl) {
      console.warn("Chatbot API URL missing. Skipping mount.");
      return;
    }

    const healthy = await checkApiHealth();

    if (!healthy) {
      console.warn("Chatbot API is unavailable. Skipping mount.");
      return;
    }

    mount();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
