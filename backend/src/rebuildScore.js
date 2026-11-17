'use strict';
// One-off, safe to re-run: gives every recorded impact event the Green Score points it should have earned. For data written
// before scoring existed. Nothing is ever given twice.   Usage: node src/rebuildScore.js
const { connectDB, disconnectDB } = require('./config/db');
const impact = require('./services/impactService');

(async () => {
  await connectDB();
  const { added } = await impact.rebuildAll();
  console.log(`Green Score rebuilt: ${added} ledger line(s) added.`);
  await disconnectDB();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
