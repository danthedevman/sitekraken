import { ObjectId } from 'mongodb';

import { getCollections, getDB } from '../config/db.js';
import { ensureWorkspaceChatbotDefaults } from '../models/defaults.js';
import { findOwnedWorkspace, trackRecentWorkspaceVisit } from '../services/workspaceService.js';
import { serializeDoc } from '../services/dbHelpers.js';

function toPct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

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
  return res.redirect(`/workspaces/${req.params.workspaceId}/analytics/dashboard`);
}

export async function dashboard(req, res) {
  const workspace = await getWorkspace(req);

  const db = getDB();
  const collection = db.collection('website_analytics_events');

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const workspaceId = new ObjectId(workspace._id);

  const totalEvents = await collection.countDocuments({
    workspaceId,
    createdAt: { $gte: sevenDaysAgo }
  });

  const pageViews = await collection.countDocuments({
    workspaceId,
    createdAt: { $gte: sevenDaysAgo },
    type: 'page_view'
  });

  const uniqueVisitors = await collection.distinct('visitorId', {
    workspaceId,
    createdAt: { $gte: sevenDaysAgo },
    visitorId: { $ne: '' }
  });

  const uniqueSessions = await collection.distinct('sessionId', {
    workspaceId,
    createdAt: { $gte: sevenDaysAgo },
    sessionId: { $ne: '' }
  });

  const clicksByType = await collection
    .aggregate([
      { $match: { workspaceId, createdAt: { $gte: sevenDaysAgo }, type: { $in: ['click', 'link_click', 'button_click'] } } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ])
    .toArray();

  const topPages = await collection
    .aggregate([
      {
        $match: {
          workspaceId,
          createdAt: { $gte: sevenDaysAgo },
          type: 'page_view',
          pathname: { $nin: ['', null] }
        }
      },
      { $group: { _id: '$pathname', views: { $sum: 1 }, visitors: { $addToSet: '$visitorId' } } },
      { $project: { _id: 1, views: 1, uniqueVisitors: { $size: '$visitors' } } },
      { $sort: { views: -1 } },
      { $limit: 8 }
    ])
    .toArray();

  const topLinks = await collection
    .aggregate([
      {
        $match: {
          workspaceId,
          createdAt: { $gte: sevenDaysAgo },
          type: 'link_click',
          targetHref: { $nin: ['', null] }
        }
      },
      { $group: { _id: '$targetHref', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 }
    ])
    .toArray();

  const topButtons = await collection
    .aggregate([
      {
        $match: {
          workspaceId,
          createdAt: { $gte: sevenDaysAgo },
          type: 'button_click',
          targetText: { $nin: ['', null] }
        }
      },
      { $group: { _id: '$targetText', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 8 }
    ])
    .toArray();

  const eventTimeline = await collection
    .aggregate([
      {
        $match: {
          workspaceId,
          createdAt: { $gte: sevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            type: '$type'
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.day': 1 } }
    ])
    .toArray();

  const clickTotal = clicksByType.reduce((sum, item) => sum + Number(item.count || 0), 0);

  res.render('analytics/index', {
    workspace,
    active: 'analytics',
    scorecards: [
      { label: 'Events (7d)', value: totalEvents, helper: 'All tracked events' },
      { label: 'Page views (7d)', value: pageViews, helper: 'Page view events only' },
      { label: 'Unique visitors (7d)', value: uniqueVisitors.length, helper: 'Distinct visitor IDs' },
      { label: 'Sessions (7d)', value: uniqueSessions.length, helper: 'Distinct session IDs' }
    ],
    clickBreakdown: clicksByType.map((item) => ({
      label: item._id,
      count: item.count,
      percentage: toPct(item.count, clickTotal)
    })),
    topPages: topPages.map((item) => ({ pathname: item._id, views: item.views, uniqueVisitors: item.uniqueVisitors })),
    topLinks: topLinks.map((item) => ({ href: item._id, count: item.count })),
    topButtons: topButtons.map((item) => ({ label: item._id, count: item.count })),
    eventTimeline,
    dateRangeLabel: 'Last 7 days'
  });
}

export async function installation(req, res) {
  const workspace = await getWorkspace(req);

  res.render('analytics/installation', {
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
  return res.redirect(`/workspaces/${workspace._id}/analytics/dashboard`);
}
