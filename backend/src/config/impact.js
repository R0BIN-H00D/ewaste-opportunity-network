'use strict';
// Environmental impact rules (design.md A.6, FR-IMP-*). Every number used to estimate material and CO2e figures is written
// down here so the rules are transparent (FR-IMP-003).

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

module.exports = { PLACEHOLDER_FACTORS, DEFAULT_FACTORS, METHOD_NOTE };
