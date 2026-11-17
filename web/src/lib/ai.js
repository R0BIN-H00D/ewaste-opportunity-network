// Helpers for the AI device suggestion (P9-07). The server decides what it knows; these only word it.

/** In words, because a percentage would claim more than a guess can. */
export function confidenceLabel(confidence) {
  const c = Number(confidence) || 0;
  if (c >= 0.75) return 'Fairly sure';
  if (c >= 0.45) return 'Not very sure';
  return 'Only a guess';
}

/** Nothing useful was found. */
export const isEmptySuggestion = (s) => !s?.category && !s?.brand && !(s?.visibleDamage?.length) && !(s?.possibleRepairs?.length);

/** What is sent back with the listing once the person has accepted the suggestion. The server marks it confirmed. */
export function toSavedSuggestion(s) {
  return {
    source: s.source,
    ...(s.category?.slug ? { category: s.category.slug } : {}),
    ...(s.deviceType ? { type: s.deviceType } : {}),
    ...(s.brand ? { brand: s.brand } : {}),
    visibleDamage: s.visibleDamage || [],
    possibleRepairs: s.possibleRepairs || [],
    confidence: Math.round((Number(s.confidence) || 0) * 100) / 100,
  };
}