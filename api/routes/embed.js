import { resolveWorkspaceAccess } from "../lib/workspace-auth.js";

function buildModulesFromWorkspace(workspace, request) {
  const chatModule = workspace.chatbot || {};
  const analyticsModule = workspace.analytics || {};
  const logsModule = workspace.logs || {};
  const allowedDomains = Array.isArray(workspace.allowedDomains)
    ? workspace.allowedDomains
    : [];

  const baseUrl = `${request.protocol}://${request.hostname}`;

  const userSession = `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

  return [
    {
      ...chatModule,
      name: chatModule.name || "chat",
      config: {
        ...(chatModule.config || {}),
        allowedDomains,
        userSession
      }
    },
    {
      ...analyticsModule,
      name: analyticsModule.name || "analytics",
      scriptUrl: analyticsModule.scriptUrl || `${baseUrl}/public/lib/analytics.js`,
      module:
        typeof analyticsModule.module === "boolean" ? analyticsModule.module : false,
      enabled:
        typeof analyticsModule.enabled === "boolean" ? analyticsModule.enabled : true,
      config: {
        ...(analyticsModule.config || {}),
        allowedDomains,
        apiUrl: baseUrl,
        userSession
      }
    },
    {
      ...logsModule,
      name: logsModule.name || "logs",
      scriptUrl: logsModule.scriptUrl || `${baseUrl}/public/lib/logs.js`,
      module:
        typeof logsModule.module === "boolean" ? logsModule.module : false,
      enabled:
        typeof logsModule.enabled === "boolean" ? logsModule.enabled : true,
      config: {
        ...(logsModule.config || {}),
        allowedDomains,
        apiUrl: baseUrl,
        userSession
      }
    }
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