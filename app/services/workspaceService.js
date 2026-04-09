import { getCollections } from '../config/db.js';
import { toObjectId, serializeDoc, serializeDocs } from './dbHelpers.js';

export async function findOwnedWorkspace(userId, workspaceId) {
  const { workspaces } = getCollections();

  const workspace = await workspaces.findOne({
    _id: toObjectId(workspaceId),
    ownerId: userId
  });

  if (!workspace) {
    throw new Error('Workspace not found');
  }

  return serializeDoc(workspace);
}

export async function listOwnedWorkspaces(userId) {
  const { workspaces } = getCollections();
  const docs = await workspaces.find({ ownerId: userId }).sort({ createdAt: -1 }).toArray();
  return serializeDocs(docs);
}

export function trackRecentWorkspaceVisit(req, workspace) {
  if (!req?.session || !workspace?._id) return;

  const currentId = String(workspace._id);
  const currentName = String(workspace.name || 'Untitled workspace');
  const existing = Array.isArray(req.session.recentWorkspaces)
    ? req.session.recentWorkspaces
    : [];

  const deduped = existing.filter((entry) => String(entry?.id || '') !== currentId);

  req.session.recentWorkspaces = [
    { id: currentId, name: currentName },
    ...deduped
  ].slice(0, 5);
}
