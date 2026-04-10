import { getCollections } from '../config/db.js';
import { toObjectId, serializeDoc, serializeDocs } from './dbHelpers.js';

const MANAGEABLE_ROLES = ['owner', 'admin'];

function normalizeRole(role) {
  return role === 'owner' ? 'owner' : 'admin';
}

function serializeWorkspaceMembership(workspace, userId) {
  const ownerId = String(workspace?.ownerId || '');
  const currentUserId = String(userId || '');

  if (ownerId && ownerId === currentUserId) {
    return 'owner';
  }

  const members = Array.isArray(workspace?.members) ? workspace.members : [];
  const member = members.find((entry) => String(entry?.userId || '') === currentUserId);
  if (!member) return null;

  return normalizeRole(member.role);
}

function serializeWorkspace(workspace, userId) {
  const serialized = serializeDoc(workspace);
  if (!serialized) return null;

  return {
    ...serialized,
    currentUserRole: serializeWorkspaceMembership(workspace, userId)
  };
}

function buildWorkspaceAccessQuery(userId) {
  const normalizedUserId = String(userId || '');

  return {
    $or: [
      { ownerId: normalizedUserId },
      {
        members: {
          $elemMatch: {
            userId: normalizedUserId,
            role: { $in: MANAGEABLE_ROLES }
          }
        }
      }
    ]
  };
}

export async function findOwnedWorkspace(userId, workspaceId) {
  const { workspaces } = getCollections();

  const workspace = await workspaces.findOne({
    _id: toObjectId(workspaceId),
    ...buildWorkspaceAccessQuery(userId)
  });

  if (!workspace) {
    return null;
  }

  return serializeWorkspace(workspace, userId);
}

export async function listOwnedWorkspaces(userId) {
  const { workspaces } = getCollections();

  const docs = await workspaces
    .find(buildWorkspaceAccessQuery(userId))
    .sort({ createdAt: -1 })
    .toArray();

  return docs.map((workspace) => serializeWorkspace(workspace, userId));
}

export async function listWorkspaceMembers(workspace) {
  const { users } = getCollections();
  if (!workspace?._id) return [];

  const memberEntries = [
    { userId: String(workspace.ownerId), role: 'owner' },
    ...(Array.isArray(workspace.members) ? workspace.members : [])
      .filter((entry) => String(entry?.userId || '') !== String(workspace.ownerId))
      .map((entry) => ({
        userId: String(entry.userId || ''),
        role: normalizeRole(entry.role)
      }))
  ];

  if (!memberEntries.length) return [];

  const uniqueUserIds = [...new Set(memberEntries.map((entry) => entry.userId).filter(Boolean))];
  const userDocs = await users.find({ _id: { $in: uniqueUserIds.map((id) => toObjectId(id)) } }).toArray();
  const usersById = new Map(userDocs.map((doc) => [String(doc._id), doc]));

  return memberEntries.map((entry) => {
    const userDoc = usersById.get(entry.userId);

    return {
      userId: entry.userId,
      role: entry.role,
      displayName: userDoc?.displayName || userDoc?.email || 'Unknown user',
      email: userDoc?.email || ''
    };
  });
}

export async function addWorkspaceMemberByEmail(workspace, email, role = 'admin') {
  const { users, workspaces } = getCollections();
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!normalizedEmail) {
    throw new Error('Email is required');
  }

  if (!workspace?._id) {
    throw new Error('Workspace not found');
  }

  const user = await users.findOne({ email: normalizedEmail });
  if (!user) {
    throw new Error('No user found with that email');
  }

  const userId = String(user._id);
  if (userId === String(workspace.ownerId)) {
    throw new Error('Owner is already part of this workspace');
  }

  const members = Array.isArray(workspace.members) ? workspace.members : [];
  const existingMember = members.find((entry) => String(entry?.userId || '') === userId);

  if (existingMember) {
    throw new Error('User is already in this workspace');
  }

  await workspaces.updateOne(
    { _id: toObjectId(workspace._id) },
    {
      $push: {
        members: {
          userId,
          role: normalizeRole(role),
          addedAt: new Date()
        }
      },
      $set: { updatedAt: new Date() }
    }
  );
}

export async function updateWorkspaceMemberRole(workspace, userId, role = 'admin') {
  const { workspaces } = getCollections();

  if (String(userId || '') === String(workspace?.ownerId || '')) {
    throw new Error('Owner role cannot be changed');
  }

  const result = await workspaces.updateOne(
    {
      _id: toObjectId(workspace._id),
      'members.userId': String(userId || '')
    },
    {
      $set: {
        'members.$.role': normalizeRole(role),
        updatedAt: new Date()
      }
    }
  );

  if (!result.matchedCount) {
    throw new Error('Workspace member not found');
  }
}

export async function removeWorkspaceMember(workspace, userId) {
  const { workspaces } = getCollections();

  if (String(userId || '') === String(workspace?.ownerId || '')) {
    throw new Error('Owner cannot be removed from workspace');
  }

  const result = await workspaces.updateOne(
    { _id: toObjectId(workspace._id) },
    {
      $pull: {
        members: {
          userId: String(userId || '')
        }
      },
      $set: { updatedAt: new Date() }
    }
  );

  if (!result.modifiedCount) {
    throw new Error('Workspace member not found');
  }
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
