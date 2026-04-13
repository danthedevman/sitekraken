import { ObjectId } from 'mongodb';

import { getCollections, getDB } from '../config/db.js';
import { ensureWorkspaceChatbotDefaults } from '../models/defaults.js';
import { serializeDoc } from '../services/dbHelpers.js';

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeObjectId(value) {
  const id = String(value || '').trim();
  if (!ObjectId.isValid(id)) return null;
  return new ObjectId(id);
}

function normalizeLogIds(value) {
  const ids = Array.isArray(value) ? value : [value];
  return [...new Set(
    ids
      .map((id) => sanitizeObjectId(id))
      .filter(Boolean)
  )];
}

function formatDateTime(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString();
}

async function hydrateWorkspace(req) {
  const { workspaces } = getCollections();
  const workspace = req.workspace;
  if (!workspace) return null;

  const hydratedWorkspace = ensureWorkspaceChatbotDefaults(workspace);

  if (!workspace.logs || !workspace.analytics || !workspace.chatbot || !workspace.feedback || !workspace.apiKey) {
    await workspaces.updateOne(
      { _id: new ObjectId(workspace._id) },
      {
        $set: {
          apiKey: hydratedWorkspace.apiKey,
          chatbot: hydratedWorkspace.chatbot,
          analytics: hydratedWorkspace.analytics,
          logs: hydratedWorkspace.logs,
          banners: hydratedWorkspace.banners,
          feedback: hydratedWorkspace.feedback,
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

  const db = getDB();
  const collection = db.collection('website_logs');
  const workspaceId = new ObjectId(workspace._id);

  const pageSize = parsePositiveInt(req.query.pageSize, 20);
  const page = parsePositiveInt(req.query.page, 1);
  const search = String(req.query.search || '').trim();
  const sort = String(req.query.sort || 'createdAt').trim();
  const direction = String(req.query.direction || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
  const sortDirection = direction === 'asc' ? 1 : -1;

  const sortConfig = {
    level: { level: sortDirection, createdAt: -1 },
    type: { type: sortDirection, createdAt: -1 },
    message: { message: sortDirection, createdAt: -1 },
    createdAt: { createdAt: sortDirection, _id: sortDirection }
  };

  const sortKey = Object.prototype.hasOwnProperty.call(sortConfig, sort) ? sort : 'createdAt';

  const query = { workspaceId };

  if (search) {
    const pattern = new RegExp(escapeRegExp(search), 'i');
    query.$or = [
      { message: { $regex: pattern } },
      { type: { $regex: pattern } },
      { level: { $regex: pattern } },
      { pageUrl: { $regex: pattern } }
    ];
  }

  const totalRows = await collection.countDocuments(query);
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(page, totalPages);
  const skip = (currentPage - 1) * pageSize;

  const logs = await collection
    .find(query)
    .sort(sortConfig[sortKey])
    .skip(skip)
    .limit(pageSize)
    .toArray();

  res.render('logs/index', {
    workspace,
    active: 'logs',
    logs: logs.map((log) => ({
      id: String(log._id),
      level: String(log.level || 'info'),
      type: String(log.type || ''),
      message: String(log.message || ''),
      pageUrl: String(log.pageUrl || ''),
      createdAtLabel: formatDateTime(log.createdAt || log.ts),
      createdAtIso: (log.createdAt || log.ts) ? new Date(log.createdAt || log.ts).toISOString() : ''
    })),
    tableState: {
      search,
      sort: sortKey,
      direction,
      page: currentPage,
      pageSize,
      totalRows,
      totalPages
    }
  });
}

export async function show(req, res) {
  const workspace = await hydrateWorkspace(req);
  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }
  const logId = sanitizeObjectId(req.params.logId);

  if (!logId) {
    req.flash('error', 'Invalid log id.');
    return res.redirect(`/workspaces/${workspace._id}/logs`);
  }

  const db = getDB();
  const workspaceId = new ObjectId(workspace._id);

  const log = await db.collection('website_logs').findOne({ _id: logId, workspaceId });

  if (!log) {
    req.flash('error', 'Log not found.');
    return res.redirect(`/workspaces/${workspace._id}/logs`);
  }

  res.render('logs/show', {
    workspace,
    active: 'logs',
    log: {
      id: String(log._id),
      level: String(log.level || 'info'),
      type: String(log.type || ''),
      message: String(log.message || ''),
      stack: String(log.stack || ''),
      pageUrl: String(log.pageUrl || ''),
      pathname: String(log.pathname || ''),
      title: String(log.title || ''),
      referrer: String(log.referrer || ''),
      source: String(log.source || ''),
      createdAtLabel: formatDateTime(log.createdAt || log.ts),
      metadataJson: JSON.stringify(log.metadata || {}, null, 2)
    }
  });
}

export async function toggleEnabled(req, res) {
  const { workspaces } = getCollections();
  const workspace = await hydrateWorkspace(req);
  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }
  const shouldEnable = String(req.body.enabled) === 'true';

  await workspaces.updateOne(
    { _id: new ObjectId(workspace._id) },
    {
      $set: {
        'logs.enabled': shouldEnable,
        updatedAt: new Date()
      }
    }
  );

  req.flash('success', shouldEnable ? 'Logs activated.' : 'Logs deactivated.');
  return res.redirect(`/workspaces/${workspace._id}/logs`);
}

export async function bulkDestroy(req, res) {
  const workspace = await hydrateWorkspace(req);
  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  const logIds = normalizeLogIds(req.body.ids);
  if (!logIds.length) {
    req.flash('error', 'No logs selected');
    return res.redirect(`/workspaces/${workspace._id}/logs`);
  }

  const db = getDB();
  const result = await db.collection('website_logs').deleteMany({
    _id: { $in: logIds },
    workspaceId: new ObjectId(workspace._id)
  });

  const deletedCount = Number(result.deletedCount || 0);
  req.flash('success', `Deleted ${deletedCount} log${deletedCount === 1 ? '' : 's'}.`);
  return res.redirect(`/workspaces/${workspace._id}/logs`);
}
