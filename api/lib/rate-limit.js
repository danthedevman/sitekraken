import crypto from "node:crypto";

export const RATE_LIMIT_REASONS = {
  RATE_LIMIT: "rate_limit",
  COOLDOWN: "cooldown"
};

function getClientIp(request) {
  const xff = request.headers["x-forwarded-for"];
  if (xff) {
    return String(xff).split(",")[0].trim();
  }

  const realIp = request.headers["x-real-ip"];
  if (realIp) {
    return String(realIp).trim();
  }

  return request.ip || "unknown";
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function getRouteActorKey(request, workspaceId, routeKey) {
  const ip = getClientIp(request);
  return sha256(`${routeKey}:${workspaceId}:${ip}`);
}

export async function enforceRouteRateLimit(db, actorKey, options = {}) {
  const {
    collectionName = "api_route_rate_limits",
    windowMs = 60 * 1000,
    maxRequestsPerWindow = 30,
    minSecondsBetweenRequests = 0
  } = options;
  const collection = db.collection(collectionName);
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);
  const expiresAt = new Date(now.getTime() + windowMs);

  const result = await collection.findOneAndUpdate(
    { actorKey },
    [
      {
        $set: {
          actorKey,
          updatedAt: now,
          expiresAt,
          requestsInWindow: {
            $cond: [
              { $lt: ["$windowStartedAt", windowStart] },
              1,
              { $add: [{ $ifNull: ["$requestsInWindow", 0] }, 1] }
            ]
          },
          windowStartedAt: {
            $cond: [
              { $lt: ["$windowStartedAt", windowStart] },
              now,
              "$windowStartedAt"
            ]
          },
          lastRequestAt: now,
          secondsSinceLastRequest: {
            $cond: [
              { $ifNull: ["$lastRequestAt", false] },
              {
                $divide: [{ $subtract: [now, "$lastRequestAt"] }, 1000]
              },
              999999
            ]
          }
        }
      }
    ],
    {
      upsert: true,
      returnDocument: "after"
    }
  );

  const doc = result?.value || result;
  const tooManyRequests = doc.requestsInWindow > maxRequestsPerWindow;
  const tooFast =
    minSecondsBetweenRequests > 0 &&
    typeof doc.secondsSinceLastRequest === "number" &&
    doc.secondsSinceLastRequest < minSecondsBetweenRequests;

  if (tooManyRequests || tooFast) {
    const retryAfterSeconds = tooFast
      ? Math.ceil(minSecondsBetweenRequests - doc.secondsSinceLastRequest)
      : Math.ceil(windowMs / 1000);

    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
      reason: tooFast ? RATE_LIMIT_REASONS.COOLDOWN : RATE_LIMIT_REASONS.RATE_LIMIT
    };
  }

  return { allowed: true };
}
