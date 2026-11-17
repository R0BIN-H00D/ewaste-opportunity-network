'use strict';
// Dev seed: categories, admin, one demo account per role (+profiles), a verified demo school (recipient), a few sample listings.
// Safe to re-run (idempotent). Refuses to run in production.
const bcrypt = require('bcrypt');
const env = require('./config/env');
const logger = require('./utils/logger');
const { connectDB, disconnectDB } = require('./config/db');
const { CATEGORY_SEED, ROLES, ACCOUNT_STATUS } = require('./config/constants');
const { makePoint } = require('./utils/geo');
const M = require('./models');

const DEMO_PASSWORD = 'Demo@12345'; // development only
const APPROVED = { status: 'approved', reviewedAt: new Date() };

async function upsertUser({ email, name, role, status = ACCOUNT_STATUS.ACTIVE }, password) {
  let user = await M.User.findOne({ email });
  if (!user) {
    user = await M.User.create({ email, name, role, status, emailVerified: true, passwordHash: await bcrypt.hash(password, env.BCRYPT_COST) });
    logger.info(`created ${role}: ${email}`);
  }
  return user;
}

async function main() {
  if (env.isProd) throw new Error('Refusing to seed in production');
  await connectDB();

  // categories
  const cats = {};
  for (const [i, [name, slug, icon, hazardous]] of CATEGORY_SEED.entries()) {
    cats[slug] = await M.Category.findOneAndUpdate({ slug }, { $setOnInsert: { name, slug, icon, hazardous, order: i } }, { upsert: true, new: true });
  }
  logger.info(`categories: ${Object.keys(cats).length}`);

  // admin
  const adminEmail = env.ADMIN_SEED_EMAIL || 'admin@example.com';
  await upsertUser({ email: adminEmail, name: 'Platform Admin', role: ROLES.ADMIN }, env.ADMIN_SEED_PASSWORD || 'ChangeMe!12345');

  // learning-centre guides
  const adminUser = await M.User.findOne({ role: ROLES.ADMIN });
  logger.info(`education guides added: ${await require('./services/educationService').seedStarter(adminUser)}`);

  // demo accounts
  const user = await upsertUser({ email: 'user@demo.local', name: 'Demo User', role: ROLES.USER }, DEMO_PASSWORD);
  const tech = await upsertUser({ email: 'tech@demo.local', name: 'Demo Technician', role: ROLES.TECHNICIAN }, DEMO_PASSWORD);
  const student = await upsertUser({ email: 'student@demo.local', name: 'Demo Student', role: ROLES.STUDENT, status: ACCOUNT_STATUS.PENDING }, DEMO_PASSWORD);
  const refurb = await upsertUser({ email: 'refurb@demo.local', name: 'Demo Refurbisher', role: ROLES.REFURBISHER }, DEMO_PASSWORD);
  const recycler = await upsertUser({ email: 'recycler@demo.local', name: 'Demo Recycler', role: ROLES.RECYCLER }, DEMO_PASSWORD);
  // A verified recipient organisation (a general user with an organisation profile, A-02) so donations can be tried end to end.
  const school = await upsertUser({ email: 'school@demo.local', name: 'Demo School Coordinator', role: ROLES.USER }, DEMO_PASSWORD);

  const blr = makePoint(77.5946, 12.9716); // Bengaluru
  await M.UserProfile.updateOne({ user: user._id }, { $setOnInsert: { user: user._id, city: 'Bengaluru', addressArea: 'Indiranagar', location: blr } }, { upsert: true });
  await M.UserProfile.updateOne({ user: school._id }, { $setOnInsert: {
    user: school._id, city: 'Bengaluru', addressArea: 'Jayanagar', location: makePoint(77.58, 12.93),
    orgProfile: { isOrg: true, orgType: 'school', orgName: 'Demo Public School', registrationNo: 'DEMO-SCH-001', recipientVerification: APPROVED },
  } }, { upsert: true });
  await M.TechnicianProfile.updateOne({ user: tech._id }, { $setOnInsert: {
    user: tech._id, headline: 'Laptop & phone repair specialist', experienceYears: 6, specializations: ['laptop', 'smartphone'],
    deviceCategories: [cats.laptop._id, cats.smartphone._id, cats.tablet._id], serviceLocation: makePoint(77.6, 12.97), city: 'Bengaluru',
    baseRate: 500, verification: APPROVED, ratingAvg: 4.6, ratingCount: 12,
  } }, { upsert: true });
  await M.StudentProfile.updateOne({ user: student._id }, { $setOnInsert: { user: student._id, college: 'Demo Institute of Technology', course: 'B.E. Electronics', yearOfStudy: 3, verification: { status: 'pending' } } }, { upsert: true });
  await M.RefurbisherProfile.updateOne({ user: refurb._id }, { $setOnInsert: { user: refurb._id, businessName: 'ReNew Electronics', categories: [cats.laptop._id, cats.smartphone._id], city: 'Bengaluru', location: makePoint(77.58, 12.98), verification: APPROVED } }, { upsert: true });
  await M.RecyclingCenter.updateOne({ user: recycler._id }, { $setOnInsert: {
    user: recycler._id, name: 'GreenCycle Recyclers', authorizationNo: 'DEMO-0001', authorizingBody: 'Demo Authority (placeholder)',
    acceptedCategories: Object.values(cats).map((c) => c._id), city: 'Bengaluru', location: makePoint(77.62, 12.95), verification: APPROVED,
  } }, { upsert: true });

  // A supervised practical task from the demo technician, for students to apply to (BR-07: never a hazardous device type).
  const taskTitle = 'Diagnose a laptop that will not power on';
  if (!(await M.LearningOpportunity.findOne({ postedBy: tech._id, title: taskTitle }))) {
    await M.LearningOpportunity.create({
      postedBy: tech._id, title: taskTitle, deviceType: cats.laptop._id, difficulty: 'beginner', requiredSkills: ['multimeter', 'basic troubleshooting'],
      description: 'Work alongside the technician to test the charger, battery connector and power rail on a laptop that will not turn on. The technician handles every part that needs opening or soldering.',
      locationArea: 'Indiranagar, Bengaluru', deadline: new Date(Date.now() + 45 * 24 * 3600 * 1000), seats: 2, expectedHours: 6,
    });
  }

  // sample listings (seed bypasses the photo requirement; real clients must upload photos to publish)
  if ((await M.DeviceListing.countDocuments({ owner: user._id })) === 0) {
    const samples = [
      ['HP Pavilion 15 laptop', 'laptop', 'HP', 'Pavilion 15', 'minor_damage', 'repair'],
      ['Old Samsung phone', 'smartphone', 'Samsung', 'Galaxy J7', 'not_working', 'recycling'],
      ['Dell 22-inch monitor', 'monitor', 'Dell', 'P2219H', 'fully_working', 'donation'],
      ['Logitech keyboard & mouse', 'keyboard', 'Logitech', 'MK270', 'fully_working', 'reuse'],
      ['Lenovo ThinkPad T450', 'laptop', 'Lenovo', 'T450', 'major_damage', 'refurbishment'],
    ];
    for (const [title, slug, brand, model, condition, preferredService] of samples) {
      const device = await M.Device.create({ owner: user._id, name: title, category: cats[slug]._id, brand, model, purchaseYear: 2019, photos: [] });
      await M.DeviceListing.create({
        device: device._id, owner: user._id, category: cats[slug]._id, title, brand, model, condition, preferredService,
        description: `Demo listing: ${title}.`, city: 'Bengaluru', addressArea: 'Indiranagar', location: blr, status: 'listed',
      });
    }
    logger.info('sample listings: 5');
  }

  logger.info(`Seed complete. Demo logins use password "${DEMO_PASSWORD}" (dev only). Admin: ${adminEmail}`);
  await disconnectDB();
}

main().catch(async (err) => {
  logger.error({ err: err.message }, 'Seed failed');
  await disconnectDB().catch(() => {});
  process.exit(1);
});
