import fs from 'fs';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function createVectorStore(name) {
  return client.vectorStores.create({ name });
}

export async function uploadFile(localPath) {
  return client.files.create({
    file: fs.createReadStream(localPath),
    purpose: 'assistants'
  });
}

export async function addFileToVectorStore(vectorStoreId, openaiFileId) {
  if (client.vectorStores.files.createAndPoll) {
    return client.vectorStores.files.createAndPoll(vectorStoreId, {
      file_id: openaiFileId
    });
  }

  return client.vectorStores.files.create(vectorStoreId, {
    file_id: openaiFileId
  });
}

export async function deleteOpenAIFile(fileId) {
  return client.files.del(fileId);
}

export default client;
