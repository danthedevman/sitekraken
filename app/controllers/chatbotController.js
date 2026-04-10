import { ObjectId } from 'mongodb';

import { getCollections, getDB } from '../config/db.js';
import {
  defaultChatbotConfig,
  ensureWorkspaceChatbotDefaults,
  normalizeAllowedDomainsInput
} from '../models/defaults.js';
import { findOwnedWorkspace, trackRecentWorkspaceVisit } from '../services/workspaceService.js';
import { serializeDoc } from '../services/dbHelpers.js';
import { uploadBufferToR2 } from '../services/r2Service.js';

async function getWorkspace(req) {
  const workspace = await findOwnedWorkspace(req.user._id, req.params.workspaceId);
  trackRecentWorkspaceVisit(req, workspace);
  return workspace;
}

function parseLines(value) {
  return String(value || '')
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseFooterLinks(value) {
  return parseLines(value)
    .map((line) => {
      const [label, href, target] = line.split('|');

      const cleanLabel = String(label || '').trim();
      const cleanHref = String(href || '').trim();
      const cleanTarget =
        String(target || '').trim() === '_self' ? '_self' : '_blank';

      if (!cleanLabel || !cleanHref) return null;

      return {
        label: cleanLabel,
        href: cleanHref,
        target: cleanTarget
      };
    })
    .filter(Boolean);
}

function parseBoolean(value) {
  return value === 'on' || value === 'true' || value === true;
}

function parseNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function stringValue(value, fallback = '') {
  const v = String(value ?? '').trim();
  return v || fallback;
}

function buildEmbedScriptTag(workspace) {
  const appUrl = String(process.env.APP_URL || '').replace(/\/+$/, '');
  const src = appUrl
    ? `${appUrl}/public/lib/embed.js`
    : '/public/lib/embed.js';

  return `<script src="${src}" data-api-key="${workspace.apiKey}"></script>`;
}

function toMultilineFooterLinks(footerLinks) {
  if (!Array.isArray(footerLinks)) return '';

  return footerLinks
    .map((item) => {
      const label = item?.label || '';
      const href = item?.href || '';
      const target = item?.target || '_blank';
      return `${label}|${href}|${target}`;
    })
    .join('\n');
}

function sanitizeHexColor(value, fallback) {
  const str = String(value || '').trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(str)) return str;
  return fallback;
}

function sanitizeDimension(value, fallback) {
  const str = String(value || '').trim();

  if (
    /^(\d+(\.\d+)?)(px|rem|em|vw|vh|dvw|dvh|%)$/i.test(str) ||
    /^min\(.+\)$/i.test(str) ||
    /^max\(.+\)$/i.test(str) ||
    /^calc\(.+\)$/i.test(str)
  ) {
    return str;
  }

  return fallback;
}


function sanitizeThreadId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatDateTime(value) {
  if (!value) return '';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleString();
}

export async function index(req, res) {
  const { workspaces } = getCollections();
  const workspace = await getWorkspace(req);

  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  const hydratedWorkspace = ensureWorkspaceChatbotDefaults(workspace);

  if (
    hydratedWorkspace.apiKey !== workspace.apiKey ||
    !workspace.chatbot ||
    !workspace.analytics ||
    !Array.isArray(workspace.allowedDomains)
  ) {
    await workspaces.updateOne(
      { _id: new ObjectId(workspace._id) },
      {
        $set: {
          apiKey: hydratedWorkspace.apiKey,
          allowedDomains: hydratedWorkspace.allowedDomains,
          chatbot: hydratedWorkspace.chatbot,
          analytics: hydratedWorkspace.analytics,
          updatedAt: new Date()
        }
      }
    );
  }

  const serializedWorkspace = serializeDoc(hydratedWorkspace);

  const chatbot = serializedWorkspace.chatbot;
  const config = chatbot?.config || {};

  res.render('chatbot/index', {
    workspace: serializedWorkspace,
    active:"chatbot",
    chatbot,
    config,
    embedScriptTag: buildEmbedScriptTag(serializedWorkspace),
    quickMessagesText: Array.isArray(config.quickMessages)
      ? config.quickMessages.join('\n')
      : '',
    footerLinksText: toMultilineFooterLinks(config.footerLinks),
    allowedDomainsText: Array.isArray(serializedWorkspace?.allowedDomains)
      ? serializedWorkspace.allowedDomains.join('\n')
      : ''
  });
}


export async function interactions(req, res) {
  const workspace = await getWorkspace(req);

  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  const db = getDB();
  const threads = db.collection('chat_threads');
  const messages = db.collection('chat_messages');
  const workspaceId = String(workspace._id);
  const pageSize = parsePositiveInt(req.query.pageSize, 20);
  const page = parsePositiveInt(req.query.page, 1);
  const search = String(req.query.search || '').trim();

  const query = { workspaceId };

  if (search) {
    const escapedSearch = escapeRegExp(search);
    const searchRegex = new RegExp(escapedSearch, 'i');

    query.$or = [
      { threadId: { $regex: searchRegex } },
      { source: { $regex: searchRegex } },
      { pageTitle: { $regex: searchRegex } },
      { pageUrl: { $regex: searchRegex } },
      { siteName: { $regex: searchRegex } }
    ];
  }

  const totalRows = await threads.countDocuments(query);
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(page, totalPages);
  const skip = (currentPage - 1) * pageSize;

  const latestThreads = await threads
    .find(query)
    .sort({ updatedAt: -1, createdAt: -1 })
    .skip(skip)
    .limit(pageSize)
    .toArray();

  const threadIds = latestThreads
    .map((thread) => String(thread.threadId || ''))
    .filter(Boolean);
  const counts = new Map();

  if (threadIds.length) {
    const grouped = await messages
      .aggregate([
        { $match: { workspaceId, threadId: { $in: threadIds } } },
        { $group: { _id: '$threadId', count: { $sum: 1 } } }
      ])
      .toArray();

    grouped.forEach((item) => {
      counts.set(String(item._id), Number(item.count || 0));
    });
  }

  const interactionRows = latestThreads.map((thread) => {
    const threadId = String(thread.threadId || '');
    const updatedAt = thread.updatedAt || thread.createdAt;

    return {
      threadId,
      source: String(thread.source || 'website'),
      siteName: String(thread.siteName || ''),
      pageTitle: String(thread.pageTitle || ''),
      pageUrl: String(thread.pageUrl || ''),
      messageCount: counts.get(threadId) || 0,
      updatedAtLabel: formatDateTime(updatedAt),
      updatedAtIso: updatedAt ? new Date(updatedAt).toISOString() : '',
      interactionHref: `/workspaces/${workspaceId}/chatbot/interactions/${encodeURIComponent(threadId)}`
    };
  });

  res.render('chatbot/interactions', {
    workspace: serializeDoc(workspace),
    active: 'chatbot',
    interactions: interactionRows,
    tableState: {
      search,
      page: currentPage,
      pageSize,
      totalRows,
      totalPages
    }
  });
}

export async function showInteraction(req, res) {
  const workspace = await getWorkspace(req);

  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  const threadId = sanitizeThreadId(req.params.threadId);

  if (!threadId) {
    req.flash('error', 'Invalid interaction id');
    return res.redirect(`/workspaces/${workspace._id}/chatbot/interactions`);
  }

  const db = getDB();
  const threads = db.collection('chat_threads');
  const messages = db.collection('chat_messages');
  const workspaceId = String(workspace._id);

  const interaction = await threads.findOne({ workspaceId, threadId });

  if (!interaction) {
    req.flash('error', 'Interaction not found');
    return res.redirect(`/workspaces/${workspace._id}/chatbot/interactions`);
  }

  const chatMessages = await messages
    .find({ workspaceId, threadId })
    .sort({ createdAt: 1, _id: 1 })
    .toArray();

  res.render('chatbot/interaction-show', {
    workspace: serializeDoc(workspace),
    active: 'chatbot',
    interaction: {
      threadId,
      source: String(interaction.source || 'website'),
      siteName: String(interaction.siteName || ''),
      pageTitle: String(interaction.pageTitle || ''),
      pageUrl: String(interaction.pageUrl || ''),
      createdAtLabel: formatDateTime(interaction.createdAt),
      updatedAtLabel: formatDateTime(interaction.updatedAt || interaction.createdAt)
    },
    chatMessages: chatMessages.map((message) => ({
      role: String(message.role || ''),
      text: String(message.text || ''),
      createdAtLabel: formatDateTime(message.createdAt)
    }))
  });
}

export async function update(req, res) {
  const { workspaces } = getCollections();
  const workspace = await getWorkspace(req);

  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  const defaults = defaultChatbotConfig(workspace._id, {
    allowedDomains: workspace?.allowedDomains
  });

  const currentConfig = ensureWorkspaceChatbotDefaults(workspace)?.chatbot?.config || {};
  const quickMessages = parseLines(req.body.quickMessages);
  const footerLinks = parseFooterLinks(req.body.footerLinks);
  const allowedDomains = normalizeAllowedDomainsInput(req.body.allowedDomains);

  let logoUrl = stringValue(req.body.existingLogoUrl, currentConfig.logoUrl || '');

  try {
    if (parseBoolean(req.body.removeLogo)) {
      logoUrl = '';
    }

    if (req.file?.buffer?.length) {
      const uploaded = await uploadBufferToR2({
        fileBuffer: req.file.buffer,
        mimeType: req.file.mimetype,
        keyPrefix: `workspaces/${workspace._id}/chatbot-logos`,
        originalName: req.file.originalname
      });

      logoUrl = uploaded.url;
    }
  } catch (error) {
    req.flash('error', `Logo upload failed: ${error.message}`);
    return res.redirect(`/workspaces/${workspace._id}/chatbot`);
  }

  await workspaces.updateOne(
    { _id: new ObjectId(workspace._id) },
    {
      $set: {
        allowedDomains,
        chatbot: {
          name: stringValue(req.body.name, defaults.name),
          enabled: parseBoolean(req.body.enabled),
          scriptUrl: stringValue(req.body.scriptUrl, defaults.scriptUrl),
          module: parseBoolean(req.body.module),
          config: {
            title: stringValue(req.body.title, defaults.config.title),
            subtitle: stringValue(req.body.subtitle, defaults.config.subtitle),
            initialMessage: stringValue(
              req.body.initialMessage,
              defaults.config.initialMessage
            ),
            additionalInstructions: stringValue(
              req.body.additionalInstructions,
              currentConfig.additionalInstructions || ''
            ),
            quickMessages,
            footerLinks,

            logoUrl,

            accent: sanitizeHexColor(
              req.body.accent,
              currentConfig.accent || '#111827'
            ),
            accentText: sanitizeHexColor(
              req.body.accentText,
              currentConfig.accentText || '#ffffff'
            ),
            border: sanitizeHexColor(
              req.body.border,
              currentConfig.border || '#e5e7eb'
            ),
            panelBg: sanitizeHexColor(
              req.body.panelBg,
              currentConfig.panelBg || '#ffffff'
            ),
            muted: sanitizeHexColor(
              req.body.muted,
              currentConfig.muted || '#6b7280'
            ),
            bubbleUserBg: sanitizeHexColor(
              req.body.bubbleUserBg,
              currentConfig.bubbleUserBg || '#111827'
            ),
            bubbleUserText: sanitizeHexColor(
              req.body.bubbleUserText,
              currentConfig.bubbleUserText || '#ffffff'
            ),
            bubbleBotBg: sanitizeHexColor(
              req.body.bubbleBotBg,
              currentConfig.bubbleBotBg || '#ffffff'
            ),
            bubbleBotText: sanitizeHexColor(
              req.body.bubbleBotText,
              currentConfig.bubbleBotText || '#111827'
            ),

            launcherSize: parseNumber(
              req.body.launcherSize,
              currentConfig.launcherSize || 70
            ),
            bottom: parseNumber(req.body.bottom, currentConfig.bottom || 20),
            right: parseNumber(req.body.right, currentConfig.right || 20),
            maxWidth: parseNumber(
              req.body.maxWidth,
              currentConfig.maxWidth || 420
            ),
            panelWidth: sanitizeDimension(
              req.body.panelWidth,
              currentConfig.panelWidth || 'min(420px, calc(100vw - 20px))'
            ),
            panelHeight: sanitizeDimension(
              req.body.panelHeight,
              currentConfig.panelHeight || 'min(600px, calc(100vh - 110px))'
            )
          }
        },
        updatedAt: new Date()
      }
    }
  );

  req.flash('success', 'Chatbot config updated');
  res.redirect(`/workspaces/${workspace._id}/chatbot`);
}

export async function regenerateApiKey(req, res) {
  const { workspaces } = getCollections();
  const workspace = await getWorkspace(req);

  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  const defaults = defaultChatbotConfig(workspace._id, {
    allowedDomains: workspace?.allowedDomains
  });

  await workspaces.updateOne(
    { _id: new ObjectId(workspace._id) },
    {
      $set: {
        apiKey: defaults.apiKey,
        updatedAt: new Date()
      }
    }
  );

  req.flash('success', 'Embed API key regenerated');
  res.redirect(`/workspaces/${workspace._id}/chatbot`);
}
