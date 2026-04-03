import { marked } from 'marked';
import { getCollections } from '../config/db.js';
import {
  buildKnowledgeMarkdown,
  buildKnowledgeFilename
} from '../services/markdownService.js';
import {
  uploadFileFromContent,
  addFileToVectorStore,
  removeFileFromVectorStore,
  deleteOpenAIFile
} from '../services/openaiService.js';
import { findOwnedWorkspace } from '../services/workspaceService.js';
import { serializeDoc, serializeDocs, toObjectId } from '../services/dbHelpers.js';

async function getWorkspace(req) {
  return findOwnedWorkspace(req.user._id, req.params.workspaceId);
}

async function cleanupKnowledgeAssets(workspace, entry) {
  if (entry?.vectorStoreFileId) {
    try {
      await removeFileFromVectorStore(
        workspace.openaiVectorStoreId,
        entry.vectorStoreFileId
      );
    } catch (error) {
      console.warn(
        'Previous vector store file deletion failed:',
        error.message
      );
    }
  }

  if (entry?.openaiFileId) {
    try {
      await deleteOpenAIFile(entry.openaiFileId);
    } catch (error) {
      console.warn('Previous OpenAI file deletion failed:', error.message);
    }
  }
}

async function publishKnowledgeEntry({ workspace, knowledgeId, title, body }) {
  const markdown = buildKnowledgeMarkdown({ title, body });
  const filename = buildKnowledgeFilename({
    title,
    workspaceId: workspace._id,
    knowledgeId
  });

  const uploaded = await uploadFileFromContent(filename, markdown);
  const vectorStoreFile = await addFileToVectorStore(
    workspace.openaiVectorStoreId,
    uploaded.id
  );

  return {
    openaiFileId: uploaded.id,
    vectorStoreFileId: vectorStoreFile?.id || null
  };
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
    entries: serializeDocs(docs)
  });
}

export async function newForm(req, res) {
  const workspace = await getWorkspace(req);

  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  res.render('knowledge/new', { workspace });
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

  const doc = {
    workspaceId: workspace._id,
    title: String(title || '').trim(),
    body: String(body || '').trim(),
    status: actionType === 'publish' ? 'published' : 'draft',
    openaiFileId: null,
    vectorStoreFileId: null,
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
          updatedAt: new Date()
        }
      }
    );
  }

  req.flash(
    'success',
    `Knowledge ${actionType === 'publish' ? 'published' : 'saved as draft'}`
  );
  res.redirect(`/workspaces/${workspace._id}/knowledge`);
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
    return res.redirect(`/workspaces/${workspace._id}/knowledge`);
  }

  res.render('knowledge/show', {
    workspace,
    entry: serializeDoc(entry),
    html: marked(entry.body)
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
    return res.redirect(`/workspaces/${workspace._id}/knowledge`);
  }

  res.render('knowledge/edit', {
    workspace,
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
    return res.redirect(`/workspaces/${workspace._id}/knowledge`);
  }

  const updateDoc = {
    title: String(title || '').trim(),
    body: String(body || '').trim(),
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
  } else if (actionType === 'draft') {
    updateDoc.status = 'draft';
  }

  await knowledgeEntries.updateOne(
    { _id: entry._id },
    { $set: updateDoc }
  );

  req.flash('success', 'Knowledge updated');
  res.redirect(`/workspaces/${workspace._id}/knowledge`);
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
    return res.redirect(`/workspaces/${workspace._id}/knowledge`);
  }

  await cleanupKnowledgeAssets(workspace, entry);
  await knowledgeEntries.deleteOne({ _id: entry._id });

  req.flash('success', 'Knowledge deleted');
  res.redirect(`/workspaces/${workspace._id}/knowledge`);
}