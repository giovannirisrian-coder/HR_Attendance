const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { Storage } = require('@google-cloud/storage');

const LOCAL_UPLOAD_ROOT = path.join(__dirname, '../../uploads');
const GCS_PREFIX = 'gcs:';
const LOCAL_PREFIX = 'local:';

let storageClient = null;

const isProduction = () => process.env.NODE_ENV === 'production';

const isGcsConfigured = () =>
  Boolean(process.env.GCS_BUCKET_NAME && String(process.env.GCS_BUCKET_NAME).trim());

const isLocalFallbackEnabled = () => {
  if (isProduction()) return false;
  const flag = process.env.LEAVE_ATTACHMENT_LOCAL_FALLBACK;
  if (flag === 'false' || flag === '0') return false;
  return true;
};

/** True when uploads/downloads can proceed (GCS or dev local fallback). */
const isLeaveAttachmentStorageConfigured = () => {
  if (isGcsConfigured()) return true;
  return isLocalFallbackEnabled();
};

const getBucketName = () => {
  const name = process.env.GCS_BUCKET_NAME;
  if (!name || !String(name).trim()) {
    throw new Error('GCS_BUCKET_NAME is not configured.');
  }
  return String(name).trim();
};

const getStorage = () => {
  if (!storageClient) {
    const opts = {};
    if (process.env.GCS_PROJECT_ID) {
      opts.projectId = String(process.env.GCS_PROJECT_ID).trim();
    }
    const keyFile = process.env.GCS_KEY_FILE || process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (keyFile && String(keyFile).trim()) {
      opts.keyFilename = String(keyFile).trim();
    }
    storageClient = new Storage(opts);
  }
  return storageClient;
};

const signedUrlExpiresMs = () => {
  const mins = parseInt(process.env.GCS_SIGNED_URL_EXPIRES_MINUTES, 10);
  const safeMins = Number.isInteger(mins) && mins > 0 && mins <= 60 ? mins : 15;
  return safeMins * 60 * 1000;
};

const sanitizeFilename = (name) => {
  const base = path.basename(String(name || 'attachment'));
  return base.replace(/[^\w.\-() ]+/g, '_') || 'attachment';
};

const buildObjectKey = (userId, safeName) => {
  const ext = path.extname(safeName);
  return `leave-attachments/${userId}/${crypto.randomUUID()}${ext}`;
};

const encodeStorageRef = (backend, objectKey) =>
  backend === 'local' ? `${LOCAL_PREFIX}${objectKey}` : `${GCS_PREFIX}${objectKey}`;

const parseStorageRef = (storagePath) => {
  if (!storagePath) return null;
  const value = String(storagePath);
  if (value.startsWith(LOCAL_PREFIX)) {
    return { backend: 'local', objectKey: value.slice(LOCAL_PREFIX.length) };
  }
  if (value.startsWith(GCS_PREFIX)) {
    return { backend: 'gcs', objectKey: value.slice(GCS_PREFIX.length) };
  }
  // Legacy rows written before backend prefix — treat as GCS object key.
  return { backend: 'gcs', objectKey: value };
};

const resolveLocalAbsolutePath = (objectKey) => {
  const normalized = String(objectKey || '').replace(/^\/+/, '');
  const abs = path.resolve(LOCAL_UPLOAD_ROOT, normalized);
  const root = path.resolve(LOCAL_UPLOAD_ROOT);
  if (!abs.startsWith(`${root}${path.sep}`) && abs !== root) {
    throw new Error('Invalid attachment path.');
  }
  return abs;
};

const uploadToGcs = async ({ buffer, objectKey, safeName, mimeType, userId }) => {
  const bucketName = getBucketName();
  const file = getStorage().bucket(bucketName).file(objectKey);
  await file.save(buffer, {
    metadata: {
      contentType: mimeType || 'application/octet-stream',
      metadata: {
        originalName: safeName,
        uploadedByUserId: String(userId),
      },
    },
    resumable: false,
  });
};

const uploadToLocalDisk = async ({ buffer, objectKey }) => {
  const absPath = resolveLocalAbsolutePath(objectKey);
  await fs.mkdir(path.dirname(absPath), { recursive: true });
  await fs.writeFile(absPath, buffer);
};

/**
 * Upload a leave attachment. Uses GCS when configured; otherwise local disk in non-production.
 * @returns {{ storagePath: string, originalName: string, backend: 'gcs'|'local' }}
 */
const uploadLeaveAttachment = async ({ buffer, originalName, mimeType, userId }) => {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('Attachment file is empty.');
  }

  const safeName = sanitizeFilename(originalName);
  const objectKey = buildObjectKey(userId, safeName);

  if (isGcsConfigured()) {
    await uploadToGcs({ buffer, objectKey, safeName, mimeType, userId });
    return {
      storagePath: encodeStorageRef('gcs', objectKey),
      gcsPath: encodeStorageRef('gcs', objectKey),
      originalName: safeName,
      backend: 'gcs',
    };
  }

  if (isLocalFallbackEnabled()) {
    await uploadToLocalDisk({ buffer, objectKey });
    return {
      storagePath: encodeStorageRef('local', objectKey),
      gcsPath: encodeStorageRef('local', objectKey),
      originalName: safeName,
      backend: 'local',
    };
  }

  if (isProduction()) {
    throw new Error('GCS is required in production. Set GCS_BUCKET_NAME and credentials.');
  }

  throw new Error('Leave attachment storage is not configured.');
};

const deleteFromGcs = async (objectKey) => {
  const bucketName = getBucketName();
  await getStorage().bucket(bucketName).file(objectKey).delete({ ignoreNotFound: true });
};

const deleteFromLocalDisk = async (objectKey) => {
  try {
    await fs.unlink(resolveLocalAbsolutePath(objectKey));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
};

const deleteLeaveAttachment = async (storagePath) => {
  if (!storagePath) return;
  const ref = parseStorageRef(storagePath);
  if (!ref) return;

  try {
    if (ref.backend === 'local') {
      await deleteFromLocalDisk(ref.objectKey);
      return;
    }
    if (isGcsConfigured()) {
      await deleteFromGcs(ref.objectKey);
    }
  } catch (err) {
    console.warn('Attachment delete failed:', storagePath, err.message);
  }
};

const getLeaveAttachmentSignedUrl = async (storagePath, originalName) => {
  const ref = parseStorageRef(storagePath);
  if (!ref || ref.backend !== 'gcs') {
    throw new Error('Attachment is not stored in GCS.');
  }
  if (!isGcsConfigured()) {
    throw new Error('GCS is not configured.');
  }

  const file = getStorage().bucket(getBucketName()).file(ref.objectKey);
  const [url] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + signedUrlExpiresMs(),
    responseDisposition: `attachment; filename="${sanitizeFilename(originalName)}"`,
  });
  return url;
};

const getLeaveAttachmentBackend = (storagePath) => parseStorageRef(storagePath)?.backend || null;

const getLeaveAttachmentLocalAbsolutePath = (storagePath) => {
  const ref = parseStorageRef(storagePath);
  if (!ref || ref.backend !== 'local') {
    throw new Error('Attachment is not stored on local disk.');
  }
  return resolveLocalAbsolutePath(ref.objectKey);
};

module.exports = {
  uploadLeaveAttachment,
  deleteLeaveAttachment,
  getLeaveAttachmentSignedUrl,
  getLeaveAttachmentBackend,
  getLeaveAttachmentLocalAbsolutePath,
  isGcsConfigured,
  isLeaveAttachmentStorageConfigured,
  isProduction,
  isLocalFallbackEnabled,
};
