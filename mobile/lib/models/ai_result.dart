/// A rough range in rupees from the AI. Always shown as an estimate, never as an offer.
class PriceRange {
  const PriceRange(this.min, this.max);
  final int min;
  final int max;

  static PriceRange? from(Object? json) {
    if (json is! Map) return null;
    final lo = json['min'];
    final hi = json['max'];
    return lo is num && hi is num ? PriceRange(lo.toInt(), hi.toInt()) : null;
  }
}

/// What the AI (or the plain rules, when AI is off) found about a device and what to do with it.
class AiResult {
  const AiResult({
    required this.source,
    this.categorySlug,
    this.categoryName,
    this.brand,
    this.model,
    this.title,
    this.condition,
    this.problems = const [],
    this.recommendation = 'repair',
    this.alternatives = const [],
    this.reasons = const [],
    this.skills = const [],
    this.safetyTip,
    this.resale,
    this.repair,
    this.notice = '',
    this.unavailableReason,
  });

  /// `ai` or `rules`.
  final String source;
  final String? categorySlug;
  final String? categoryName;
  final String? brand;
  final String? model;
  final String? title;
  final String? condition;
  final List<String> problems;
  final String recommendation;
  final List<String> alternatives;
  final List<String> reasons;
  final List<String> skills;
  final String? safetyTip;
  final PriceRange? resale;
  final PriceRange? repair;
  final String notice;

  /// Why the AI could not be used this time (off, over the daily limit, or down); the rule-based answer is shown instead.
  final String? unavailableReason;

  bool get fromAi => source == 'ai';

  static List<String> _list(Object? v) => v is List ? [for (final e in v) if (e is String) e] : const [];

  factory AiResult.fromJson(Map<String, dynamic> json) {
    final category = json['category'] is Map ? (json['category'] as Map).cast<String, dynamic>() : const <String, dynamic>{};
    final advice = json['advice'] is Map ? (json['advice'] as Map).cast<String, dynamic>() : const <String, dynamic>{};
    final estimate = json['estimate'] is Map ? (json['estimate'] as Map).cast<String, dynamic>() : const <String, dynamic>{};
    return AiResult(
      source: (json['source'] as String?) ?? 'rules',
      categorySlug: category['slug'] as String?,
      categoryName: category['name'] as String?,
      brand: json['brand'] as String?,
      model: json['model'] as String?,
      title: json['title'] as String?,
      condition: json['condition'] as String?,
      problems: _list(json['problems']),
      recommendation: (advice['recommendation'] as String?) ?? 'repair',
      alternatives: _list(advice['alternatives']),
      reasons: _list(advice['reasons']),
      skills: _list(advice['skillsNeeded']),
      safetyTip: advice['safetyTip'] as String?,
      resale: PriceRange.from(estimate['resale']),
      repair: PriceRange.from(estimate['repair']),
      notice: (json['notice'] as String?) ?? '',
      unavailableReason: json['unavailableReason'] as String?,
    );
  }
}

/// One suggested provider or wanted request for a device, with the plain reasons it fits.
class MatchItem {
  const MatchItem({required this.id, required this.name, required this.score, this.reasons = const [], this.kind});
  final String id;
  final String name;
  final double score;
  final List<String> reasons;
  final String? kind;

  factory MatchItem.fromJson(Map<String, dynamic> json) {
    // Technician matches nest the person under `technician`; the others carry the name directly.
    final tech = json['technician'] is Map ? (json['technician'] as Map).cast<String, dynamic>() : null;
    return MatchItem(
      id: (tech?['_id'] ?? json['id'] ?? '') as String,
      name: (tech?['name'] ?? json['name'] ?? json['title'] ?? '') as String,
      score: (json['score'] as num?)?.toDouble() ?? 0,
      reasons: AiResult._list(json['reasons']),
      kind: tech != null ? 'technician' : json['kind'] as String?,
    );
  }
}
