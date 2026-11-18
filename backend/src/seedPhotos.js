'use strict';
// Gives every device and shop product that has no picture one of the presentation pictures made by
// `python backend/scripts/make_demo_photos.py` (served from /uploads/demo/). Safe to re-run: it only fills empty ones.
// Development only. Usage: npm run seed:photos
const fs = require('fs');
const path = require('path');
const env = require('./config/env');
const logger = require('./utils/logger');
const { connectDB, disconnectDB } = require('./config/db');
const M = require('./models');

const dir = path.join(env.uploadDir, 'public', 'demo');
const hash = (s) => [...String(s)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

function photoFor(slug, seed) {
  const n = (hash(seed) % 3) + 1;
  const name = `${slug}-${n}.jpg`;
  if (!fs.existsSync(path.join(dir, name))) return null;
  return { url: `/uploads/demo/${name}`, publicId: `public/demo/${name}`, mime: 'image/jpeg', bytes: fs.statSync(path.join(dir, name)).size };
}

async function main() {
  if (env.isProd) throw new Error('Refusing to run in production');
  if (!fs.existsSync(dir)) throw new Error('No pictures yet. Run: python backend/scripts/make_demo_photos.py');
  await connectDB();
  const cats = new Map((await M.Category.find().select('slug').lean()).map((c) => [String(c._id), c.slug]));

  let devices = 0;
  for (const device of await M.Device.find({ $or: [{ photos: { $size: 0 } }, { photos: { $exists: false } }] })) {
    const photo = photoFor(cats.get(String(device.category)) || 'other-electronic-devices', device.name);
    if (photo) { device.photos = [photo]; await device.save(); devices += 1; }
  }
  let products = 0;
  for (const product of await M.MarketplaceProduct.find({ $or: [{ photos: { $size: 0 } }, { photos: { $exists: false } }] })) {
    const slug = cats.get(String(product.category)) || 'other-electronic-devices';
    const photos = [photoFor(slug, product.title), photoFor(slug, `${product.title}!`)].filter(Boolean);
    if (photos.length) { product.photos = photos.filter((p, i, a) => a.findIndex((q) => q.url === p.url) === i); await product.save(); products += 1; }
  }
  logger.info(`photos added: ${devices} devices, ${products} products`);
  await disconnectDB();
}

main().catch(async (err) => {
  logger.error({ err: err.message }, 'Photo seed failed');
  await disconnectDB().catch(() => {});
  process.exit(1);
});
