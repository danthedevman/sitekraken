import { getCollections } from '../config/db.js';
import { defaultChatbotConfig } from '../models/defaults.js';
import { findOwnedWorkspace } from '../services/workspaceService.js';
import { serializeDoc } from '../services/dbHelpers.js';

async function getWorkspace(req) {
  return findOwnedWorkspace(req.user._id, req.params.workspaceId);
}

function buildEmbedScriptTag(chatbot) {
  return `<script src="${chatbot.scriptUrl}" data-api-key="${chatbot.apiKey}"></script>`;
}

export async function index(req, res) {
  const { chatbotConfigs } = getCollections();
  const workspace = await getWorkspace(req);

  let chatbot = await chatbotConfigs.findOne({ workspaceId: workspace._id });

  if (!chatbot) {
    const doc = defaultChatbotConfig(workspace._id);
    await chatbotConfigs.insertOne(doc);
    chatbot = doc;
  }

  chatbot = serializeDoc(chatbot);

  res.render('chatbot/index', {
    workspace,
    chatbot,
    embedScriptTag: buildEmbedScriptTag(chatbot)
  });
}

export async function update(req, res) {
  const { chatbotConfigs } = getCollections();
  const workspace = await getWorkspace(req);

  let chatbot = await chatbotConfigs.findOne({ workspaceId: workspace._id });

  if (!chatbot) {
    const doc = defaultChatbotConfig(workspace._id);
    await chatbotConfigs.insertOne(doc);
    chatbot = doc;
  }

  const quickMessages = (req.body.quickMessages || '')
    .split('')
    .map((x) => x.trim())
    .filter(Boolean);

  const footerLinks = (req.body.footerLinks || '')
    .split('')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [label, href] = line.split('|');
      return { label: label?.trim(), href: href?.trim() };
    })
    .filter((item) => item.label && item.href);

  const allowedDomains = (req.body.allowedDomains || '')
    .split('')
    .map((x) => x.trim().replace(/^https?:\/\//, '').replace(/\/$/, ''))
    .filter(Boolean);

  await chatbotConfigs.updateOne(
    { workspaceId: workspace._id },
    {
      $set: {
        name: req.body.name || 'chat',
        enabled: req.body.enabled === 'on',
        scriptUrl: req.body.scriptUrl,
        module: req.body.module === 'on',
        allowedDomains,
        config: {
          title: req.body.title,
          subtitle: req.body.subtitle,
          initialMessage: req.body.initialMessage,
          quickMessages,
          footerLinks
        },
        updatedAt: new Date()
      }
    }
  );

  req.flash('success', 'Chatbot config updated');
  res.redirect(`/workspaces/${workspace._id}/chatbot`);
}

export async function regenerateApiKey(req, res) {
  const { chatbotConfigs } = getCollections();
  const workspace = await getWorkspace(req);
  const newApiKey = crypto.randomUUID().replace(/-/g, '');

  await chatbotConfigs.updateOne(
    { workspaceId: workspace._id },
    {
      $set: {
        apiKey: newApiKey,
        updatedAt: new Date()
      }
    }
  );

  req.flash('success', 'Embed API key regenerated');
  res.redirect(`/workspaces/${workspace._id}/chatbot`);
}
