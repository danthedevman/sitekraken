import fp from "fastify-plugin";
import { MongoClient } from "mongodb";

async function mongoPlugin(fastify) {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || "main_db";

  if (!uri) {
    throw new Error("Missing MONGODB_URI");
  }

  const client = new MongoClient(uri);
  await client.connect();

  const db = client.db(dbName);

  fastify.decorate("mongoClient", client);
  fastify.decorate("mongoDb", db);

  await db.collection("chat_threads").createIndex({ threadId: 1 }, { unique: true });
  await db.collection("chat_messages").createIndex({ threadId: 1, createdAt: 1 });
  await db.collection("chat_rate_limits").createIndex({ actorKey: 1 }, { unique: true });
  await db.collection("chat_rate_limits").createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 }
  );


  fastify.addHook("onClose", async function () {
    await client.close();
  });
}

export default fp(mongoPlugin);