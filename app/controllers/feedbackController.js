import { ObjectId } from 'mongodb';

import { getCollections, getDB } from '../config/db.js';
import { ensureWorkspaceChatbotDefaults } from '../models/defaults.js';
import { serializeDoc } from '../services/dbHelpers.js';

const ALLOWED_FIELD_TYPES = new Set(['text', 'multiline', 'select', 'email']);

function parseBoolean(value) {
  return value === 'on' || value === 'true' || value === true;
}

function cleanString(value, max = 300) {
  return String(value || '').trim().slice(0, max);
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function normalizeFeedbackFields(raw) {
  let fields = [];

  try {
    const parsed = JSON.parse(String(raw || '[]'));
    fields = Array.isArray(parsed) ? parsed : [];
  } catch {
    fields = [];
  }

  return fields
    .map((field, index) => {
      const type = cleanString(field?.type, 30).toLowerCase();
      const label = cleanString(field?.label, 120);
      const keyInput = cleanString(field?.key, 80).toLowerCase();
      const key = keyInput.replace(/[^a-z0-9_]/g, '_').slice(0, 50) || `field_${index + 1}`;
      const placeholder = cleanString(field?.placeholder, 180);
      const required = Boolean(field?.required);
      const options = Array.isArray(field?.options)
        ? field.options.map((item) => cleanString(item, 80)).filter(Boolean).slice(0, 40)
        : [];

      if (!ALLOWED_FIELD_TYPES.has(type) || !label) return null;

      return {
        key,
        type,
        label,
        placeholder,
        required,
        options: type === 'select' ? options : []
      };
    })
    .filter(Boolean)
    .slice(0, 30);
}

async function hydrateWorkspace(req) {
  const { workspaces } = getCollections();
  const workspace = req.workspace;
  if (!workspace) return null;

  const hydratedWorkspace = ensureWorkspaceChatbotDefaults(workspace);

  if (!workspace.feedback || !workspace.logs || !workspace.analytics || !workspace.chatbot || !workspace.apiKey) {
    await workspaces.updateOne(
      { _id: new ObjectId(workspace._id) },
      {
        $set: {
          apiKey: hydratedWorkspace.apiKey,
          chatbot: hydratedWorkspace.chatbot,
          analytics: hydratedWorkspace.analytics,
          logs: hydratedWorkspace.logs,
          feedback: hydratedWorkspace.feedback,
          allowedDomains: hydratedWorkspace.allowedDomains,
          updatedAt: new Date()
        }
      }
    );
  }

  return serializeDoc(hydratedWorkspace);
}

function buildTabs(workspaceId, activeTab = 'config') {
  return [
    { key: 'config', label: 'Configuration', href: `/workspaces/${workspaceId}/feedback` },
    { key: 'submissions', label: 'Submissions', href: `/workspaces/${workspaceId}/feedback/submissions` },
    { key: 'confirm', label: 'Confirmation', href: `/workspaces/${workspaceId}/feedback/confirm` }
  ].map((tab) => ({ ...tab, active: tab.key === activeTab }));
}

export async function index(req, res) {
  const workspace = await hydrateWorkspace(req);
  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  const feedback = workspace.feedback || {};
  res.render('feedback/index', {
    workspace,
    active: 'feedback',
    tabs: buildTabs(workspace._id, 'config'),
    feedback,
    fieldsJson: JSON.stringify(Array.isArray(feedback?.config?.fields) ? feedback.config.fields : [])
  });
}

export async function update(req, res) {
  const { workspaces } = getCollections();
  const workspace = await hydrateWorkspace(req);
  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  const existingConfig = workspace.feedback?.config || {};
  const fields = normalizeFeedbackFields(req.body.fieldsJson);

  await workspaces.updateOne(
    { _id: new ObjectId(workspace._id) },
    {
      $set: {
        'feedback.enabled': parseBoolean(req.body.enabled),
        'feedback.name': cleanString(req.body.name, 50) || 'feedback',
        'feedback.module': parseBoolean(req.body.module),
        'feedback.scriptUrl': cleanString(req.body.scriptUrl, 500) || workspace.feedback?.scriptUrl,
        'feedback.config.tabLabel': cleanString(req.body.tabLabel, 40) || 'Feedback',
        'feedback.config.formTitle': cleanString(req.body.formTitle, 100) || 'Send feedback',
        'feedback.config.submitLabel': cleanString(req.body.submitLabel, 50) || 'Submit',
        'feedback.config.successTitle': cleanString(req.body.successTitle, 120) || existingConfig.successTitle || 'Thanks for your feedback!',
        'feedback.config.successMessage': cleanString(req.body.successMessage, 700) || existingConfig.successMessage || 'Your submission has been received.',
        'feedback.config.accent': cleanString(req.body.accent, 12) || '#111827',
        'feedback.config.textColor': cleanString(req.body.textColor, 12) || '#ffffff',
        'feedback.config.panelBg': cleanString(req.body.panelBg, 12) || '#ffffff',
        'feedback.config.fields': fields,
        updatedAt: new Date()
      }
    }
  );

  req.flash('success', 'Feedback configuration updated.');
  return res.redirect(`/workspaces/${workspace._id}/feedback`);
}

export async function submissions(req, res) {
  const workspace = await hydrateWorkspace(req);
  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  const collection = getDB().collection('feedback_submissions');
  const workspaceId = new ObjectId(workspace._id);

  const pageSize = parsePositiveInt(req.query.pageSize, 20);
  const page = parsePositiveInt(req.query.page, 1);

  const totalRows = await collection.countDocuments({ workspaceId });
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(page, totalPages);
  const skip = (currentPage - 1) * pageSize;

  const rows = await collection
    .find({ workspaceId })
    .sort({ createdAt: -1, _id: -1 })
    .skip(skip)
    .limit(pageSize)
    .toArray();

  res.render('feedback/submissions', {
    workspace,
    active: 'feedback',
    tabs: buildTabs(workspace._id, 'submissions'),
    submissions: rows.map((row) => ({
      id: String(row._id),
      pageUrl: cleanString(row.pageUrl, 220),
      createdAtLabel: row.createdAt ? new Date(row.createdAt).toLocaleString() : '',
      createdAtIso: row.createdAt ? new Date(row.createdAt).toISOString() : '',
      data: row.data || {}
    })),
    tableState: { page: currentPage, totalPages, totalRows, pageSize }
  });
}

export async function confirmForm(req, res) {
  const workspace = await hydrateWorkspace(req);
  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  const feedbackConfig = workspace.feedback?.config || {};

  res.render('feedback/confirm', {
    workspace,
    active: 'feedback',
    tabs: buildTabs(workspace._id, 'confirm'),
    successTitle: feedbackConfig.successTitle || 'Thanks for your feedback!',
    successMessage: feedbackConfig.successMessage || 'Your submission has been received.'
  });
}

export async function updateConfirm(req, res) {
  const { workspaces } = getCollections();
  const workspace = await hydrateWorkspace(req);
  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  await workspaces.updateOne(
    { _id: new ObjectId(workspace._id) },
    {
      $set: {
        'feedback.config.successTitle': cleanString(req.body.successTitle, 120) || 'Thanks for your feedback!',
        'feedback.config.successMessage': cleanString(req.body.successMessage, 700) || 'Your submission has been received.',
        updatedAt: new Date()
      }
    }
  );

  req.flash('success', 'Feedback confirmation content updated.');
  return res.redirect(`/workspaces/${workspace._id}/feedback/confirm`);
}
