'use strict';
// The rule-based classifier (FR-AI-004): reads the title and description only, and always works. It is deliberately modest:
// it names a category when keywords match, picks out a brand and the damage the text mentions, and says how sure it is.

// slug -> words that point to it. Matched as whole words, case-insensitive.
const CATEGORY_WORDS = {
  laptop: ['laptop', 'notebook', 'macbook', 'thinkpad', 'chromebook', 'ideapad', 'inspiron', 'pavilion', 'latitude', 'vivobook', 'zenbook'],
  'desktop-computer': ['desktop', 'cpu tower', 'tower pc', 'all-in-one', 'imac', 'workstation'],
  smartphone: ['smartphone', 'phone', 'iphone', 'android', 'mobile', 'redmi', 'galaxy', 'pixel', 'oneplus', 'realme', 'poco'],
  tablet: ['tablet', 'ipad', 'tab'],
  monitor: ['monitor', 'lcd', 'led monitor', 'display'],
  television: ['television', 'tv', 'smart tv'],
  keyboard: ['keyboard'],
  mouse: ['mouse', 'trackpad'],
  printer: ['printer', 'inkjet', 'laserjet', 'scanner'],
  charger: ['charger', 'adapter', 'adaptor', 'power brick', 'charging cable'],
  battery: ['battery', 'power bank', 'powerbank', 'ups battery'],
  'electronic-accessories': ['cable', 'headphone', 'headphones', 'earphone', 'earphones', 'speaker', 'hdmi', 'usb hub', 'webcam', 'router', 'remote'],
  'circuit-boards': ['motherboard', 'pcb', 'circuit board', 'mainboard', 'logic board'],
  'computer-components': ['ram', 'ssd', 'hard disk', 'hdd', 'graphics card', 'gpu', 'processor', 'cpu', 'heatsink', 'cooling fan', 'power supply', 'smps'],
};

const BRANDS = {
  apple: 'Apple', samsung: 'Samsung', dell: 'Dell', hp: 'HP', lenovo: 'Lenovo', asus: 'Asus', acer: 'Acer', msi: 'MSI', sony: 'Sony', lg: 'LG',
  xiaomi: 'Xiaomi', redmi: 'Redmi', oneplus: 'OnePlus', realme: 'Realme', vivo: 'Vivo', oppo: 'Oppo', motorola: 'Motorola', nokia: 'Nokia',
  huawei: 'Huawei', canon: 'Canon', epson: 'Epson', brother: 'Brother', logitech: 'Logitech', boat: 'boAt', jbl: 'JBL', intel: 'Intel', amd: 'AMD',
  nvidia: 'Nvidia', toshiba: 'Toshiba', panasonic: 'Panasonic', philips: 'Philips', microsoft: 'Microsoft', google: 'Google',
};

// Physical damage a person would write about, and what to look at for it.
const DAMAGE = [
  { re: /\b(cracked|broken|shattered|smashed)\s+(screen|display|glass)\b|\bscreen\s+(is\s+)?(cracked|broken)\b/i, damage: 'Cracked or broken screen', repair: 'Screen replacement' },
  { re: /\bdent(s|ed)?\b/i, damage: 'Dents', repair: null },
  { re: /\bscratch(es|ed)?\b/i, damage: 'Scratches', repair: null },
  { re: /\b(swollen|bulging|puffed)\s+battery\b|\bbattery\s+(is\s+)?(swollen|bulging)\b/i, damage: 'Swollen battery', repair: 'Battery replacement (do not charge a swollen battery)' },
  { re: /\bbent\b/i, damage: 'Bent body', repair: 'Frame or casing repair' },
  { re: /\b(broken|damaged|loose)\s+hinge\b/i, damage: 'Damaged hinge', repair: 'Hinge repair' },
  { re: /\bmissing\s+keys?\b|\bkeys?\s+(missing|broken)\b/i, damage: 'Missing keys', repair: 'Keyboard repair' },
  { re: /\b(water|liquid|coffee|tea)\s+(damage|damaged|spill|spilled)\b|\bspilled\b|\bwater[- ]damaged\b/i, damage: 'Liquid exposure mentioned', repair: 'Internal cleaning and inspection' },
  { re: /\bburn(t|ed)?\b/i, damage: 'Burn marks', repair: 'Inspection of the power circuit' },
];

// Faults described in words, which a photo could not show.
const FAULTS = [
  { re: /\b(won'?t|will not|does not|doesn'?t|not)\s+(turn|switch|power)\s*(on)?\b|\bdead\b|\bno power\b/i, repair: 'Check the charger, battery and power circuit' },
  { re: /\bnot\s+charging\b|\bwon'?t\s+charge\b/i, repair: 'Check the charging port and battery' },
  { re: /\bslow\b|\blags?\b|\bhangs?\b/i, repair: 'Storage or memory upgrade, or a clean software install' },
  { re: /\bno\s+(display|picture|video|signal)\b|\bblank\s+screen\b/i, repair: 'Check the display, cable and graphics' },
  { re: /\boverheat(s|ing)?\b/i, repair: 'Cleaning and new thermal paste' },
  { re: /\bno\s+sound\b|\bspeaker\b.*\b(broken|not working)\b/i, repair: 'Speaker or audio check' },
];

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (w) => new RegExp(`(^|[^a-z0-9])${escape(w).replace(/\\ /g, '\\s+')}($|[^a-z0-9])`, 'i');
const WORD_RES = Object.fromEntries(Object.entries(CATEGORY_WORDS).map(([slug, words]) => [slug, words.map((w) => [w, wordRe(w)])]));
const BRAND_RES = Object.entries(BRANDS).map(([key, name]) => [name, wordRe(key)]);

/** @returns {{ slug: string|null, hits: number }} the category the words point to most, title counting double */
function pickCategory(title = '', description = '') {
  let best = { slug: null, hits: 0 };
  for (const [slug, words] of Object.entries(WORD_RES)) {
    let hits = 0;
    for (const [, re] of words) {
      if (re.test(title)) hits += 2;
      else if (re.test(description)) hits += 1;
    }
    if (hits > best.hits) best = { slug, hits };
  }
  return best;
}

/**
 * @param {{ title?: string, description?: string }} input
 * @returns {{ slug: string|null, brand: string|null, visibleDamage: string[], possibleRepairs: string[], confidence: number }}
 */
function classifyByRules({ title = '', description = '' } = {}) {
  const text = `${title}\n${description}`;
  const { slug, hits } = pickCategory(title, description);
  const brand = BRAND_RES.find(([, re]) => re.test(title))?.[0] || BRAND_RES.find(([, re]) => re.test(description))?.[0] || null;
  const visibleDamage = [];
  const possibleRepairs = [];
  for (const d of DAMAGE) {
    if (d.re.test(text)) {
      visibleDamage.push(d.damage);
      if (d.repair) possibleRepairs.push(d.repair);
    }
  }
  for (const f of FAULTS) if (f.re.test(text)) possibleRepairs.push(f.repair);
  return {
    slug,
    brand,
    visibleDamage,
    possibleRepairs: [...new Set(possibleRepairs)],
    confidence: slug ? Math.min(0.3 + 0.1 * hits, 0.8) : 0, // keywords are weak evidence: never above 0.8
  };
}

module.exports = { classifyByRules, CATEGORY_WORDS };