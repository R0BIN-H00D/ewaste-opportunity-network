// Helpers for the map views (P8-07). Pure functions, so they are tested without a map.

/** GeoJSON `[lng, lat]` to Leaflet's `[lat, lng]`, or null when it is not a real point. */
export function toLatLng(point) {
  const c = point?.coordinates;
  if (!Array.isArray(c) || c.length !== 2) return null;
  const [lng, lat] = c.map(Number);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lat, lng];
}

const place = (...parts) => parts.filter(Boolean).join(', ');

/**
 * Markers for listings. Only the PUBLIC, already-fuzzed location is ever used (BR-08, FR-MAP-006): a listing's exact
 * `location` is for its owner and is deliberately never read here, even if a response were to include it.
 */
export function listingMarkers(listings = []) {
  return listings.flatMap((l) => {
    const position = toLatLng(l.publicLocation);
    return position ? [{ id: l._id, position, title: l.title, subtitle: place(l.addressArea, l.city), to: `/devices/${l._id}` }] : [];
  });
}

/** Markers for recycling centres. A centre's location is its published address, so it is shown as it is. */
export function centerMarkers(centers = []) {
  return centers.flatMap((c) => {
    const position = toLatLng(c.location);
    return position ? [{ id: c._id, position, title: c.name, subtitle: c.city || '', to: `/recycling-centers/${c._id}` }] : [];
  });
}

/** How many of the items could not be placed on the map, for an honest note under it. */
export const unplaced = (items, markers) => Math.max(0, items.length - markers.length);