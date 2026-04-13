import { ObjectId } from 'mongodb';
import { resolveWorkspaceAccess } from '../lib/workspace-auth.js';

const ALLOWED_TYPES = new Set(['text', 'multiline', 'select', 'email']);

function cleanString(value, maxLength = 1000) {
  return String(value || '').trim().slice(0, maxLength);
}

function validateSubmission(data, fields) {
  const errors = [];
  const normalized = {};

  const entries = data && typeof data === 'object' && !Array.isArray(data) ? data : {};

  for (const field of fields) {
    if (!field || !ALLOWED_TYPES.has(String(field.type || ''))) continue;

    const key = cleanString(field.key, 60);
    if (!key) continue;

    const value = cleanString(entries[key], 2000);

    if (field.required && !value) {
      errors.push(`${field.label || key} is required.`);
      continue;
    }

    if (field.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      errors.push(`${field.label || key} must be a valid email.`);
      continue;
    }

    if (field.type === 'select' && value) {
      const options = Array.isArray(field.options) ? field.options.map((x) => cleanString(x, 80)) : [];
      if (options.length && !options.includes(value)) {
        errors.push(`${field.label || key} must match one of the configured options.`);
        continue;
      }
    }

    normalized[key] = value;
  }

  return { errors, normalized };
}

export default async function feedbackRoutes(fastify) {
  fastify.post('/submissions', async function handler(request, reply) {
    const access = await resolveWorkspaceAccess(request, fastify.mongoDb);

    if (!access.ok) {
      return reply.code(access.status).send({ success: false, error: access.error });
    }

    const { workspace } = access;
    if (workspace?.feedback?.enabled === false) {
      return reply.code(403).send({ success: false, error: 'Feedback is disabled for this workspace.' });
    }

    const fields = Array.isArray(workspace?.feedback?.config?.fields) ? workspace.feedback.config.fields : [];
    const payload = request.body || {};
    const { errors, normalized } = validateSubmission(payload.data, fields);

    if (errors.length) {
      return reply.code(400).send({ success: false, error: errors[0], errors });
    }

    await fastify.mongoDb.collection('feedback_submissions').insertOne({
      workspaceId: workspace._id instanceof ObjectId ? workspace._id : new ObjectId(workspace._id),
      workspaceKey: String(workspace._id),
      data: normalized,
      pageUrl: cleanString(payload.pageUrl || '', 1200),
      pathname: cleanString(payload.pathname || '', 800),
      title: cleanString(payload.title || '', 200),
      host: cleanString(payload.host || request.query?.host || '', 300),
      userAgent: cleanString(request.headers['user-agent'] || '', 700),
      origin: cleanString(access.origin || '', 300),
      createdAt: new Date()
    });

    return reply.code(201).send({
      success: true,
      confirmation: {
        title: workspace?.feedback?.config?.successTitle || 'Thanks for your feedback!',
        message: workspace?.feedback?.config?.successMessage || 'Your submission has been received.'
      }
    });
  });
}
