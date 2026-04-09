import { ObjectId } from 'mongodb';

import { getCollections } from '../config/db.js';
import { ensureWorkspaceChatbotDefaults } from '../models/defaults.js';
import { findOwnedWorkspace, trackRecentWorkspaceVisit } from '../services/workspaceService.js';
import { serializeDoc } from '../services/dbHelpers.js';

function buildAnalyticsSnippet(workspace) {
  const appUrl = String(process.env.APP_URL || '').replace(/\/+$/, '');
  const apiUrl = appUrl || '/';
  const scriptSrc = appUrl
    ? `${appUrl}/public/lib/analytics.js`
    : '/public/lib/analytics.js';

  const moduleConfig = {
    apiUrl,
    trackClicks: true,
    trackLinks: true,
    trackButtons: true,
    trackScrollDepth: true,
  };

  return `<script src="${scriptSrc}" data-api-key="${workspace.apiKey}" data-module-config='${JSON.stringify(moduleConfig)}'></script>`;
}

async function getWorkspace(req) {
  const { workspaces } = getCollections();
  const workspace = await findOwnedWorkspace(req.user._id, req.params.workspaceId);
  trackRecentWorkspaceVisit(req, workspace);

  const hydratedWorkspace = ensureWorkspaceChatbotDefaults(workspace);

  if (!workspace.analytics || !workspace.chatbot || !workspace.apiKey) {
    await workspaces.updateOne(
      { _id: new ObjectId(workspace._id) },
      {
        $set: {
          apiKey: hydratedWorkspace.apiKey,
          chatbot: hydratedWorkspace.chatbot,
          analytics: hydratedWorkspace.analytics,
          allowedDomains: hydratedWorkspace.allowedDomains,
          updatedAt: new Date(),
        },
      }
    );
  }

  return serializeDoc(hydratedWorkspace);
}

export async function index(req, res) {
  const workspace = await getWorkspace(req);

  res.render('analytics/index', {
    workspace,
    active: 'analytics',
    analyticsScriptTag: buildAnalyticsSnippet(workspace)
  });
}

export async function toggleEnabled(req, res) {
  const { workspaces } = getCollections();
  const workspace = await getWorkspace(req);
  const shouldEnable = String(req.body.enabled) === 'true';

  await workspaces.updateOne(
    { _id: new ObjectId(workspace._id) },
    {
      $set: {
        'analytics.enabled': shouldEnable,
        updatedAt: new Date()
      }
    }
  );

  req.flash('success', shouldEnable ? 'Analytics activated.' : 'Analytics deactivated.');
  return res.redirect(`/workspaces/${workspace._id}/analytics`);
}
