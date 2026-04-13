import { ObjectId } from 'mongodb';

import { getCollections } from '../config/db.js';
import { ensureWorkspaceChatbotDefaults } from '../models/defaults.js';
import { serializeDoc } from '../services/dbHelpers.js';

function parseBoolean(value) {
  return value === 'on' || value === 'true' || value === true;
}

function parseNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseDateTime(value) {
  const str = String(value || '').trim();
  if (!str) return '';
  const date = new Date(str);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function sanitizeHexColor(value, fallback) {
  const str = String(value || '').trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(str)) return str;
  return fallback;
}

async function hydrateWorkspace(req) {
  const { workspaces } = getCollections();
  const workspace = req.workspace;
  if (!workspace) return null;

  const hydratedWorkspace = ensureWorkspaceChatbotDefaults(workspace);

  if (!workspace.banners || !workspace.logs || !workspace.analytics || !workspace.chatbot || !workspace.apiKey) {
    await workspaces.updateOne(
      { _id: new ObjectId(workspace._id) },
      {
        $set: {
          apiKey: hydratedWorkspace.apiKey,
          chatbot: hydratedWorkspace.chatbot,
          analytics: hydratedWorkspace.analytics,
          logs: hydratedWorkspace.logs,
          banners: hydratedWorkspace.banners,
          allowedDomains: hydratedWorkspace.allowedDomains,
          updatedAt: new Date(),
        },
      }
    );
  }

  return serializeDoc(hydratedWorkspace);
}

export async function index(req, res) {
  const workspace = await hydrateWorkspace(req);
  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  res.render('announcements/index', {
    workspace,
    active: 'announcements',
    banners: workspace.banners || {},
    config: workspace.banners?.config || {}
  });
}

export async function update(req, res) {
  const { workspaces } = getCollections();
  const workspace = await hydrateWorkspace(req);
  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  const existing = workspace.banners || {};
  const existingConfig = existing.config || {};

  const mode = String(req.body.mode || existingConfig.type || 'top');
  const status = String(req.body.status || existingConfig.status || 'draft');

  const config = {
    ...existingConfig,
    type: ['top', 'bottom', 'modal'].includes(mode) ? mode : 'top',
    position: ['top', 'bottom'].includes(String(req.body.position || existingConfig.position || 'top'))
      ? String(req.body.position || existingConfig.position || 'top')
      : 'top',
    status: ['draft', 'scheduled', 'published'].includes(status) ? status : 'draft',
    title: String(req.body.title || '').trim(),
    message: String(req.body.message || '').trim(),
    confirmLabel: String(req.body.confirmLabel || '').trim() || 'Okay',
    dismissible: parseBoolean(req.body.dismissible),
    showOncePerSession: parseBoolean(req.body.showOncePerSession),
    fullWidth: parseBoolean(req.body.fullWidth),
    shadow: parseBoolean(req.body.shadow),
    autoHideMs: Math.max(0, parseNumber(req.body.autoHideMs, 0)),
    borderRadius: Math.max(0, parseNumber(req.body.borderRadius, 8)),
    zIndex: Math.max(10, parseNumber(req.body.zIndex, 2147483000)),
    backgroundColor: sanitizeHexColor(req.body.backgroundColor, '#1f2937'),
    textColor: sanitizeHexColor(req.body.textColor, '#ffffff'),
    buttonColor: sanitizeHexColor(req.body.buttonColor, '#ffffff'),
    buttonTextColor: sanitizeHexColor(req.body.buttonTextColor, '#111827'),
    scheduleStartAt: parseDateTime(req.body.scheduleStartAt),
    scheduleEndAt: parseDateTime(req.body.scheduleEndAt),
  };

  await workspaces.updateOne(
    { _id: new ObjectId(workspace._id) },
    {
      $set: {
        banners: {
          ...existing,
          name: 'banners',
          enabled: parseBoolean(req.body.enabled),
          scriptUrl: existing.scriptUrl || 'https://api.sitekraken.com/public/lib/banners.js',
          module: typeof existing.module === 'boolean' ? existing.module : false,
          config,
        },
        updatedAt: new Date()
      }
    }
  );

  req.flash('success', 'Banner configuration saved.');
  return res.redirect(`/workspaces/${workspace._id}/announcements`);
}
