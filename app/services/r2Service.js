import crypto from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const r2 = new S3Client({
  region: 'auto',
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
  }
});

export async function uploadBufferToR2({ fileBuffer, mimeType, keyPrefix, originalName }) {
  if (!fileBuffer?.length) return null;

  const ext = String(originalName || '').split('.').pop()?.toLowerCase() || 'bin';

  const safePrefix = String(keyPrefix || 'uploads').replace(/^\/+|\/+$/g, '');
  const key = `${safePrefix}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.CLOUDFLARE_R2_BUCKET,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType || 'application/octet-stream'
    })
  );

  const publicBase = String(process.env.CLOUDFLARE_R2_PUBLIC_URL || '').replace(/\/+$/, '');

  if (!publicBase) {
    throw new Error('Missing CLOUDFLARE_R2_PUBLIC_URL');
  }

  return {
    key,
    url: `${publicBase}/${key}`
  };
}
