/// How each part of a device is doing. Every answer is optional; the form asks only about the parts that fit the category.
/// The keys and values are the server's (`CONDITION_PARTS`).
class ConditionPart {
  const ConditionPart(this.key, this.label, this.options);

  final String key;
  final String label;

  /// (value, words) pairs, best first.
  final List<(String, String)> options;

  String? labelFor(String? value) {
    for (final o in options) {
      if (o.$1 == value) return o.$2;
    }
    return null;
  }
}

const List<ConditionPart> conditionParts = [
  ConditionPart('power', 'Does it turn on?', [
    ('works_normally', 'Turns on and works normally'),
    ('unstable', 'Turns on but is unstable (restarts or freezes)'),
    ('does_not_turn_on', 'Does not turn on'),
  ]),
  ConditionPart('screen', 'Screen', [
    ('no_damage', 'No damage'),
    ('scratched', 'Light scratches'),
    ('cracked', 'Cracked'),
    ('faulty', 'Faulty (lines, spots or no picture)'),
  ]),
  ConditionPart('battery', 'Battery', [
    ('holds_well', 'Holds charge well'),
    ('drains_fast', 'Drains quickly'),
    ('needs_replacing', 'Needs replacing'),
    ('swollen', 'Swollen or leaking'),
    ('missing', 'No battery'),
  ]),
  ConditionPart('body', 'Body and casing', [
    ('like_new', 'Like new'),
    ('scratched_or_dented', 'Scratches or dents'),
    ('cracked_or_bent', 'Cracked or bent'),
    ('parts_missing', 'Parts missing'),
  ]),
  ConditionPart('charging', 'Charging', [
    ('normal', 'Charges normally'),
    ('slow', 'Charges slowly'),
    ('not_charging', 'Does not charge'),
    ('port_damaged', 'Charging port damaged'),
  ]),
  ConditionPart('ports', 'Ports and buttons', [
    ('all_work', 'All work'),
    ('some_faulty', 'Some do not work'),
  ]),
  ConditionPart('sound', 'Speaker and microphone', [
    ('works', 'Works'),
    ('faulty', 'Faulty'),
  ]),
  ConditionPart('camera', 'Camera', [
    ('works', 'Works'),
    ('faulty', 'Faulty'),
  ]),
  ConditionPart('water', 'Water damage', [
    ('none', 'None'),
    ('suspected', 'Suspected'),
    ('damaged', 'Yes, water damaged'),
  ]),
];

const _allParts = ['power', 'screen', 'battery', 'body', 'charging', 'ports', 'sound', 'camera', 'water'];
const _partsByCategory = <String, List<String>>{
  'laptop': _allParts,
  'smartphone': _allParts,
  'tablet': _allParts,
  'desktop-computer': ['power', 'body', 'ports', 'sound', 'water'],
  'monitor': ['power', 'screen', 'body', 'ports', 'sound', 'water'],
  'television': ['power', 'screen', 'body', 'ports', 'sound', 'water'],
  'keyboard': ['body', 'ports', 'water'],
  'mouse': ['body', 'ports', 'water'],
  'printer': ['power', 'body', 'ports', 'water'],
  'charger': ['power', 'body', 'ports'],
  'battery': ['battery', 'body'],
};
const _defaultParts = ['power', 'body', 'water'];

/// The parts worth asking about for a category slug (an unknown one still gets the basics).
List<ConditionPart> conditionPartsFor(String? categorySlug) {
  final keys = _partsByCategory[categorySlug] ?? _defaultParts;
  return [for (final p in conditionParts) if (keys.contains(p.key)) p];
}

/// Answered before a new listing can be published (where the category has them); the others sit behind "Show more".
const requiredPartKeys = ['battery', 'screen', 'ports', 'water'];

/// The required parts for a category, in the order people are asked.
List<ConditionPart> requiredPartsFor(String? categorySlug) {
  final parts = conditionPartsFor(categorySlug);
  return [for (final key in requiredPartKeys) ...parts.where((p) => p.key == key)];
}

/// The optional parts for a category.
List<ConditionPart> optionalPartsFor(String? categorySlug) => [for (final p in conditionPartsFor(categorySlug)) if (!requiredPartKeys.contains(p.key)) p];

const _serious = <String, List<String>>{
  'power': ['unstable', 'does_not_turn_on'],
  'screen': ['cracked', 'faulty'],
  'battery': ['swollen'],
  'body': ['cracked_or_bent', 'parts_missing'],
  'charging': ['not_charging'],
  'water': ['damaged'],
};
const _minor = <String, List<String>>{
  'screen': ['scratched'],
  'battery': ['drains_fast', 'needs_replacing', 'missing'],
  'body': ['scratched_or_dented'],
  'charging': ['slow', 'port_damaged'],
  'ports': ['some_faulty'],
  'sound': ['faulty'],
  'camera': ['faulty'],
  'water': ['suspected'],
};

/// The overall condition the answers point to, or `''` when nothing was answered. Only ever a suggestion.
String suggestCondition(Map<String, String> details) {
  final answers = {for (final e in details.entries) if (e.value.isNotEmpty) e.key: e.value};
  if (answers.isEmpty) return '';
  if (answers['power'] == 'does_not_turn_on') return 'not_working';
  if (answers.entries.any((e) => (_serious[e.key] ?? const []).contains(e.value))) return 'major_damage';
  if (answers.entries.any((e) => (_minor[e.key] ?? const []).contains(e.value))) return 'minor_damage';
  return 'fully_working';
}

/// How one answer reads to a buyer.
enum PartTone { good, warn, bad }

PartTone partTone(String key, String value) {
  if ((_serious[key] ?? const []).contains(value)) return PartTone.bad;
  if ((_minor[key] ?? const []).contains(value)) return PartTone.warn;
  return PartTone.good;
}

// The same parts, worded for a buyer looking at a product.
const _buyerLabels = {
  'power': 'Working condition',
  'battery': 'Battery',
  'screen': 'Screen',
  'body': 'Scratches and body',
  'charging': 'Charging',
  'ports': 'Ports and buttons',
  'sound': 'Speaker and microphone',
  'camera': 'Camera',
  'water': 'Water damage',
};

class AboutRow {
  const AboutRow(this.key, this.label, this.answer, this.tone);
  final String key;
  final String label;
  final String answer;
  final PartTone tone;
}

/// One row for each answered part, in the usual order, for the "About this device" card.
List<AboutRow> aboutRows(Map<String, String> details) => [
      for (final p in conditionParts)
        if (details[p.key] != null && p.labelFor(details[p.key]) != null) AboutRow(p.key, _buyerLabels[p.key] ?? p.label, p.labelFor(details[p.key])!, partTone(p.key, details[p.key]!)),
    ];

/// (label, answer) for each answered part, in the usual order.
List<(String, String)> conditionRows(Map<String, String> details) => [
      for (final p in conditionParts)
        if (details[p.key] != null && p.labelFor(details[p.key]) != null) (p.label, p.labelFor(details[p.key])!),
    ];
