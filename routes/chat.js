import crypto from "node:crypto";

const MAX_MESSAGE_LENGTH = 2000;
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;
const MIN_SECONDS_BETWEEN_MESSAGES = 2;
const MAX_THREAD_ID_LENGTH = 200;

const SAFE_FALLBACK_REPLY =
  "I’m sorry, I don’t have that information. Is there something else I can help you with.";

const UNSUPPORTED_ACTION_REPLY =
  "I’m sorry, I can’t do that here. Is there something else I can help you with.";

function getVectorStoreIds() {
  return (process.env.OPENAI_VECTOR_STORE_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function safeThreadId(threadId) {
  if (!threadId || typeof threadId !== "string") {
    return crypto.randomUUID();
  }
  return threadId.slice(0, MAX_THREAD_ID_LENGTH);
}

function extractOutputText(response) {
  if (response.output_text && response.output_text.trim()) {
    return response.output_text.trim();
  }

  if (Array.isArray(response.output)) {
    const textParts = [];

    for (const item of response.output) {
      if (item.type === "message" && Array.isArray(item.content)) {
        for (const contentItem of item.content) {
          if (contentItem.type === "output_text" && contentItem.text) {
            textParts.push(contentItem.text);
          }
        }
      }
    }

    if (textParts.length) {
      return textParts.join("\n").trim();
    }
  }

  return "Sorry, I couldn't generate a response.";
}

function containsSourceLeak(text) {
  if (!text) return false;

  return [
    /\bfile(s)?\b/i,
    /\bfilename(s)?\b/i,
    /\bdocument(s)?\b/i,
    /\bpdf(s)?\b/i,
    /\battachment(s)?\b/i,
    /\bupload(ed|s)?\b/i,
    /\bsource(s)?\b/i,
    /\bcitation(s)?\b/i,
    /\bretriev(ed|al|ing)\b/i,
    /\bvector store(s)?\b/i,
    /\bknowledge base\b/i,
    /\bfile search\b/i,
    /\binternal tool(s)?\b/i,
    /\baccording to\b/i,
    /\bthe file says\b/i,
    /\bthe document says\b/i,
    /\buploaded file\b/i
  ].some((pattern) => pattern.test(text));
}

function containsUnsupportedCapabilityOffer(text) {
  if (!text) return false;

  return [
    /\bi can (send|share|attach|upload|provide|deliver)\b/i,
    /\bprovide .* for download\b/i,
    /\bavailable for download\b/i,
    /\blet me know if you'd like me to\b/i,
    /\bi can give you\b/i,
    /\bi can email\b/i,
    /\bi can forward\b/i,
    /\bi can download\b/i,
    /\bsend it to you directly\b/i
  ].some((pattern) => pattern.test(text));
}

async function rewriteForCustomerSafeOutput(openai, question, answer) {
  if (!answer) return answer;

  const rewriteInstructions = `
You are a response rewriter for a customer-facing assistant.

Rules:
- Never mention files, file names, document names, titles, PDFs, resumes, attachments, uploads, sources, citations, retrieval, search results, vector stores, internal tools, or knowledge base structure.
- Never say phrases like "according to the file", "the document says", "the uploaded file mentions", or similar.
- Never imply system capabilities beyond returning plain text in chat.
- Never offer to send, share, attach, upload, provide for download, or deliver files or assets.
- Remove any unsupported offer, invitation, or call to action.
- Preserve the original meaning exactly when possible.
- Do not add new facts.
- Keep the answer concise and natural.
- If the answer cannot be safely rewritten without implying hidden sources or unsupported knowledge, respond EXACTLY with:
"I’m sorry, I don’t have that information. Is there something else I can help you with."
- If the draft answer depends on an unsupported action or offer, respond EXACTLY with:
"I’m sorry, I can’t do that here. Is there something else I can help you with."
`.trim();

  const rewriteResponse = await openai.responses.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    instructions: rewriteInstructions,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: `User question:\n${question}\n\nDraft answer:\n${answer}`
          }
        ]
      }
    ],
    store: false,
    truncation: "auto"
  });

  return extractOutputText(rewriteResponse);
}

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

function getActorKey(request, threadId) {
  const ip = getClientIp(request);
  return sha256(`${ip}:${threadId}`);
}

async function enforceRateLimit(db, actorKey) {
  const collection = db.collection("chat_rate_limits");
  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_MS);
  const expiresAt = new Date(now.getTime() + WINDOW_MS);

  const doc = await collection.findOneAndUpdate(
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

  const tooManyRequests = doc.requestsInWindow > MAX_REQUESTS_PER_WINDOW;
  const tooFast =
    typeof doc.secondsSinceLastRequest === "number" &&
    doc.secondsSinceLastRequest < MIN_SECONDS_BETWEEN_MESSAGES;

  if (tooManyRequests || tooFast) {
    const retryAfterSeconds = tooFast
      ? Math.ceil(MIN_SECONDS_BETWEEN_MESSAGES - doc.secondsSinceLastRequest)
      : Math.ceil(WINDOW_MS / 1000);

    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
      reason: tooFast ? "cooldown" : "rate_limit"
    };
  }

  return { allowed: true };
}

export default async function chatRoutes(fastify) {
  fastify.post("/chat", async function handler(request, reply) {
    try {
      const contentLength = Number(request.headers["content-length"] || "0");
      if (contentLength > 20_000) {
        return reply.code(413).send({ error: "Request too large." });
      }

      const body = request.body || {};
      const message = String(body.message || "").trim();
      const threadId = safeThreadId(body.threadId);

      if (!message) {
        return reply.code(400).send({ error: "Message is required." });
      }

      if (message.length > MAX_MESSAGE_LENGTH) {
        return reply.code(400).send({
          error: `Message too long. Max ${MAX_MESSAGE_LENGTH} characters.`
        });
      }

      const db = fastify.mongoDb;
      const openai = fastify.openai;

      const actorKey = getActorKey(request, threadId);
      const limit = await enforceRateLimit(db, actorKey);

      if (!limit.allowed) {
        return reply
          .code(429)
          .header("Retry-After", String(limit.retryAfterSeconds))
          .send({ error: "Too many requests. Please slow down." });
      }

      const threads = db.collection("chat_threads");
      const messages = db.collection("chat_messages");
      const existingThread = await threads.findOne({ threadId });

      const vectorStoreIds = getVectorStoreIds();

      const tools = vectorStoreIds.length
        ? [
            {
              type: "file_search",
              vector_store_ids: vectorStoreIds,
              max_num_results: 5
            }
          ]
        : [];

      const instructions = `
You are a concise customer-facing website assistant.

Rules:
- Answer using plain helpful language.
- Do not mention internal tools, files, sources, citations, vector stores, or retrieval.
- Do not claim actions you cannot perform.
- If unsure, say:
"${SAFE_FALLBACK_REPLY}"
- If asked to do something unsupported here, say:
"${UNSUPPORTED_ACTION_REPLY}"
`.trim();

      const response = await openai.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        instructions,
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: message }]
          }
        ],
        previous_response_id: existingThread?.openaiPreviousResponseId,
        tools,
        include: vectorStoreIds.length ? ["file_search_call.results"] : undefined,
        store: true,
        truncation: "auto"
      });

      const firstPassReply = extractOutputText(response);

      let replyText = await rewriteForCustomerSafeOutput(
        openai,
        message,
        firstPassReply
      );

      if (containsSourceLeak(replyText)) {
        replyText = SAFE_FALLBACK_REPLY;
      } else if (containsUnsupportedCapabilityOffer(replyText)) {
        replyText = UNSUPPORTED_ACTION_REPLY;
      }

      const now = new Date();

      if (!existingThread) {
        await threads.insertOne({
          threadId,
          openaiPreviousResponseId: response.id,
          createdAt: now,
          updatedAt: now,
          source: body.source || "website",
          pageUrl: body.pageUrl || null,
          pageTitle: body.pageTitle || null,
          siteName: body.siteName || null
        });
      } else {
        await threads.updateOne(
          { threadId },
          {
            $set: {
              openaiPreviousResponseId: response.id,
              updatedAt: now,
              pageUrl: body.pageUrl || existingThread.pageUrl || null,
              pageTitle: body.pageTitle || existingThread.pageTitle || null,
              siteName: body.siteName || existingThread.siteName || null
            }
          }
        );
      }

      await messages.insertMany([
        {
          threadId,
          role: "user",
          text: message,
          createdAt: now,
          source: body.source || "website",
          pageUrl: body.pageUrl || null,
          pageTitle: body.pageTitle || null
        },
        {
          threadId,
          role: "assistant",
          text: replyText,
          createdAt: now,
          openaiResponseId: response.id,
          rawOutput: response.output || [],
          rewrittenFrom: firstPassReply
        }
      ]);

      return reply.send({
        ok: true,
        threadId,
        reply: replyText,
        responseId: response.id
      });
    } catch (error) {
      request.log.error(error, "CHAT_API_ERROR");
      return reply.code(500).send({ error: "Unexpected server error." });
    }
  });
}