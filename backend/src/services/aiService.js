'use strict';
// Smart device help: identify a device from photos, and advise repair / refurbish / reuse / donate / recycle.
// Gemini (free tier) does the looking; plain rules answer when AI is off, over quota or down, so the feature always works.
// Everything here is a suggestion for the person to check: prices are rough ranges, never offers.
const { z } = require('zod');
const { isValidObjectId } = require('mongoose');
const Category = require('../models/Category');
const DeviceListing = require('../models/DeviceListing');
const gemini = require('./integrations/gemini');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { CONDITIONS, SERVICES } = require('../config/constants');

const NOTICE = 'A suggestion, not a promise. Check it before you rely on it.';

/* ---------- rules (used when AI is off or fails) ---------- */

const BRANDS = ['Apple', 'Samsung', 'Dell', 'HP', 'Lenovo', 'Asus', 'Acer', 'Sony', 'LG', 'Xiaomi', 'OnePlus', 'Realme', 'Oppo', 'Vivo', 'Motorola', 'Nokia', 'Canon', 'Epson', 'Philips', 'Panasonic'];
const BRAND_ALIASES = { iphone: 'Apple', ipad: 'Apple', macbook: 'Apple', redmi: 'Xiaomi', mi: 'Xiaomi', galaxy: 'Samsung', thinkpad: 'Lenovo', inspiron: 'Dell', pavilion: 'HP' };
const CONDITION_WORDS = [
  ['for_spare_parts', /spare parts|for parts|only parts/],
  ['not_working', /not (working|turning on|switching on|charging)|(won'?t|will not|does ?n'?o?t|doesn'?t|can'?t|cannot) (turn|switch|start|boot|power|charge)|dead|no power|stopped working/],
  ['major_damage', /crack|shatter|broken|water damage|bent|burn|motherboard|major/],
  ['minor_damage', /scratch|dent|minor|small|loose|battery (is )?(weak|drain)|slow/],
  ['fully_working', /works? (fine|well|perfectly)|working (fine|well|perfectly)|fully working|good condition|like new/],
];

const wordsIn = (s) => String(s || '').toLowerCase();

function guessBrand(text) {
  const t = wordsIn(text);
  const hit = BRANDS.find((b) => new RegExp(`\\b${b.toLowerCase()}\\b`).test(t));
  if (hit) return hit;
  const alias = Object.keys(BRAND_ALIASES).find((a) => new RegExp(`\\b${a}\\b`).test(t));
  return alias ? BRAND_ALIASES[alias] : undefined;
}

function guessCondition(text) {
  const t = wordsIn(text);
  return (CONDITION_WORDS.find(([, re]) => re.test(t)) || [])[0];
}

function guessCategory(text, categories) {
  const t = wordsIn(text);
  const extra = { smartphone: /phone|mobile|iphone|galaxy|redmi/, laptop: /laptop|macbook|notebook|thinkpad/, tablet: /tablet|ipad/, television: /\btv\b|television/, monitor: /monitor|display screen/, printer: /printer|scanner/ };
  return categories.find((c) => t.includes(wordsIn(c.name)) || t.includes(wordsIn(c.slug).replace(/-/g, ' ')) || (extra[c.slug] && extra[c.slug].test(t)));
}

/** The simple rule: what usually makes sense for this category and condition. */
function ruleAdvice({ category, condition }) {
  const hazardous = Boolean(category?.hazardous);
  const reasons = [];
  let recommendation;
  let alternatives;
  if (condition === 'for_spare_parts' || (hazardous && condition === 'not_working')) {
    recommendation = 'recycling';
    alternatives = ['donation'];
    reasons.push(hazardous ? 'This kind of device has hazardous parts, so a certified recycler is the safe way to dispose of it.' : 'It is only good for parts, so recycling recovers the most.');
  } else if (condition === 'fully_working') {
    recommendation = 'reuse';
    alternatives = ['donation'];
    reasons.push('It works, so someone can use it as it is. Keeping a working device in use is the best result.');
  } else if (condition === 'minor_damage') {
    recommendation = 'repair';
    alternatives = ['refurbishment', 'reuse'];
    reasons.push('Minor damage is usually cheap to fix, and a repaired device lasts for years.');
  } else if (condition === 'major_damage') {
    recommendation = 'refurbishment';
    alternatives = ['repair', 'recycling'];
    reasons.push('Major damage needs proper work. A refurbisher can rebuild it and sell it, or a technician can quote the repair.');
  } else {
    recommendation = 'repair';
    alternatives = ['recycling'];
    reasons.push('A device that will not work is worth a technician diagnosis first. If the repair costs too much, recycle it.');
  }
  return { recommendation, alternatives, reasons };
}

/* ---------- AI answer shape ---------- */

const num = z.preprocess((v) => (v === null || v === '' ? undefined : v), z.coerce.number().int().min(0).max(10_000_000).optional()).catch(undefined);
const str = (max) => z.string().trim().max(max).optional().catch(undefined);
const aiShape = z.object({
  categorySlug: str(60),
  brand: str(60),
  model: str(80),
  title: str(120),
  condition: z.enum(CONDITIONS).optional().catch(undefined),
  problems: z.array(z.string().trim().max(160)).max(6).optional().catch(undefined),
  recommendation: z.enum(SERVICES).optional().catch(undefined),
  alternatives: z.array(z.enum(SERVICES)).max(3).optional().catch(undefined),
  reasons: z.array(z.string().trim().max(240)).max(4).optional().catch(undefined),
  skillsNeeded: z.array(z.string().trim().max(80)).max(5).optional().catch(undefined),
  resaleMin: num, resaleMax: num, repairMin: num, repairMax: num,
  confidence: z.coerce.number().min(0).max(1).optional().catch(undefined),
  safetyTip: str(240),
});

const range = (min, max) => (min != null && max != null && max >= min ? { min, max } : null);

function shapeResult(a, categories, { source, fallback }) {
  const category = categories.find((c) => c.slug === a.categorySlug) || fallback.category || null;
  const condition = a.condition || fallback.condition;
  const base = ruleAdvice({ category, condition });
  return {
    source,
    category: category ? { _id: category._id, name: category.name, slug: category.slug, hazardous: Boolean(category.hazardous) } : null,
    brand: a.brand || fallback.brand,
    model: a.model,
    title: a.title || [a.brand || fallback.brand, a.model].filter(Boolean).join(' ') || undefined,
    condition,
    problems: a.problems || [],
    advice: {
      recommendation: a.recommendation || base.recommendation,
      alternatives: (a.alternatives && a.alternatives.length ? a.alternatives : base.alternatives).filter((s) => s !== (a.recommendation || base.recommendation)),
      reasons: a.reasons && a.reasons.length ? a.reasons : base.reasons,
      skillsNeeded: a.skillsNeeded || [],
      safetyTip: a.safetyTip || (category?.hazardous ? 'This device has hazardous parts. Do not open it or put it in household waste.' : undefined),
    },
    estimate: { currency: 'INR', isEstimate: true, resale: range(a.resaleMin, a.resaleMax), repair: range(a.repairMin, a.repairMax) },
    confidence: a.confidence,
    notice: NOTICE,
  };
}

const PROMPT_RULES = `You help people in India decide what to do with old electronics. Answer ONLY with a JSON object with these keys:
categorySlug (one of the allowed slugs, or null), brand, model, title (short listing title), condition (one of: ${CONDITIONS.join(', ')}),
problems (up to 5 short visible or likely problems), recommendation (one of: ${SERVICES.join(', ')}), alternatives (up to 2 others from the same list),
reasons (up to 3 short plain sentences), skillsNeeded (up to 4 repair skills), resaleMin and resaleMax (rough used resale value in Indian rupees, integers, or null),
repairMin and repairMax (rough repair cost in Indian rupees, integers, or null), confidence (0 to 1), safetyTip (one sentence about data or hazard safety, or null).
Use null when you cannot tell. Never invent a model you cannot see. Prices are rough ranges only.`;

async function loadCategories() {
  return Category.find({ active: { $ne: false } }).select('name slug hazardous').lean();
}

/* ---------- 1. identify a device from photos (and words) ---------- */

async function analyzeDevice({ files = [], text = '' }) {
  const categories = await loadCategories();
  const words = text.trim();
  const fallback = { category: guessCategory(words, categories), brand: guessBrand(words), condition: guessCondition(words) };
  if (gemini.isEnabled()) {
    try {
      const prompt = `${PROMPT_RULES}\nAllowed category slugs: ${categories.map((c) => c.slug).join(', ')}.\n${words ? `The owner wrote: "${words.replace(/"/g, "'")}"` : 'The owner wrote nothing.'}\nLook at the photo(s) of the device.`;
      const raw = await gemini.generateJson({ prompt, images: files.map((f) => ({ mimeType: f.sniffedMime || f.mimetype, buffer: f.buffer })) });
      return shapeResult(aiShape.parse(raw), categories, { source: 'ai', fallback });
    } catch (err) {
      if (!(err instanceof ApiError)) logger.error({ err: err.message }, 'ai analysis failed');
      if (files.length === 0) return { ...shapeResult({}, categories, { source: 'rules', fallback }), unavailableReason: err.message };
      const out = shapeResult({}, categories, { source: 'rules', fallback });
      out.unavailableReason = err instanceof ApiError ? err.message : 'The AI could not read the photo';
      return out;
    }
  }
  const out = shapeResult({}, categories, { source: 'rules', fallback });
  out.unavailableReason = files.length ? 'Photo reading is switched off, so only your words were used.' : undefined;
  return out;
}

/* ---------- 2. repair, reuse or recycle advice ---------- */

async function advise(user, { listingId, category: categoryRef, condition, issue = '', brand, model, expectedPrice }) {
  let info = { category: categoryRef, condition, issue, brand, model, expectedPrice };
  if (listingId) {
    if (!isValidObjectId(listingId)) throw ApiError.notFound('Listing not found');
    const l = await DeviceListing.findById(listingId).lean();
    if (!l || String(l.owner) !== user.id) throw ApiError.notFound('Listing not found'); // hides other people's listings
    info = { category: String(l.category), condition: l.condition, issue: issue || l.description || '', brand: l.brand, model: l.model, expectedPrice: l.expectedPrice };
  }
  const categories = await loadCategories();
  const category = categories.find((c) => String(c._id) === String(info.category) || c.slug === info.category) || guessCategory(info.issue, categories);
  const cond = info.condition || guessCondition(info.issue);
  const fallback = { category, brand: info.brand, condition: cond };
  if (gemini.isEnabled()) {
    try {
      const prompt = `${PROMPT_RULES}\nAllowed category slugs: ${categories.map((c) => c.slug).join(', ')}.\nDevice: ${[info.brand, info.model].filter(Boolean).join(' ') || 'unknown'}; category: ${category?.name || 'unknown'}; condition: ${cond || 'unknown'}; owner's price hope: ${info.expectedPrice ?? 'none'}.\nProblem described: "${String(info.issue).replace(/"/g, "'").slice(0, 1000)}".\nAdvise whether to repair, refurbish, reuse, donate or recycle.`;
      const raw = await gemini.generateJson({ prompt });
      return shapeResult({ ...aiShape.parse(raw), brand: info.brand, model: info.model, condition: cond, categorySlug: category?.slug }, categories, { source: 'ai', fallback });
    } catch (err) {
      const out = shapeResult({ brand: info.brand, model: info.model, condition: cond, categorySlug: category?.slug }, categories, { source: 'rules', fallback });
      out.unavailableReason = err instanceof ApiError ? err.message : 'The AI could not answer';
      return out;
    }
  }
  return shapeResult({ brand: info.brand, model: info.model, condition: cond, categorySlug: category?.slug }, categories, { source: 'rules', fallback });
}

module.exports = { analyzeDevice, advise, ruleAdvice, guessBrand, guessCondition, guessCategory, isEnabled: gemini.isEnabled };
