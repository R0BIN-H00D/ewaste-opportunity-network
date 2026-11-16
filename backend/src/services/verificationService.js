'use strict';
const ApiError = require('../utils/ApiError');
const storage = require('./integrations/storage');
const VerificationDocument = require('../models/VerificationDocument');
const { ROLES, PROVIDER_ROLES } = require('../config/constants');
const { ROLE_PROFILE_MODEL } = require('./profileModels');

const MAX_DOCS = 10;
const SUBMITTABLE = ['not_submitted', 'rejected', 'resubmission_required'];

// Which document types make sense for which provider role (BR-01).
const ALLOWED_TYPES = {
  [ROLES.TECHNICIAN]: ['id_proof', 'qualification', 'other'],
  [ROLES.STUDENT]: ['student_id', 'id_proof', 'other'],
  [ROLES.REFURBISHER]: ['business', 'id_proof', 'authorization', 'other'],
  [ROLES.RECYCLER]: ['authorization', 'business', 'id_proof', 'other'],
};

/** Never exposes where the private file lives. */
const toDoc = (d) => ({
  _id: d._id,
  docType: d.docType,
  status: d.status,
  reason: d.reason,
  submittedAt: d.submittedAt,
  reviewedAt: d.reviewedAt,
  file: { mime: d.file?.mime, bytes: d.file?.bytes, originalName: d.file?.originalName },
});

function assertProvider(user) {
  if (!PROVIDER_ROLES.includes(user.role)) throw ApiError.forbidden('Only provider accounts submit verification documents');
}

async function getStatus(user) {
  assertProvider(user);
  const [profile, docs] = await Promise.all([
    ROLE_PROFILE_MODEL[user.role].findOne({ user: user.id }).select('verification').lean(),
    VerificationDocument.find({ owner: user.id }).sort({ submittedAt: -1 }).lean(),
  ]);
  return {
    status: profile?.verification?.status || 'not_submitted',
    reason: profile?.verification?.reason,
    reviewedAt: profile?.verification?.reviewedAt,
    allowedDocTypes: ALLOWED_TYPES[user.role],
    documents: docs.map(toDoc),
  };
}

async function submit(user, docType, files) {
  assertProvider(user);
  if (!ALLOWED_TYPES[user.role].includes(docType)) {
    throw ApiError.validation([{ field: 'docType', message: `Allowed for your role: ${ALLOWED_TYPES[user.role].join(', ')}` }]);
  }
  if (!files?.length) throw ApiError.validation([{ field: 'documents', message: 'Attach at least one file' }]);

  const existing = await VerificationDocument.countDocuments({ owner: user.id });
  if (existing + files.length > MAX_DOCS) {
    throw ApiError.validation([{ field: 'documents', message: `You can keep at most ${MAX_DOCS} documents; delete some first` }]);
  }

  const saved = await storage.saveMany(files, { folder: `verification/${user.id}`, isPrivate: true });
  let docs;
  try {
    docs = await VerificationDocument.insertMany(
      saved.map((s, i) => ({
        owner: user.id,
        ownerRole: user.role,
        docType,
        file: { publicId: s.publicId, storage: s.storage, bytes: s.bytes, mime: s.mime, originalName: files[i].originalname?.slice(0, 200) },
      })),
    );
  } catch (err) {
    await Promise.all(saved.map((s) => storage.remove(s.publicId)));
    throw err;
  }

  const Profile = ROLE_PROFILE_MODEL[user.role];
  const profile = await Profile.findOne({ user: user.id });
  if (SUBMITTABLE.includes(profile.verification?.status || 'not_submitted')) {
    profile.verification = { status: 'pending' }; // clears any earlier rejection reason / reviewer
  }
  if (user.role === ROLES.STUDENT && docType === 'student_id') profile.studentIdDoc = docs[0]._id;
  await profile.save();

  return { verificationStatus: profile.verification.status, documents: docs.map(toDoc) };
}

async function remove(user, docId) {
  assertProvider(user);
  const doc = await VerificationDocument.findOne({ _id: docId, owner: user.id });
  if (!doc) throw ApiError.notFound('Document not found');
  if (doc.status === 'approved') throw ApiError.conflict('Approved documents cannot be deleted', 'DOC_APPROVED');

  await VerificationDocument.deleteOne({ _id: doc._id });
  await storage.remove(doc.file.publicId);

  // Nothing left waiting for review: the submission goes back to "not submitted".
  const Profile = ROLE_PROFILE_MODEL[user.role];
  const profile = await Profile.findOne({ user: user.id });
  if (profile?.verification?.status === 'pending') {
    const pendingLeft = await VerificationDocument.countDocuments({ owner: user.id, status: 'pending' });
    if (!pendingLeft) {
      profile.verification = { status: 'not_submitted' };
      await profile.save();
    }
  }
}

module.exports = { getStatus, submit, remove, toDoc, ALLOWED_TYPES, MAX_DOCS };
