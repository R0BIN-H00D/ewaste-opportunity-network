/// Checks for the refurbisher's forms. They mirror `refurbishment.validators.js` and `marketplace.validators.js`.
const maxMoney = 10000000;

/// Reads a rupee amount typed by a person: digits with an optional decimal part, spaces and commas ignored. `null` when it is not a number.
double? parseMoney(String? value) {
  final text = (value ?? '').replaceAll(',', '').replaceAll('₹', '').trim();
  if (text.isEmpty) return null;
  return double.tryParse(text);
}

/// The amount a refurbisher offers the owner for the device. Optional: leaving it empty means free collection.
String? validateOfferAmount(String? value) {
  if ((value ?? '').trim().isEmpty) return null;
  final amount = parseMoney(value);
  if (amount == null) return 'Enter an amount in rupees, for example 500';
  if (amount < 0) return 'The amount cannot be negative';
  if (amount > maxMoney) return 'That amount is too large';
  return null;
}

String? validateOfferMessage(String? value) => (value ?? '').trim().length > 1000 ? 'Please keep this under 1000 characters' : null;

String? validateJobNote(String? value) => (value ?? '').trim().length > 500 ? 'Please keep this under 500 characters' : null;

String? validateProductTitle(String? value) {
  final text = (value ?? '').trim();
  if (text.length < 3) return 'Give the product a clear title';
  if (text.length > 140) return 'Please keep this under 140 characters';
  return null;
}

String? validateRefurbishmentInfo(String? value) {
  final text = (value ?? '').trim();
  if (text.length < 10) return 'Say what was repaired, replaced or tested (at least 10 characters)';
  if (text.length > 2000) return 'Please keep this under 2000 characters';
  return null;
}

String? validateProductPrice(String? value) {
  final price = parseMoney(value);
  if (price == null) return 'Enter the price in rupees';
  if (price < 0) return 'The price cannot be negative';
  if (price > maxMoney) return 'That price is too large';
  return null;
}

/// Stock for a new product must be at least 1; an existing product may be set to 0 (sold out).
String? Function(String?) stockValidator({required bool allowZero}) => (value) {
      final n = int.tryParse((value ?? '').trim());
      if (n == null) return 'Enter how many you have';
      if (n < (allowZero ? 0 : 1)) return allowZero ? 'Stock cannot be negative' : 'You need at least 1 in stock';
      if (n > 999) return 'At most 999';
      return null;
    };

String? validateBrandOrModel(String? value) => (value ?? '').trim().length > 60 ? 'Please keep this under 60 characters' : null;

/// Turns "RAM: 8 GB" lines into a map. Returns the problem when a line has no colon, a long name, or there are too many.
({Map<String, String> specs, String? error}) parseSpecs(String? text) {
  final specs = <String, String>{};
  final lines = (text ?? '').split('\n').map((l) => l.trim()).where((l) => l.isNotEmpty);
  for (final line in lines) {
    final i = line.indexOf(':');
    if (i <= 0 || i == line.length - 1) return (specs: const {}, error: 'Write each specification as "name: value", one per line');
    final key = line.substring(0, i).trim();
    final value = line.substring(i + 1).trim();
    if (key.isEmpty || value.isEmpty) return (specs: const {}, error: 'Write each specification as "name: value", one per line');
    if (key.length > 40) return (specs: const {}, error: 'A specification name can be at most 40 characters');
    if (value.length > 100) return (specs: const {}, error: 'A specification value can be at most 100 characters');
    specs[key] = value;
  }
  if (specs.length > 20) return (specs: const {}, error: 'At most 20 specifications');
  return (specs: specs, error: null);
}

String? validateSpecs(String? text) => parseSpecs(text).error;

/// "RAM: 8 GB" lines from a specification map, for editing.
String specsToText(Map<String, String> specs) => [for (final e in specs.entries) '${e.key}: ${e.value}'].join('\n');
