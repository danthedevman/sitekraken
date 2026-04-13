import { ObjectId } from 'mongodb';
import { resolveWorkspaceAccess } from '../lib/workspace-auth.js';

function cleanString(value, max = 600) {
  return String(value || '').trim().slice(0, max);
}

function normalizeFieldType(value) {
  const type = cleanString(value, 30).toLowerCase();
  return ['text', 'multiline', 'select', 'email'].includes(type) ? type : 'text';
}

function validateField(field, value) {
  const type = normalizeFieldType(field?.type);
  const required = field?.required === true;
  const trimmedValue = cleanString(value, 2000);

  if (required && !trimmedValue) return 'This field is required.';
  if (!trimmedValue) return null;

  if (type === 'email') {
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedValue);
    if (!isEmail) return 'Please provide a valid email.';
  }

  if (type === 'select') {
    const options = Array.isArray(field?.options) ? field.options.map((item) => cleanString(item, 120)) : [];
    if (options.length && !options.includes(trimmedValue)) {
      return 'Please select a valid option.';
    }
  }

  return null;
}

export default async function feedbackRoutes(fastify) {
  fastify.post('/submissions', async function handler(request, reply) {
    const access = await resolveWorkspaceAccess(request, fastify.mongoDb);

    if (!access.ok) {
      return reply.code(access.status).send({
        success: false,
        error: access.error,
      });
    }

    const workspace = access.workspace;

    if (workspace?.feedback?.enabled === false) {
      return reply.code(403).send({
        success: false,
        error: 'Feedback is disabled for this workspace.',
      });
    }

    const payload = request.body && typeof request.body === 'object' ? request.body : {};
    const answers = payload.answers && typeof payload.answers === 'object' ? payload.answers : {};
    const fields = Array.isArray(workspace?.feedback?.config?.fields) ? workspace.feedback.config.fields : [];

    if (!fields.length) {
      return reply.code(400).send({
        success: false,
        error: 'Feedback form is not configured.',
      });
    }

    const errors = {};
    const normalizedPayload = {};

    for (const field of fields) {
      const key = cleanString(field?.id, 80);
      if (!key) continue;

      const answer = answers[key];
      const message = validateField(field, answer);
      if (message) {
        errors[key] = message;
      }

      normalizedPayload[key] = cleanString(answer, 2000);
    }

    if (Object.keys(errors).length) {
      return reply.code(422).send({
        success: false,
        errors,
      });
    }

    await fastify.mongoDb.collection('website_feedback_submissions').insertOne({
      workspaceId: workspace._id instanceof ObjectId ? workspace._id : new ObjectId(workspace._id),
      workspaceKey: String(workspace._id),
      payload: normalizedPayload,
      pageUrl: cleanString(payload.pageUrl || request.headers.referer || '', 1200),
      userAgent: cleanString(request.headers['user-agent'] || '', 500),
      createdAt: new Date(),
    });

    return reply.code(201).send({
      success: true,
      confirmationTitle: cleanString(workspace?.feedback?.config?.confirmationTitle || 'Thanks for your feedback', 120),
      confirmationMessage: cleanString(workspace?.feedback?.config?.confirmationMessage || 'Your response has been submitted.', 280),
    });
  });
}
