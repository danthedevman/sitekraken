import OpenAI from 'openai';
import { toFile } from 'openai/uploads';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export async function createVectorStore(name) {
  return client.vectorStores.create({ name });
}

export async function uploadFileFromContent(
  filename,
  content,
  mimeType = 'text/markdown'
) {
  const file = await toFile(Buffer.from(content, 'utf8'), filename, {
    type: mimeType
  });

  return client.files.create({
    file,
    purpose: 'assistants'
  });
}

export async function uploadBuffer(buffer, filename, mimeType = 'application/octet-stream') {
  const file = await toFile(buffer, filename, {
    type: mimeType
  });

  return client.files.create({
    file,
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

export async function removeFileFromVectorStore(vectorStoreId, vectorStoreFileId) {
  if (!vectorStoreId || !vectorStoreFileId) return null;
  return client.vectorStores.files.del(vectorStoreId, vectorStoreFileId);
}

export async function deleteOpenAIFile(fileId) {
  if (!fileId) return null;
  return client.files.del(fileId);
}

export default client;