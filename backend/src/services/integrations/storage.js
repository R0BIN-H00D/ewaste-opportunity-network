'use strict';
// File storage. Two drivers behind one interface:
//   local       files on this server's disk (development; never for production)
//   cloudinary  public images through Cloudinary's CDN, and private documents as "authenticated" uploads that can only be read
//               with a signed address that this server makes and uses itself, so it never reaches a browser (NFR-SEC-12)
// STORAGE_DRIVER=cloudinary without all three credentials falls back to local with a warning, so the app keeps running; in
// production that is refused instead. A stored file remembers which driver wrote it, so files made before a switch stay readable.
const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const env = require('../../config/env');
const logger = require('../../utils/logger');
const ApiError = require('../../utils/ApiError');

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'application/pdf': '.pdf' };
const CLOUD_ROOT = 'ewaste';
const SIGNED_URL_SECONDS = 60; // a private document's address stops working a minute after it is made

/* ---------- which driver ---------- */

let cloudinary = null; // loaded on first use, so a local-only setup never loads the SDK
let warned = false;
const credsPresent = () => Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);

/** For tests: swap in a fake SDK. Pass null to go back to the real one. */
const _setCloudinary = (sdk) => { cloudinary = sdk; };

function sdk() {
  if (!cloudinary) {
    // Loaded only when the driver is in use.
    cloudinary = require('cloudinary').v2;
    cloudinary.config({ cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET, secure: true });
  }
  return cloudinary;
}

/** 'cloudinary' or 'local' for new files. */
function driver() {
  if (env.STORAGE_DRIVER !== 'cloudinary') {
    if (env.isProd) logger.warn('Local disk storage is for development only; configure Cloudinary before production.');
    return 'local';
  }
  if (credsPresent()) return 'cloudinary';
  if (env.isProd) throw new ApiError(500, 'File storage is not configured', 'STORAGE_NOT_CONFIGURED');
  if (!warned) {
    warned = true;
    logger.warn('STORAGE_DRIVER=cloudinary but the Cloudinary credentials are missing: using local disk storage instead.');
  }
  return 'local';
}

const isLocalId = (publicId) => /^(public|_private)\//.test(String(publicId));
const resourceTypeOf = (publicId) => (String(publicId).toLowerCase().endsWith('.pdf') ? 'raw' : 'image');
const safeFolderOf = (folder) => String(folder).replace(/[^a-zA-Z0-9/_-]/g, '').split('/').filter(Boolean).join('/');

/* ---------- local ---------- */

async function saveLocal(file, { folder, isPrivate }, ext) {
  const rel = path.posix.join(isPrivate ? '_private' : 'public', safeFolderOf(folder), `${crypto.randomBytes(16).toString('hex')}${ext}`);
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

async function removeLocal(publicId) {
  const abs = path.resolve(env.uploadDir, ...String(publicId).split('/'));
  if (!abs.startsWith(path.resolve(env.uploadDir) + path.sep)) return; // never outside the upload folder
  await fs.rm(abs, { force: true }).catch(() => {});
}

async function resolveLocalPrivate(publicId) {
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

/* ---------- cloudinary ---------- */

function uploadStream(options, buffer) {
  return new Promise((resolve, reject) => {
    const stream = sdk().uploader.upload_stream(options, (err, result) => (err ? reject(err) : resolve(result)));
    stream.end(buffer);
  });
}

async function saveCloud(file, { folder, isPrivate }, ext) {
  const mime = file.sniffedMime || file.mimetype;
  const isPdf = ext === '.pdf';
  const id = crypto.randomBytes(16).toString('hex');
  const options = {
    folder: `${CLOUD_ROOT}/${isPrivate ? 'private' : 'public'}/${safeFolderOf(folder)}`,
    public_id: isPdf ? `${id}.pdf` : id, // a raw file keeps its extension in its id
    resource_type: isPdf ? 'raw' : 'image',
    type: isPrivate ? 'authenticated' : 'upload',
    overwrite: false,
    unique_filename: false,
  };
  let result;
  try {
    result = await uploadStream(options, file.buffer);
  } catch (err) {
    logger.error({ reason: err?.message || 'error' }, 'cloud upload failed');
    throw new ApiError(502, 'The file could not be stored. Please try again.', 'STORAGE_UNAVAILABLE');
  }
  return {
    publicId: result.public_id,
    // Public images are served through the CDN, converted to the best format and quality for each viewer.
    url: isPrivate ? undefined : sdk().url(result.public_id, { secure: true, resource_type: 'image', fetch_format: 'auto', quality: 'auto' }),
    bytes: result.bytes ?? file.size,
    mime,
    storage: 'cloudinary',
  };
}

async function removeCloud(publicId) {
  const type = String(publicId).includes(`${CLOUD_ROOT}/private/`) ? 'authenticated' : 'upload';
  try {
    await sdk().uploader.destroy(publicId, { resource_type: resourceTypeOf(publicId), type, invalidate: true });
  } catch (err) {
    logger.warn({ reason: err?.message || 'error' }, 'cloud delete failed'); // best effort, like the local driver
  }
}

/** The bytes of a private document, read with a short-lived signed address that is made and used here and never shown. */
async function readCloudPrivate(publicId) {
  const url = sdk().url(publicId, {
    secure: true, sign_url: true, type: 'authenticated', resource_type: resourceTypeOf(publicId),
    expires_at: Math.floor(Date.now() / 1000) + SIGNED_URL_SECONDS,
  });
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`status ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (err) {
    logger.warn({ reason: err?.message || 'error' }, 'cloud read failed');
    throw ApiError.notFound('The stored file is missing');
  }
}

/* ---------- the interface ---------- */

/** Save one multer memory file. Returns { publicId, url?, bytes, mime, storage }. Private files get no URL. */
async function save(file, { folder = 'misc', isPrivate = false } = {}) {
  const ext = EXT[file.sniffedMime || file.mimetype];
  if (!ext) throw ApiError.validation([{ field: 'file', message: 'Unsupported file type' }]);
  return driver() === 'cloudinary' ? saveCloud(file, { folder, isPrivate }, ext) : saveLocal(file, { folder, isPrivate }, ext);
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

/** Best-effort delete, whichever driver wrote the file. */
async function remove(publicId) {
  if (!publicId) return;
  if (isLocalId(publicId)) return removeLocal(publicId);
  if (String(publicId).startsWith(`${CLOUD_ROOT}/`) && credsPresent()) return removeCloud(publicId);
  return undefined;
}

/**
 * A private document for an administrator's viewer: `{ path }` for a file on disk, or `{ buffer }` for one fetched from the
 * cloud. Never leaves the private area.
 */
async function openPrivate(publicId) {
  if (isLocalId(publicId)) return { path: await resolveLocalPrivate(publicId) };
  if (String(publicId).startsWith(`${CLOUD_ROOT}/private/`) && credsPresent()) return { buffer: await readCloudPrivate(publicId) };
  throw ApiError.notFound('Document not found');
}

/** Absolute path of a private local file. Kept for code that only handles local files. */
const resolvePrivate = (publicId) => resolveLocalPrivate(publicId);

const toPhoto = ({ url, publicId, bytes, mime }) => ({ url, publicId, bytes, mime });

module.exports = { save, saveMany, remove, openPrivate, resolvePrivate, toPhoto, driver, _setCloudinary };