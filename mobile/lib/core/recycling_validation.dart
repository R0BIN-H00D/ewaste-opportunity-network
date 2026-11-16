const maxRecyclingDevices = 500;

String? validatePickupArea(String? value) {
  final text = (value ?? '').trim();
  if (text.length < 2) return 'Enter the area or locality';
  if (text.length > 100) return 'Please keep this under 100 characters';
  return null;
}

String? validatePickupAddress(String? value) {
  final text = (value ?? '').trim();
  if (text.length < 5) return 'Enter the full pickup address';
  if (text.length > 250) return 'Please keep this under 250 characters';
  return null;
}

String? validateRecyclingNotes(String? value) => (value ?? '').trim().length > 500 ? 'Please keep this under 500 characters' : null;

/// A weight in kilograms typed by the centre. Empty is allowed (the caller decides whether a row needs one); returns the message to show,
/// or `null` when the text is empty or a valid non-negative number.
String? validateKg(String? value) {
  final text = (value ?? '').trim();
  if (text.isEmpty) return null;
  final n = double.tryParse(text);
  if (n == null) return 'Enter a number';
  if (n < 0) return 'Cannot be negative';
  if (n > 1000000) return 'That is too large';
  return null;
}

/// The number in [text], or `null` when it is empty or not a number.
double? parseKg(String? text) {
  final t = (text ?? '').trim();
  return t.isEmpty ? null : double.tryParse(t);
}
