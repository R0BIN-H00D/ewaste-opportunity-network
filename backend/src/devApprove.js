'use strict';
// Development helper: approves a provider account (technician, student, refurbisher or recycling centre) so you can try provider features without an admin screen.
// Usage: npm run dev:approve -- someone@example.com
// Refuses to run in production. In real use an administrator approves providers (BR-01).
require('dotenv').config();
const mongoose = require('mongoose');
const env = require('./config/env');
const User = require('./models/User');
const TechnicianProfile = require('./models/TechnicianProfile');
const StudentProfile = require('./models/StudentProfile');
const RefurbisherProfile = require('./models/RefurbisherProfile');
const RecyclingCenter = require('./models/RecyclingCenter');
const UserProfile = require('./models/UserProfile');

async function main() {
  if (env.isProd) throw new Error('Refusing to run in production');
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!email) throw new Error('Usage: npm run dev:approve -- <email>');
  await mongoose.connect(env.MONGODB_URI);
  const user = await User.findOne({ email });
  if (!user) throw new Error(`No user with email ${email}`);
  user.status = 'active';
  await user.save();
  const approve = { $set: { 'verification.status': 'approved', 'verification.reviewedAt': new Date() } };
  // The provider profile that matches the account's role (technician, student, refurbisher or recycling centre).
  const Model = { technician: TechnicianProfile, student: StudentProfile, refurbisher: RefurbisherProfile, recycler: RecyclingCenter }[user.role] || TechnicianProfile;
  const res = await Model.updateOne({ user: user._id }, approve);
  // A general user who registered an organisation is approved as a donation recipient (A-02).
  const org = await UserProfile.updateOne({ user: user._id, 'orgProfile.isOrg': true }, { $set: { 'orgProfile.recipientVerification.status': 'approved', 'orgProfile.recipientVerification.reviewedAt': new Date() } });
  console.log(`Approved ${email} (${user.role}). Provider profile updated: ${res.matchedCount === 1 ? 'yes' : 'none found'}. Recipient organisation approved: ${org.matchedCount === 1 ? 'yes' : 'no'}.`);
}

main()
  .catch((err) => { console.error(err.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
