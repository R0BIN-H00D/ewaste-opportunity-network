'use strict';
// Demo data: new provider accounts waiting for admin verification (with a document each) and sample requests from users
// to technicians, refurbishers and recyclers. Safe to re-run (skips what exists). Development only.
// Run: node src/seedRequests.js
const bcrypt = require('bcrypt');
const env = require('./config/env');
const logger = require('./utils/logger');
const { connectDB, disconnectDB } = require('./config/db');
const { ROLES, ACCOUNT_STATUS } = require('./config/constants');
const { makePoint } = require('./utils/geo');
const storage = require('./services/integrations/storage');
const M = require('./models');

const PASSWORD = 'Demo@12345';
const DAY = 24 * 3600 * 1000;
const ago = (d, h = 0) => new Date(Date.now() - d * DAY - h * 3600 * 1000);
const ahead = (d) => new Date(Date.now() + d * DAY);
const ref = () => `REC-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const PDF = (title) => Buffer.from(`%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 100]>>endobj\n%% ${title}\ntrailer<</Root 1 0 R>>\n%%EOF`);

async function account(email, name, role, extra = {}) {
  let u = await M.User.findOne({ email });
  if (!u) u = await M.User.create({ email, name, role, status: ACCOUNT_STATUS.ACTIVE, emailVerified: true, passwordHash: await bcrypt.hash(PASSWORD, env.BCRYPT_COST), ...extra });
  return u;
}

async function pendingProvider(email, name, role, profileFields, docType, docTitle) {
  const exists = await M.User.findOne({ email });
  const u = await account(email, name, role, { status: ACCOUNT_STATUS.PENDING });
  if (exists) return u;
  const profile = { user: u._id, verification: { status: 'pending' }, ...profileFields };
  if (role === ROLES.TECHNICIAN) await M.TechnicianProfile.create(profile);
  if (role === ROLES.REFURBISHER) await M.RefurbisherProfile.create(profile);
  if (role === ROLES.RECYCLER) await M.RecyclingCenter.create(profile);
  const saved = await storage.save({ buffer: PDF(docTitle), mimetype: 'application/pdf', originalname: `${docTitle}.pdf` }, { folder: `verification/${u._id}`, isPrivate: true });
  await M.VerificationDocument.create({
    owner: u._id, ownerRole: role, docType, submittedAt: ago(0, 2),
    file: { publicId: saved.publicId, storage: saved.storage, bytes: saved.bytes, mime: saved.mime, originalName: `${docTitle}.pdf` },
  });
  return u;
}

async function main() {
  if (env.isProd) throw new Error('Refusing to seed in production');
  await connectDB();
  const cats = {};
  for (const c of await M.Category.find().lean()) cats[c.slug] = c;
  const get = (email) => M.User.findOne({ email });
  const [demo, meera, rahul, priya, tech, arjun, refurb, recycler] = await Promise.all(
    ['user@demo.local', 'meera@demo.local', 'rahul@demo.local', 'priya@demo.local', 'tech@demo.local', 'arjun@demo.local', 'refurb@demo.local', 'recycler@demo.local'].map(get),
  );
  if (!demo || !tech || !refurb || !recycler) throw new Error('Run "npm run seed" first.');

  // ---- verification requests to the admin: the existing provider accounts are already approved, so new ones --------
  const kavya = await pendingProvider('kavya.tech@demo.local', 'Kavya Reddy', ROLES.TECHNICIAN, {
    headline: 'Laptop and smartphone repair', experienceYears: 5, specializations: ['laptop', 'smartphone'],
    deviceCategories: [cats.laptop._id, cats.smartphone._id], serviceLocation: makePoint(77.6, 12.97), city: 'Bengaluru', baseRate: 350,
  }, 'id_proof', 'Aadhaar-ID-Kavya-Reddy');
  const greenloop = await pendingProvider('greenloop.refurb@demo.local', 'GreenLoop Refurbs', ROLES.REFURBISHER, {
    businessName: 'GreenLoop Refurbs', registrationNo: 'GST-29AAEFG1234Q1ZP', description: 'We refurbish used laptops and desktops and resell them to students.',
    categories: [cats.laptop._id, cats['desktop-computer']._id], city: 'Bengaluru', addressArea: 'Jayanagar', location: makePoint(77.58, 12.93),
  }, 'business', 'GreenLoop-Business-Registration');
  const ecocycle = await pendingProvider('ecocycle.recycler@demo.local', 'EcoCycle Recyclers', ROLES.RECYCLER, {
    name: 'EcoCycle Recyclers', authorizationNo: 'KSPCB/EW/2026/0412', authorizingBody: 'State Pollution Control Board', validUntil: ahead(700),
    facilityDetails: 'Authorised e-waste dismantling facility.', acceptedCategories: [cats.laptop._id, cats.smartphone._id, cats.printer._id],
    city: 'Bengaluru', location: makePoint(77.66, 12.99), operatingHours: 'Mon-Sat 9:00-18:00',
  }, 'authorization', 'EcoCycle-Pollution-Board-Authorization');

  // ---- requests from users ----------------------------------------------------------------------------------------
  if (await M.DeviceListing.findOne({ title: 'Acer Aspire 5, keyboard keys not working' })) {
    logger.info('Sample requests already exist.');
    await disconnectDB();
    return;
  }
  const listing = async (owner, { title, slug, brand, model, condition, service, area, price }) => {
    const device = await M.Device.create({ owner: owner._id, name: title, category: cats[slug]._id, brand, model, purchaseYear: 2020, photos: [] });
    return M.DeviceListing.create({
      device: device._id, owner: owner._id, category: cats[slug]._id, title, brand, model, condition, preferredService: service, expectedPrice: price,
      description: `${title}.`, city: 'Bengaluru', addressArea: area, location: makePoint(77.6 + Math.random() * 0.06, 12.9 + Math.random() * 0.08), status: 'listed',
    });
  };
  const hist = (user, at) => [{ status: 'request_submitted', by: user._id, at }];
  const repair = async (owner, t, issue, fields) => {
    const l = await listing(owner, { ...t, service: 'repair' });
    return M.ServiceRequest.create({ listing: l._id, customer: owner._id, issueDescription: issue, statusHistory: hist(owner, fields.at || ago(0, 4)), ...fields });
  };

  // To technicians: some sent straight to one technician, some open to all.
  await repair(demo, { title: 'Acer Aspire 5, keyboard keys not working', slug: 'laptop', brand: 'Acer', model: 'Aspire 5', condition: 'minor_damage', area: 'Indiranagar' },
    'Several keys stopped working after water was spilled. Needs a keyboard check or replacement.', { mode: 'targeted', invitedTechnicians: [tech._id], at: ago(0, 5) });
  await repair(meera, { title: 'HP LaserJet printer, paper jam error', slug: 'printer', brand: 'HP', model: 'LaserJet M111', condition: 'minor_damage', area: 'Koramangala' },
    'Shows a paper jam error all the time though nothing is stuck.', { mode: 'targeted', invitedTechnicians: [arjun._id, kavya._id], at: ago(1) });
  await repair(rahul, { title: 'OnePlus Nord, charging port loose', slug: 'smartphone', brand: 'OnePlus', model: 'Nord CE', condition: 'minor_damage', area: 'HSR Layout' },
    'The charger falls out and the phone only charges at an angle.', { mode: 'open', at: ago(0, 9) });
  await repair(priya, { title: 'Samsung 43-inch TV, no picture', slug: 'television', brand: 'Samsung', model: 'UA43T', condition: 'major_damage', area: 'Whitefield' },
    'There is sound but the screen stays black. Backlight problem maybe.', { mode: 'open', at: ago(0, 12) });
  await repair(demo, { title: 'Dell 24-inch monitor, flickering', slug: 'monitor', brand: 'Dell', model: 'P2419H', condition: 'minor_damage', area: 'Indiranagar' },
    'The screen flickers every few minutes, more when it gets warm.', { mode: 'targeted', invitedTechnicians: [kavya._id], at: ago(2) });

  // To refurbishers: devices offered for refurbishment (they appear on the refurbisher board), plus one offer already made.
  const rf1 = await listing(demo, { title: 'Old Lenovo ThinkCentre desktop', slug: 'desktop-computer', brand: 'Lenovo', model: 'ThinkCentre M72e', condition: 'major_damage', service: 'refurbishment', area: 'Indiranagar', price: 3000 });
  await listing(meera, { title: 'MacBook Air 2015, battery swollen', slug: 'laptop', brand: 'Apple', model: 'MacBook Air A1466', condition: 'major_damage', service: 'refurbishment', area: 'Koramangala', price: 9000 });
  await listing(rahul, { title: 'Three old Dell Latitude laptops', slug: 'laptop', brand: 'Dell', model: 'Latitude E6410', condition: 'not_working', service: 'refurbishment', area: 'HSR Layout', price: 6000 });
  await listing(priya, { title: 'Lenovo tablet, not charging', slug: 'tablet', brand: 'Lenovo', model: 'Tab M8', condition: 'minor_damage', service: 'refurbishment', area: 'Whitefield', price: 2500 });
  await M.RefurbishmentJob.create({
    listing: rf1._id, owner: demo._id, refurbisher: refurb._id, status: 'offered',
    offer: { amount: 2800, message: 'We can collect this week and refurbish it for a student lab.', status: 'pending' }, history: [{ status: 'offered', at: ago(0, 3), by: refurb._id }],
  });
  await M.DeviceListing.updateOne({ _id: rf1._id }, { $set: { status: 'in_service' } });

  // To recyclers: recycling requests to the recycling centres.
  const centres = await M.RecyclingCenter.find({ user: { $in: [recycler._id, ecocycle._id] } });
  const recycle = async (owner, centre, t, fields = {}) => {
    const l = await listing(owner, { ...t, service: 'recycling' });
    return M.RecyclingRecord.create({
      listing: l._id, requester: owner._id, center: centre._id, categories: [l.category], deviceCount: 1, status: 'requested', refNo: ref(),
      pickupAddressArea: l.addressArea, pickupAddress: `Flat 12, ${l.addressArea}, Bengaluru`, preferredDate: ahead(2), checklistAcknowledgedAt: ago(0, 6),
      history: [{ status: 'requested', at: ago(0, 6), by: owner._id }], ...fields,
    });
  };
  const [c1, c2] = [centres.find((c) => String(c.user) === String(recycler._id)), centres.find((c) => String(c.user) === String(ecocycle._id))];
  await recycle(demo, c1, { title: 'Broken CRT monitor and keyboards', slug: 'monitor', brand: 'Samsung', model: 'SyncMaster', condition: 'not_working', area: 'Indiranagar' }, { deviceCount: 3, notes: 'One monitor and two keyboards.' });
  await recycle(meera, c1, { title: 'Dead laptop batteries and chargers', slug: 'electronic-accessories', brand: 'Mixed', model: '', condition: 'not_working', area: 'Koramangala' }, { deviceCount: 5, notes: 'Batteries are swollen, please handle with care.' });
  await recycle(rahul, c1, { title: 'Old inkjet printer', slug: 'printer', brand: 'Epson', model: 'L220', condition: 'not_working', area: 'HSR Layout' });
  await recycle(priya, c1, { title: 'Broken smartphone, cracked and dead', slug: 'smartphone', brand: 'Redmi', model: 'Note 7', condition: 'not_working', area: 'Whitefield' });
  void c2; // EcoCycle is pending, so it is not yet shown to users; requests go to the verified centre.

  logger.info('Requests and verification requests added.');
  await disconnectDB();
}

main().catch(async (err) => {
  logger.error({ err: err.message, stack: err.stack }, 'Seed failed');
  await disconnectDB().catch(() => {});
  process.exit(1);
});
