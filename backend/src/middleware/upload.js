'use strict';
const multer = require('multer');
const ApiError = require('../utils/ApiError');
const { sniffMime } = require('../utils/fileSniff');
const { MAX_DEVICE_PHOTOS } = require('../config/constants');

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const DOC_MIMES = [...IMAGE_MIMES, 'application/pdf'];
const MB = 1024 * 1024;

/**
 * Returns [multer, magic-byte check]. Files are kept in memory, then handed to the storage adapter.
 * After this runs: req.files[i].sniffedMime is the *real* type. Wrong type/oversize -> 422.
 */
function makeUpload({ field, maxFiles, maxBytes, allowed }) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: maxFiles, fields: 40 },
    fileFilter: (_req, file, cb) =>
      allowed.includes(file.mimetype)
        ? cb(null, true)
        : cb(ApiError.validation([{ field, message: `Unsupported file type. Allowed: ${allowed.join(', ')}` }])),
  });

  const parse = (req, res, next) =>
    upload.array(field, maxFiles)(req, res, (err) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        const message =
          err.code === 'LIMIT_FILE_SIZE' ? `Each file must be at most ${Math.round(maxBytes / MB)} MB`
            : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE' ? `At most ${maxFiles} files allowed`
              : err.message;
        return next(ApiError.validation([{ field, message }]));
      }
      return next(err);
    });

  const sniff = (req, _res, next) => {
    req.files = req.files || [];
    for (const f of req.files) {
      const real = sniffMime(f.buffer);
      if (!real || !allowed.includes(real)) {
        return next(ApiError.validation([{ field, message: `"${f.originalname}" is not a valid ${allowed.includes('application/pdf') ? 'image or PDF' : 'image'} file` }]));
      }
      f.sniffedMime = real;
    }
    return next();
  };

  return [parse, sniff];
}

const imageUpload = (field = 'photos', maxFiles = MAX_DEVICE_PHOTOS) =>
  makeUpload({ field, maxFiles, maxBytes: 5 * MB, allowed: IMAGE_MIMES });
const documentUpload = (field = 'documents', maxFiles = 3) =>
  makeUpload({ field, maxFiles, maxBytes: 10 * MB, allowed: DOC_MIMES });

module.exports = { imageUpload, documentUpload };
