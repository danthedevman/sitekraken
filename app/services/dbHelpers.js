import { ObjectId } from 'mongodb';

export function toObjectId(id) {
  return new ObjectId(id);
}

export function serializeDoc(doc) {
  if (!doc) return null;
  return {
    ...doc,
    _id: doc._id?.toString?.() || doc._id
  };
}

export function serializeDocs(docs) {
  return docs.map(serializeDoc);
}
