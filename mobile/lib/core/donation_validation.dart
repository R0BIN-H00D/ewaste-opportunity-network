/// Checks for the donation forms. They mirror `backend/src/validators/donation.validators.js`, so the server rarely has to refuse.
String? validateDonationNote(String? value) => (value ?? '').trim().length > 1000 ? 'Please keep this under 1000 characters' : null;

String? validateJustification(String? value) {
  final text = (value ?? '').trim();
  if (text.length < 10) return 'Tell the donor why you need this device (at least a sentence)';
  if (text.length > 1000) return 'Please keep this under 1000 characters';
  return null;
}

String? validateIntendedUse(String? value) => (value ?? '').trim().length > 500 ? 'Please keep this under 500 characters' : null;

String? validateOrgName(String? value) {
  final text = (value ?? '').trim();
  if (text.length < 2) return 'Enter the organisation name';
  if (text.length > 150) return 'Please keep this under 150 characters';
  return null;
}

String? validateRegistrationNo(String? value) {
  final text = (value ?? '').trim();
  if (text.length < 3) return 'Enter the registration number';
  if (text.length > 60) return 'Please keep this under 60 characters';
  return null;
}
