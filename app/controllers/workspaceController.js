import { getCollections } from '../config/db.js';
import {
  defaultWorkspaceChatbot,
  normalizeAllowedDomainsInput
} from '../models/defaults.js';
import { createVectorStore } from '../services/openaiService.js';
import {
  listOwnedWorkspaces,
  findOwnedWorkspace,
  trackRecentWorkspaceVisit
} from '../services/workspaceService.js';

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
  const workspace = await findOwnedWorkspace(req.user._id, req.params.id);
  trackRecentWorkspaceVisit(req, workspace);

  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  res.render('workspaces/show', { workspace, active: "dashboard" });
}
