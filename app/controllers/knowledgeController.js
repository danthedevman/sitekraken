import { ObjectId } from 'mongodb';

import { getCollections } from '../config/db.js';
import {
  buildKnowledgeHtmlDocument,
  buildKnowledgeHtmlFilename,
  sanitizeKnowledgeHtml,
  extractImageUrlsFromHtml
} from '../services/knowledgeHtmlService.js';
import {
  uploadFileFromContent,
  uploadBuffer,
  addFileToVectorStore,
  removeFileFromVectorStore,
  deleteOpenAIFile
} from '../services/openaiService.js';
import { uploadBufferToR2 } from '../services/r2Service.js';
import { findOwnedWorkspace, trackRecentWorkspaceVisit } from '../services/workspaceService.js';
import { serializeDoc, serializeDocs, toObjectId } from '../services/dbHelpers.js';

async function getWorkspace(req) {
  const workspace = await findOwnedWorkspace(req.user._id, req.params.workspaceId);
  trackRecentWorkspaceVisit(req, workspace);
  return workspace;
}

function buildChatbotTabLinks(workspaceId) {
  return [
    { key: 'chatbot', label: 'Configuration', href: `/workspaces/${workspaceId}/chatbot` },
    { key: 'files', label: 'Files', href: `/workspaces/${workspaceId}/chatbot/files` },
    { key: 'knowledge', label: 'Knowledge', href: `/workspaces/${workspaceId}/chatbot/knowledge` },
    { key: 'interactions', label: 'Interactions', href: `/workspaces/${workspaceId}/chatbot/interactions` }
  ];
}

function normalizeKnowledgeIds(value) {
  const ids = Array.isArray(value) ? value : [value];
  return [...new Set(
    ids
      .map((id) => String(id || '').trim())
      .filter((id) => id && ObjectId.isValid(id))
  )];
}

async function cleanupKnowledgeAssets(workspace, entry) {
  const vectorFileIds = [
    entry?.vectorStoreFileId,
    ...(Array.isArray(entry?.vectorStoreImageFileIds)
      ? entry.vectorStoreImageFileIds
      : [])
  ].filter(Boolean);

  for (const vectorStoreFileId of vectorFileIds) {
    try {
      await removeFileFromVectorStore(workspace.openaiVectorStoreId, vectorStoreFileId);
    } catch (error) {
      console.warn('Previous vector store file deletion failed:', error.message);
    }
  }

  const openaiFileIds = [
    entry?.openaiFileId,
    ...(Array.isArray(entry?.openaiImageFileIds) ? entry.openaiImageFileIds : [])
  ].filter(Boolean);

  for (const openaiFileId of openaiFileIds) {
    try {
      await deleteOpenAIFile(openaiFileId);
    } catch (error) {
      console.warn('Previous OpenAI file deletion failed:', error.message);
    }
  }
}

async function fetchImageBuffer(url) {
  const r2PublicBase = String(process.env.CLOUDFLARE_R2_PUBLIC_URL || '').replace(/\/+$/, '');
  if (!r2PublicBase) return null;

  if (!String(url || '').startsWith(`${r2PublicBase}/`)) {
    return null;
  }

  const response = await fetch(url);
  if (!response.ok) return null;

  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: response.headers.get('content-type') || 'application/octet-stream'
  };
}

async function uploadKnowledgeImagesToAssistant({ workspace, knowledgeId, bodyHtml }) {
  const imageUrls = [...new Set(extractImageUrlsFromHtml(bodyHtml))];
  if (!imageUrls.length) {
    return {
      openaiImageFileIds: [],
      vectorStoreImageFileIds: []
    };
  }

  const uploadedImageFileIds = [];
  const vectorStoreImageFileIds = [];

  for (const [index, imageUrl] of imageUrls.entries()) {
    try {
      const fileData = await fetchImageBuffer(imageUrl);
      if (!fileData?.buffer?.length) continue;

      const uploaded = await uploadBuffer(
        fileData.buffer,
        `knowledge-${knowledgeId}-image-${index + 1}`,
        fileData.mimeType
      );

      uploadedImageFileIds.push(uploaded.id);

      const vectorStoreFile = await addFileToVectorStore(
        workspace.openaiVectorStoreId,
        uploaded.id
      );

      if (vectorStoreFile?.id) {
        vectorStoreImageFileIds.push(vectorStoreFile.id);
      }
    } catch (error) {
      console.warn('Knowledge image assistant upload failed:', error.message);
    }
  }

  return {
    openaiImageFileIds: uploadedImageFileIds,
    vectorStoreImageFileIds
  };
}

async function publishKnowledgeEntry({ workspace, knowledgeId, title, body }) {
  const htmlDocument = buildKnowledgeHtmlDocument({ title, bodyHtml: body });
  const filename = buildKnowledgeHtmlFilename({
    title,
    workspaceId: workspace._id,
    knowledgeId
  });

  const uploaded = await uploadFileFromContent(filename, htmlDocument, 'text/html');
  const vectorStoreFile = await addFileToVectorStore(
    workspace.openaiVectorStoreId,
    uploaded.id
  );

  const imageAssets = await uploadKnowledgeImagesToAssistant({
    workspace,
    knowledgeId,
    bodyHtml: body
  });

  return {
    openaiFileId: uploaded.id,
    vectorStoreFileId: vectorStoreFile?.id || null,
    openaiImageFileIds: imageAssets.openaiImageFileIds,
    vectorStoreImageFileIds: imageAssets.vectorStoreImageFileIds
  };
}

export async function uploadKnowledgeImage(req, res) {
  const workspace = await getWorkspace(req);

  if (!workspace) {
    return res.status(404).json({ error: 'Workspace not found' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' });
  }

  if (!String(req.file.mimetype || '').startsWith('image/')) {
    return res.status(400).json({ error: 'Only image uploads are supported' });
  }

  const uploaded = await uploadBufferToR2({
    fileBuffer: req.file.buffer,
    mimeType: req.file.mimetype,
    keyPrefix: `workspaces/${workspace._id}/knowledge-images`,
    originalName: req.file.originalname
  });

  return res.json({ url: uploaded.url });
}

export async function index(req, res) {
  const { knowledgeEntries } = getCollections();
  const workspace = await getWorkspace(req);

  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  const docs = await knowledgeEntries
    .find({ workspaceId: workspace._id })
    .sort({ createdAt: -1 })
    .toArray();

  res.render('knowledge/index', {
    workspace,
    active: 'chatbot',
    tabLinks: buildChatbotTabLinks(workspace._id),
    entries: serializeDocs(docs)
  });
}

export async function newForm(req, res) {
  const workspace = await getWorkspace(req);

  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  res.render('knowledge/new', {
    workspace,
    active: 'chatbot',
    tabLinks: buildChatbotTabLinks(workspace._id),
  });
}

export async function create(req, res) {
  const { knowledgeEntries } = getCollections();
  const workspace = await getWorkspace(req);
  const { title, body, actionType } = req.body;
  const now = new Date();

  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  const safeBody = sanitizeKnowledgeHtml(body);

  const doc = {
    workspaceId: workspace._id,
    title: String(title || '').trim(),
    body: safeBody,
    status: actionType === 'publish' ? 'published' : 'draft',
    openaiFileId: null,
    vectorStoreFileId: null,
    openaiImageFileIds: [],
    vectorStoreImageFileIds: [],
    createdAt: now,
    updatedAt: now
  };

  const result = await knowledgeEntries.insertOne(doc);
  const entryId = result.insertedId.toString();

  if (actionType === 'publish') {
    const publishedAssets = await publishKnowledgeEntry({
      workspace,
      knowledgeId: entryId,
      title: doc.title,
      body: doc.body
    });

    await knowledgeEntries.updateOne(
      { _id: result.insertedId },
      {
        $set: {
          openaiFileId: publishedAssets.openaiFileId,
          vectorStoreFileId: publishedAssets.vectorStoreFileId,
          openaiImageFileIds: publishedAssets.openaiImageFileIds,
          vectorStoreImageFileIds: publishedAssets.vectorStoreImageFileIds,
          updatedAt: new Date()
        }
      }
    );
  }

  req.flash(
    'success',
    `Knowledge ${actionType === 'publish' ? 'published' : 'saved as draft'}`
  );
  res.redirect(`/workspaces/${workspace._id}/chatbot/knowledge`);
}

export async function show(req, res) {
  const { knowledgeEntries } = getCollections();
  const workspace = await getWorkspace(req);

  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  const entry = await knowledgeEntries.findOne({
    _id: toObjectId(req.params.knowledgeId),
    workspaceId: workspace._id
  });

  if (!entry) {
    req.flash('error', 'Knowledge entry not found');
    return res.redirect(`/workspaces/${workspace._id}/chatbot/knowledge`);
  }

  res.render('knowledge/show', {
    workspace,
    active: 'chatbot',
    tabLinks: buildChatbotTabLinks(workspace._id),
    entry: serializeDoc(entry)
  });
}

export async function editForm(req, res) {
  const { knowledgeEntries } = getCollections();
  const workspace = await getWorkspace(req);

  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  const entry = await knowledgeEntries.findOne({
    _id: toObjectId(req.params.knowledgeId),
    workspaceId: workspace._id
  });

  if (!entry) {
    req.flash('error', 'Knowledge entry not found');
    return res.redirect(`/workspaces/${workspace._id}/chatbot/knowledge`);
  }

  res.render('knowledge/edit', {
    workspace,
    active: 'chatbot',
    tabLinks: buildChatbotTabLinks(workspace._id),
    entry: serializeDoc(entry)
  });
}

export async function update(req, res) {
  const { knowledgeEntries } = getCollections();
  const workspace = await getWorkspace(req);
  const { title, body, actionType } = req.body;

  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  const entry = await knowledgeEntries.findOne({
    _id: toObjectId(req.params.knowledgeId),
    workspaceId: workspace._id
  });

  if (!entry) {
    req.flash('error', 'Knowledge entry not found');
    return res.redirect(`/workspaces/${workspace._id}/chatbot/knowledge`);
  }

  const updateDoc = {
    title: String(title || '').trim(),
    body: sanitizeKnowledgeHtml(body),
    updatedAt: new Date()
  };

  if (actionType === 'publish') {
    updateDoc.status = 'published';

    await cleanupKnowledgeAssets(workspace, entry);

    const publishedAssets = await publishKnowledgeEntry({
      workspace,
      knowledgeId: entry._id.toString(),
      title: updateDoc.title,
      body: updateDoc.body
    });

    updateDoc.openaiFileId = publishedAssets.openaiFileId;
    updateDoc.vectorStoreFileId = publishedAssets.vectorStoreFileId;
    updateDoc.openaiImageFileIds = publishedAssets.openaiImageFileIds;
    updateDoc.vectorStoreImageFileIds = publishedAssets.vectorStoreImageFileIds;
  } else if (actionType === 'draft') {
    updateDoc.status = 'draft';
  }

  await knowledgeEntries.updateOne({ _id: entry._id }, { $set: updateDoc });

  req.flash('success', 'Knowledge updated');
  res.redirect(`/workspaces/${workspace._id}/chatbot/knowledge`);
}

export async function destroy(req, res) {
  const { knowledgeEntries } = getCollections();
  const workspace = await getWorkspace(req);

  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  const entry = await knowledgeEntries.findOne({
    _id: toObjectId(req.params.knowledgeId),
    workspaceId: workspace._id
  });

  if (!entry) {
    req.flash('error', 'Knowledge entry not found');
    return res.redirect(`/workspaces/${workspace._id}/chatbot/knowledge`);
  }

  await cleanupKnowledgeAssets(workspace, entry);
  await knowledgeEntries.deleteOne({ _id: entry._id });

  req.flash('success', 'Knowledge deleted');
  res.redirect(`/workspaces/${workspace._id}/chatbot/knowledge`);
}

export async function bulkDestroy(req, res) {
  const { knowledgeEntries } = getCollections();
  const workspace = await getWorkspace(req);

  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  const knowledgeIds = normalizeKnowledgeIds(req.body.ids);

  if (!knowledgeIds.length) {
    req.flash('error', 'No knowledge entries selected');
    return res.redirect(`/workspaces/${workspace._id}/chatbot/knowledge`);
  }

  const entryObjectIds = knowledgeIds.map((id) => toObjectId(id));
  const entries = await knowledgeEntries
    .find({
      _id: { $in: entryObjectIds },
      workspaceId: workspace._id
    })
    .toArray();

  if (!entries.length) {
    req.flash('error', 'No valid knowledge entries found');
    return res.redirect(`/workspaces/${workspace._id}/chatbot/knowledge`);
  }

  for (const entry of entries) {
    await cleanupKnowledgeAssets(workspace, entry);
  }

  await knowledgeEntries.deleteMany({
    _id: { $in: entries.map((entry) => entry._id) },
    workspaceId: workspace._id
  });

  req.flash(
    'success',
    `Deleted ${entries.length} knowledge ${entries.length === 1 ? 'entry' : 'entries'}`
  );
  return res.redirect(`/workspaces/${workspace._id}/chatbot/knowledge`);
}
