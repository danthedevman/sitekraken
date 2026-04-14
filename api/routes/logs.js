import { ObjectId } from "mongodb";
import { resolveWorkspaceAccess } from "../lib/workspace-auth.js";
import { enforceRouteRateLimit, getRouteActorKey } from "../lib/rate-limit.js";

const MAX_CONTENT_LENGTH = 180_000;
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 60;

const ALLOWED_LEVELS = new Set(["debug", "info", "warn", "error", "fatal"]);
const ALLOWED_TYPES = new Set([
  "library_loaded",
  "page_view",
  "error",
  "unhandled_rejection",
  "console_error",
  "manual_log"
]);

function cleanString(value, maxLength = 500) {
  const str = String(value || "").trim();
  if (!str) return "";
  return str.slice(0, maxLength);
}

function normalizeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.entries(value).reduce((acc, [key, raw]) => {
    const safeKey = cleanString(key, 80);
    if (!safeKey) return acc;

    if (raw == null || ["string", "number", "boolean"].includes(typeof raw)) {
      acc[safeKey] = raw;
      return acc;
    }

    acc[safeKey] = cleanString(JSON.stringify(raw), 1500);
    return acc;
  }, {});
}

function normalizeLog(raw = {}, context = {}) {
  const level = cleanString(raw.level || "info", 20).toLowerCase();
  if (!ALLOWED_LEVELS.has(level)) return null;

  const type = cleanString(raw.type || "manual_log", 40).toLowerCase();
  if (!ALLOWED_TYPES.has(type)) return null;

  return {
    level,
    type,
    message: cleanString(raw.message || "", 2000),
    stack: cleanString(raw.stack || "", 6000),
    pageUrl: cleanString(raw.pageUrl || context.pageUrl || "", 1200),
    pathname: cleanString(raw.pathname || context.pathname || "", 800),
    title: cleanString(raw.title || context.title || "", 250),
    referrer: cleanString(raw.referrer || context.referrer || "", 1200),
    host: cleanString(raw.host || context.host || "", 300),
    source: cleanString(raw.source || "embed", 50),
    userAgent: cleanString(raw.userAgent || context.userAgent || "", 600),
    language: cleanString(raw.language || context.language || "", 40),
    ts: raw.ts ? new Date(raw.ts) : new Date(),
    metadata: normalizeMetadata(raw.metadata)
  };
}

export default async function logsRoutes(fastify) {
  fastify.post("/events", async function handler(request, reply) {
    const contentLength = Number(request.headers["content-length"] || "0");
    if (contentLength > MAX_CONTENT_LENGTH) {
      return reply.code(413).send({
        success: false,
        error: "Request too large."
      });
    }

    const access = await resolveWorkspaceAccess(request, fastify.mongoDb);

    if (!access.ok) {
      return reply.code(access.status).send({
        success: false,
        error: access.error
      });
    }

    const actorKey = getRouteActorKey(request, String(access.workspace?._id), "logs:events");
    const limit = await enforceRouteRateLimit(fastify.mongoDb, actorKey, {
      collectionName: "logs_rate_limits",
      windowMs: WINDOW_MS,
      maxRequestsPerWindow: MAX_REQUESTS_PER_WINDOW
    });

    if (!limit.allowed) {
      return reply
        .code(429)
        .header("Retry-After", String(limit.retryAfterSeconds))
        .send({
          success: false,
          error: "Too many requests. Please slow down."
        });
    }

    const payload = request.body || {};
    const events = Array.isArray(payload.events) ? payload.events : [];

    if (!events.length) {
      return reply.code(400).send({
        success: false,
        error: "Expected a non-empty events array."
      });
    }

    const { workspace } = access;

    if (workspace?.logs?.enabled === false) {
      return reply.code(403).send({
        success: false,
        error: "Logs are disabled for this workspace."
      });
    }

    const now = new Date();
    const context = {
      pageUrl: payload.pageUrl,
      pathname: payload.pathname,
      title: payload.title,
      referrer: payload.referrer,
      host: payload.host || request.query?.host || "",
      userAgent: request.headers["user-agent"],
      language: request.headers["accept-language"],
      
    };

    const normalized = events
      .map((event) => normalizeLog(event, context))
      .filter(Boolean)
      .slice(0, 100)
      .map((event) => ({
        ...event,
        workspaceId: workspace._id instanceof ObjectId ? workspace._id : new ObjectId(workspace._id),
        workspaceKey: String(workspace._id),
        origin: cleanString(access.origin || "", 300),
        createdAt: now
      }));

    if (!normalized.length) {
      return reply.code(400).send({
        success: false,
        error: "No valid logs were provided."
      });
    }

    await fastify.mongoDb.collection("website_logs").insertMany(normalized);

    return reply.code(202).send({
      success: true,
      accepted: normalized.length
    });
  });
}
