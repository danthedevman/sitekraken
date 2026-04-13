import { ObjectId } from 'mongodb';

import { getCollections, getDB } from '../config/db.js';
import { ensureWorkspaceChatbotDefaults } from '../models/defaults.js';
import { serializeDoc } from '../services/dbHelpers.js';

function toPct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  if (!minutes) return `${remainingSeconds}s`;
  if (!remainingSeconds) return `${minutes}m`;
  return `${minutes}m ${remainingSeconds}s`;
}

async function hydrateWorkspace(req) {
  const { workspaces } = getCollections();
  const workspace = req.workspace;
  if (!workspace) return null;

  const hydratedWorkspace = ensureWorkspaceChatbotDefaults(workspace);

  if (!workspace.analytics || !workspace.logs || !workspace.chatbot || !workspace.apiKey) {
    await workspaces.updateOne(
      { _id: new ObjectId(workspace._id) },
      {
        $set: {
          apiKey: hydratedWorkspace.apiKey,
          chatbot: hydratedWorkspace.chatbot,
          analytics: hydratedWorkspace.analytics,
          logs: hydratedWorkspace.logs,
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

  const heartbeatCount = await collection.countDocuments({
    workspaceId,
    createdAt: { $gte: sevenDaysAgo },
    type: 'heartbeat'
  });

  const heartbeatEveryMs = Number(workspace?.analytics?.config?.heartbeatEveryMs) || 30000;
  const avgTimeOnPageSeconds = pageViews
    ? Math.round((heartbeatCount * (heartbeatEveryMs / 1000)) / pageViews)
    : 0;

  const liveWindowMinutes = 5;
  const liveWindowStart = new Date(now.getTime() - liveWindowMinutes * 60 * 1000);

  const liveUsersAgg = await collection
    .aggregate([
      {
        $match: {
          workspaceId,
          createdAt: { $gte: liveWindowStart },
          type: { $in: ['session_start', 'page_view', 'heartbeat'] }
        }
      },
      {
        $group: {
          _id: {
            userAgent: '$userAgent',
            language: '$language',
            tzOffsetMinutes: '$tzOffsetMinutes',
            viewportW: '$viewportW',
            viewportH: '$viewportH'
          }
        }
      },
      { $count: 'liveUsers' }
    ])
    .toArray();

  const liveUsers = Number(liveUsersAgg?.[0]?.liveUsers || 0);

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
      { $group: { _id: '$pathname', views: { $sum: 1 } } },
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
      {
        label: 'Avg. time on page',
        value: avgTimeOnPageSeconds,
        displayValue: formatDuration(avgTimeOnPageSeconds),
        helper: 'Estimated from heartbeat events (7d)'
      },
      {
        label: 'Live users',
        value: liveUsers,
        helper: `Estimated active users in last ${liveWindowMinutes}m`
      }
    ],
    clickBreakdown: clicksByType.map((item) => ({
      label: item._id,
      count: item.count,
      percentage: toPct(item.count, clickTotal)
    })),
    topPages: topPages.map((item) => ({ pathname: item._id, views: item.views })),
    topLinks: topLinks.map((item) => ({ href: item._id, count: item.count })),
    topButtons: topButtons.map((item) => ({ label: item._id, count: item.count })),
    eventTimeline,
    dateRangeLabel: 'Last 7 days'
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
        'analytics.enabled': shouldEnable,
        updatedAt: new Date()
      }
    }
  );

  req.flash('success', shouldEnable ? 'Analytics activated.' : 'Analytics deactivated.');
  return res.redirect(`/workspaces/${workspace._id}/analytics`);
}
