List<String> _strings(Object? value) => value is List ? [for (final v in value) if (v is String && v.isNotEmpty) v] : const [];

/// A verified technician as the public directory shows them. The exact base address is never sent.
class Technician {
  const Technician({
    required this.id,
    required this.name,
    this.headline,
    this.experienceYears,
    this.qualifications = const [],
    this.specializations = const [],
    this.categories = const [],
    this.area,
    this.city,
    this.serviceRadiusKm,
    this.baseRate,
    this.availability = 'available',
    this.ratingAvg = 0,
    this.ratingCount = 0,
    this.completedJobs = 0,
    this.distanceKm,
  });

  final String id;
  final String name;
  final String? headline;
  final int? experienceYears;
  final List<String> qualifications;
  final List<String> specializations;

  /// Names of the device categories they repair. Empty means all.
  final List<String> categories;
  final String? area;
  final String? city;
  final int? serviceRadiusKm;
  final double? baseRate;
  final String availability;
  final double ratingAvg;
  final int ratingCount;
  final int completedJobs;
  final double? distanceKm;

  bool get isAvailable => availability != 'unavailable';

  String get place => [area, city].where((p) => p != null && p.trim().isNotEmpty).join(', ');

  bool get hasRating => ratingCount > 0;

  factory Technician.fromJson(Map<String, dynamic> json) {
    final availability = json['availability'];
    final cats = json['categories'];
    return Technician(
      id: json['_id'] as String,
      name: (json['name'] as String?) ?? 'Technician',
      headline: json['headline'] as String?,
      experienceYears: (json['experienceYears'] as num?)?.toInt(),
      qualifications: _strings(json['qualifications']),
      specializations: _strings(json['specializations']),
      categories: cats is List ? [for (final c in cats) if (c is Map && c['name'] is String) c['name'] as String] : const [],
      area: json['serviceAddressArea'] as String?,
      city: json['city'] as String?,
      serviceRadiusKm: (json['serviceRadiusKm'] as num?)?.toInt(),
      baseRate: (json['baseRate'] as num?)?.toDouble(),
      availability: availability is Map ? (availability['status'] as String? ?? 'available') : 'available',
      ratingAvg: (json['ratingAvg'] as num?)?.toDouble() ?? 0,
      ratingCount: (json['ratingCount'] as num?)?.toInt() ?? 0,
      completedJobs: (json['completedJobs'] as num?)?.toInt() ?? 0,
      distanceKm: (json['distanceKm'] as num?)?.toDouble(),
    );
  }
}
