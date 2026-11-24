'use strict';
// Presentation data: fills every part of the app with believable activity, so each role has something to look at the moment
// they sign in (requests asked for and in progress, new requests waiting for a technician, donations, orders, recycling...).
// Run `npm run seed` first (categories and the base demo accounts), then `npm run seed:demo`.
// Safe to re-run: if the presentation data is already there it does nothing. Development only; it refuses to run in production.
const bcrypt = require('bcrypt');
const { DEMO_PRODUCT_DETAILS } = require('./demoProductDetails');
const env = require('./config/env');
const logger = require('./utils/logger');
const { connectDB, disconnectDB } = require('./config/db');
const { ROLES, ACCOUNT_STATUS } = require('./config/constants');
const { makePoint } = require('./utils/geo');
const M = require('./models');

const PASSWORD = 'Demo@12345';
const APPROVED = { status: 'approved', reviewedAt: new Date() };
const DAY = 24 * 3600 * 1000;
const ago = (days, hours = 0) => new Date(Date.now() - days * DAY - hours * 3600 * 1000);
const ahead = (days) => new Date(Date.now() + days * DAY);
const ref = (prefix) => `${prefix}-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

async function user(email, name, role, extra = {}) {
  let u = await M.User.findOne({ email });
  if (!u) u = await M.User.create({ email, name, role, status: ACCOUNT_STATUS.ACTIVE, emailVerified: true, passwordHash: await bcrypt.hash(PASSWORD, env.BCRYPT_COST), ...extra });
  return u;
}

async function main() {
  if (env.isProd) throw new Error('Refusing to seed in production');
  await connectDB();

  const cats = {};
  for (const c of await M.Category.find().lean()) cats[c.slug] = c;
  const demo = await M.User.findOne({ email: 'user@demo.local' });
  const tech = await M.User.findOne({ email: 'tech@demo.local' });
  const refurb = await M.User.findOne({ email: 'refurb@demo.local' });
  const recycler = await M.User.findOne({ email: 'recycler@demo.local' });
  const school = await M.User.findOne({ email: 'school@demo.local' });
  const admin = await M.User.findOne({ role: ROLES.ADMIN });
  if (!cats.laptop || !demo || !tech || !refurb || !recycler || !school || !admin) throw new Error('Run "npm run seed" first (categories and the base demo accounts are missing).');
  if (await M.User.findOne({ email: 'meera@demo.local' })) {
    logger.info('Presentation data is already there. Nothing to do.');
    await disconnectDB();
    return;
  }
  const centre = await M.RecyclingCenter.findOne({ user: recycler._id });

  // ---- more people ------------------------------------------------------------------------------------------------
  const meera = await user('meera@demo.local', 'Meera Iyer', ROLES.USER);
  const rahul = await user('rahul@demo.local', 'Rahul Sharma', ROLES.USER);
  const priya = await user('priya@demo.local', 'Priya Nair', ROLES.USER);
  const arjun = await user('arjun@demo.local', 'Arjun Mehta', ROLES.TECHNICIAN);
  const areas = [[meera, 'Koramangala', [77.6245, 12.9352]], [rahul, 'HSR Layout', [77.6474, 12.9116]], [priya, 'Whitefield', [77.7500, 12.9698]]];
  for (const [u, area, [lng, lat]] of areas) {
    await M.UserProfile.updateOne({ user: u._id }, { $setOnInsert: { user: u._id, city: 'Bengaluru', addressArea: area, location: makePoint(lng, lat) } }, { upsert: true });
  }
  await M.TechnicianProfile.updateOne({ user: arjun._id }, { $setOnInsert: {
    user: arjun._id, headline: 'Desktop, printer and TV repairs', experienceYears: 9, specializations: ['desktop-computer', 'printer', 'television'],
    deviceCategories: [cats['desktop-computer']._id, cats.printer._id, cats.television._id, cats.monitor._id], serviceLocation: makePoint(77.64, 12.92), city: 'Bengaluru',
    baseRate: 400, verification: APPROVED, ratingAvg: 4.8, ratingCount: 31, completedJobs: 31,
  } }, { upsert: true });
  await M.TechnicianProfile.updateOne({ user: tech._id }, { $set: { completedJobs: 12, ratingAvg: 4.6, ratingCount: 12, earningsTotal: 18400, 'availability.status': 'available' } });

  // ---- devices and listings ---------------------------------------------------------------------------------------
  const makeListing = async (owner, { title, slug, brand, model, condition, service, status = 'listed', area, price }) => {
    const device = await M.Device.create({ owner: owner._id, name: title, category: cats[slug]._id, brand, model, purchaseYear: 2020, photos: [] });
    return M.DeviceListing.create({
      device: device._id, owner: owner._id, category: cats[slug]._id, title, brand, model, condition, preferredService: service,
      description: `${title}. ${condition === 'fully_working' ? 'Works well, no known faults.' : 'Has the fault described in the request.'}`, city: 'Bengaluru',
      addressArea: area || 'Koramangala', location: makePoint(77.62 + Math.random() * 0.04, 12.92 + Math.random() * 0.06), status, expectedPrice: price,
    });
  };
  const L = {
    meeraLaptop: await makeListing(meera, { title: 'Dell Inspiron 15 laptop, screen flickers', slug: 'laptop', brand: 'Dell', model: 'Inspiron 15 3511', condition: 'minor_damage', service: 'repair', status: 'in_service' }),
    meeraOld: await makeListing(meera, { title: 'Lenovo IdeaPad with a weak battery', slug: 'laptop', brand: 'Lenovo', model: 'IdeaPad S145', condition: 'minor_damage', service: 'repair', status: 'completed' }),
    rahulPhone: await makeListing(rahul, { title: 'iPhone 8, battery drains fast', slug: 'smartphone', brand: 'Apple', model: 'iPhone 8', condition: 'minor_damage', service: 'repair', area: 'HSR Layout' }),
    rahulKeys: await makeListing(rahul, { title: 'Keyboard and mouse set', slug: 'keyboard', brand: 'Logitech', model: 'MK270', condition: 'fully_working', service: 'donation', status: 'in_service', area: 'HSR Layout' }),
    rahulPhone2: await makeListing(rahul, { title: 'Old Nokia phone and chargers', slug: 'smartphone', brand: 'Nokia', model: '105', condition: 'not_working', service: 'recycling', area: 'HSR Layout' }),
    priyaTablet: await makeListing(priya, { title: 'Samsung Galaxy Tab A, cracked screen', slug: 'tablet', brand: 'Samsung', model: 'Tab A 10.1', condition: 'major_damage', service: 'repair', area: 'Whitefield' }),
    priyaTv: await makeListing(priya, { title: 'Box of old cables and a dead router', slug: 'electronic-accessories', brand: 'Mixed', model: '', condition: 'not_working', service: 'recycling', area: 'Whitefield' }),
    demoPrinter: await makeListing(demo, { title: 'Canon PIXMA printer, will not print', slug: 'printer', brand: 'Canon', model: 'PIXMA G3010', condition: 'minor_damage', service: 'repair', status: 'in_service', area: 'Indiranagar' }),
    demoDesktop: await makeListing(demo, { title: 'Old Dell desktop computer', slug: 'desktop-computer', brand: 'Dell', model: 'OptiPlex 3020', condition: 'major_damage', service: 'refurbishment', area: 'Indiranagar' }),
    demoMonitorDone: await makeListing(demo, { title: 'LG 19-inch monitor', slug: 'monitor', brand: 'LG', model: '19M38A', condition: 'fully_working', service: 'donation', status: 'completed', area: 'Indiranagar' }),
    demoLaptopRepair: await M.DeviceListing.findOne({ owner: demo._id, title: 'HP Pavilion 15 laptop' }),
    demoMonitor: await M.DeviceListing.findOne({ owner: demo._id, title: 'Dell 22-inch monitor' }),
    demoThinkpad: await M.DeviceListing.findOne({ owner: demo._id, title: 'Lenovo ThinkPad T450' }),
  };
  if (L.demoThinkpad) await M.DeviceListing.updateOne({ _id: L.demoThinkpad._id }, { $set: { status: 'in_service' } });

  // ---- repairs: asked for, new for technicians, running, finished -------------------------------------------------
  const note = (id, type, title, body, to, extra = {}) => M.Notification.create({ user: id, type, title, body, data: { deepLink: to }, ...extra });
  const request = (listing, customer, fields) => M.ServiceRequest.create({ listing: listing._id, customer: customer._id, issueDescription: 'See the device description.', ...fields });
  const hist = (...entries) => entries.map(([status, by, at, text]) => ({ status, by: by._id, at, note: text }));

  // New requests waiting on the technician board (open to anyone suitable) and one sent straight to the demo technician.
  const reqPhone = await request(L.rahulPhone, rahul, { mode: 'open', issueDescription: 'The battery drops from 100% to 20% in a couple of hours and the phone gets warm.', statusHistory: hist(['request_submitted', rahul, ago(0, 3)]) });
  const reqTablet = await request(L.priyaTablet, priya, { mode: 'open', issueDescription: 'Fell on the floor. The screen is cracked but the tablet still turns on and the touch works.', statusHistory: hist(['request_submitted', priya, ago(0, 8)]) });
  const reqLaptop = await request(L.demoLaptopRepair, demo, { mode: 'targeted', invitedTechnicians: [tech._id], issueDescription: 'Laptop gets very slow and the fan is loud. Maybe a thermal paste or storage problem.', statusHistory: hist(['request_submitted', demo, ago(1)]) });
  await M.DeviceListing.updateOne({ _id: L.demoLaptopRepair._id }, { $set: { preferredService: 'repair' } });

  // Quotation waiting for the customer to decide.
  const reqPrinter = await request(L.demoPrinter, demo, { mode: 'targeted', technician: arjun._id, status: 'customer_approval_pending', issueDescription: 'Prints blank pages. Ink was changed last month.', diagnosisNotes: 'Print head is clogged. A deep clean and a new ink tube set will fix it.', statusHistory: hist(['request_submitted', demo, ago(3)], ['technician_assigned', arjun, ago(3)], ['diagnosis_in_progress', arjun, ago(2)], ['quotation_submitted', arjun, ago(1)]) });
  const quotePrinter = await M.Quotation.create({ serviceRequest: reqPrinter._id, technician: arjun._id, amount: 1800, breakdown: [{ label: 'Print head cleaning', amount: 600 }, { label: 'Ink tubes and refill', amount: 900 }, { label: 'Labour', amount: 300 }], parts: ['Ink tube set'], etaDays: 2, validUntil: ahead(5), notes: 'Includes a test print on delivery.' });
  await M.ServiceRequest.updateOne({ _id: reqPrinter._id }, { $set: { activeQuotation: quotePrinter._id } });

  // Running now: the demo technician is repairing Meera's laptop.
  const reqRunning = await request(L.meeraLaptop, meera, {
    mode: 'targeted', technician: tech._id, status: 'repair_in_progress', issueDescription: 'The screen flickers and sometimes goes black for a few seconds.',
    diagnosisNotes: 'The display cable is loose and the panel connector is worn.',
    statusHistory: hist(['request_submitted', meera, ago(5)], ['technician_assigned', tech, ago(5)], ['quotation_submitted', tech, ago(4)], ['repair_in_progress', tech, ago(2)]),
    progressUpdates: [{ text: 'Opened the laptop and found the display cable loose. Ordered a new cable.', by: tech._id, at: ago(2) }, { text: 'New cable fitted. Running a two-hour stress test now.', by: tech._id, at: ago(0, 5) }],
    repairNotes: [{ text: 'Display cable replaced; hinge tightened.', by: tech._id, at: ago(0, 5) }],
  });
  const quoteRunning = await M.Quotation.create({ serviceRequest: reqRunning._id, technician: tech._id, amount: 2400, breakdown: [{ label: 'Display cable', amount: 1400 }, { label: 'Labour', amount: 1000 }], parts: ['Display cable'], etaDays: 3, validUntil: ahead(2), status: 'accepted', decidedAt: ago(3) });
  await M.ServiceRequest.updateOne({ _id: reqRunning._id }, { $set: { activeQuotation: quoteRunning._id } });

  // Finished: Meera's old laptop, with a review, a payment record and the impact it counts for.
  const reqDone = await request(L.meeraOld, meera, {
    mode: 'targeted', technician: tech._id, status: 'service_completed', customerConfirmedAt: ago(10), reviewed: true, issueDescription: 'Battery lasts only twenty minutes.',
    statusHistory: hist(['request_submitted', meera, ago(18)], ['technician_assigned', tech, ago(18)], ['repair_in_progress', tech, ago(14)], ['repair_completed', tech, ago(11)], ['service_completed', meera, ago(10)]),
  });
  const quoteDone = await M.Quotation.create({ serviceRequest: reqDone._id, technician: tech._id, amount: 3200, breakdown: [{ label: 'New battery', amount: 2700 }, { label: 'Labour', amount: 500 }], etaDays: 2, status: 'accepted', decidedAt: ago(16) });
  await M.ServiceRequest.updateOne({ _id: reqDone._id }, { $set: { activeQuotation: quoteDone._id } });
  await M.Transaction.create({ type: 'repair', refType: 'ServiceRequest', refId: reqDone._id, payer: meera._id, payee: tech._id, amount: 3200, method: 'offline', status: 'recorded' });
  await M.EnvironmentalImpact.create({ user: meera._id, type: 'repair', refType: 'ServiceRequest', refId: reqDone._id, category: cats.laptop._id, devices: 1, co2eEstimate: 50, verifiedBy: meera._id, verifiedAt: ago(10) });

  // ---- reviews -----------------------------------------------------------------------------------------------------
  const reviews = [
    [meera, tech, ROLES.TECHNICIAN, 'service', reqDone._id, 5, 'Explained the fault clearly and fixed it in two days. The battery works like new.'],
    [rahul, tech, ROLES.TECHNICIAN, 'service', new M.ServiceRequest()._id, 5, 'Quick, honest and fairly priced.'],
    [priya, tech, ROLES.TECHNICIAN, 'service', new M.ServiceRequest()._id, 4, 'Good work, finished a day later than promised.'],
    [demo, arjun, ROLES.TECHNICIAN, 'service', new M.ServiceRequest()._id, 5, 'Fixed my TV in one visit.'],
    [rahul, refurb, ROLES.REFURBISHER, 'order', new M.Order()._id, 5, 'The laptop was exactly as described and came with a charger.'],
    [meera, refurb, ROLES.REFURBISHER, 'order', new M.Order()._id, 4, 'Good condition, small scratch that was disclosed.'],
  ];
  for (const [reviewer, target, targetRole, contextType, contextId, rating, comment] of reviews) {
    await M.Review.create({ reviewer: reviewer._id, target: target._id, targetRole, contextType, contextId, rating, quality: rating, communication: rating, timeliness: rating, comment });
  }

  // ---- donations: open, being arranged, finished ------------------------------------------------------------------
  if (L.demoMonitor) {
    const open = await M.Donation.create({ listing: L.demoMonitor._id, donor: demo._id, description: 'A working 22-inch monitor, happy to give it to a school lab.', status: 'requested', history: [{ status: 'open', at: ago(2), by: demo._id }, { status: 'requested', at: ago(1), by: school._id }] });
    await M.DonationRequest.create({ donation: open._id, requester: school._id, justification: 'Our computer lab has 12 machines and four of them have no monitor.', intendedUse: 'Computer lab for classes 6 to 8' });
  }
  const arranged = await M.Donation.create({ listing: L.rahulKeys._id, donor: rahul._id, description: 'Keyboard and mouse set, all keys working.', status: 'handover_scheduled', history: [{ status: 'open', at: ago(5), by: rahul._id }, { status: 'accepted', at: ago(3), by: rahul._id }, { status: 'handover_scheduled', at: ago(2), by: rahul._id }] });
  const arrangedReq = await M.DonationRequest.create({ donation: arranged._id, requester: school._id, justification: 'For students who practise typing in our library.', status: 'accepted', decidedAt: ago(3) });
  await M.Donation.updateOne({ _id: arranged._id }, { $set: { acceptedRequest: arrangedReq._id } });
  const arrangedPickup = await M.PickupSchedule.create({ contextType: 'donation', contextId: arranged._id, requester: school._id, provider: rahul._id, date: ahead(2), timeSlot: '10:00-12:00', addressArea: 'HSR Layout', status: 'confirmed', proposedBy: school._id, notes: 'Please call from the gate.' });
  await M.Donation.updateOne({ _id: arranged._id }, { $set: { pickup: arrangedPickup._id } });
  const finished = await M.Donation.create({ listing: L.demoMonitorDone._id, donor: demo._id, description: 'LG 19-inch monitor, works well.', status: 'completed', confirmation: { refNo: ref('DON'), issuedAt: ago(9) }, confirmations: { donorAt: ago(9), recipientAt: ago(9) }, history: [{ status: 'open', at: ago(15), by: demo._id }, { status: 'completed', at: ago(9), by: school._id }] });
  await M.DonationRequest.create({ donation: finished._id, requester: school._id, justification: 'For our reading room.', status: 'accepted', decidedAt: ago(13) });
  await M.EnvironmentalImpact.create({ user: demo._id, type: 'donation', refType: 'Donation', refId: finished._id, category: cats.monitor._id, devices: 1, co2eEstimate: 45, verifiedBy: school._id, verifiedAt: ago(9) });

  // ---- refurbishment, shop products and orders --------------------------------------------------------------------
  const jobRunning = await M.RefurbishmentJob.create({
    listing: L.demoThinkpad._id, owner: demo._id, refurbisher: refurb._id, offer: { amount: 4000, message: 'We will replace the battery and fit an SSD, then sell it with a 3 month warranty.', status: 'accepted' },
    status: 'in_progress', workLog: [{ text: 'Device collected and assessed. Battery and SSD needed.', at: ago(4) }, { text: 'New SSD installed, now cleaning and testing.', at: ago(1) }],
    confirmations: { ownerAt: ago(5), refurbisherAt: ago(5) }, history: [{ status: 'offered', at: ago(8), by: refurb._id }, { status: 'accepted', at: ago(7), by: demo._id }, { status: 'collected', at: ago(5), by: refurb._id }, { status: 'in_progress', at: ago(3), by: refurb._id }],
  });
  await M.RefurbishmentJob.create({ listing: L.demoDesktop._id, owner: demo._id, refurbisher: refurb._id, offer: { amount: 2500, message: 'Good candidate for a budget home PC. We can collect it this week.', status: 'pending' }, status: 'offered', history: [{ status: 'offered', at: ago(1), by: refurb._id }] });
  void jobRunning;

  const product = (title, slug, brand, model, condition, price, info, stock = 3, extra = {}) =>
    M.MarketplaceProduct.create({ seller: refurb._id, title, category: cats[slug]._id, brand, model, condition, price, stock, refurbishmentInfo: info, ratingAvg: 4.5, ratingCount: 4, ...(DEMO_PRODUCT_DETAILS[title] || {}), ...extra });
  const pLaptop = await product('Lenovo ThinkPad X230, 8 GB RAM, 256 GB SSD', 'laptop', 'Lenovo', 'ThinkPad X230', 'good', 14500, 'New battery and SSD fitted, keyboard cleaned, tested for 24 hours. 3 month warranty.', 2);
  const pPhone = await product('iPhone 7, 32 GB, new battery', 'smartphone', 'Apple', 'iPhone 7', 'excellent', 8999, 'Original screen, battery replaced, factory reset, no scratches on the body.', 4);
  const pMonitor = await product('Dell 24-inch full HD monitor', 'monitor', 'Dell', 'P2419H', 'like_new', 5500, 'Cleaned and tested. One tiny mark on the stand, disclosed in the photos.', 5);
  const pTablet = await product('Samsung Galaxy Tab A 8-inch', 'tablet', 'Samsung', 'Tab A 8.0', 'fair', 4200, 'Screen replaced, battery at 85% health. A few scratches on the back.', 2);
  await product('HP LaserJet printer', 'printer', 'HP', 'LaserJet 1018', 'good', 3800, 'New toner, rollers cleaned, prints 500 test pages.', 1);
  await product('Wireless keyboard and mouse combo', 'keyboard', 'Logitech', 'MK270', 'like_new', 899, 'Tested, new batteries included.', 8);
  await product('Old Acer desktop (sold out)', 'desktop-computer', 'Acer', 'Veriton', 'fair', 6500, 'Sold. Kept here as a record of past work.', 0, { status: 'sold' });

  const order = (productDoc, buyer, status, history, extra = {}) => M.Order.create({
    product: productDoc._id, buyer: buyer._id, seller: refurb._id, priceAtOrder: productDoc.price, status, deliveryArea: 'Bengaluru', paymentMethod: 'cod',
    statusHistory: history.map(([s, at]) => ({ status: s, at, by: buyer._id })), ...extra,
  });
  const oDone = await order(pPhone, rahul, 'completed', [['placed', ago(20)], ['confirmed', ago(19)], ['delivered', ago(16)], ['completed', ago(15)]], { paymentStatus: 'confirmed', reviewed: true });
  await M.Transaction.create({ type: 'order', refType: 'Order', refId: oDone._id, payer: rahul._id, payee: refurb._id, amount: pPhone.price, method: 'cod', status: 'confirmed' });
  await M.EnvironmentalImpact.create({ user: refurb._id, type: 'refurbishment', refType: 'Order', refId: oDone._id, category: cats.smartphone._id, devices: 1, co2eEstimate: 30, verifiedBy: rahul._id, verifiedAt: ago(15) });
  await order(pLaptop, demo, 'confirmed', [['placed', ago(2)], ['confirmed', ago(1)]]);
  await order(pMonitor, meera, 'ready', [['placed', ago(3)], ['confirmed', ago(2)], ['ready', ago(0, 6)]]);
  await order(pTablet, priya, 'placed', [['placed', ago(0, 2)]]);

  // ---- recycling: new, being collected, finished ------------------------------------------------------------------
  const recycle = (listing, requester, status, fields = {}) => M.RecyclingRecord.create({
    listing: listing._id, requester: requester._id, center: centre._id, categories: [listing.category], deviceCount: 1, status, refNo: ref('REC'),
    pickupAddressArea: listing.addressArea, pickupAddress: `Flat 4B, ${listing.addressArea}, Bengaluru`, preferredDate: ahead(2), checklistAcknowledgedAt: ago(1),
    history: [{ status: 'requested', at: ago(1), by: requester._id }], ...fields,
  });
  await recycle(L.rahulPhone2, rahul, 'requested', { deviceCount: 2, notes: 'A phone and three old chargers.' });
  await recycle(L.priyaTv, priya, 'requested', { deviceCount: 6, notes: 'Cables, a router and a power strip.' });
  const recPickup = await M.PickupSchedule.create({ contextType: 'recycling', contextId: new M.User()._id, requester: meera._id, provider: recycler._id, date: ahead(1), timeSlot: '14:00-16:00', addressArea: 'Koramangala', status: 'confirmed', proposedBy: recycler._id });
  void recPickup;
  const recDone = await recycle(L.demoMonitorDone, demo, 'completed', {
    deviceCount: 3, completedAt: ago(6), receivedAt: ago(7), handover: { byUser: ago(7), byCenter: ago(7) },
    materials: [{ type: 'copper', actualKg: 1.4, estimatedKg: 1.2, measuredBy: recycler._id, measuredAt: ago(6) }, { type: 'plastics', actualKg: 3.1, estimatedKg: 3, measuredBy: recycler._id, measuredAt: ago(6) }, { type: 'iron', actualKg: 2.2, estimatedKg: 2, measuredBy: recycler._id, measuredAt: ago(6) }],
    reportNotes: 'Three old monitors and a keyboard dismantled and sorted. Hazardous parts sent to an authorised facility.',
    history: [{ status: 'requested', at: ago(10), by: demo._id }, { status: 'accepted', at: ago(9), by: recycler._id }, { status: 'collected', at: ago(7), by: recycler._id }, { status: 'completed', at: ago(6), by: recycler._id }],
  });
  await M.DeviceListing.updateOne({ _id: L.demoMonitorDone._id }, { $set: { status: 'completed' } });
  await M.EnvironmentalImpact.create({ user: demo._id, type: 'recycling', refType: 'RecyclingRecord', refId: recDone._id, category: cats.monitor._id, devices: 3, materials: { actual: { copper: 1.4, plastics: 3.1, iron: 2.2 }, estimated: {} }, co2eEstimate: 135, verifiedBy: recycler._id, verifiedAt: ago(6) });
  const rec2 = await recycle(L.meeraOld, meera, 'pickup_scheduled', { deviceCount: 1, history: [{ status: 'requested', at: ago(3), by: meera._id }, { status: 'accepted', at: ago(2), by: recycler._id }, { status: 'pickup_scheduled', at: ago(1), by: recycler._id }] });
  await M.PickupSchedule.updateOne({ _id: recPickup._id }, { $set: { contextId: rec2._id } });
  await M.RecyclingRecord.updateOne({ _id: rec2._id }, { $set: { pickup: recPickup._id } });
  await M.DeviceListing.updateOne({ _id: L.meeraOld._id }, { $set: { status: 'in_service' } });
  await M.RecyclingCenter.updateOne({ _id: centre._id }, { $set: { 'totals.actualKg': 6.7, 'totals.estimatedKg': 6.2 } });

  // ---- repair pickups ----------------------------------------------------------------------------------------------
  await M.PickupSchedule.create({ contextType: 'service', contextId: reqRunning._id, requester: meera._id, provider: tech._id, date: ahead(2), timeSlot: '17:00-19:00', addressArea: 'Koramangala', status: 'confirmed', proposedBy: tech._id, notes: 'Return the repaired laptop.' });
  await M.PickupSchedule.create({ contextType: 'service', contextId: reqPrinter._id, requester: demo._id, provider: arjun._id, date: ahead(1), timeSlot: '10:00-12:00', addressArea: 'Indiranagar', status: 'requested', proposedBy: arjun._id });

  // ---- messages ----------------------------------------------------------------------------------------------------
  const talk = async (a, b, contextType, contextId, lines) => {
    const convo = await M.Conversation.create({ participants: [a._id, b._id], contextType, contextId, unread: { [String(a._id)]: lines.filter(([s]) => s === b).length ? 1 : 0 } });
    let last;
    for (const [i, [sender, text]] of lines.entries()) {
      last = await M.Message.create({ conversation: convo._id, sender: sender._id, text, createdAt: ago(0, lines.length - i) });
    }
    await M.Conversation.updateOne({ _id: convo._id }, { $set: { lastMessage: { text: last.text, at: last.createdAt, sender: last.sender } } });
  };
  await talk(meera, tech, 'service', reqRunning._id, [
    [meera, 'Hi, is the laptop ready? I have a deadline on Friday.'],
    [tech, 'Almost. The new cable is fitted and I am testing it for two hours. I can bring it tomorrow evening.'],
    [meera, 'That works, thank you!'],
    [tech, 'Great. I will confirm the pickup time here.'],
  ]);
  await talk(demo, arjun, 'service', reqPrinter._id, [
    [arjun, 'I have sent a quotation for the printer. A deep clean should fix the blank pages.'],
    [demo, 'Thanks. Does the price include the ink?'],
    [arjun, 'Yes, the ink tubes and the refill are included.'],
  ]);
  await talk(rahul, refurb, 'enquiry', pPhone._id, [[rahul, 'Is the iPhone 7 still available in black?'], [refurb, 'Yes, one black piece is left. I can deliver it this week.']]);
  await talk(school, rahul, 'donation', arranged._id, [[school, 'Thank you for the donation. Is 10 AM on Saturday fine?'], [rahul, 'Yes, I will be at the gate.']]);

  // ---- notifications for every person ------------------------------------------------------------------------------
  const unread = { readAt: undefined };
  await note(tech._id, 'request.new', 'New repair request near you', 'Laptop gets very slow and the fan is loud.', `/dashboard/requests/${reqLaptop._id}`, unread);
  await note(tech._id, 'request.new', 'New repair request near you', 'iPhone 8, battery drains fast.', `/dashboard/requests/${reqPhone._id}`, unread);
  await note(tech._id, 'request.new', 'New repair request near you', 'Samsung Galaxy Tab A, cracked screen.', `/dashboard/requests/${reqTablet._id}`, unread);
  await note(tech._id, 'review.new', 'You received a 5 star review', 'Meera Iyer reviewed your repair.', '/dashboard/requests', { readAt: ago(9) });
  await note(demo._id, 'quotation.new', 'You have a new quotation', 'Arjun Mehta quoted 1,800 for your printer.', `/dashboard/requests/${reqPrinter._id}`, unread);
  await note(demo._id, 'donation.request', 'A school asked for your monitor', 'Demo Public School would like the Dell 22-inch monitor.', '/dashboard/donations', unread);
  await note(demo._id, 'refurbishment.progress', 'Your ThinkPad is being refurbished', 'ReNew Electronics installed the new SSD.', '/dashboard/refurbishment', { readAt: ago(1) });
  await note(meera._id, 'request.status', 'Your repair is in progress', 'The technician is testing your laptop.', `/dashboard/requests/${reqRunning._id}`, unread);
  await note(meera._id, 'pickup.scheduled', 'Pickup confirmed', 'Your laptop comes back in two days between 17:00 and 19:00.', '/dashboard/pickups', unread);
  await note(rahul._id, 'donation.accepted', 'Your donation was accepted', 'Demo Public School will collect the keyboard and mouse.', '/dashboard/donations', unread);
  await note(priya._id, 'order.placed', 'Order placed', 'Samsung Galaxy Tab A 8-inch from ReNew Electronics.', '/dashboard/orders', unread);
  await note(refurb._id, 'order.placed', 'New order', 'A buyer ordered the Samsung Galaxy Tab A.', '/dashboard/orders', unread);
  await note(refurb._id, 'refurbishment.accepted', 'Your offer was accepted', 'The ThinkPad T450 owner accepted your offer.', '/dashboard/refurbishment', { readAt: ago(7) });
  await note(recycler._id, 'recycling.request', 'New recycling request', 'Two devices to collect in HSR Layout.', '/dashboard/recycling', unread);
  await note(recycler._id, 'recycling.request', 'New recycling request', 'Six items to collect in Whitefield.', '/dashboard/recycling', unread);
  await note(school._id, 'donation.handover', 'Handover scheduled', 'Collect the keyboard and mouse in HSR Layout.', '/dashboard/donations', unread);

  // ---- a complaint and announcements for the administrator ---------------------------------------------------------
  await M.Complaint.create({ filedBy: priya._id, against: tech._id, refType: 'service', refId: reqDone._id, subject: 'Repair took longer than promised', description: 'The technician said two days and it took three. The result was fine, but I was not told about the delay.', history: [{ status: 'open', at: ago(1), by: priya._id }] });
  await M.Announcement.create({ title: 'Welcome to the E-Waste Network', body: 'List a device, get it repaired, donate it or recycle it responsibly. Every completed activity adds to the shared impact figures.', audience: ['all'], createdBy: admin._id, startsAt: ago(3) });
  await M.Announcement.create({ title: 'Technicians: keep your availability up to date', body: 'Customers only see technicians who are taking jobs. Update your availability on the repair requests page.', audience: ['technician'], createdBy: admin._id, startsAt: ago(1) });

  logger.info('Presentation data added. Logins (password Demo@12345): user@demo.local, meera@demo.local, rahul@demo.local, priya@demo.local, tech@demo.local, arjun@demo.local, refurb@demo.local, recycler@demo.local, school@demo.local.');
  await disconnectDB();
}

main().catch(async (err) => {
  logger.error({ err: err.message, stack: err.stack }, 'Presentation seed failed');
  await disconnectDB().catch(() => {});
  process.exit(1);
});
