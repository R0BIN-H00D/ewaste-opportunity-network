import 'listing.dart' show ListingPhoto;

DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v) : null;
Map<String, dynamic> _map(Object? v) => v is Map ? v.cast<String, dynamic>() : const <String, dynamic>{};
double? _kg(Object? v) => v is num ? v.toDouble() : null;

/// A device category as the recycling endpoints name it.
class CenterCategory {
  const CenterCategory({required this.id, this.name = ''});

  final String id;
  final String name;

  factory CenterCategory.fromJson(Map<String, dynamic> json) => CenterCategory(id: (json['_id'] as String?) ?? '', name: (json['name'] as String?) ?? '');
}

List<CenterCategory> _categories(Object? v) => v is List ? [for (final c in v) if (c is Map) CenterCategory.fromJson(c.cast<String, dynamic>())] : const [];

/// An approved recycling centre as the public directory shows it. The server only lists centres that are in date.
class RecyclingCenter {
  const RecyclingCenter({
    required this.id,
    required this.name,
    this.city,
    this.authorized = false,
    this.authorizationNo,
    this.authorizingBody,
    this.validUntil,
    this.acceptedCategories = const [],
    this.operatingHours,
    this.ratingAvg = 0,
    this.ratingCount = 0,
    this.facilityDetails,
    this.collectionAreas = const [],
    this.totalActualKg = 0,
    this.totalEstimatedKg = 0,
  });

  final String id;
  final String name;
  final String? city;
  final bool authorized;
  final String? authorizationNo;
  final String? authorizingBody;
  final DateTime? validUntil;
  final List<CenterCategory> acceptedCategories;
  final String? operatingHours;
  final double ratingAvg;
  final int ratingCount;
  final String? facilityDetails;

  /// Labels of the places the centre collects from (never exact addresses).
  final List<String> collectionAreas;

  /// What the centre has recovered so far. Measured and estimated weights are kept apart (BR-06).
  final double totalActualKg;
  final double totalEstimatedKg;

  bool get hasRating => ratingCount > 0;

  factory RecyclingCenter.fromJson(Map<String, dynamic> json) {
    final areas = json['collectionAreas'];
    final totals = _map(json['totals']);
    return RecyclingCenter(
      id: json['_id'] as String,
      name: (json['name'] as String?) ?? 'Recycling centre',
      city: json['city'] as String?,
      authorized: json['authorized'] == true,
      authorizationNo: json['authorizationNo'] as String?,
      authorizingBody: json['authorizingBody'] as String?,
      validUntil: _date(json['validUntil']),
      acceptedCategories: _categories(json['acceptedCategories']),
      operatingHours: json['operatingHours'] as String?,
      ratingAvg: (json['ratingAvg'] as num?)?.toDouble() ?? 0,
      ratingCount: (json['ratingCount'] as num?)?.toInt() ?? 0,
      facilityDetails: json['facilityDetails'] as String?,
      collectionAreas: areas is List
          ? [for (final a in areas) if (a is Map && ((a['label'] ?? a['addressArea']) is String)) (a['label'] ?? a['addressArea']) as String]
          : const [],
      totalActualKg: (totals['actualKg'] as num?)?.toDouble() ?? 0,
      totalEstimatedKg: (totals['estimatedKg'] as num?)?.toDouble() ?? 0,
    );
  }
}

/// What came out of the devices, by material. Measured and estimated weights are never merged (BR-06).
class RecoveredMaterial {
  const RecoveredMaterial({required this.type, this.actualKg, this.estimatedKg});

  final String type;
  final double? actualKg;
  final double? estimatedKg;

  factory RecoveredMaterial.fromJson(Map<String, dynamic> json) =>
      RecoveredMaterial(type: (json['type'] as String?) ?? 'other', actualKg: _kg(json['actualKg']), estimatedKg: _kg(json['estimatedKg']));

  Map<String, dynamic> toJson() => {'type': type, if (actualKg != null) 'actualKg': actualKg, if (estimatedKg != null) 'estimatedKg': estimatedKg};
}

class RecyclingPickup {
  const RecyclingPickup({this.date, this.timeSlot, this.notes, this.status});

  final DateTime? date;
  final String? timeSlot;
  final String? notes;
  final String? status;

  factory RecyclingPickup.fromJson(Map<String, dynamic> json) =>
      RecyclingPickup(date: _date(json['date']), timeSlot: json['timeSlot'] as String?, notes: json['notes'] as String?, status: json['status'] as String?);
}

class RecyclingStep {
  const RecyclingStep({required this.status, this.at, this.note});

  final String status;
  final DateTime? at;
  final String? note;

  factory RecyclingStep.fromJson(Map<String, dynamic> json) => RecyclingStep(status: (json['status'] as String?) ?? '', at: _date(json['at']), note: json['note'] as String?);
}

/// A request to hand devices to a recycling centre. Lists carry the short form; one request carries everything,
/// including the `actions` the signed-in person may take next.
class RecyclingRequest {
  const RecyclingRequest({
    required this.id,
    required this.refNo,
    required this.status,
    required this.viewerRole,
    this.categories = const [],
    this.deviceCount = 1,
    this.photos = const [],
    this.pickupArea,
    this.pickupAddress,
    this.preferredDate,
    this.notes,
    this.centerId = '',
    this.centerName,
    this.centerCity,
    this.requesterName,
    this.listingTitle,
    this.createdAt,
    this.updatedAt,
    this.pickup,
    this.requesterConfirmed = false,
    this.centerConfirmed = false,
    this.receivedAt,
    this.completedAt,
    this.materials = const [],
    this.totalActualKg = 0,
    this.totalEstimatedKg = 0,
    this.reportNotes,
    this.history = const [],
    this.cancelReason,
    this.actions = const [],
  });

  final String id;
  final String refNo;
  final String status;

  /// `requester`, `center` or `admin`.
  final String viewerRole;
  final List<CenterCategory> categories;
  final int deviceCount;
  final List<ListingPhoto> photos;
  final String? pickupArea;

  /// Only sent to the sender, and to the centre while the request is accepted or a pickup is scheduled (BR-08).
  final String? pickupAddress;
  final DateTime? preferredDate;
  final String? notes;
  final String centerId;
  final String? centerName;
  final String? centerCity;
  final String? requesterName;
  final String? listingTitle;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final RecyclingPickup? pickup;
  final bool requesterConfirmed;
  final bool centerConfirmed;
  final DateTime? receivedAt;
  final DateTime? completedAt;
  final List<RecoveredMaterial> materials;
  final double totalActualKg;
  final double totalEstimatedKg;
  final String? reportNotes;
  final List<RecyclingStep> history;
  final String? cancelReason;
  final List<String> actions;

  bool get isCenterView => viewerRole == 'center';
  bool get isFinished => status == 'completed' || status == 'rejected' || status == 'cancelled';
  bool can(String action) => actions.contains(action);

  /// The device category names, "Laptops, Phones".
  String get categoryNames => categories.map((c) => c.name).where((n) => n.isNotEmpty).join(', ');

  factory RecyclingRequest.fromJson(Map<String, dynamic> json) {
    final center = _map(json['center']);
    final requester = _map(json['requester']);
    final listing = json['listing'];
    final confirmations = _map(json['confirmations']);
    final totals = _map(json['totals']);
    final photos = json['photos'];
    final materials = json['materials'];
    final history = json['history'];
    final actions = json['actions'];
    return RecyclingRequest(
      id: json['_id'] as String,
      refNo: (json['refNo'] as String?) ?? '',
      status: (json['status'] as String?) ?? 'requested',
      viewerRole: (json['viewerRole'] as String?) ?? 'requester',
      categories: _categories(json['categories']),
      deviceCount: (json['deviceCount'] as num?)?.toInt() ?? 1,
      photos: photos is List ? [for (final p in photos) if (p is Map) ListingPhoto.fromJson(p.cast<String, dynamic>())] : const [],
      pickupArea: json['pickupAddressArea'] as String?,
      pickupAddress: json['pickupAddress'] as String?,
      preferredDate: _date(json['preferredDate']),
      notes: json['notes'] as String?,
      centerId: (center['_id'] as String?) ?? '',
      centerName: center['name'] as String?,
      centerCity: center['city'] as String?,
      requesterName: requester['name'] as String?,
      listingTitle: listing is Map ? listing['title'] as String? : null,
      createdAt: _date(json['createdAt']),
      updatedAt: _date(json['updatedAt']),
      pickup: json['pickup'] is Map ? RecyclingPickup.fromJson(_map(json['pickup'])) : null,
      requesterConfirmed: confirmations['requester'] == true,
      centerConfirmed: confirmations['center'] == true,
      receivedAt: _date(json['receivedAt']),
      completedAt: _date(json['completedAt']),
      materials: materials is List ? [for (final m in materials) if (m is Map) RecoveredMaterial.fromJson(m.cast<String, dynamic>())] : const [],
      totalActualKg: (totals['actualKg'] as num?)?.toDouble() ?? 0,
      totalEstimatedKg: (totals['estimatedKg'] as num?)?.toDouble() ?? 0,
      reportNotes: json['reportNotes'] as String?,
      history: history is List ? [for (final h in history) if (h is Map) RecyclingStep.fromJson(h.cast<String, dynamic>())] : const [],
      cancelReason: json['cancelReason'] as String?,
      actions: actions is List ? [for (final a in actions) if (a is String) a] : const [],
    );
  }
}
