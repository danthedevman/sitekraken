import crypto from "node:crypto";

export async function findWorkspaceByApiKey(db, apiKey) {
  if (!apiKey || typeof apiKey !== "string") return null;

  return db.collection("workspaces").findOne({
    apiKey: apiKey.trim(),
  });
}

export function createWorkspaceApiKey() {
  return `ws_${crypto.randomBytes(24).toString("hex")}`;
}

export function getApiKeyFromRequest(request) {
  const headerKey = request.headers["x-api-key"];
  if (headerKey && typeof headerKey === "string") return headerKey.trim();

  const queryKey = request.query?.apiKey || request.query?.key;
  if (queryKey && typeof queryKey === "string") return queryKey.trim();

  const bodyKey = request.body?.apiKey;
  if (bodyKey && typeof bodyKey === "string") return bodyKey.trim();

  return null;
}

export function getRequestOrigin(request) {
  const origin = request.headers.origin;
  if (origin && typeof origin === "string") {
    return origin.trim();
  }

  const referer = request.headers.referer;
  if (referer && typeof referer === "string") {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }

  return null;
}

export function normalizeOrigin(value) {
  if (!value || typeof value !== "string") return null;

  try {
    if (value.startsWith("http://") || value.startsWith("https://")) {
      return new URL(value).origin.toLowerCase();
    }

    return new URL(`https://${value}`).origin.toLowerCase();
  } catch {
    return null;
  }
}

export function isOriginAllowed(origin, allowedDomains = []) {
  const normalizedOrigin = normalizeOrigin(origin);
  if (!normalizedOrigin) return false;

  const normalizedAllowedDomains = allowedDomains
    .map(normalizeOrigin)
    .filter(Boolean);

  return normalizedAllowedDomains.includes(normalizedOrigin);
}

export async function resolveWorkspaceAccess(request, db) {
  const apiKey = getApiKeyFromRequest(request);
  if (!apiKey) {
    return { ok: false, status: 401, error: "Missing API key." };
  }

  const workspace = await findWorkspaceByApiKey(db, apiKey);
  if (!workspace) {
    return { ok: false, status: 401, error: "Invalid API key." };
  }

  const origin = getRequestOrigin(request);
  const allowedDomains = Array.isArray(workspace.allowedDomains)
    ? workspace.allowedDomains
    : [];

  if (!isOriginAllowed(origin, allowedDomains)) {
    return { ok: false, status: 403, error: "Origin not allowed." };
  }

  return {
    ok: true,
    apiKey,
    origin,
    workspace,
  };
}