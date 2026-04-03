import { getCollections } from '../config/db.js';
import { defaultChatbotConfig } from '../models/defaults.js';
import { createVectorStore } from '../services/openaiService.js';
import { listOwnedWorkspaces, findOwnedWorkspace } from '../services/workspaceService.js';

export async function index(req, res) {
  const workspaces = await listOwnedWorkspaces(req.user._id);
  res.render('workspaces/index', { workspaces });
}

export function newForm(req, res) {
  res.render('workspaces/new');
}

export async function create(req, res) {
  const { workspaces, chatbotConfigs } = getCollections();
  const { name, description } = req.body;

  const vectorStore = await createVectorStore(name);

  const workspaceDoc = {
    name,
    description: description || '',
    ownerId: req.user._id,
    openaiVectorStoreId: vectorStore.id,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const result = await workspaces.insertOne(workspaceDoc);
  const workspaceId = result.insertedId.toString();

  await chatbotConfigs.insertOne(defaultChatbotConfig(workspaceId));

  req.flash('success', 'Workspace created');
  res.redirect(`/workspaces/${workspaceId}`);
}

export async function show(req, res) {
  const workspace = await findOwnedWorkspace(req.user._id, req.params.id);
  res.render('workspaces/show', { workspace });
}
