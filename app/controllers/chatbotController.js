import { ObjectId } from 'mongodb';
import crypto from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

import { getCollections } from '../config/db.js';
import {
  defaultChatbotConfig,
  ensureWorkspaceChatbotDefaults,
  normalizeAllowedDomainsInput
} from '../models/defaults.js';
import { findOwnedWorkspace } from '../services/workspaceService.js';
import { serializeDoc } from '../services/dbHelpers.js';

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
  }
});

async function getWorkspace(req) {
  return findOwnedWorkspace(req.user._id, req.params.workspaceId);
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

async function uploadLogoToR2({ fileBuffer, mimeType, workspaceId, originalName }) {
  if (!fileBuffer?.length) return null;

  const ext =
    String(originalName || '').split('.').pop()?.toLowerCase() || 'bin';

  const key = `workspaces/${workspaceId}/chatbot-logos/${Date.now()}-${crypto
    .randomBytes(8)
    .toString('hex')}.${ext}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType || 'application/octet-stream'
    })
  );

  const publicBase = String(process.env.CLOUDFLARE_R2_PUBLIC_URL || '').replace(
    /\/+$/,
    ''
  );

  if (!publicBase) {
    throw new Error('Missing CLOUDFLARE_R2_PUBLIC_URL');
  }

  return `${publicBase}/${key}`;
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
    !Array.isArray(workspace.allowedDomains)
  ) {
    await workspaces.updateOne(
      { _id: new ObjectId(workspace._id) },
      {
        $set: {
          apiKey: hydratedWorkspace.apiKey,
          allowedDomains: hydratedWorkspace.allowedDomains,
          chatbot: hydratedWorkspace.chatbot,
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
      logoUrl = await uploadLogoToR2({
        fileBuffer: req.file.buffer,
        mimeType: req.file.mimetype,
        workspaceId: String(workspace._id),
        originalName: req.file.originalname
      });
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