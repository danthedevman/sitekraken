import { marked } from 'marked';
import { getCollections } from '../config/db.js';
import { saveKnowledgeAsMarkdown } from '../services/markdownService.js';
import { uploadFile, addFileToVectorStore, deleteOpenAIFile } from '../services/openaiService.js';
import { findOwnedWorkspace } from '../services/workspaceService.js';
import { serializeDoc, serializeDocs, toObjectId } from '../services/dbHelpers.js';

async function getWorkspace(req) {
  return findOwnedWorkspace(req.user._id, req.params.workspaceId);
}

export async function index(req, res) {
  const { knowledgeEntries } = getCollections();
  const workspace = await getWorkspace(req);
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
  res.render('knowledge/new', { workspace });
}

export async function create(req, res) {
  const { knowledgeEntries } = getCollections();
  const workspace = await getWorkspace(req);
  const { title, body, actionType } = req.body;
  const now = new Date();

  const doc = {
    workspaceId: workspace._id,
    title,
    body,
    status: actionType === 'publish' ? 'published' : 'draft',
    openaiFileId: null,
    createdAt: now,
    updatedAt: now
  };

  const result = await knowledgeEntries.insertOne(doc);
  const entryId = result.insertedId.toString();

  if (actionType === 'publish') {
    const mdPath = saveKnowledgeAsMarkdown({
      title,
      body,
      workspaceId: workspace._id,
      knowledgeId: entryId
    });

    const uploaded = await uploadFile(mdPath);
    await addFileToVectorStore(workspace.openaiVectorStoreId, uploaded.id);

    await knowledgeEntries.updateOne(
      { _id: result.insertedId },
      {
        $set: {
          openaiFileId: uploaded.id,
          updatedAt: new Date()
        }
      }
    );
  }

  req.flash('success', `Knowledge ${actionType === 'publish' ? 'published' : 'saved as draft'}`);
  res.redirect(`/workspaces/${workspace._id}/knowledge`);
}

export async function show(req, res) {
  const { knowledgeEntries } = getCollections();
  const workspace = await getWorkspace(req);

  const entry = await knowledgeEntries.findOne({
    _id: toObjectId(req.params.knowledgeId),
    workspaceId: workspace._id
  });

  if (!entry) throw new Error('Knowledge entry not found');

  res.render('knowledge/show', {
    workspace,
    entry: serializeDoc(entry),
    html: marked(entry.body)
  });
}

export async function editForm(req, res) {
  const { knowledgeEntries } = getCollections();
  const workspace = await getWorkspace(req);

  const entry = await knowledgeEntries.findOne({
    _id: toObjectId(req.params.knowledgeId),
    workspaceId: workspace._id
  });

  if (!entry) throw new Error('Knowledge entry not found');

  res.render('knowledge/edit', {
    workspace,
    entry: serializeDoc(entry)
  });
}

export async function update(req, res) {
  const { knowledgeEntries } = getCollections();
  const workspace = await getWorkspace(req);
  const { title, body, actionType } = req.body;

  const entry = await knowledgeEntries.findOne({
    _id: toObjectId(req.params.knowledgeId),
    workspaceId: workspace._id
  });

  if (!entry) throw new Error('Knowledge entry not found');

  const updateDoc = {
    title,
    body,
    updatedAt: new Date()
  };

  if (actionType === 'publish') {
    updateDoc.status = 'published';

    if (entry.openaiFileId) {
      try {
        await deleteOpenAIFile(entry.openaiFileId);
      } catch (error) {
        console.warn('Previous OpenAI file deletion failed:', error.message);
      }
    }

    const mdPath = saveKnowledgeAsMarkdown({
      title,
      body,
      workspaceId: workspace._id,
      knowledgeId: entry._id.toString()
    });

    const uploaded = await uploadFile(mdPath);
    await addFileToVectorStore(workspace.openaiVectorStoreId, uploaded.id);
    updateDoc.openaiFileId = uploaded.id;
  }

  await knowledgeEntries.updateOne(
    { _id: entry._id },
    { $set: updateDoc }
  );

  req.flash('success', 'Knowledge updated');
  res.redirect(`/workspaces/${workspace._id}/knowledge`);
}
