// Checks that mirror backend/src/validators/device.validators.js, so people get an answer before a round trip.

const maxPhotos = 6;
const maxPhotoBytes = 5 * 1024 * 1024;
const allowedPhotoTypes = {'image/jpeg', 'image/png', 'image/webp'};

String? validateDeviceName(String? value) {
  final text = (value ?? '').trim();
  if (text.length < 3 || !RegExp(r'[A-Za-z]').hasMatch(text))
    return 'Give the device a name, for example "Samsung Galaxy A12"';
  if (text.length > 120) return 'Use at most 120 characters';
  return null;
}

/// Required: at least 2 characters.
String? validateBrand(String? value) {
  final text = (value ?? '').trim();
  if (text.length < 2) return 'Enter the brand, for example "Samsung"';
  if (text.length > 60) return 'Use at most 60 characters';
  return null;
}

/// Required: letters or numbers, up to 60 characters.
String? validateModel(String? value) {
  final text = (value ?? '').trim();
  if (text.isEmpty) return 'Enter the model, for example "Galaxy A12"';
  if (text.length > 60) return 'Use at most 60 characters';
  if (!RegExp(r'[A-Za-z0-9]').hasMatch(text)) return 'The model must contain letters or numbers';
  return null;
}

String? validateBrandOrModel(String? value) =>
    (value ?? '').trim().length > 60 ? 'Use at most 60 characters' : null;

/// Required: a year from 1990 to this year.
String? validateModelYear(String? value, {int? thisYear}) {
  final text = (value ?? '').trim();
  if (text.isEmpty) return 'Enter the year this model came out';
  final year = int.tryParse(text);
  final latest = thisYear ?? DateTime.now().year;
  if (year == null || year < 1990 || year > latest) return 'Enter a year from 1990 to $latest';
  return null;
}

/// Required: a year from 1990 to this year, and not before the model year.
String? validatePurchaseYear(String? value, {int? thisYear, String? modelYear}) {
  final text = (value ?? '').trim();
  if (text.isEmpty) return 'Enter the year it was bought';
  final year = int.tryParse(text);
  final latest = thisYear ?? DateTime.now().year;
  if (year == null || year < 1990 || year > latest) return 'Enter a year from 1990 to $latest';
  final model = int.tryParse((modelYear ?? '').trim());
  if (model != null && year < model) return 'The purchase year cannot be earlier than the model year ($model)';
  return null;
}

/// Optional. 0 means free. Whole or decimal rupees.
String? validateExpectedPrice(String? value) {
  final text = (value ?? '').trim().replaceAll(',', '');
  if (text.isEmpty) return null;
  final price = double.tryParse(text);
  if (price == null || price < 0) return 'Enter an amount of 0 or more';
  if (price > 10000000) return 'That price is too high';
  if (!RegExp(r'^\d+(\.\d{1,2})?$').hasMatch(text))
    return 'Use at most 2 decimal places';
  return null;
}

/// Not asked on the form any more; kept as an optional length limit.
String? validateDescription(String? value) => (value ?? '').trim().length > 2000 ? 'Use at most 2000 characters' : null;

/// Required: at least 3 characters, starting with a letter.
String? validateArea(String? value) {
  final text = (value ?? '').trim();
  if (text.length < 3)
    return 'Enter the area or locality (at least 3 characters)';
  if (text.length > 100) return 'Use at most 100 characters';
  if (!RegExp(r"^[A-Za-z][A-Za-z0-9 .,'()/&-]*$").hasMatch(text))
    return 'The area must start with a letter and use normal characters';
  return null;
}

/// Required: letters only.
String? validateCity(String? value) {
  final text = (value ?? '').trim();
  if (text.length < 2) return 'Enter the city';
  if (text.length > 80) return 'Use at most 80 characters';
  if (!RegExp(r"^[A-Za-z][A-Za-z .'-]*$").hasMatch(text))
    return 'The city can only have letters';
  return null;
}

/// What is wrong with a picked photo, in plain words, or `null` when it can be uploaded.
String? photoProblem({required String mime, required int bytes}) {
  if (!allowedPhotoTypes.contains(mime))
    return 'Only JPEG, PNG or WebP photos can be used.';
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

/// An Indian mobile number as 10 digits: spaces, dashes, brackets, +91, 91 and a leading 0 are dropped.
String normalizePhone(String? value) {
  var d = (value ?? '').replaceAll(RegExp(r'[\s\-().]'), '');
  if (RegExp(r'^\+91\d{10}$').hasMatch(d)) {
    d = d.substring(3);
  } else if (RegExp(r'^91\d{10}$').hasMatch(d)) {
    d = d.substring(2);
  } else if (RegExp(r'^0\d{10}$').hasMatch(d)) {
    d = d.substring(1);
  }
  return d;
}

/// Required: your 10-digit mobile number (starts with 6 to 9).
String? validateAgentPhone(String? value) => RegExp(r'^[6-9]\d{9}$').hasMatch(normalizePhone(value)) ? null : 'Enter a valid 10-digit mobile number';

/// The three things a person confirms before a device can be saved or published (the same as on the web).
const dataProtectionChecklist = [
  'I have backed up anything I want to keep.',
  'I have signed out of all accounts (Google, Apple, Microsoft...) and removed locks.',
  'I will erase personal data, or I understand the recipient may recover whatever is left on the device.',
];
