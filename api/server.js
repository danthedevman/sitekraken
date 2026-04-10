import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Fastify from "fastify";
import cors from "@fastify/cors";
import view from "@fastify/view";
import ejs from "ejs";

import mongoPlugin from "./plugins/mongo.js";
import openaiPlugin from "./plugins/openai.js";
import chatRoutes from "./routes/chat.js";
import embedRoutes from "./routes/embed.js";
import analyticsRoutes from "./routes/analytics.js";
import logsRoutes from "./routes/logs.js";
import fastifyStatic from "@fastify/static";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = Fastify({
  logger: true,
  trustProxy: true,
});

await app.register(cors, {
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
});

await app.register(view, {
  engine: {
    ejs,
  },
  root: path.join(__dirname, "views"),
});

await app.register(fastifyStatic, {
  root: path.join(__dirname, "public"),
  prefix: "/public/",
});

await app.register(mongoPlugin);
await app.register(openaiPlugin);

await app.register(embedRoutes, { prefix: "/embed" });
await app.register(chatRoutes, { prefix: "/api" });
await app.register(analyticsRoutes, { prefix: "/api/analytics" });
await app.register(logsRoutes, { prefix: "/api/logs" });

app.get("/health", async function (req, reply) {
  return reply.status(200).send({ ok: true });
});

const port = Number(process.env.PORT || 4001);
const host = process.env.HOST || "0.0.0.0";

try {
  await app.listen({ port, host });
  app.log.info(`Fastify chat API running on http://${host}:${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}