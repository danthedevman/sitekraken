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
