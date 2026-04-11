import { DeleteObjectCommand, DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { getCollections } from '../config/db.js';
import {
  defaultWorkspaceChatbot,
  normalizeAllowedDomainsInput
} from '../models/defaults.js';
import openaiClient, { createVectorStore, deleteOpenAIFile } from '../services/openaiService.js';
import {
  addWorkspaceMemberByEmail,
  listOwnedWorkspaces,
  listWorkspaceMembers,
  removeWorkspaceMember,
  updateWorkspaceMemberRole
} from '../services/workspaceService.js';
import { toObjectId } from '../services/dbHelpers.js';

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
  }
});

async function deleteR2ObjectsByPrefix(prefix) {
  const bucket = process.env.CLOUDFLARE_R2_BUCKET;
  if (!bucket || !prefix) return;

  let continuationToken;
  do {
    const page = await r2.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken
      })
    );

    const keys = (page.Contents || []).map((item) => item.Key).filter(Boolean);
    if (keys.length) {
      await r2.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: keys.map((Key) => ({ Key }))
          }
        })
      );
    }

    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
}

async function deleteWorkspaceDataAssets(workspace) {
  const { workspaceFiles, knowledgeEntries } = getCollections();
  const workspaceId = String(workspace._id);

  const fileDocs = await workspaceFiles.find({ workspaceId }).toArray();
  for (const fileDoc of fileDocs) {
    if (fileDoc.openaiFileId) {
      try {
        await deleteOpenAIFile(fileDoc.openaiFileId);
      } catch (error) {
        console.warn('Failed deleting OpenAI file:', error.message);
      }
    }

    if (fileDoc.r2Key) {
      try {
        await r2.send(
          new DeleteObjectCommand({
            Bucket: process.env.CLOUDFLARE_R2_BUCKET,
            Key: fileDoc.r2Key
          })
        );
      } catch (error) {
        console.warn('Failed deleting R2 file:', error.message);
      }
    }
  }

  const knowledgeDocs = await knowledgeEntries.find({ workspaceId }).toArray();
  for (const entry of knowledgeDocs) {
    const openaiFileIds = [
      entry?.openaiFileId,
      ...(Array.isArray(entry?.openaiImageFileIds) ? entry.openaiImageFileIds : [])
    ].filter(Boolean);

    for (const fileId of openaiFileIds) {
      try {
        await deleteOpenAIFile(fileId);
      } catch (error) {
        console.warn('Failed deleting knowledge OpenAI file:', error.message);
      }
    }
  }

  try {
    await deleteR2ObjectsByPrefix(`workspaces/${workspaceId}/`);
  } catch (error) {
    console.warn('Failed deleting workspace R2 prefix:', error.message);
  }

  if (workspace.openaiVectorStoreId) {
    try {
      await openaiClient.vectorStores.del(workspace.openaiVectorStoreId);
    } catch (error) {
      console.warn('Failed deleting vector store:', error.message);
    }
  }
}

export async function index(req, res) {
  const workspaces = await listOwnedWorkspaces(req.user._id);
  res.render('workspaces/index', { workspaces});
}

export function newForm(req, res) {
  res.render('workspaces/new');
}

export async function create(req, res) {
  const { workspaces } = getCollections();
  const { name, description } = req.body;

  const trimmedName = String(name || '').trim();
  const trimmedDescription = String(description || '').trim();
  const allowedDomains = normalizeAllowedDomainsInput(req.body.allowedDomains);

  if (!trimmedName) {
    req.flash('error', 'Workspace name is required');
    return res.redirect('/workspaces/new');
  }

  const vectorStore = await createVectorStore(trimmedName);
  const chatbotDefaults = defaultWorkspaceChatbot(null, { allowedDomains });

  const workspaceDoc = {
    name: trimmedName,
    description: trimmedDescription,
    ownerId: req.user._id,
    members: [],
    openaiVectorStoreId: vectorStore.id,
    apiKey: chatbotDefaults.apiKey,
    allowedDomains: chatbotDefaults.allowedDomains,
    chatbot: chatbotDefaults.chatbot,
    analytics: chatbotDefaults.analytics,
    logs: chatbotDefaults.logs,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const result = await workspaces.insertOne(workspaceDoc);
  const workspaceId = result.insertedId.toString();

  req.flash('success', 'Workspace created');
  res.redirect(`/workspaces/${workspaceId}`);
}

export async function show(req, res) {
  const workspace = req.workspace;

  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  return res.redirect(`/workspaces/${workspace._id}/analytics`);
}

export async function settingsForm(req, res) {
  const workspace = req.workspace;

  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  const members = await listWorkspaceMembers(workspace);

  res.render('workspaces/settings', {
    workspace,
    active: 'settings',
    members,
    allowedDomainsText: Array.isArray(workspace.allowedDomains)
      ? workspace.allowedDomains.join('\n')
      : ''
  });
}

export async function updateSettings(req, res) {
  const { workspaces } = getCollections();
  const workspace = req.workspace;

  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  const trimmedName = String(req.body.name || '').trim();
  const trimmedDescription = String(req.body.description || '').trim();
  const allowedDomains = normalizeAllowedDomainsInput(req.body.allowedDomains);

  if (!trimmedName) {
    req.flash('error', 'Workspace name is required');
    return res.redirect(`/workspaces/${workspace._id}/settings`);
  }

  await workspaces.updateOne(
    { _id: toObjectId(workspace._id) },
    {
      $set: {
        name: trimmedName,
        description: trimmedDescription,
        allowedDomains,
        updatedAt: new Date()
      }
    }
  );

  req.flash('success', 'Workspace settings updated');
  return res.redirect(`/workspaces/${workspace._id}/settings`);
}

export async function createMember(req, res) {
  const workspace = req.workspace;
  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  try {
    await addWorkspaceMemberByEmail(workspace, req.body.email, 'admin');
    req.flash('success', 'Workspace member added');
  } catch (error) {
    req.flash('error', error.message || 'Unable to add member');
  }

  return res.redirect(`/workspaces/${workspace._id}/settings`);
}

export async function updateMember(req, res) {
  const workspace = req.workspace;
  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  try {
    await updateWorkspaceMemberRole(workspace, req.params.memberUserId, 'admin');
    req.flash('success', 'Workspace member updated');
  } catch (error) {
    req.flash('error', error.message || 'Unable to update member');
  }

  return res.redirect(`/workspaces/${workspace._id}/settings`);
}

export async function destroyMember(req, res) {
  const workspace = req.workspace;
  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  if (String(req.params.memberUserId || '') === String(workspace.ownerId)) {
    req.flash('error', 'Owner cannot delete themselves from a workspace');
    return res.redirect(`/workspaces/${workspace._id}/settings`);
  }

  try {
    await removeWorkspaceMember(workspace, req.params.memberUserId);
    req.flash('success', 'Workspace member removed');
  } catch (error) {
    req.flash('error', error.message || 'Unable to remove member');
  }

  return res.redirect(`/workspaces/${workspace._id}/settings`);
}

export async function destroy(req, res) {
  const { workspaces, workspaceFiles, knowledgeEntries, chatbotConfigs } = getCollections();
  const workspace = req.workspace;

  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  if (workspace.currentUserRole !== 'owner') {
    req.flash('error', 'Only workspace owners can delete a workspace');
    return res.redirect(`/workspaces/${workspace._id}/settings`);
  }

  await deleteWorkspaceDataAssets(workspace);

  await Promise.all([
    workspaceFiles.deleteMany({ workspaceId: workspace._id }),
    knowledgeEntries.deleteMany({ workspaceId: workspace._id }),
    chatbotConfigs.deleteMany({ workspaceId: workspace._id }),
    workspaces.deleteOne({ _id: toObjectId(workspace._id) })
  ]);

  req.flash('success', 'Workspace deleted with all associated data');
  return res.redirect('/workspaces');
}
