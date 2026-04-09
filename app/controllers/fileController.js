import crypto from 'node:crypto';
import multer from 'multer';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getCollections } from '../config/db.js';
import {
  uploadBuffer,
  addFileToVectorStore,
  removeFileFromVectorStore,
  deleteOpenAIFile
} from '../services/openaiService.js';
import { findOwnedWorkspace, trackRecentWorkspaceVisit } from '../services/workspaceService.js';
import { serializeDocs, toObjectId } from '../services/dbHelpers.js';
import { buildWorkspaceTabs } from '../services/workspaceTabs.js';

const storage = multer.memoryStorage();

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
  }
});

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

function wantsJson(req) {
  return req.xhr || req.get('x-requested-with') === 'XMLHttpRequest';
}

function r2PublicBase() {
  const publicBase = String(process.env.CLOUDFLARE_R2_PUBLIC_URL || '').replace(/\/+$/, '');
  if (!publicBase) throw new Error('Missing CLOUDFLARE_R2_PUBLIC_URL');
  return publicBase;
}

function buildR2Key({ workspaceId, originalName }) {
  const ext = String(originalName || '').split('.').pop()?.toLowerCase() || 'bin';

  return `workspaces/${workspaceId}/files/${Date.now()}-${crypto
    .randomBytes(8)
    .toString('hex')}.${ext}`;
}

async function uploadFileToR2({ fileBuffer, mimeType, workspaceId, originalName }) {
  const key = buildR2Key({ workspaceId, originalName });

  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType || 'application/octet-stream'
    })
  );

  return {
    key,
    url: `${r2PublicBase()}/${key}`
  };
}

async function deleteFromR2(r2Key) {
  if (!r2Key) return;

  await r2.send(
    new DeleteObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET,
      Key: r2Key
    })
  );
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
    active: 'chatbot',
    tabs: buildWorkspaceTabs(workspace._id),
    files: serializeDocs(docs)
  });
}

export async function create(req, res) {
  const { workspaceFiles } = getCollections();
  const workspace = await getWorkspace(req);

  if (!workspace) {
    if (wantsJson(req)) {
      return res.status(404).json({ error: 'Workspace not found' });
    }

    req.flash('error', 'Workspace not found');
    return res.redirect('/workspaces');
  }

  if (!req.file) {
    if (wantsJson(req)) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    req.flash('error', 'No file uploaded');
    return res.redirect(`/workspaces/${req.params.workspaceId}/chatbot/files`);
  }

  try {
    const r2Asset = await uploadFileToR2({
      fileBuffer: req.file.buffer,
      mimeType: req.file.mimetype,
      workspaceId: workspace._id,
      originalName: req.file.originalname
    });

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
      r2Key: r2Asset.key,
      r2Url: r2Asset.url,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    if (wantsJson(req)) {
      return res.status(201).json({ ok: true });
    }

    req.flash('success', 'File uploaded to OpenAI, vector store, and R2');
    return res.redirect(`/workspaces/${workspace._id}/chatbot/files`);
  } catch (error) {
    console.error('File upload failed:', error.message);

    if (wantsJson(req)) {
      return res.status(500).json({ error: `Upload failed: ${error.message}` });
    }

    req.flash('error', `Upload failed: ${error.message}`);
    return res.redirect(`/workspaces/${workspace._id}/chatbot/files`);
  }
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
    return res.redirect(`/workspaces/${workspace._id}/chatbot/files`);
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

  if (file.r2Key) {
    try {
      await deleteFromR2(file.r2Key);
    } catch (error) {
      console.warn('R2 file deletion failed:', error.message);
    }
  }

  await workspaceFiles.deleteOne({ _id: file._id });

  req.flash('success', 'File removed from vector store, OpenAI, and R2');
  return res.redirect(`/workspaces/${workspace._id}/chatbot/files`);
}
