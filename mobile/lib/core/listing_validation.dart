// Checks that mirror backend/src/validators/device.validators.js, so people get an answer before a round trip.

const maxPhotos = 6;
const maxPhotoBytes = 5 * 1024 * 1024;
const allowedPhotoTypes = {'image/jpeg', 'image/png', 'image/webp'};

String? validateDeviceName(String? value) {
  final text = (value ?? '').trim();
  if (text.length < 2) return 'Give the device a name, for example "Samsung Galaxy A12"';
  if (text.length > 120) return 'Use at most 120 characters';
  return null;
}

String? validateBrandOrModel(String? value) => (value ?? '').trim().length > 60 ? 'Use at most 60 characters' : null;

/// Optional. When given it must be a year from 1990 to next year.
String? validatePurchaseYear(String? value, {int? thisYear}) {
  final text = (value ?? '').trim();
  if (text.isEmpty) return null;
  final year = int.tryParse(text);
  final latest = (thisYear ?? DateTime.now().year) + 1;
  if (year == null || year < 1990 || year > latest) return 'Enter a year from 1990 to $latest';
  return null;
}

/// Optional. 0 means free. Whole or decimal rupees.
String? validateExpectedPrice(String? value) {
  final text = (value ?? '').trim().replaceAll(',', '');
  if (text.isEmpty) return null;
  final price = double.tryParse(text);
  if (price == null || price < 0) return 'Enter an amount of 0 or more';
  return null;
}

String? validateDescription(String? value) => (value ?? '').trim().length > 2000 ? 'Use at most 2000 characters' : null;

String? validateAreaOrCity(String? value) => (value ?? '').trim().length > 100 ? 'Use at most 100 characters' : null;

/// What is wrong with a picked photo, in plain words, or `null` when it can be uploaded.
String? photoProblem({required String mime, required int bytes}) {
  if (!allowedPhotoTypes.contains(mime)) return 'Only JPEG, PNG or WebP photos can be used.';
  if (bytes > maxPhotoBytes) return 'That photo is larger than 5 MB.';
  return null;
}

/// The content type for a file name, judged by its ending. Empty when it is not a photo type we accept.
String mimeFromName(String name) {
  final lower = name.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return '';
}
