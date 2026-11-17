'use strict';
// Green Score and environmental impact rules (design.md A.6, FR-IMP-*). Everything a person can earn, and every number
// used to estimate material and CO2e figures, is written down here so the rules are transparent (FR-IMP-003) and can be
// shown to people as they are. Change a number here and the score history keeps its old entries: points are recorded
// as they were when earned.

/** What earns points. `provider` rules reward the person who did the work, not the one who asked for it. */
const POINT_RULES = {
  repair_completed: { points: 50, label: 'A repair you asked for was completed', who: 'the person who asked' },
  repair_provider: { points: 30, label: 'You completed a repair', who: 'the technician' },
  donation_completed: { points: 40, label: 'You donated a device', who: 'the donor' },
  reuse_completed: { points: 30, label: 'A device you passed on whole was received', who: 'the person who passed it on' },
  refurbishment_sold: { points: 40, label: 'A device you refurbished was received by its buyer', who: 'the refurbisher' },
  recycling_verified: { points: 30, label: 'A recycling centre confirmed it received and weighed your devices', who: 'the person who sent them' },
  review_left: { points: 2, label: 'You reviewed a completed service', who: 'the reviewer, once per transaction' },
};

/** Which rule an impact event of each type earns for the person it is recorded against. */
const RULE_FOR_TYPE = {
  repair: 'repair_completed',
  donation: 'donation_completed',
  reuse: 'reuse_completed',
  refurbishment: 'refurbishment_sold',
  recycling: 'recycling_verified',
};

/** To stop points being farmed: only this many scored events a person can earn in one (UTC) day. Further ones are recorded at 0. */
const DAILY_EVENT_CAP = 10;

const LEVELS = [
  { key: 'seed', name: 'Seed', min: 0 },
  { key: 'sprout', name: 'Sprout', min: 100 },
  { key: 'sapling', name: 'Sapling', min: 250 },
  { key: 'tree', name: 'Tree', min: 500 },
  { key: 'forest', name: 'Forest', min: 1000 },
];

/** Badges, each with the plain-words condition shown to people. `test(stats)` decides if it is earned. */
const BADGES = [
  { key: 'first_repair', name: 'First repair', description: 'Take part in one completed repair.', test: (s) => s.byType.repair >= 1, progress: (s) => [s.byType.repair, 1] },
  { key: 'donor', name: 'Donor', description: 'Donate one device.', test: (s) => s.byType.donation >= 1, progress: (s) => [s.byType.donation, 1] },
  { key: 'refurbisher', name: 'Refurbisher', description: 'Have one refurbished device received by its buyer.', test: (s) => s.byType.refurbishment >= 1, progress: (s) => [s.byType.refurbishment, 1] },
  { key: 'recycler', name: 'Responsible recycler', description: 'Have devices received and weighed by a recycling centre.', test: (s) => s.byType.recycling >= 1, progress: (s) => [s.byType.recycling, 1] },
  {
    key: 'circular_champion',
    name: 'Circular champion',
    description: 'Complete at least 5 activities across at least 3 different kinds.',
    test: (s) => s.total >= 5 && s.kinds >= 3,
    progress: (s) => [Math.min(s.total, 5) + Math.min(s.kinds, 3), 8],
  },
  { key: 'material_saver', name: 'Material saver', description: 'Have 10 kg of materials measured on a scale at a recycling centre.', test: (s) => s.measuredKg >= 10, progress: (s) => [Math.min(s.measuredKg, 10), 10] },
  { key: 'reviewer', name: 'Helpful reviewer', description: 'Review 3 completed services.', test: (s) => s.reviews >= 3, progress: (s) => [s.reviews, 3] },
];

/**
 * PLACEHOLDER factors per category slug (A-11): kilograms of material in one device, and CO2e (kg) avoided by keeping one
 * out of the waste stream. They are made-up round numbers, NOT sourced values. Every figure derived from them is an
 * estimate and is labelled so. Replace them with cited values (P10-12) before making any public environmental claim.
 * A category document's own `defaultMaterialFactors` overrides these.
 */
const PLACEHOLDER_FACTORS = {
  laptop: { co2eKg: 50, copperKg: 0.1, aluminiumKg: 0.3, ironKg: 0.2, plasticsKg: 0.5, glassKg: 0.1 },
  'desktop-computer': { co2eKg: 90, copperKg: 0.3, aluminiumKg: 0.8, ironKg: 3, plasticsKg: 1, glassKg: 0.1 },
  smartphone: { co2eKg: 30, copperKg: 0.02, aluminiumKg: 0.03, plasticsKg: 0.05, glassKg: 0.05 },
  tablet: { co2eKg: 40, copperKg: 0.03, aluminiumKg: 0.1, plasticsKg: 0.1, glassKg: 0.2 },
  monitor: { co2eKg: 45, copperKg: 0.1, aluminiumKg: 0.3, ironKg: 0.5, plasticsKg: 2, glassKg: 1.5 },
  television: { co2eKg: 80, copperKg: 0.2, aluminiumKg: 0.5, ironKg: 1, plasticsKg: 4, glassKg: 3 },
  keyboard: { co2eKg: 3, plasticsKg: 0.5, copperKg: 0.01 },
  mouse: { co2eKg: 1, plasticsKg: 0.1 },
  printer: { co2eKg: 25, ironKg: 1, plasticsKg: 3, copperKg: 0.05 },
  charger: { co2eKg: 2, copperKg: 0.03, plasticsKg: 0.1 },
  battery: { co2eKg: 5, aluminiumKg: 0.05, copperKg: 0.03 },
  'electronic-accessories': { co2eKg: 2, plasticsKg: 0.1, copperKg: 0.02 },
  'circuit-boards': { co2eKg: 8, copperKg: 0.1, plasticsKg: 0.1 },
  'computer-components': { co2eKg: 12, copperKg: 0.1, aluminiumKg: 0.2, ironKg: 0.3 },
  'other-electronic-devices': { co2eKg: 10, plasticsKg: 0.3, copperKg: 0.02 },
};
const DEFAULT_FACTORS = { co2eKg: 10 };

/** What the API says about its own numbers, so no client has to guess. */
const METHOD_NOTE = 'Counts of devices and weights measured on a scale at a recycling centre are actual. Everything else (material weights without a measurement, and CO2e avoided) is an estimate from placeholder factors that have not been sourced yet.';

module.exports = { POINT_RULES, RULE_FOR_TYPE, DAILY_EVENT_CAP, LEVELS, BADGES, PLACEHOLDER_FACTORS, DEFAULT_FACTORS, METHOD_NOTE };
