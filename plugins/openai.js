import fp from "fastify-plugin";
import OpenAI from "openai";

async function openaiPlugin(fastify) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  fastify.decorate("openai", client);
}

export default fp(openaiPlugin);