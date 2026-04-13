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

function normalizeBannerItem(raw = {}) {
  const status = String(raw.status || 'draft');
  const type = String(raw.type || 'top');
  const position = String(raw.position || 'top');

  return {
    id: String(raw.id || new ObjectId().toString()),
    type: ['top', 'bottom', 'modal'].includes(type) ? type : 'top',
    position: ['top', 'bottom'].includes(position) ? position : 'top',
    status: ['draft', 'scheduled', 'published'].includes(status) ? status : 'draft',
    title: String(raw.title || '').trim(),
    message: String(raw.message || '').trim(),
    confirmLabel: String(raw.confirmLabel || '').trim() || 'Okay',
    dismissible: typeof raw.dismissible === 'boolean' ? raw.dismissible : parseBoolean(raw.dismissible),
    showOncePerSession:
      typeof raw.showOncePerSession === 'boolean'
        ? raw.showOncePerSession
        : parseBoolean(raw.showOncePerSession),
    fullWidth: typeof raw.fullWidth === 'boolean' ? raw.fullWidth : parseBoolean(raw.fullWidth),
    shadow: typeof raw.shadow === 'boolean' ? raw.shadow : parseBoolean(raw.shadow),
    autoHideMs: Math.max(0, parseNumber(raw.autoHideMs, 0)),
    borderRadius: Math.max(0, parseNumber(raw.borderRadius, 8)),
    zIndex: Math.max(10, parseNumber(raw.zIndex, 2147483000)),
    backgroundColor: sanitizeHexColor(raw.backgroundColor, '#1f2937'),
    textColor: sanitizeHexColor(raw.textColor, '#ffffff'),
    buttonColor: sanitizeHexColor(raw.buttonColor, '#ffffff'),
    buttonTextColor: sanitizeHexColor(raw.buttonTextColor, '#111827'),
    scheduleStartAt: parseDateTime(raw.scheduleStartAt),
    scheduleEndAt: parseDateTime(raw.scheduleEndAt),
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function getBannerItems(banners = {}) {
  if (Array.isArray(banners.items) && banners.items.length) {
    return banners.items.map((item) => normalizeBannerItem(item));
  }

  if (banners?.config?.message) {
    return [
      normalizeBannerItem({
        ...banners.config,
        id: banners.config.id || new ObjectId().toString(),
      }),
    ];
  }

  return [];
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

function sortedItems(workspace) {
  const banners = workspace.banners || {};
  return getBannerItems(banners).sort((a, b) => {
    return new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime();
  });
}

export async function index(req, res) {
  const workspace = await hydrateWorkspace(req);
  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  const banners = workspace.banners || {};
  const items = sortedItems(workspace);

  res.render('announcements/index', {
    workspace,
    active: 'announcements',
    banners,
    items,
  });
}

export async function record(req, res) {
  const workspace = await hydrateWorkspace(req);
  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  const items = sortedItems(workspace);
  const bannerId = String(req.params.bannerId || '').trim();
  const isEdit = Boolean(bannerId);
  const banner = isEdit ? items.find((item) => item.id === bannerId) : null;

  if (isEdit && !banner) {
    req.flash('error', 'Banner not found');
    return res.redirect(`/workspaces/${workspace._id}/announcements`);
  }

  return res.render('announcements/record', {
    workspace,
    active: 'announcements',
    banners: workspace.banners || {},
    banner,
    isEdit,
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
  const existingItems = getBannerItems(existing);
  const intent = String(req.body.intent || 'create');

  let items = existingItems;
  let flashMessage = 'Banner configuration saved.';

  if (intent === 'delete') {
    const bannerId = String(req.body.bannerId || '');
    items = existingItems.filter((item) => item.id !== bannerId);
    flashMessage = 'Banner deleted.';
  } else if (intent === 'set-status') {
    const bannerId = String(req.body.bannerId || '');
    const nextStatus = String(req.body.nextStatus || 'draft');
    items = existingItems.map((item) => {
      if (item.id !== bannerId) return item;
      return normalizeBannerItem({ ...item, status: nextStatus, updatedAt: new Date().toISOString() });
    });
    flashMessage = 'Banner status updated.';
  } else {
    const incoming = normalizeBannerItem({
      ...req.body,
      id: req.body.bannerId || new ObjectId().toString(),
      createdAt:
        req.body.bannerId && existingItems.find((item) => item.id === req.body.bannerId)?.createdAt
          ? existingItems.find((item) => item.id === req.body.bannerId).createdAt
          : new Date().toISOString(),
    });

    if (String(req.body.bannerId || '').trim()) {
      items = existingItems.map((item) => (item.id === incoming.id ? incoming : item));
      flashMessage = 'Banner updated.';
    } else {
      items = [incoming, ...existingItems];
      flashMessage = 'Banner created.';
    }
  }

  const primaryConfig = items[0] || {};

  await workspaces.updateOne(
    { _id: new ObjectId(workspace._id) },
    {
      $set: {
        banners: {
          ...existing,
          name: 'banners',
          enabled:
            intent === 'settings'
              ? parseBoolean(req.body.enabled)
              : typeof req.body.enabled === 'undefined'
                ? Boolean(existing.enabled)
                : parseBoolean(req.body.enabled),
          scriptUrl: existing.scriptUrl || 'https://api.sitekraken.com/public/lib/banners.js',
          module: typeof existing.module === 'boolean' ? existing.module : false,
          items,
          config: {
            ...primaryConfig,
            allowedDomains: existing?.config?.allowedDomains || [],
          },
        },
        updatedAt: new Date()
      }
    }
  );

  req.flash('success', flashMessage);
  return res.redirect(`/workspaces/${workspace._id}/announcements`);
}
