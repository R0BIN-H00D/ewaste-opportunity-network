'use strict';
// Puts a real photo of the actual model on every demo device and shop product that still shows one of the generic
// drawings (/uploads/demo/...). The photos are in backend/seed-assets/real-photos, with who took each one and under which
// licence in manifest.json (and in docs/PHOTO_CREDITS.md). Photos that people uploaded themselves are never touched.
// Safe to re-run. Development only. Usage: npm run seed:realphotos
const fs = require('fs');
const path = require('path');
const env = require('./config/env');
const logger = require('./utils/logger');
const { connectDB, disconnectDB } = require('./config/db');
const M = require('./models');

const source = path.join(__dirname, '..', 'seed-assets', 'real-photos');
const target = path.join(env.uploadDir, 'public', 'real');

// First match wins, so the specific models come before the general ones. The text tested is the title, brand and model.
const RULES = [
  [/pavilion 15/, 'hp-pavilion-15'],
  [/pavilion (14|laptop)/, 'hp-pavilion-14'],
  [/galaxy j7|old samsung phone/, 'samsung-galaxy-j7'],
  [/p2219h|dell 22/, 'dell-monitor'],
  [/p2419h|dell 24/, 'dell-monitor'],
  [/keyboard & mouse/, 'logitech-k270'],
  [/keyboard and mouse/, 'keyboard-mouse'],
  [/t450/, 'thinkpad-t450'],
  [/t440/, 'thinkpad-t440'],
  [/x230/, 'thinkpad-x230'],
  [/inspiron/, 'dell-inspiron-15'],
  [/ideapad/, 'lenovo-ideapad'],
  [/iphone 8/, 'iphone-8'],
  [/iphone 7/, 'iphone-7'],
  [/nokia/, 'nokia-105'],
  [/tab a 8/, 'galaxy-tab-a-8'],
  [/tab a/, 'galaxy-tab-a-10'],
  [/router|cables/, 'router'],
  [/pixma/, 'canon-pixma'],
  [/optiplex 3020/, 'dell-optiplex-3020'],
  [/optiplex 7010|dell optiplex/, 'dell-optiplex-7010'],
  [/19m38a|lg 19/, 'lg-monitor'],
  [/galaxy a12/, 'galaxy-a12'],
  [/aspire/, 'acer-aspire-5'],
  [/s22e310|samsung 22/, 'samsung-monitor'],
  [/ipad air/, 'ipad-air-2'],
  [/laserjet 1020/, 'hp-laserjet-1020'],
  [/laserjet 1018|hp laserjet printer/, 'hp-laserjet-1018'],
  [/android phones/, 'android-phones'],
  [/veriton|acer desktop/, 'acer-veriton'],
];

const isDrawing = (p) => String(p.url || '').startsWith('/uploads/demo/');
const keyFor = (text) => {
  const t = String(text).toLowerCase();
  const hit = RULES.find(([re]) => re.test(t));
  return hit ? hit[1] : null;
};

async function apply(Model, titleField, manifest, label) {
  let changed = 0;
  const missing = [];
  for (const doc of await Model.find()) {
    const photos = doc.photos || [];
    // Only the generic drawings (or nothing at all) are replaced; a photo somebody uploaded stays as it is.
    if (photos.length && !photos.every(isDrawing)) continue;
    const key = keyFor([doc[titleField], doc.brand, doc.model].filter(Boolean).join(' '));
    const entry = key && manifest[key];
    if (!entry) {
      missing.push(doc[titleField]);
      continue;
    }
    const file = path.join(target, entry.file);
    doc.photos = [{ url: `/uploads/real/${entry.file}`, publicId: `public/real/${entry.file}`, mime: 'image/jpeg', bytes: fs.statSync(file).size }];
    await doc.save();
    changed += 1;
  }
  logger.info(`${label}: ${changed} got a real photo${missing.length ? `; no photo for: ${missing.join(' | ')}` : ''}`);
}

async function main() {
  if (env.isProd) throw new Error('Refusing to run in production');
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'manifest.json'), 'utf8'));
  fs.mkdirSync(target, { recursive: true });
  for (const entry of Object.values(manifest)) fs.copyFileSync(path.join(source, entry.file), path.join(target, entry.file));
  await connectDB();
  await apply(M.Device, 'name', manifest, 'devices');
  await apply(M.MarketplaceProduct, 'title', manifest, 'products');
  await disconnectDB();
}

main().catch(async (err) => {
  logger.error({ err: err.message }, 'Real photo seed failed');
  await disconnectDB().catch(() => {});
  process.exit(1);
});
