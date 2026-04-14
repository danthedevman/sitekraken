import { resolveWorkspaceAccess } from "../lib/workspace-auth.js";

function getRequestBaseUrl(request) {
  const forwardedProto = request.headers["x-forwarded-proto"];
  const forwardedHost = request.headers["x-forwarded-host"];

  const protocol = String(
    Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto || request.protocol || "https"
  )
    .split(",")[0]
    .trim();

  const host = String(
    Array.isArray(forwardedHost)
      ? forwardedHost[0]
      : forwardedHost || request.headers.host || request.hostname
  )
    .split(",")[0]
    .trim();

  return `${protocol}://${host}`;
}

function getOriginFromUrl(url, fallbackOrigin) {
  try {
    return new URL(String(url)).origin;
  } catch {
    return fallbackOrigin;
  }
}

function isLocalhostHost(hostname) {
  if (!hostname) return false;

  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]"
  );
}

function getDevBaseUrl(request) {
  const candidate = request.query?.devBaseUrl;

  if (!candidate) {
    return null;
  }

  try {
    const parsed = new URL(String(candidate));
    if (!isLocalhostHost(parsed.hostname)) {
      return null;
    }

    return parsed.origin;
  } catch {
    return null;
  }
}

function buildModulesFromWorkspace(workspace, request) {
  const chatModule = workspace.chatbot || {};
  const analyticsModule = workspace.analytics || {};
  const logsModule = workspace.logs || {};
  const bannersModule = workspace.banners || {};
  const feedbackModule = workspace.feedback || {};
  const allowedDomains = Array.isArray(workspace.allowedDomains)
    ? workspace.allowedDomains
    : [];

  const baseUrl = getDevBaseUrl(request) || getRequestBaseUrl(request);
  const analyticsScriptUrl = analyticsModule.scriptUrl || `${baseUrl}/public/lib/analytics.js`;
  const logsScriptUrl = logsModule.scriptUrl || `${baseUrl}/public/lib/logs.js`;
  const bannersScriptUrl = bannersModule.scriptUrl || `${baseUrl}/public/lib/banners.js`;
  const feedbackScriptUrl = feedbackModule.scriptUrl || `${baseUrl}/public/lib/feedback.js`;
  const analyticsApiUrl = getOriginFromUrl(
    analyticsModule?.config?.apiUrl,
    getOriginFromUrl(analyticsScriptUrl, baseUrl)
  );
  const logsApiUrl = getOriginFromUrl(
    logsModule?.config?.apiUrl,
    getOriginFromUrl(logsScriptUrl, baseUrl)
  );
  const feedbackApiUrl = getOriginFromUrl(
    feedbackModule?.config?.apiUrl,
    getOriginFromUrl(feedbackScriptUrl, baseUrl)
  );

  return [
    {
      ...chatModule,
      name: chatModule.name || "chat",
      config: {
        ...(chatModule.config || {}),
        allowedDomains
      }
    },
    {
      ...analyticsModule,
      name: analyticsModule.name || "analytics",
      scriptUrl: analyticsScriptUrl,
      module:
        typeof analyticsModule.module === "boolean" ? analyticsModule.module : false,
      enabled:
        typeof analyticsModule.enabled === "boolean" ? analyticsModule.enabled : true,
      config: {
        ...(analyticsModule.config || {}),
        allowedDomains,
        apiUrl: analyticsApiUrl
      }
    },
    {
      ...logsModule,
      name: logsModule.name || "logs",
      scriptUrl: logsScriptUrl,
      module:
        typeof logsModule.module === "boolean" ? logsModule.module : false,
      enabled:
        typeof logsModule.enabled === "boolean" ? logsModule.enabled : true,
      config: {
        ...(logsModule.config || {}),
        allowedDomains,
        apiUrl: logsApiUrl
      }
    },
    {
      ...bannersModule,
      name: bannersModule.name || "banners",
      scriptUrl: bannersScriptUrl,
      module:
        typeof bannersModule.module === "boolean" ? bannersModule.module : false,
      enabled:
        typeof bannersModule.enabled === "boolean" ? bannersModule.enabled : true,
      config: {
        ...(bannersModule.config || {}),
        allowedDomains
      }
    },
    {
      ...feedbackModule,
      name: feedbackModule.name || "feedback",
      scriptUrl: feedbackScriptUrl,
      module:
        typeof feedbackModule.module === "boolean" ? feedbackModule.module : false,
      enabled:
        typeof feedbackModule.enabled === "boolean" ? feedbackModule.enabled : true,
      config: {
        ...(feedbackModule.config || {}),
        allowedDomains,
        apiUrl: feedbackApiUrl
      }
    },
  ];
}

export default async function embedRoutes(fastify) {
  fastify.get("/config", async function handler(request, reply) {

    const access = await resolveWorkspaceAccess(request, fastify.mongoDb);

    if (!access.ok) {
      return reply.code(access.status).send({
        success: false,
        error: access.error,
      });
    }

    const { workspace } = access;

    return reply.code(200).send({
      success: true,
      workspaceId: String(workspace._id),
      name: workspace.name,
      allowedDomains: workspace.allowedDomains || [],
      modules: buildModulesFromWorkspace(workspace, request),
    });
  });
}
