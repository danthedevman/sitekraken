import { resolveWorkspaceAccess } from "../lib/workspace-auth.js";

function buildModulesFromWorkspace(workspace) {
  const chatModule = workspace.chatbot || {};
  const allowedDomains = Array.isArray(workspace.allowedDomains)
    ? workspace.allowedDomains
    : [];

  return [
    {
      ...chatModule,
      config: {
        ...(chatModule.config || {}),
        allowedDomains
      }
    }
    /*{
      name: "analytics",
      enabled: false,
      scriptUrl: "http://localhost:4001/analytics.js",
      module: true,
      config: {},
    },*/
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
      modules: buildModulesFromWorkspace(workspace),
    });
  });
}