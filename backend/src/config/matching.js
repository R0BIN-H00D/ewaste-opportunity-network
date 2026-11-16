'use strict';
// Matching engine settings (design.md A.5). Weights add up to 100 so a score is directly a percentage.
// Change numbers here, not in the scorers.
module.exports = {
  weights: { category: 30, proximity: 25, rating: 15, availability: 10, condition: 10, experience: 5, freshness: 5 },
  // Bayesian smoothing so one 5-star review does not outrank thirty 4.8-star reviews.
  ratingPrior: { mean: 3.5, weight: 5 },
  defaultSearchRadiusKm: 25,
  maxCandidates: 500,
  maxResults: 20,
  // Rough share of the technician's base rate by condition. Always shown as an estimate, never a price.
  conditionMultiplier: { fully_working: 0.8, minor_damage: 1, major_damage: 1.5, not_working: 1.3, for_spare_parts: 0.6 },
  // Technicians who hold more than this many days since their last review lose the freshness bonus.
  freshnessDays: 730,
};
