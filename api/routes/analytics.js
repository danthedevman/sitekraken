import { ObjectId } from "mongodb";
import { resolveWorkspaceAccess } from "../lib/workspace-auth.js";

const ALLOWED_EVENT_TYPES = new Set([
  "page_view",
  "session_start",
  "click",
  "link_click",
  "button_click",
  "scroll_depth",
  "heartbeat"
]);

function cleanString(value, maxLength = 500) {
  const str = String(value || "").trim();
  if (!str) return "";
  return str.slice(0, maxLength);
}

function toFiniteNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeEvent(rawEvent = {}, context = {}) {
  const type = cleanString(rawEvent.type || "", 40).toLowerCase();
  if (!ALLOWED_EVENT_TYPES.has(type)) return null;

  const pageUrl = cleanString(rawEvent.pageUrl || context.pageUrl || "", 1200);
  const pathname = cleanString(rawEvent.pathname || context.pathname || "", 800);
  const title = cleanString(rawEvent.title || context.title || "", 250);
  const referrer = cleanString(rawEvent.referrer || context.referrer || "", 1200);
  const targetText = cleanString(rawEvent.targetText || "", 200);
  const targetId = cleanString(rawEvent.targetId || "", 200);
  const targetHref = cleanString(rawEvent.targetHref || "", 1200);
  const targetTag = cleanString(rawEvent.targetTag || "", 50).toLowerCase();
  const targetRole = cleanString(rawEvent.targetRole || "", 100).toLowerCase();

  const scrollPercent = toFiniteNumber(rawEvent.scrollPercent, null);
  const viewportW = toFiniteNumber(rawEvent.viewportW, null);
  const viewportH = toFiniteNumber(rawEvent.viewportH, null);
  const tzOffsetMinutes = toFiniteNumber(rawEvent.tzOffsetMinutes, null);

  return {
    type,
    ts: rawEvent.ts ? new Date(rawEvent.ts) : new Date(),
    pageUrl,
    pathname,
    title,
    referrer,
    targetText,
    targetId,
    targetHref,
    targetTag,
    targetRole,
    scrollPercent,
    viewportW,
    viewportH,
    source: cleanString(rawEvent.source || "embed", 40),
    userAgent: cleanString(rawEvent.userAgent || context.userAgent || "", 600),
    language: cleanString(rawEvent.language || context.language || "", 40),
    tzOffsetMinutes,
    metadata:
      rawEvent.metadata && typeof rawEvent.metadata === "object"
        ? rawEvent.metadata
        : {}
  };
}

export default async function analyticsRoutes(fastify) {
  fastify.post("/events", async function handler(request, reply) {
    const access = await resolveWorkspaceAccess(request, fastify.mongoDb);

    if (!access.ok) {
      return reply.code(access.status).send({
        success: false,
        error: access.error
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

    const now = new Date();
    const { workspace } = access;

    if (workspace?.analytics?.enabled === false) {
      return reply.code(403).send({
        success: false,
        error: "Analytics is disabled for this workspace."
      });
    }

    const context = {
      pageUrl: payload.pageUrl,
      pathname: payload.pathname,
      title: payload.title,
      referrer: payload.referrer,
      userAgent: request.headers["user-agent"],
      language: request.headers["accept-language"]
    };

    const normalized = events
      .map((event) => normalizeEvent(event, context))
      .filter(Boolean)
      .slice(0, 100)
      .map((event) => ({
        ...event,
        workspaceId: workspace._id instanceof ObjectId ? workspace._id : new ObjectId(workspace._id),
        workspaceKey: String(workspace._id),
        host: cleanString(payload.host || request.query?.host || "", 300),
        origin: cleanString(access.origin || "", 300),
        createdAt: now
      }));

    if (!normalized.length) {
      return reply.code(400).send({
        success: false,
        error: "No valid analytics events were provided."
      });
    }

    await fastify.mongoDb.collection("website_analytics_events").insertMany(normalized);

    return reply.code(202).send({
      success: true,
      accepted: normalized.length
    });
  });
}
