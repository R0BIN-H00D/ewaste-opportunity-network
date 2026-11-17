DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v)?.toLocal() : null;
Map<String, dynamic> _map(Object? v) => v is Map ? v.cast<String, dynamic>() : const <String, dynamic>{};
double _num(Object? v) => (v as num?)?.toDouble() ?? 0;

/// The kinds of verified activity, in the order they are shown, with the words used for each.
const Map<String, String> impactTypeLabels = {
  'repair': 'Repaired',
  'reuse': 'Reused',
  'donation': 'Donated',
  'refurbishment': 'Refurbished',
  'recycling': 'Recycled',
};

/// Where a person stands: a named level, and how far through it they are towards the next one.
class GreenLevel {
  const GreenLevel({required this.key, required this.name, required this.min, this.nextName, this.nextMin, this.progress = 0});

  final String key;
  final String name;
  final int min;
  final String? nextName;
  final int? nextMin;

  /// 0 to 1 through the current level; 1 at the top level.
  final double progress;

  bool get isTop => nextName == null;

  /// Points still needed for the next level, for a score of [score].
  int pointsToNext(int score) => nextMin == null ? 0 : (nextMin! - score).clamp(0, 1 << 30);

  factory GreenLevel.fromJson(Map<String, dynamic> json) {
    final next = json['next'] is Map ? _map(json['next']) : null;
    return GreenLevel(
      key: (json['key'] as String?) ?? 'seed',
      name: (json['name'] as String?) ?? 'Seed',
      min: (json['min'] as num?)?.toInt() ?? 0,
      nextName: next?['name'] as String?,
      nextMin: (next?['min'] as num?)?.toInt(),
      progress: _num(json['progress']).clamp(0.0, 1.0),
    );
  }
}

/// An achievement, earned or not yet. [done] of [needed] says how close it is.
class GreenBadge {
  const GreenBadge({required this.key, required this.name, required this.description, required this.earned, this.done = 0, this.needed = 1});

  final String key;
  final String name;
  final String description;
  final bool earned;
  final double done;
  final double needed;

  factory GreenBadge.fromJson(Map<String, dynamic> json) {
    final p = _map(json['progress']);
    return GreenBadge(
      key: (json['key'] as String?) ?? '',
      name: (json['name'] as String?) ?? '',
      description: (json['description'] as String?) ?? '',
      earned: json['earned'] == true,
      done: _num(p['done']),
      needed: _num(p['needed']) == 0 ? 1 : _num(p['needed']),
    );
  }
}

/// One line of the score history: what happened and how many points it added (or took away).
class LedgerEntry {
  const LedgerEntry({required this.id, required this.points, required this.label, required this.rule, this.at});

  final String id;
  final int points;
  final String label;
  final String rule;
  final DateTime? at;

  bool get isReversal => rule == 'reversal';

  factory LedgerEntry.fromJson(Map<String, dynamic> json) => LedgerEntry(
        id: (json['_id'] as String?) ?? '',
        points: (json['points'] as num?)?.toInt() ?? 0,
        label: (json['label'] as String?) ?? '',
        rule: (json['rule'] as String?) ?? '',
        at: _date(json['createdAt']),
      );
}

class GreenScore {
  const GreenScore({required this.score, required this.level, this.badges = const [], this.ledger = const []});

  final int score;
  final GreenLevel level;
  final List<GreenBadge> badges;

  /// The newest lines of the history (the first page).
  final List<LedgerEntry> ledger;

  List<GreenBadge> get earnedBadges => [for (final b in badges) if (b.earned) b];

  factory GreenScore.fromJson(Map<String, dynamic> json) {
    final badges = json['badges'];
    final ledger = json['ledger'];
    return GreenScore(
      score: (json['score'] as num?)?.toInt() ?? 0,
      level: GreenLevel.fromJson(_map(json['level'])),
      badges: badges is List ? [for (final b in badges) if (b is Map) GreenBadge.fromJson(b.cast<String, dynamic>())] : const [],
      ledger: ledger is List ? [for (final l in ledger) if (l is Map) LedgerEntry.fromJson(l.cast<String, dynamic>())] : const [],
    );
  }
}

/// A person's own impact. Device counts are actual. Weights are kept apart: [measuredKg] was weighed on a scale at a
/// recycling centre, [estimatedKg] was not. [co2eKg] is only ever an estimate (BR-06).
class ImpactSummary {
  const ImpactSummary({
    this.events = 0,
    this.devicesTotal = 0,
    this.byType = const {},
    this.measuredKg = 0,
    this.estimatedKg = 0,
    this.co2eKg = 0,
    this.method = '',
  });

  final int events;
  final int devicesTotal;
  final Map<String, int> byType;
  final double measuredKg;
  final double estimatedKg;
  final double co2eKg;

  /// The server's own plain-words note on what is measured and what is estimated.
  final String method;

  bool get isEmpty => devicesTotal == 0 && measuredKg == 0 && estimatedKg == 0;

  factory ImpactSummary.fromJson(Map<String, dynamic> json) {
    final devices = _map(json['devices']);
    final byType = _map(devices['byType']);
    final materials = _map(json['materials']);
    return ImpactSummary(
      events: (json['events'] as num?)?.toInt() ?? 0,
      devicesTotal: (devices['total'] as num?)?.toInt() ?? 0,
      byType: {for (final e in byType.entries) e.key: (e.value as num?)?.toInt() ?? 0},
      measuredKg: _num(materials['measuredKg']),
      estimatedKg: _num(materials['estimatedKg']),
      co2eKg: _num(_map(json['co2e'])['kgEstimated']),
      method: (json['method'] as String?) ?? '',
    );
  }
}

/// One calendar month of activity, `month` as `YYYY-MM`.
class MonthImpact {
  const MonthImpact({required this.month, this.devices = 0, this.byType = const {}, this.measuredKg = 0, this.estimatedKg = 0, this.co2eKg = 0});

  final String month;
  final int devices;
  final Map<String, int> byType;
  final double measuredKg;
  final double estimatedKg;
  final double co2eKg;

  factory MonthImpact.fromJson(Map<String, dynamic> json) => MonthImpact(
        month: (json['month'] as String?) ?? '',
        devices: (json['devices'] as num?)?.toInt() ?? 0,
        byType: {for (final e in _map(json['byType']).entries) e.key: (e.value as num?)?.toInt() ?? 0},
        measuredKg: _num(json['measuredKg']),
        estimatedKg: _num(json['estimatedKg']),
        co2eKg: _num(json['co2eKgEstimated']),
      );
}

class ScoringRule {
  const ScoringRule({required this.key, required this.points, required this.label, required this.who});

  final String key;
  final int points;
  final String label;
  final String who;
}

/// How a score is made, exactly as the server runs it, so it can be read in the app (P9-03).
class ScoringRules {
  const ScoringRules({this.rules = const [], this.dailyCap = 0, this.notes = const [], this.method = ''});

  final List<ScoringRule> rules;
  final int dailyCap;
  final List<String> notes;
  final String method;

  factory ScoringRules.fromJson(Map<String, dynamic> json) {
    final rules = json['rules'];
    final notes = json['notes'];
    return ScoringRules(
      rules: rules is List
          ? [
              for (final r in rules)
                if (r is Map) ScoringRule(key: (r['key'] as String?) ?? '', points: (r['points'] as num?)?.toInt() ?? 0, label: (r['label'] as String?) ?? '', who: (r['who'] as String?) ?? '')
            ]
          : const [],
      dailyCap: (json['dailyCap'] as num?)?.toInt() ?? 0,
      notes: notes is List ? [for (final n in notes) '$n'] : const [],
      method: (json['method'] as String?) ?? '',
    );
  }
}
