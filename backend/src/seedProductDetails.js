'use strict';
// Fills in the part-by-part details of the demo products that were created before those details existed. Safe to run again:
// it only touches demo products that have none yet, and never changes anything a seller wrote.
const mongoose = require('mongoose');
const env = require('./config/env');
const MarketplaceProduct = require('./models/MarketplaceProduct');
const { DEMO_PRODUCT_DETAILS } = require('./demoProductDetails');

(async () => {
  await mongoose.connect(env.MONGODB_URI);
  let filled = 0;
  for (const [title, details] of Object.entries(DEMO_PRODUCT_DETAILS)) {
    const res = await MarketplaceProduct.updateMany(
      { title, $or: [{ conditionDetails: { $exists: false } }, { conditionDetails: null }, { conditionDetails: {} }] },
      { $set: { conditionDetails: details.conditionDetails, conditionNote: details.conditionNote } },
    );
    filled += res.modifiedCount;
  }
  // eslint-disable-next-line no-console
  console.log(`Filled in the details of ${filled} demo product(s).`);
  await mongoose.disconnect();
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
