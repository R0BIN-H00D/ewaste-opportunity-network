/// A photo of a device. `url` is as the API sent it (usually a path); load it with `assetUrl`.
class ListingPhoto {
  const ListingPhoto({required this.url, this.publicId = ''});

  final String url;
  final String publicId;

  factory ListingPhoto.fromJson(Map<String, dynamic> json) =>
      ListingPhoto(url: (json['url'] as String?) ?? '', publicId: (json['publicId'] as String?) ?? '');
}

Map<String, dynamic> _map(Object? value) => value is Map ? value.cast<String, dynamic>() : const <String, dynamic>{};

/// A device someone has offered for repair, reuse, donation, refurbishment or recycling.
/// The server decides what each viewer may see: the exact address never arrives here (BR-08).
class Listing {
  const Listing({
    required this.id,
    required this.title,
    required this.condition,
    required this.preferredService,
    required this.status,
    this.brand,
    this.model,
    this.description,
    this.expectedPrice,
    this.pickupPreference,
    this.addressArea,
    this.city,
    this.isOwner = false,
    this.viewCount,
    this.photos = const [],
    this.categoryName,
    this.categorySlug,
    this.purchaseYear,
    this.ageYears,
    this.ownerName,
    this.moderationReason,
  });

  final String id;
  final String title;
  final String? brand;
  final String? model;
  final String condition;
  final String? description;
  final String preferredService;
  final double? expectedPrice;
  final String? pickupPreference;
  final String? addressArea;
  final String? city;
  final String status;
  final bool isOwner;
  final int? viewCount;
  final List<ListingPhoto> photos;
  final String? categoryName;
  final String? categorySlug;
  final int? purchaseYear;
  final int? ageYears;
  final String? ownerName;

  /// Why an administrator took the listing down. Only the owner is sent this.
  final String? moderationReason;

  bool get isLive => status == 'listed';

  /// "Area, City" without the street, as shown to everyone.
  String get place => [addressArea, city].where((p) => p != null && p.trim().isNotEmpty).join(', ');

  /// "Category · Brand · Model", skipping what is missing.
  String get subtitle => [categoryName, brand, model].where((p) => p != null && p.trim().isNotEmpty).join(' · ');

  factory Listing.fromJson(Map<String, dynamic> json) {
    final device = _map(json['device']);
    final category = _map(json['category']);
    final owner = _map(json['owner']);
    final moderation = _map(json['moderation']);
    final rawPhotos = device['photos'];
    return Listing(
      id: json['_id'] as String,
      title: (json['title'] as String?) ?? (device['name'] as String?) ?? '',
      brand: (json['brand'] as String?) ?? device['brand'] as String?,
      model: (json['model'] as String?) ?? device['model'] as String?,
      condition: (json['condition'] as String?) ?? '',
      description: json['description'] as String?,
      preferredService: (json['preferredService'] as String?) ?? '',
      expectedPrice: (json['expectedPrice'] as num?)?.toDouble(),
      pickupPreference: json['pickupPreference'] as String?,
      addressArea: json['addressArea'] as String?,
      city: json['city'] as String?,
      status: (json['status'] as String?) ?? 'listed',
      isOwner: (json['isOwner'] as bool?) ?? false,
      viewCount: (json['viewCount'] as num?)?.toInt(),
      photos: rawPhotos is List ? [for (final p in rawPhotos) if (p is Map) ListingPhoto.fromJson(p.cast<String, dynamic>())] : const [],
      categoryName: category['name'] as String?,
      categorySlug: category['slug'] as String?,
      purchaseYear: (device['purchaseYear'] as num?)?.toInt(),
      ageYears: (device['ageYears'] as num?)?.toInt(),
      ownerName: owner['name'] as String?,
      moderationReason: moderation['reason'] as String?,
    );
  }
}

/// One page of listings and where it sits in the whole result.
class ListingPage {
  const ListingPage({required this.items, required this.page, required this.pages, required this.total});

  final List<Listing> items;
  final int page;
  final int pages;
  final int total;

  bool get hasMore => page < pages;
}

class Category {
  const Category({required this.id, required this.name, required this.slug});

  final String id;
  final String name;
  final String slug;

  factory Category.fromJson(Map<String, dynamic> json) =>
      Category(id: (json['_id'] as String?) ?? '', name: (json['name'] as String?) ?? '', slug: (json['slug'] as String?) ?? '');
}
