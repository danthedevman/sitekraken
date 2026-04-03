import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { getCollections } from '../config/db.js';
import { uploadFile, addFileToVectorStore, deleteOpenAIFile } from '../services/openaiService.js';
import { findOwnedWorkspace } from '../services/workspaceService.js';
import { serializeDocs, toObjectId } from '../services/dbHelpers.js';

const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadDir);
  },
  filename(req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

export const upload = multer({ storage });

export async function index(req, res) {
  const { workspaceFiles } = getCollections();
  const workspace = await findOwnedWorkspace(req.user._id, req.params.workspaceId);
  const docs = await workspaceFiles
    .find({ workspaceId: workspace._id })
    .sort({ createdAt: -1 })
    .toArray();

  res.render('files/index', {
    workspace,
    files: serializeDocs(docs)
  });
}

export async function create(req, res) {
  const { workspaceFiles } = getCollections();
  const workspace = await findOwnedWorkspace(req.user._id, req.params.workspaceId);

  if (!req.file) {
    throw new Error('No file uploaded');
  }

  const uploaded = await uploadFile(req.file.path);
  await addFileToVectorStore(workspace.openaiVectorStoreId, uploaded.id);

  await workspaceFiles.insertOne({
    workspaceId: workspace._id,
    originalName: req.file.originalname,
    localFilename: req.file.filename,
    mimeType: req.file.mimetype,
    size: req.file.size,
    openaiFileId: uploaded.id,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  try {
    fs.unlinkSync(req.file.path);
  } catch (error) {
    console.warn('Temporary upload cleanup failed:', error.message);
  }

  req.flash('success', 'File uploaded to OpenAI and linked to vector store');
  res.redirect(`/workspaces/${workspace._id}/files`);
}

export async function destroy(req, res) {
  const { workspaceFiles } = getCollections();
  const workspace = await findOwnedWorkspace(req.user._id, req.params.workspaceId);

  const file = await workspaceFiles.findOne({
    _id: toObjectId(req.params.fileId),
    workspaceId: workspace._id
  });

  if (!file) {
    throw new Error('File not found');
  }

  if (file.openaiFileId) {
    await deleteOpenAIFile(file.openaiFileId);
  }

  await workspaceFiles.deleteOne({ _id: file._id });

  req.flash('success', 'File removed');
  res.redirect(`/workspaces/${workspace._id}/files`);
}
