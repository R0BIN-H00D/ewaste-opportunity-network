'use strict';
// Storage adapter. Phase 2 ships the local-disk driver (development only).
// The Cloudinary driver (public images + private/authenticated documents with signed URLs) is added in Phase 8.
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const ApiError = require('../../utils/ApiError');

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'application/pdf': '.pdf' };

function assertDriver() {
  if (env.STORAGE_DRIVER === 'cloudinary') {
    throw new ApiError(501, 'Cloudinary storage is not implemented until Phase 8. Use STORAGE_DRIVER=local for now.', 'NOT_IMPLEMENTED');
  }
  if (env.isProd) logger.warn('Local disk storage is for development only; configure Cloudinary before production.');
}

/** Save one multer memory file. Returns { publicId, url?, bytes, mime, storage }. Private files get no URL. */
async function save(file, { folder = 'misc', isPrivate = false } = {}) {
  assertDriver();
  const ext = EXT[file.sniffedMime || file.mimetype];
  if (!ext) throw ApiError.validation([{ field: 'file', message: 'Unsupported file type' }]);
  const safeFolder = folder.replace(/[^a-zA-Z0-9/_-]/g, '').replace(/\.\./g, '');
  const rel = path.posix.join(isPrivate ? '_private' : 'public', safeFolder, `${crypto.randomBytes(16).toString('hex')}${ext}`);
  const abs = path.join(env.uploadDir, ...rel.split('/'));
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, file.buffer);
  return {
    publicId: rel,
    url: isPrivate ? undefined : `/uploads/${rel.replace(/^public\//, '')}`,
    bytes: file.size,
    mime: file.sniffedMime || file.mimetype,
    storage: 'local',
  };
}

async function saveMany(files = [], opts) {
  const saved = [];
  try {
    for (const f of files) saved.push(await save(f, opts));
    return saved;
  } catch (err) {
    await Promise.all(saved.map((s) => remove(s.publicId)));
    throw err;
  }
}

/** Best-effort delete. Refuses paths that escape the upload dir. */
async function remove(publicId) {
  if (!publicId) return;
  const abs = path.resolve(env.uploadDir, ...String(publicId).split('/'));
  if (!abs.startsWith(path.resolve(env.uploadDir) + path.sep)) return;
  await fs.rm(abs, { force: true }).catch(() => {});
}

/** Absolute path of a private file, for an administrator's document viewer. Never leaves the upload folder. */
async function resolvePrivate(publicId) {
  assertDriver();
  const root = path.resolve(env.uploadDir);
  const abs = path.resolve(root, ...String(publicId || '').split('/'));
  const privateRoot = path.join(root, '_private') + path.sep;
  if (!abs.startsWith(privateRoot)) throw ApiError.notFound('Document not found');
  try {
    await fs.access(abs);
  } catch {
    throw ApiError.notFound('The stored file is missing');
  }
  return abs;
}

const toPhoto = ({ url, publicId, bytes, mime }) => ({ url, publicId, bytes, mime });

module.exports = { save, saveMany, remove, resolvePrivate, toPhoto };
