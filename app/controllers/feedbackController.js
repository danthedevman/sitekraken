import { ObjectId } from 'mongodb';

import { getCollections, getDB } from '../config/db.js';
import { ensureWorkspaceChatbotDefaults } from '../models/defaults.js';
import { serializeDoc } from '../services/dbHelpers.js';

function parseBoolean(value) {
  return value === 'on' || value === 'true' || value === true;
}

function sanitizeHexColor(value, fallback) {
  const str = String(value || '').trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(str)) return str;
  return fallback;
}

function cleanString(value, max = 180) {
  return String(value || '').trim().slice(0, max);
}

function normalizeDisplaySide(value) {
  return cleanString(value, 10).toLowerCase() === 'left' ? 'left' : 'right';
}

function normalizeVerticalPosition(value) {
  const position = cleanString(value, 12).toLowerCase();
  if (position === 'top' || position === 'middle') return position;
  return 'bottom';
}

function normalizeOffsetPx(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(200, Math.max(0, Math.round(parsed)));
}

function normalizeFieldType(value) {
  const type = cleanString(value, 30).toLowerCase();
  if (['text', 'multiline', 'select', 'email'].includes(type)) return type;
  return 'text';
}

function normalizeField(raw = {}, index = 0) {
  const type = normalizeFieldType(raw.type);
  const options = String(raw.options || '')
    .split('\n')
    .map((option) => option.trim())
    .filter(Boolean)
    .slice(0, 25);

  return {
    id: cleanString(raw.id, 60) || `field_${Date.now()}_${index}`,
    label: cleanString(raw.label, 120) || `Field ${index + 1}`,
    placeholder: cleanString(raw.placeholder, 140),
    helpText: cleanString(raw.helpText, 180),
    type,
    required: parseBoolean(raw.required),
    options: type === 'select' ? options : [],
  };
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

function normalizeFieldRows(body = {}) {
  const labels = Array.isArray(body.fieldLabel) ? body.fieldLabel : [body.fieldLabel];
  const types = Array.isArray(body.fieldType) ? body.fieldType : [body.fieldType];
  const requireds = Array.isArray(body.fieldRequired) ? body.fieldRequired : [body.fieldRequired];
  const placeholders = Array.isArray(body.fieldPlaceholder) ? body.fieldPlaceholder : [body.fieldPlaceholder];
  const helps = Array.isArray(body.fieldHelpText) ? body.fieldHelpText : [body.fieldHelpText];
  const options = Array.isArray(body.fieldOptions) ? body.fieldOptions : [body.fieldOptions];
  const ids = Array.isArray(body.fieldId) ? body.fieldId : [body.fieldId];

  const length = Math.max(labels.length, types.length, requireds.length, placeholders.length, helps.length, options.length, ids.length);
  const fields = [];

  for (let i = 0; i < length; i += 1) {
    const label = String(labels[i] || '').trim();
    if (!label) continue;

    fields.push(
      normalizeField(
        {
          id: ids[i],
          label,
          type: types[i],
          required: requireds[i],
          placeholder: placeholders[i],
          helpText: helps[i],
          options: options[i],
        },
        i
      )
    );
  }

  return fields;
}

function buildFeedbackTabLinks(workspaceId) {
  return [
    { key: 'configuration', label: 'Configuration', href: `/workspaces/${workspaceId}/feedback` },
    { key: 'submissions', label: 'Submissions', href: `/workspaces/${workspaceId}/feedback/submissions` },
  ];
}

function normalizeSubmissionIds(value) {
  const ids = Array.isArray(value) ? value : [value];
  return [...new Set(
    ids
      .map((id) => String(id || '').trim())
      .filter((id) => id && ObjectId.isValid(id))
  )];
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return parsed;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function index(req, res) {
  const workspace = await hydrateWorkspace(req);
  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  res.render('feedback/index', {
    workspace,
    active: 'feedback',
    tabLinks: buildFeedbackTabLinks(workspace._id),
    feedback: workspace.feedback || {},
    fields: Array.isArray(workspace.feedback?.config?.fields) ? workspace.feedback.config.fields : [],
  });
}

export async function update(req, res) {
  const { workspaces } = getCollections();
  const workspace = await hydrateWorkspace(req);

  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  const fields = normalizeFieldRows(req.body);
  if (!fields.length) {
    req.flash('error', 'Add at least one feedback field.');
    return res.redirect(`/workspaces/${workspace._id}/feedback`);
  }

  await workspaces.updateOne(
    { _id: new ObjectId(workspace._id) },
    {
      $set: {
        feedback: {
          ...(workspace.feedback || {}),
          name: 'feedback',
          enabled: parseBoolean(req.body.enabled),
          scriptUrl: workspace.feedback?.scriptUrl || 'https://api.sitekraken.com/public/lib/feedback.js',
          module: typeof workspace.feedback?.module === 'boolean' ? workspace.feedback.module : false,
          config: {
            ...(workspace.feedback?.config || {}),
            tabLabel: cleanString(req.body.tabLabel, 40) || 'Feedback',
            formTitle: cleanString(req.body.formTitle, 80) || 'Share your feedback',
            submitLabel: cleanString(req.body.submitLabel, 40) || 'Send feedback',
            confirmationTitle: cleanString(req.body.confirmationTitle, 80) || 'Thanks for your feedback',
            confirmationMessage:
              cleanString(req.body.confirmationMessage, 240) || 'Your response has been submitted.',
            tabBackgroundColor: sanitizeHexColor(req.body.tabBackgroundColor, '#111827'),
            tabTextColor: sanitizeHexColor(req.body.tabTextColor, '#ffffff'),
            panelBackgroundColor: sanitizeHexColor(req.body.panelBackgroundColor, '#ffffff'),
            panelTextColor: sanitizeHexColor(req.body.panelTextColor, '#111827'),
            buttonBackgroundColor: sanitizeHexColor(req.body.buttonBackgroundColor, '#111827'),
            buttonTextColor: sanitizeHexColor(req.body.buttonTextColor, '#ffffff'),
            displaySide: normalizeDisplaySide(req.body.displaySide),
            verticalPosition: normalizeVerticalPosition(req.body.verticalPosition),
            offsetPx: normalizeOffsetPx(req.body.offsetPx),
            fields,
            allowedDomains: Array.isArray(workspace.allowedDomains) ? workspace.allowedDomains : [],
          },
        },
        updatedAt: new Date(),
      },
    }
  );

  req.flash('success', 'Feedback form settings saved.');
  return res.redirect(`/workspaces/${workspace._id}/feedback`);
}

export async function submissions(req, res) {
  const workspace = await hydrateWorkspace(req);

  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  const db = getDB();
  const collection = db.collection('website_feedback_submissions');
  const workspaceId = new ObjectId(workspace._id);
  const pageSize = parsePositiveInt(req.query.pageSize, 20);
  const page = parsePositiveInt(req.query.page, 1);
  const search = String(req.query.search || '').trim();
  const sort = String(req.query.sort || 'createdAt').trim();
  const direction = String(req.query.direction || 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
  const sortDirection = direction === 'asc' ? 1 : -1;
  const sortConfig = {
    createdAt: { createdAt: sortDirection, _id: sortDirection },
    pageUrl: { pageUrl: sortDirection, createdAt: -1 }
  };
  const sortKey = Object.prototype.hasOwnProperty.call(sortConfig, sort) ? sort : 'createdAt';
  const query = { workspaceId };

  if (search) {
    const escapedSearch = escapeRegExp(search);
    const searchRegex = new RegExp(escapedSearch, 'i');

    query.$or = [
      { pageUrl: { $regex: searchRegex } },
      { $expr: { $regexMatch: { input: { $toString: '$payload' }, regex: escapedSearch, options: 'i' } } }
    ];
  }

  const totalRows = await collection.countDocuments(query);
  const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(page, totalPages);
  const skip = (currentPage - 1) * pageSize;

  const feedbackSubmissions = await collection
    .find(query)
    .sort(sortConfig[sortKey])
    .skip(skip)
    .limit(pageSize)
    .toArray();

  res.render('feedback/submissions', {
    workspace,
    active: 'feedback',
    tabLinks: buildFeedbackTabLinks(workspace._id),
    submissions: feedbackSubmissions.map((entry) => ({
      id: String(entry._id),
      createdAt: entry.createdAt ? new Date(entry.createdAt).toLocaleString() : '—',
      payload: entry.payload && typeof entry.payload === 'object' ? entry.payload : {},
      pageUrl: String(entry.pageUrl || ''),
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

export async function showSubmission(req, res) {
  const workspace = await hydrateWorkspace(req);

  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  const submissionId = String(req.params.submissionId || '').trim();
  if (!ObjectId.isValid(submissionId)) {
    req.flash('error', 'Submission not found');
    return res.redirect(`/workspaces/${workspace._id}/feedback/submissions`);
  }

  const db = getDB();
  const submission = await db.collection('website_feedback_submissions').findOne({
    _id: new ObjectId(submissionId),
    workspaceId: new ObjectId(workspace._id),
  });

  if (!submission) {
    req.flash('error', 'Submission not found');
    return res.redirect(`/workspaces/${workspace._id}/feedback/submissions`);
  }

  return res.render('feedback/submission-show', {
    workspace,
    active: 'feedback',
    tabLinks: buildFeedbackTabLinks(workspace._id),
    submission: {
      id: String(submission._id),
      createdAt: submission.createdAt ? new Date(submission.createdAt).toLocaleString() : '—',
      pageUrl: String(submission.pageUrl || ''),
      payload: submission.payload && typeof submission.payload === 'object' ? submission.payload : {},
    }
  });
}

export async function bulkDestroySubmissions(req, res) {
  const workspace = await hydrateWorkspace(req);
  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  const submissionIds = normalizeSubmissionIds(req.body.ids);

  if (!submissionIds.length) {
    req.flash('error', 'No submissions selected');
    return res.redirect(`/workspaces/${workspace._id}/feedback/submissions`);
  }

  const objectIds = submissionIds.map((id) => new ObjectId(id));
  const db = getDB();
  const result = await db.collection('website_feedback_submissions').deleteMany({
    _id: { $in: objectIds },
    workspaceId: new ObjectId(workspace._id),
  });

  const deletedCount = Number(result.deletedCount || 0);
  req.flash('success', `Deleted ${deletedCount} submission${deletedCount === 1 ? '' : 's'}.`);
  return res.redirect(`/workspaces/${workspace._id}/feedback/submissions`);
}

export async function confirmation(req, res) {
  const workspace = await hydrateWorkspace(req);

  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  res.render('feedback/confirmation', {
    workspace,
    active: 'feedback',
    feedback: workspace.feedback || {},
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
        'feedback.enabled': shouldEnable,
        updatedAt: new Date(),
      },
    }
  );

  req.flash('success', shouldEnable ? 'Feedback activated.' : 'Feedback deactivated.');
  return res.redirect(`/workspaces/${workspace._id}/feedback`);
}
