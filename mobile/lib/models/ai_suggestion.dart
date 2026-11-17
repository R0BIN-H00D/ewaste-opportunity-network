/// What the server thinks a device is, from a photo and/or the owner's words. Always a suggestion: the person confirms it.
class AiSuggestion {
  const AiSuggestion({
    required this.source,
    this.categorySlug,
    this.categoryName,
    this.deviceType,
    this.brand,
    this.visibleDamage = const [],
    this.possibleRepairs = const [],
    this.confidence = 0,
    this.usedPhoto = false,
    this.fallbackReason,
    this.disclaimer = '',
  });

  /// `gemini` (read from the photo) or `rules` (read from the words).
  final String source;
  final String? categorySlug;
  final String? categoryName;
  final String? deviceType;
  final String? brand;
  final List<String> visibleDamage;
  final List<String> possibleRepairs;
  final double confidence;
  final bool usedPhoto;

  /// Why the photo was not read: `not_configured`, `no_photo`, `quota` or `unavailable`.
  final String? fallbackReason;
  final String disclaimer;

  /// Nothing useful was found.
  bool get isEmpty => categorySlug == null && brand == null && visibleDamage.isEmpty && possibleRepairs.isEmpty;

  /// In words, because a percentage would claim more than a guess can.
  String get confidenceLabel => confidence >= 0.75 ? 'Fairly sure' : (confidence >= 0.45 ? 'Not very sure' : 'Only a guess');

  factory AiSuggestion.fromJson(Map<String, dynamic> json) {
    final category = json['category'];
    List<String> strings(Object? v) => v is List ? [for (final s in v) if (s is String && s.trim().isNotEmpty) s.trim()] : const [];
    return AiSuggestion(
      source: json['source'] as String? ?? 'rules',
      categorySlug: category is Map ? category['slug'] as String? : null,
      categoryName: category is Map ? category['name'] as String? : null,
      deviceType: json['deviceType'] is String ? json['deviceType'] as String : null,
      brand: json['brand'] is String ? json['brand'] as String : null,
      visibleDamage: strings(json['visibleDamage']),
      possibleRepairs: strings(json['possibleRepairs']),
      confidence: json['confidence'] is num ? (json['confidence'] as num).toDouble() : 0,
      usedPhoto: json['usedPhoto'] == true,
      fallbackReason: json['fallbackReason'] as String?,
      disclaimer: json['disclaimer'] as String? ?? '',
    );
  }

  /// What is sent back with the listing once the person has accepted it.
  Map<String, dynamic> toSaved() => {
        'source': source,
        if (categorySlug != null) 'category': categorySlug,
        if (deviceType != null) 'type': deviceType,
        if (brand != null) 'brand': brand,
        'visibleDamage': visibleDamage,
        'possibleRepairs': possibleRepairs,
        'confidence': double.parse(confidence.toStringAsFixed(2)),
      };
}