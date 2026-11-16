import 'donation.dart' show DonatedDevice, DonationHandover;
import 'listing.dart' show ListingPhoto;

DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v) : null;
Map<String, dynamic> _map(Object? v) => v is Map ? v.cast<String, dynamic>() : const <String, dynamic>{};
List<String> _strings(Object? v) => v is List ? [for (final s in v) if (s is String) s] : const [];
List<ListingPhoto> _photos(Object? v) => v is List ? [for (final p in v) if (p is Map) ListingPhoto.fromJson(p.cast<String, dynamic>())] : const [];

/// A device an owner would like refurbished, as it appears in the refurbisher's feed. Only the public area is shown (BR-08).
class RefurbOpportunity {
  const RefurbOpportunity({required this.id, required this.device, this.hasOffered = false, this.listedAt});

  final String id;
  final DonatedDevice device;

  /// The refurbisher already has a live offer on this device.
  final bool hasOffered;
  final DateTime? listedAt;

  factory RefurbOpportunity.fromJson(Map<String, dynamic> json) => RefurbOpportunity(
        id: json['_id'] as String,
        device: DonatedDevice.fromJson(json),
        hasOffered: json['hasOffered'] == true,
        listedAt: _date(json['listedAt']),
      );
}

class JobStep {
  const JobStep({required this.status, this.at, this.note});

  final String status;
  final DateTime? at;
  final String? note;

  factory JobStep.fromJson(Map<String, dynamic> json) => JobStep(status: (json['status'] as String?) ?? '', at: _date(json['at']), note: json['note'] as String?);
}

class WorkNote {
  const WorkNote({required this.text, this.at});

  final String text;
  final DateTime? at;

  factory WorkNote.fromJson(Map<String, dynamic> json) => WorkNote(text: (json['text'] as String?) ?? '', at: _date(json['at']));
}

/// One refurbishment job: an offer by a refurbisher on an owner's device, and the work after it is accepted.
/// Lists carry the short form; one job carries everything, including the `actions` the signed-in person may take next.
class RefurbJob {
  const RefurbJob({
    required this.id,
    required this.status,
    required this.device,
    required this.viewerRole,
    this.offerAmount = 0,
    this.offerMessage,
    this.ownerName,
    this.refurbisherName,
    this.businessName,
    this.city,
    this.beforePhotos = const [],
    this.afterPhotos = const [],
    this.productId,
    this.handover,
    this.ownerConfirmed = false,
    this.refurbisherConfirmed = false,
    this.workLog = const [],
    this.history = const [],
    this.cancelReason,
    this.actions = const [],
    this.photoStages = const [],
    this.nextStatus,
    this.updatedAt,
  });

  final String id;
  final String status;
  final DonatedDevice device;

  /// `owner`, `refurbisher` or `admin`.
  final String viewerRole;
  final double offerAmount;
  final String? offerMessage;
  final String? ownerName;
  final String? refurbisherName;
  final String? businessName;
  final String? city;
  final List<ListingPhoto> beforePhotos;
  final List<ListingPhoto> afterPhotos;
  final String? productId;
  final DonationHandover? handover;
  final bool ownerConfirmed;
  final bool refurbisherConfirmed;
  final List<WorkNote> workLog;
  final List<JobStep> history;
  final String? cancelReason;
  final List<String> actions;

  /// `before` and/or `after`: which photo sets can be added at this step (refurbisher only).
  final List<String> photoStages;

  /// The step the refurbisher can move the job to, or null.
  final String? nextStatus;
  final DateTime? updatedAt;

  bool get isRefurbisherView => viewerRole == 'refurbisher';
  bool get isOwnerView => viewerRole == 'owner';
  bool get isFinished => status == 'cancelled' || status == 'listed';
  bool can(String action) => actions.contains(action);

  /// The business name when there is one, otherwise the person's name.
  String? get refurbisherLabel => (businessName ?? '').trim().isNotEmpty ? businessName!.trim() : refurbisherName;

  /// Whichever side the viewer is not.
  String? get otherSideName => isRefurbisherView ? ownerName : refurbisherLabel;

  factory RefurbJob.fromJson(Map<String, dynamic> json) {
    final offer = _map(json['offer']);
    final owner = _map(json['owner']);
    final refurbisher = _map(json['refurbisher']);
    final confirmations = _map(json['confirmations']);
    final history = json['history'];
    final workLog = json['workLog'];
    final pickup = json['pickup'];
    return RefurbJob(
      id: json['_id'] as String,
      status: (json['status'] as String?) ?? 'offered',
      device: DonatedDevice.fromJson(_map(json['listing'])),
      viewerRole: (json['viewerRole'] as String?) ?? 'owner',
      offerAmount: (offer['amount'] as num?)?.toDouble() ?? 0,
      offerMessage: offer['message'] as String?,
      ownerName: owner['name'] as String?,
      refurbisherName: refurbisher['name'] as String?,
      businessName: refurbisher['businessName'] as String?,
      city: refurbisher['city'] as String?,
      beforePhotos: _photos(json['beforePhotos']),
      afterPhotos: _photos(json['afterPhotos']),
      productId: json['product'] is String ? json['product'] as String : null,
      handover: pickup is Map ? DonationHandover.fromJson(pickup.cast<String, dynamic>()) : null,
      ownerConfirmed: confirmations['owner'] == true,
      refurbisherConfirmed: confirmations['refurbisher'] == true,
      workLog: workLog is List ? [for (final w in workLog) if (w is Map) WorkNote.fromJson(w.cast<String, dynamic>())] : const [],
      history: history is List ? [for (final h in history) if (h is Map) JobStep.fromJson(h.cast<String, dynamic>())] : const [],
      cancelReason: json['cancelReason'] as String?,
      actions: _strings(json['actions']),
      photoStages: _strings(json['photoStages']),
      nextStatus: json['nextStatus'] as String?,
      updatedAt: _date(json['updatedAt']),
    );
  }
}
