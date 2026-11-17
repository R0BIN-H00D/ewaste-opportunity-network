'use strict';
// Suggests what a device is from a photo and/or the words the owner wrote (P9-07, FR-AI-001..004).
// Gemini is tried only when it is switched on, a photo was sent, and today's free-tier allowance is not used up; in every
// other case, or if it fails, the rule-based classifier answers. Either way this is a SUGGESTION: nothing is saved until the
// person confirms it in the listing form (FR-AI-002).
const Category = require('../models/Category');
const AiUsage = require('../models/AiUsage');
const env = require('../config/env');
const { classifyByRules } = require('./classifierRules');
const gemini = require('./geminiClient');

const DISCLAIMER = 'This is only a suggestion from your photo and words. A photo cannot show whether a device is damaged inside or still works, so please check it and correct anything that is wrong.';

/** Counts one use of today's allowance. False when the allowance is already used up (a second insert for the day collides). */
async function reserveQuota(limit, now = new Date()) {
  if (limit <= 0) return false;
  const day = now.toISOString().slice(0, 10);
  try {
    const row = await AiUsage.findOneAndUpdate({ day, count: { $lt: limit } }, { $inc: { count: 1 } }, { upsert: true, new: true });
    return Boolean(row);
  } catch (err) {
    if (err.code === 11000) return false;
    throw err;
  }
}

const list = (arr) => [...new Set((arr || []).map((s) => String(s).trim()).filter(Boolean))].slice(0, 6);

/**
 * @param {{ title?: string, description?: string, photo?: { buffer: Buffer, mime: string }, fetchImpl?: Function, now?: Date }} input
 */
async function classify({ title = '', description = '', photo, fetchImpl, now } = {}) {
  const categories = await Category.find({ active: true }).sort({ order: 1 }).select('name slug').lean();
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const rules = classifyByRules({ title, description });

  let fallbackReason = null;
  let ai = null;
  if (!gemini.isConfigured()) fallbackReason = 'not_configured';
  else if (!photo) fallbackReason = 'no_photo';
  else if (!(await reserveQuota(env.GEMINI_DAILY_LIMIT, now))) fallbackReason = 'quota';
  else {
    ai = await gemini.classifyPhoto(photo, { slugs: [...bySlug.keys()], hints: `${title} ${description}`.trim().slice(0, 300), fetchImpl });
    if (!ai) fallbackReason = 'unavailable';
  }

  const pick = (slug) => (slug && bySlug.has(slug) ? bySlug.get(slug) : null);
  const category = pick(ai?.category) || pick(rules.slug);
  const fromAi = Boolean(ai && pick(ai.category));
  const source = ai ? 'gemini' : 'rules';
  return {
    source,
    category: category ? { _id: category._id, name: category.name, slug: category.slug } : null,
    deviceType: (fromAi && ai.deviceType) || category?.name || null,
    brand: ai?.brand || rules.brand || null,
    visibleDamage: list([...(ai?.visibleDamage || []), ...(ai ? [] : rules.visibleDamage)]),
    possibleRepairs: list([...(ai?.possibleRepairs || []), ...rules.possibleRepairs]),
    confidence: fromAi ? (ai.confidence ?? 0.5) : rules.confidence,
    usedPhoto: Boolean(ai),
    fallbackReason,
    disclaimer: DISCLAIMER,
  };
}

module.exports = { classify, reserveQuota, DISCLAIMER };