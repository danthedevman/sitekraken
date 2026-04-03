import { MongoClient } from 'mongodb';

let client;
let db;

export async function connectDB() {
  if (db) return db;

  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();
  db = client.db(process.env.MONGODB_DB_NAME);
  console.log('MongoDB connected');
  return db;
}

export function getDB() {
  if (!db) {
    throw new Error('Database not connected yet');
  }
  return db;
}

export function getCollections() {
  const database = getDB();

  return {
    users: database.collection('users'),
    workspaces: database.collection('workspaces'),
    workspaceFiles: database.collection('workspaceFiles'),
    knowledgeEntries: database.collection('knowledgeEntries'),
    chatbotConfigs: database.collection('chatbotConfigs')
  };
}
