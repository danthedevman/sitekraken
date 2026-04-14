import crypto from "node:crypto";
import { resolveWorkspaceAccess } from "../lib/workspace-auth.js";
import { enforceRouteRateLimit, getRouteActorKey } from "../lib/rate-limit.js";

const MAX_MESSAGE_LENGTH = 2000;
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;
const MIN_SECONDS_BETWEEN_MESSAGES = 2;
const MAX_THREAD_ID_LENGTH = 200;
const MAX_ADDITIONAL_INSTRUCTIONS_LENGTH = 4000;

const SAFE_FALLBACK_REPLY =
  "I’m sorry, I don’t have that information. Is there something else I can help you with?";

const UNSUPPORTED_ACTION_REPLY =
  "I’m sorry, I can’t do that here. Is there something else I can help you with?";

const END_CONVERSATION_REPLY = "Glad I could help.";

const ALLOWED_NON_KNOWLEDGE_REPLIES = new Map([
  ["hi", "Hi! How can I help you today?"],
  ["hello", "Hello! How can I help you today?"],
  ["hey", "Hey! How can I help you today?"],
  ["help", "How can I help you today?"],
  ["what can you help with?", "I can assist you with answers based on content I have access to. How can I help you?"],
  ["what do you do?", "I can answer questions based on the information available."],
  ["thanks", "You’re welcome!"],
  ["thank you", "You’re welcome!"]
]);

const CONVERSATION_END_PATTERNS = [
  /\bno thanks?\b/i,
  /\bno thank you\b/i,
  /\bnever mind\b/i,
  /\bnevermind\b/i,
  /\bi don'?t need (any )?(more )?(help|assistance)( anymore)?\b/i,
  /\bi do not need (any )?(more )?(help|assistance)( anymore)?\b/i,
  /\bno (more|further) (help|assistance)\b/i,
  /\bthat('?s| is) all\b/i,
  /\bthat('?s| is) it\b/i,
  /\bi('?m| am) (good|all set|done|fine)\b/i,
  /\ball set\b/i,
  /\bwe('?re| are) good\b/i,
  /\bsolved\b/i,
  /\bresolved\b/i,
  /\bgot it(,? thanks)?\b/i,
  /\bthank(s| you),? (that('?s| is) )?(all|it)\b/i,
  /\byou can stop\b/i,
  /\bno reply needed\b/i
];

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

function extractFileSearchResults(response) {
  if (!Array.isArray(response?.output)) return [];

  const results = [];

  for (const item of response.output) {
    if (item?.type === "file_search_call" && Array.isArray(item.results)) {
      results.push(...item.results.filter(Boolean));
    }
  }

  return results;
}

function hasUsableFileSearchResults(response) {
  return extractFileSearchResults(response).length > 0;
}

function containsSourceLeak(text) {
  if (!text) return false;

  return [
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
    /\bi can (send|share|attach|upload|deliver)\b/i,
    /\bi can email\b/i,
    /\bi can forward\b/i,
    /\bsend it to you directly\b/i
  ].some((pattern) => pattern.test(text));
}

function getAllowedNonKnowledgeReply(message) {
  const normalized = String(message || "").trim().toLowerCase();
  return ALLOWED_NON_KNOWLEDGE_REPLIES.get(normalized) || null;
}

function userIsEndingConversation(message) {
  const text = String(message || "").trim();
  if (!text) return false;
  return CONVERSATION_END_PATTERNS.some((pattern) => pattern.test(text));
}

async function rewriteForCustomerSafeOutput(openai, question, answer) {
  if (!answer) return answer;

  const rewriteInstructions = `
You are a response rewriter for a customer-facing assistant.

Rules:
- Never mention files, file names, document names, titles, attachments, uploads, sources, citations, retrieval, search results, vector stores, internal tools, or knowledge base structure.
- Never say phrases like "according to the file", "the document says", "the uploaded file mentions", or similar.
- Never imply system capabilities beyond returning text in chat.
- Never claim you can send, share, attach, upload, deliver, email, or forward files or assets.
- You MAY keep public URLs already present in the draft answer.
- You MAY preserve simple markdown formatting when it improves clarity:
  - headings with #
  - bullet lists with -
  - inline code
  - markdown links like [label](https://example.com) and mailto links
- Do NOT invent links.
- Preserve the original meaning exactly when possible.
- Keep the answer concise and natural.
- If the user is clearly ending the conversation, rewrite the response as a brief polite closing and do not ask a follow-up question.
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

function getActorKey(request, threadId, workspaceId) {
  return getRouteActorKey(request, workspaceId, `chat:${threadId}`);
}

async function enforceRateLimit(db, actorKey) {
  return enforceRouteRateLimit(db, actorKey, {
    collectionName: "chat_rate_limits",
    windowMs: WINDOW_MS,
    maxRequestsPerWindow: MAX_REQUESTS_PER_WINDOW,
    minSecondsBetweenRequests: MIN_SECONDS_BETWEEN_MESSAGES
  });
}

function getWorkspaceVectorStoreIds(workspace) {
  if (Array.isArray(workspace.openaiVectorStoreIds)) {
    return workspace.openaiVectorStoreIds.filter(Boolean);
  }

  if (workspace.openaiVectorStoreId) {
    return [workspace.openaiVectorStoreId];
  }

  return [];
}

function normalizeInstructionText(
  value,
  maxLength = MAX_ADDITIONAL_INSTRUCTIONS_LENGTH
) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function getWorkspaceConfigInstructions(workspace) {
  const config = workspace?.chatbot?.config || {};

  return {
    customInitialMessage: normalizeInstructionText(config.initialMessage, 1000),
    additionalInstructions:
      normalizeInstructionText(config.additionalInstructions) ||
      normalizeInstructionText(config.instructions)
  };
}

function getWorkspaceInstructions(workspace) {
  const { customInitialMessage, additionalInstructions } =
    getWorkspaceConfigInstructions(workspace);

  const instructionSections = [
    `
You are a concise customer-facing website assistant.

You must obey these rules:
- Only answer using:
  1. information found in retrieved file search results, and
  2. explicit workspace additional instructions that define behavior, tone, routing, or constraints.
- For substantive factual answers, the answer must be supported by retrieved file search results.
- Do not use general world knowledge, background knowledge, or guesses.
- Do not infer facts that are not clearly supported by retrieved content.
- If the user is clearly ending the conversation (for example: "no thanks", "I'm all set", "never mind", "I don't need help anymore"), respond briefly and politely, and do not ask a follow-up question.
- If retrieved content is missing, irrelevant, or insufficient for a substantive answer, you must reply exactly:
"${SAFE_FALLBACK_REPLY}"

Formatting rules:
- Use plain helpful language.
- You may use simple markdown when it improves clarity:
  - headings with #
  - bullet lists with -
  - markdown links like [label](https://example.com)
  - inline code

Safety and capability rules:
- Do not mention internal tools, sources, citations, vector stores, files, retrieval, or knowledge base structure.
- Do not claim actions you cannot perform.
- Do not say you can send, attach, upload, or deliver files.

Behavior rules:
- If the user asks for a link, resume, portfolio, contact page, or resource, only return it when it is explicitly present in retrieved content.
- Keep answers aligned with this chatbot setup when relevant:
${customInitialMessage ? `- Assistant persona/context: ${customInitialMessage}` : "- Assistant persona/context: helpful professional assistant."}
- If asked to do something unsupported here, say:
"${UNSUPPORTED_ACTION_REPLY}"
`.trim()
  ];

  if (additionalInstructions) {
    instructionSections.push(
      `
Explicit workspace additional instructions:
${additionalInstructions}
`.trim()
    );
  }

  return instructionSections.join("\n\n");
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

      const access = await resolveWorkspaceAccess(request, db);
      if (!access.ok) {
        return reply.code(access.status).send({ error: access.error });
      }

      const { workspace } = access;
      if (!workspace || !workspace.chatbot || !workspace.chatbot.enabled) {
        return reply.code(403).send({ error: "Chatbot is not enabled." });
      }

      const actorKey = getActorKey(request, threadId, String(workspace._id));
      const limit = await enforceRateLimit(db, actorKey);

      if (!limit.allowed) {
        return reply
          .code(429)
          .header("Retry-After", String(limit.retryAfterSeconds))
          .send({ error: "Too many requests. Please slow down." });
      }

      const threads = db.collection("chat_threads");
      const messages = db.collection("chat_messages");

      const existingThread = await threads.findOne({
        threadId,
        workspaceId: String(workspace._id)
      });

      const now = new Date();
      const isEndingConversation = userIsEndingConversation(message);

      if (isEndingConversation) {
        const replyText = END_CONVERSATION_REPLY;

        if (!existingThread) {
          await threads.insertOne({
            workspaceId: String(workspace._id),
            threadId,
            openaiPreviousResponseId: existingThread?.openaiPreviousResponseId || null,
            createdAt: now,
            updatedAt: now,
            source: body.source || "website",
            pageUrl: body.pageUrl || null,
            pageTitle: body.pageTitle || null,
            siteName: body.siteName || null
          });
        } else {
          await threads.updateOne(
            {
              threadId,
              workspaceId: String(workspace._id)
            },
            {
              $set: {
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
            workspaceId: String(workspace._id),
            threadId,
            role: "user",
            text: message,
            createdAt: now,
            source: body.source || "website",
            pageUrl: body.pageUrl || null,
            pageTitle: body.pageTitle || null
          },
          {
            workspaceId: String(workspace._id),
            threadId,
            role: "assistant",
            text: replyText,
            createdAt: now,
            openaiResponseId: null,
            rawOutput: [],
            rewrittenFrom: null
          }
        ]);

        return reply.send({
          ok: true,
          workspaceId: String(workspace._id),
          threadId,
          reply: replyText,
          responseId: null
        });
      }

      const vectorStoreIds = getWorkspaceVectorStoreIds(workspace);

      const tools = vectorStoreIds.length
        ? [
            {
              type: "file_search",
              vector_store_ids: vectorStoreIds,
              max_num_results: 8
            }
          ]
        : [];

      const instructions = getWorkspaceInstructions(workspace);

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
      const hasFileGrounding = hasUsableFileSearchResults(response);
      const allowedNonKnowledgeReply = getAllowedNonKnowledgeReply(message);

      let replyText;

      if (!hasFileGrounding && allowedNonKnowledgeReply) {
        replyText = allowedNonKnowledgeReply;
      } else if (!hasFileGrounding) {
        replyText = SAFE_FALLBACK_REPLY;
      } else {
        replyText = await rewriteForCustomerSafeOutput(
          openai,
          message,
          firstPassReply
        );

        if (containsSourceLeak(replyText)) {
          replyText = SAFE_FALLBACK_REPLY;
        } else if (containsUnsupportedCapabilityOffer(replyText)) {
          replyText = UNSUPPORTED_ACTION_REPLY;
        }
      }

      if (!existingThread) {
        await threads.insertOne({
          workspaceId: String(workspace._id),
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
          {
            threadId,
            workspaceId: String(workspace._id)
          },
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
          workspaceId: String(workspace._id),
          threadId,
          role: "user",
          text: message,
          createdAt: now,
          source: body.source || "website",
          pageUrl: body.pageUrl || null,
          pageTitle: body.pageTitle || null
        },
        {
          workspaceId: String(workspace._id),
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
        workspaceId: String(workspace._id),
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
