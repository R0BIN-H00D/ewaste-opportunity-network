Map<String, dynamic> _map(Object? v) =>
    v is Map ? v.cast<String, dynamic>() : const <String, dynamic>{};
double _num(Object? v) => (v as num?)?.toDouble() ?? 0;

/// The kinds of verified activity, in the order they are shown, with the words used for each.
const Map<String, String> impactTypeLabels = {
  'repair': 'Repaired',
  'reuse': 'Reused',
  'donation': 'Donated',
  'refurbishment': 'Refurbished',
  'recycling': 'Recycled',
};

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
      byType: {
        for (final e in byType.entries) e.key: (e.value as num?)?.toInt() ?? 0
      },
      measuredKg: _num(materials['measuredKg']),
      estimatedKg: _num(materials['estimatedKg']),
      co2eKg: _num(_map(json['co2e'])['kgEstimated']),
      method: (json['method'] as String?) ?? '',
    );
  }
}

/// One calendar month of activity, `month` as `YYYY-MM`.
class MonthImpact {
  const MonthImpact(
      {required this.month,
      this.devices = 0,
      this.byType = const {},
      this.measuredKg = 0,
      this.estimatedKg = 0,
      this.co2eKg = 0});

  final String month;
  final int devices;
  final Map<String, int> byType;
  final double measuredKg;
  final double estimatedKg;
  final double co2eKg;

  factory MonthImpact.fromJson(Map<String, dynamic> json) => MonthImpact(
        month: (json['month'] as String?) ?? '',
        devices: (json['devices'] as num?)?.toInt() ?? 0,
        byType: {
          for (final e in _map(json['byType']).entries)
            e.key: (e.value as num?)?.toInt() ?? 0
        },
        measuredKg: _num(json['measuredKg']),
        estimatedKg: _num(json['estimatedKg']),
        co2eKg: _num(json['co2eKgEstimated']),
      );
}

/// One bar of a breakdown: a year, or a kind of device, with how many devices and what the activity was.
class BreakdownRow {
  const BreakdownRow(
      {required this.key,
      required this.label,
      this.devices = 0,
      this.byType = const {}});

  final String key;
  final String label;
  final int devices;
  final Map<String, int> byType;

  /// "Repaired 4 · Recycled 3", in the usual order, leaving out kinds with nothing.
  String get detail => [
        for (final e in impactTypeLabels.entries)
          if ((byType[e.key] ?? 0) > 0) '${e.value} ${byType[e.key]}'
      ].join(' · ');

  static Map<String, int> _types(Object? v) =>
      {for (final e in _map(v).entries) e.key: (e.value as num?)?.toInt() ?? 0};

  factory BreakdownRow.year(Map<String, dynamic> json) {
    final year = (json['year'] as num?)?.toInt();
    return BreakdownRow(
        key: '$year',
        label: year == null ? '' : '$year',
        devices: (json['devices'] as num?)?.toInt() ?? 0,
        byType: _types(json['byType']));
  }

  /// A row with no category is "Other": the server keeps those so the rows add up to the total.
  factory BreakdownRow.category(Map<String, dynamic> json) {
    final c = json['category'];
    final category = c is Map ? c.cast<String, dynamic>() : null;
    final name = category?['name'] as String?;
    return BreakdownRow(
      key: (category?['_id'] as String?) ?? 'other',
      label: (name != null && name.isNotEmpty) ? name : 'Other',
      devices: (json['devices'] as num?)?.toInt() ?? 0,
      byType: _types(json['byType']),
    );
  }
}

bool hasActivity(List<BreakdownRow> rows) => rows.any((r) => r.devices > 0);
