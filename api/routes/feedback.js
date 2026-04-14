import { ObjectId } from 'mongodb';
import { resolveWorkspaceAccess } from '../lib/workspace-auth.js';
import { enforceRouteRateLimit, getRouteActorKey } from '../lib/rate-limit.js';

const MAX_CONTENT_LENGTH = 40_000;
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;
const MIN_SECONDS_BETWEEN_SUBMISSIONS = 2;

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
    const contentLength = Number(request.headers['content-length'] || '0');
    if (contentLength > MAX_CONTENT_LENGTH) {
      return reply.code(413).send({
        success: false,
        error: 'Request too large.',
      });
    }

    const access = await resolveWorkspaceAccess(request, fastify.mongoDb);

    if (!access.ok) {
      return reply.code(access.status).send({
        success: false,
        error: access.error,
      });
    }

    const actorKey = getRouteActorKey(request, String(access.workspace?._id), 'feedback:submissions');
    const limit = await enforceRouteRateLimit(fastify.mongoDb, actorKey, {
      collectionName: 'feedback_rate_limits',
      windowMs: WINDOW_MS,
      maxRequestsPerWindow: MAX_REQUESTS_PER_WINDOW,
      minSecondsBetweenRequests: MIN_SECONDS_BETWEEN_SUBMISSIONS,
    });

    if (!limit.allowed) {
      return reply
        .code(429)
        .header('Retry-After', String(limit.retryAfterSeconds))
        .send({
          success: false,
          error: 'Too many requests. Please slow down.',
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
