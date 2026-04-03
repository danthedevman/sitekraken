import { ObjectId } from 'mongodb';
import { getCollections } from '../config/db.js';
import {
  defaultChatbotConfig,
  ensureWorkspaceChatbotDefaults,
  normalizeAllowedDomainsInput
} from '../models/defaults.js';
import { findOwnedWorkspace } from '../services/workspaceService.js';
import { serializeDoc } from '../services/dbHelpers.js';

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

function buildEmbedScriptTag(workspace) {
  return `<script src="http://localhost:4001/public/loader.js" data-api-key="${workspace.apiKey}"></script>`;
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

  res.render('chatbot/index', {
    workspace: serializedWorkspace,
    chatbot,
    embedScriptTag: buildEmbedScriptTag(serializedWorkspace),
    quickMessagesText: Array.isArray(chatbot?.config?.quickMessages)
      ? chatbot.config.quickMessages.join('\n')
      : '',
    footerLinksText: toMultilineFooterLinks(chatbot?.config?.footerLinks),
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

  const quickMessages = parseLines(req.body.quickMessages);
  const footerLinks = parseFooterLinks(req.body.footerLinks);
  const allowedDomains = normalizeAllowedDomainsInput(req.body.allowedDomains);

  await workspaces.updateOne(
    { _id: new ObjectId(workspace._id) },
    {
      $set: {
        allowedDomains,
        chatbot: {
          name: String(req.body.name || defaults.name).trim(),
          enabled: req.body.enabled === 'on',
          scriptUrl: String(
            req.body.scriptUrl || defaults.scriptUrl
          ).trim(),
          module: req.body.module === 'on',
          config: {
            title: String(req.body.title || defaults.config.title).trim(),
            subtitle: String(
              req.body.subtitle || defaults.config.subtitle
            ).trim(),
            initialMessage: String(
              req.body.initialMessage || defaults.config.initialMessage
            ).trim(),
            additionalInstructions: String(
              req.body.additionalInstructions || ''
            ).trim(),
            quickMessages,
            footerLinks
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