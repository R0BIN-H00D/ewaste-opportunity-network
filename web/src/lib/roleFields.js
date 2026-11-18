// Data-driven form definition for each provider role (mirrors backend/src/validators/profile.validators.js).
// type: text | textarea | number | date | list (comma separated)
export const ROLE_FIELDS = {
  technician: {
    title: 'Technician details',
    fields: [
      { name: 'headline', label: 'Headline', type: 'text', max: 120, full: true },
      { name: 'experienceYears', label: 'Years of experience', type: 'number', min: 0, max: 60 },
      { name: 'baseRate', label: 'Base rate (INR)', type: 'number', min: 0 },
      { name: 'specializations', label: 'Specialisations', type: 'list', hint: 'Separate with commas, e.g. screen repair, battery', full: true },
      { name: 'serviceAddressArea', label: 'Service area', type: 'text' },
      { name: 'city', label: 'City', type: 'text' },
      { name: 'serviceRadiusKm', label: 'Service radius (km)', type: 'number', min: 1, max: 200 },
    ],
  },
  refurbisher: {
    title: 'Business details',
    fields: [
      { name: 'businessName', label: 'Business name', type: 'text', full: true },
      { name: 'registrationNo', label: 'Registration number', type: 'text' },
      { name: 'addressArea', label: 'Area / locality', type: 'text' },
      { name: 'city', label: 'City', type: 'text' },
      { name: 'description', label: 'About the business', type: 'textarea', full: true },
    ],
  },
  recycler: {
    title: 'Recycling centre details',
    fields: [
      { name: 'name', label: 'Centre name', type: 'text', full: true },
      { name: 'authorizationNo', label: 'Authorisation number', type: 'text' },
      { name: 'authorizingBody', label: 'Authorising body', type: 'text' },
      { name: 'validUntil', label: 'Authorisation valid until', type: 'date' },
      { name: 'operatingHours', label: 'Operating hours', type: 'text' },
      { name: 'city', label: 'City', type: 'text' },
      { name: 'facilityDetails', label: 'Facility details', type: 'textarea', full: true },
    ],
  },
};

const toInput = (field, value) => {
  if (value === undefined || value === null) return '';
  if (field.type === 'list') return Array.isArray(value) ? value.join(', ') : '';
  if (field.type === 'date') return String(value).slice(0, 10);
  return String(value);
};

export const roleDefaults = (role, profile) =>
  Object.fromEntries((ROLE_FIELDS[role]?.fields || []).map((f) => [f.name, toInput(f, profile?.[f.name])]));

/** Form values -> PATCH body. Empty inputs are skipped (the API treats an empty update as an error). */
export function roleBody(role, values) {
  const body = {};
  for (const f of ROLE_FIELDS[role]?.fields || []) {
    const v = (values[f.name] ?? '').toString().trim();
    if (!v) continue;
    if (f.type === 'list') body[f.name] = v.split(',').map((s) => s.trim()).filter(Boolean);
    else if (f.type === 'number') body[f.name] = Number(v);
    else body[f.name] = v;
  }
  return body;
}
