'use strict';
// The optional Gemini adapter (P8-10, FR-AI-001): one photo in, a structured suggestion out. It never throws for a service
// problem; it returns null so the caller can fall back to the rule-based classifier (FR-AI-004). The key travels in a header,
// never in the URL, and nothing here is logged except a short reason.
const { z } = require('zod');
const env = require('../config/env');
const logger = require('../utils/logger');

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 8000;

const text = (max) => z.string().trim().min(1).max(max);
const answer = z.object({
  category: z.string().trim().max(60).nullish(),
  deviceType: text(60).nullish(),
  brand: text(60).nullish(),
  visibleDamage: z.array(text(80)).max(6).default([]),
  possibleRepairs: z.array(text(100)).max(6).default([]),
  confidence: z.number().min(0).max(1).nullish(),
});

const isConfigured = () => Boolean(env.GEMINI_ENABLED && env.GEMINI_API_KEY);

/** What the model is asked, in plain words. It is told not to guess at what a photo cannot show (FR-AI-003). */
const prompt = (slugs, hints) => [
  'You help list used electronic devices for reuse, repair or recycling.',
  'Look at the photo and answer only from what is visible. Do not say anything about internal hardware, battery health, data or whether it works: a photo cannot show that.',
  `Pick "category" from exactly this list, or null if none fits: ${slugs.join(', ')}.`,
  'Give "deviceType" (a short plain name, e.g. "Laptop"), "brand" only if a logo or name is visible, "visibleDamage" (marks you can actually see), "possibleRepairs" (what a repairer might look at) and "confidence" from 0 to 1.',
  hints ? `The owner wrote: ${hints}` : '',
].filter(Boolean).join('\n');

const schema = {
  type: 'OBJECT',
  properties: {
    category: { type: 'STRING', nullable: true },
    deviceType: { type: 'STRING', nullable: true },
    brand: { type: 'STRING', nullable: true },
    visibleDamage: { type: 'ARRAY', items: { type: 'STRING' } },
    possibleRepairs: { type: 'ARRAY', items: { type: 'STRING' } },
    confidence: { type: 'NUMBER' },
  },
  required: ['category', 'deviceType', 'visibleDamage', 'possibleRepairs', 'confidence'],
};

/**
 * @param {{ buffer: Buffer, mime: string }} photo
 * @param {{ slugs: string[], hints?: string, fetchImpl?: typeof fetch }} ctx
 * @returns {Promise<z.infer<typeof answer>|null>} null on any problem (timeout, quota, bad answer)
 */
async function classifyPhoto(photo, { slugs, hints = '', fetchImpl = fetch }) {
  try {
    const res = await fetchImpl(`${ENDPOINT}/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt(slugs, hints) }, { inline_data: { mime_type: photo.mime, data: photo.buffer.toString('base64') } }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 },
      }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, 'gemini request was not accepted');
      return null;
    }
    const body = await res.json();
    const raw = body?.candidates?.[0]?.content?.parts?.[0]?.text;
    const parsed = answer.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch (err) {
    logger.warn({ reason: err?.name || 'error' }, 'gemini classification failed');
    return null;
  }
}

module.exports = { classifyPhoto, isConfigured };