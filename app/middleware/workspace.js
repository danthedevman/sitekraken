import { findOwnedWorkspace, trackRecentWorkspaceVisit } from '../services/workspaceService.js';

export function loadWorkspace(paramName = 'workspaceId') {
  return async function workspaceLoader(req, res, next) {
    const workspaceId = req.params?.[paramName];

    if (!workspaceId) {
      req.workspace = null;
      return next();
    }

    const workspace = await findOwnedWorkspace(req.user?._id, workspaceId);
    req.workspace = workspace;

    if (workspace) {
      trackRecentWorkspaceVisit(req, workspace);
    }

    return next();
  };
}
