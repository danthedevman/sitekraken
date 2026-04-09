import multer from 'multer';
import { getCollections } from '../config/db.js';
import {
  uploadBuffer,
  addFileToVectorStore,
  removeFileFromVectorStore,
  deleteOpenAIFile
} from '../services/openaiService.js';
import { findOwnedWorkspace, trackRecentWorkspaceVisit } from '../services/workspaceService.js';
import { serializeDocs, toObjectId } from '../services/dbHelpers.js';

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024
  }
});

async function getWorkspace(req) {
  const workspace = await findOwnedWorkspace(req.user._id, req.params.workspaceId);
  trackRecentWorkspaceVisit(req, workspace);
  return workspace;
}

export async function index(req, res) {
  const { workspaceFiles } = getCollections();
  const workspace = await getWorkspace(req);

  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

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
  const workspace = await getWorkspace(req);

  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  if (!req.file) {
    req.flash('error', 'No file uploaded');
    return res.redirect(`/workspaces/${req.params.workspaceId}/files`);
  }

  const uploaded = await uploadBuffer(
    req.file.buffer,
    req.file.originalname,
    req.file.mimetype
  );

  const vectorStoreFile = await addFileToVectorStore(
    workspace.openaiVectorStoreId,
    uploaded.id
  );

  await workspaceFiles.insertOne({
    workspaceId: workspace._id,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
    openaiFileId: uploaded.id,
    vectorStoreFileId: vectorStoreFile?.id || null,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  req.flash('success', 'File uploaded to OpenAI and linked to vector store');
  res.redirect(`/workspaces/${workspace._id}/files`);
}

export async function destroy(req, res) {
  const { workspaceFiles } = getCollections();
  const workspace = await getWorkspace(req);

  if (!workspace) {
    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  const file = await workspaceFiles.findOne({
    _id: toObjectId(req.params.fileId),
    workspaceId: workspace._id
  });

  if (!file) {
    req.flash('error', 'File not found');
    return res.redirect(`/workspaces/${workspace._id}/files`);
  }

  if (file.vectorStoreFileId) {
    try {
      await removeFileFromVectorStore(
        workspace.openaiVectorStoreId,
        file.vectorStoreFileId
      );
    } catch (error) {
      console.warn('Vector store file deletion failed:', error.message);
    }
  }

  if (file.openaiFileId) {
    try {
      await deleteOpenAIFile(file.openaiFileId);
    } catch (error) {
      console.warn('OpenAI file deletion failed:', error.message);
    }
  }

  await workspaceFiles.deleteOne({ _id: file._id });

  req.flash('success', 'File removed');
  res.redirect(`/workspaces/${workspace._id}/files`);
}
