'use strict';
// Adds a set of "wanted device" requests from the existing refurbishers, so the Wanted devices page has plenty to show.
// Safe to re-run: a request with the same title from the same refurbisher is never added twice. Development only.
const env = require('./config/env');
const logger = require('./utils/logger');
const { connectDB, disconnectDB } = require('./config/db');
const { ROLES } = require('./config/constants');
const M = require('./models');

const DAY = 24 * 3600 * 1000;
const ago = (days) => new Date(Date.now() - days * DAY);

// [title, category slug, brand, minCondition, quantity, city, notes]
const REQUESTS = [
  ['Dell Latitude laptops, any model', 'laptop', 'Dell', 'minor_damage', 10, 'Bengaluru', 'Working or with a dead battery is fine. We refit SSDs and batteries and sell them with a warranty.'],
  ['Lenovo ThinkPad T-series', 'laptop', 'Lenovo', 'fully_working', 5, 'Bengaluru', 'Looking for T440 to T480. Screen should be free of cracks.'],
  ['iPhone 7, 8 and SE', 'smartphone', 'Apple', 'minor_damage', 8, 'Chennai', 'Cracked screens are fine, we replace them. Must power on.'],
  ['Samsung Galaxy phones (A and M series)', 'smartphone', 'Samsung', 'fully_working', 12, 'Hyderabad', 'Bulk lots welcome. Please include the charger if you have it.'],
  ['Android tablets, 8 to 10 inch', 'tablet', '', 'minor_damage', 6, 'Pune', 'For a school donation drive. Battery condition does not matter.'],
  ['LED monitors, 19 to 24 inch', 'monitor', '', 'fully_working', 15, 'Bengaluru', 'No dead pixel clusters please. VGA or HDMI.'],
  ['Desktop PCs for budget builds', 'desktop-computer', 'HP', 'major_damage', 10, 'Mumbai', 'Even non-working towers help. We reuse the parts that still work.'],
  ['Laptop and phone batteries', 'battery', '', 'major_damage', 40, 'Bengaluru', 'We test and recycle them safely through our partner.'],
  ['Inkjet and laser printers', 'printer', 'Canon', 'minor_damage', 5, 'Kochi', 'Working or nearly working. Ink cartridges not needed.'],
  ['Smart TVs, 32 inch and above', 'television', '', 'fully_working', 3, 'Delhi', 'Screen must be undamaged. Remote not required.'],
  ['Keyboards and mice, bulk', 'keyboard', '', 'fully_working', 50, 'Bengaluru', 'USB or wireless. Used by a training centre, so quantity matters.'],
  ['Old circuit boards and motherboards', 'circuit-boards', '', 'major_damage', 25, 'Hyderabad', 'For parts recovery. Any condition.'],
];

async function main() {
  if (env.isProd) throw new Error('Refusing to seed in production');
  await connectDB();
  const cats = {};
  for (const c of await M.Category.find().lean()) cats[c.slug] = c;
  const refurbishers = await M.User.find({ role: ROLES.REFURBISHER }).select('_id name').lean();
  if (refurbishers.length === 0) throw new Error('There is no refurbisher account. Run "npm run seed" and "npm run seed:demo" first.');

  let added = 0;
  for (const [i, [title, slug, brand, minCondition, quantity, city, notes]] of REQUESTS.entries()) {
    const refurbisher = refurbishers[i % refurbishers.length]; // spread over the existing refurbishers
    const exists = await M.WantedRequest.exists({ refurbisher: refurbisher._id, title });
    if (exists) continue;
    await M.WantedRequest.create({
      refurbisher: refurbisher._id, title, category: cats[slug]?._id, ...(brand ? { brand } : {}), minCondition, quantity, city, notes, status: 'open',
      createdAt: ago(1 + i), updatedAt: ago(1 + i),
    });
    added += 1;
  }
  logger.info(`Wanted requests: added ${added}, from ${refurbishers.length} refurbisher(s).`);
  await disconnectDB();
}

main().catch((e) => { logger.error(e); process.exit(1); });
