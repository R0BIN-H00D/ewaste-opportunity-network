import 'listing.dart';

Map<String, dynamic> _map(Object? value) => value is Map ? value.cast<String, dynamic>() : const <String, dynamic>{};
DateTime? _date(Object? value) => value is String ? DateTime.tryParse(value) : null;

/// The technician's price for a repair. Nothing starts until the owner approves it (BR-02). Money is paid offline (BR-10).
class Quotation {
  const Quotation({
    required this.id,
    required this.amount,
    required this.status,
    this.version = 1,
    this.breakdown = const [],
    this.parts = const [],
    this.etaDays,
    this.validUntil,
    this.notes,
  });

  final String id;
  final double amount;
  final String status;
  final int version;
  final List<({String label, double amount})> breakdown;
  final List<String> parts;
  final int? etaDays;
  final DateTime? validUntil;
  final String? notes;

  bool get isOpen => status == 'submitted';

  factory Quotation.fromJson(Map<String, dynamic> json) {
    final lines = json['breakdown'];
    final parts = json['parts'];
    return Quotation(
      id: json['_id'] as String,
      amount: (json['amount'] as num?)?.toDouble() ?? 0,
      status: (json['status'] as String?) ?? 'submitted',
      version: (json['version'] as num?)?.toInt() ?? 1,
      breakdown: lines is List
          ? [for (final l in lines) if (l is Map) (label: (l['label'] as String?) ?? '', amount: (l['amount'] as num?)?.toDouble() ?? 0)]
          : const [],
      parts: parts is List ? [for (final p in parts) if (p is String) p] : const [],
      etaDays: (json['etaDays'] as num?)?.toInt(),
      validUntil: _date(json['validUntil']),
      notes: json['notes'] as String?,
    );
  }
}

/// One step in the request's history, with any photos taken at that step (such as the repaired device).
class RequestStep {
  const RequestStep({required this.status, this.at, this.note, this.photos = const []});

  final String status;
  final DateTime? at;
  final String? note;
  final List<ListingPhoto> photos;

  factory RequestStep.fromJson(Map<String, dynamic> json) {
    final photos = json['photos'];
    return RequestStep(
      status: (json['status'] as String?) ?? '',
      at: _date(json['at']),
      note: json['note'] as String?,
      photos: photos is List ? [for (final p in photos) if (p is Map) ListingPhoto.fromJson(p.cast<String, dynamic>())] : const [],
    );
  }
}

/// Who has confirmed a handover. The owner must tick the data-protection checklist before the first one (BR-12).
class Handover {
  const Handover({this.collectOwner = false, this.collectProvider = false, this.checklistDone = false, this.deliveryOwner = false, this.deliveryProvider = false});

  final bool collectOwner;
  final bool collectProvider;
  final bool checklistDone;
  final bool deliveryOwner;
  final bool deliveryProvider;

  factory Handover.fromJson(Map<String, dynamic> json) {
    final collect = _map(json['collect']);
    final delivery = _map(json['delivery']);
    return Handover(
      collectOwner: collect['owner'] == true,
      collectProvider: collect['provider'] == true,
      checklistDone: collect['checklistAcknowledged'] == true,
      deliveryOwner: delivery['owner'] == true,
      deliveryProvider: delivery['provider'] == true,
    );
  }
}

class PickupInfo {
  const PickupInfo({this.date, this.timeSlot, this.status});

  final DateTime? date;
  final String? timeSlot;
  final String? status;
}

/// A repair request: one device, one technician (or an open request), moving through the workflow.
/// `actions` says which buttons to show, so the rules stay on the server.
class ServiceRequest {
  const ServiceRequest({
    required this.id,
    required this.status,
    required this.issueDescription,
    this.mode = 'open',
    this.onSite = false,
    this.listingId,
    this.deviceTitle = '',
    this.deviceSubtitle = '',
    this.devicePhoto,
    this.deviceArea = '',
    this.technicianId,
    this.technicianName,
    this.customerName,
    this.viewerRole = 'customer',
    this.quotation,
    this.history = const [],
    this.repairNotes = const [],
    this.progressPhotos = const [],
    this.progressUpdates = const [],
    this.handover = const Handover(),
    this.pickup,
    this.returnSchedule,
    this.actions = const [],
    this.reviewed = false,
    this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String status;
  final String issueDescription;
  final String mode;
  final bool onSite;
  final String? listingId;
  final String deviceTitle;
  final String deviceSubtitle;
  final ListingPhoto? devicePhoto;
  final String deviceArea;
  final String? technicianId;
  final String? technicianName;

  /// Who asked for the repair. Shown to the technician.
  final String? customerName;

  /// `customer`, `technician` or `admin`: whose view of the request this is. The same screen serves both people.
  final String viewerRole;
  final Quotation? quotation;

  bool get isTechnicianView => viewerRole == 'technician';
  final List<RequestStep> history;

  /// Updates the technician posts while checking or repairing, each with its own photos. Requests from before the
  /// server grouped them only have the flat [repairNotes] and [progressPhotos], which are shown side by side instead.
  final List<({String text, List<ListingPhoto> photos, DateTime? at})> progressUpdates;
  final List<({String text, DateTime? at})> repairNotes;
  final List<ListingPhoto> progressPhotos;
  final Handover handover;
  final PickupInfo? pickup;

  /// When the technician expects to bring the device back, if they said so when starting delivery.
  final PickupInfo? returnSchedule;
  final List<String> actions;
  final bool reviewed;
  final DateTime? createdAt;
  final DateTime? updatedAt;

  bool can(String action) => actions.contains(action);

  bool get isFinished => status == 'service_completed' || status == 'rejected' || status == 'cancelled';

  /// The technician holds the device: both sides confirmed the pickup and the return has not been confirmed by both.
  bool get technicianHasDevice =>
      !onSite && handover.collectOwner && handover.collectProvider && !(handover.deliveryOwner && handover.deliveryProvider);

  factory ServiceRequest.fromJson(Map<String, dynamic> json) {
    final listing = _map(json['listing']);
    final category = _map(listing['category']);
    final device = _map(listing['device']);
    final photos = device['photos'];
    final technician = _map(json['technician']);
    final customer = _map(json['customer']);
    final quotation = json['activeQuotation'];
    final pickup = json['pickup'];
    final back = json['returnSchedule'];
    final history = json['statusHistory'];
    final notes = json['repairNotes'];
    final progress = json['progressPhotos'];
    final updates = json['progressUpdates'];
    List<ListingPhoto> photosOf(Object? list) => list is List ? [for (final p in list) if (p is Map) ListingPhoto.fromJson(p.cast<String, dynamic>())] : const [];
    final actions = json['actions'];
    final subtitle = [category['name'], listing['brand'], listing['model']].whereType<String>().where((s) => s.trim().isNotEmpty).join(' · ');
    final area = [listing['addressArea'], listing['city']].whereType<String>().where((s) => s.trim().isNotEmpty).join(', ');
    return ServiceRequest(
      id: json['_id'] as String,
      status: (json['status'] as String?) ?? 'request_submitted',
      issueDescription: (json['issueDescription'] as String?) ?? '',
      mode: (json['mode'] as String?) ?? 'open',
      onSite: json['onSite'] == true,
      listingId: listing['_id'] as String?,
      deviceTitle: (listing['title'] as String?) ?? 'Device',
      deviceSubtitle: subtitle,
      devicePhoto: photos is List && photos.isNotEmpty && photos.first is Map ? ListingPhoto.fromJson((photos.first as Map).cast<String, dynamic>()) : null,
      deviceArea: area,
      technicianId: technician['_id'] as String?,
      technicianName: technician['name'] as String?,
      customerName: customer['name'] as String?,
      viewerRole: (json['viewerRole'] as String?) ?? 'customer',
      quotation: quotation is Map ? Quotation.fromJson(quotation.cast<String, dynamic>()) : null,
      history: history is List ? [for (final h in history) if (h is Map) RequestStep.fromJson(h.cast<String, dynamic>())] : const [],
      repairNotes: notes is List
          ? [for (final n in notes) if (n is Map && n['text'] is String && (n['text'] as String).trim().isNotEmpty) (text: (n['text'] as String).trim(), at: _date(n['at']))]
          : const [],
      progressPhotos: photosOf(progress),
      progressUpdates: updates is List
          ? [
              for (final u in updates)
                if (u is Map && ((u['text'] is String && (u['text'] as String).trim().isNotEmpty) || photosOf(u['photos']).isNotEmpty))
                  (text: ((u['text'] as String?) ?? '').trim(), photos: photosOf(u['photos']), at: _date(u['at'])),
            ]
          : const [],
      handover: Handover.fromJson(_map(json['handover'])),
      pickup: pickup is Map ? PickupInfo(date: _date(pickup['date']), timeSlot: pickup['timeSlot'] as String?, status: pickup['status'] as String?) : null,
      returnSchedule: back is Map && _date(back['date']) != null ? PickupInfo(date: _date(back['date']), timeSlot: back['timeSlot'] as String?) : null,
      actions: actions is List ? [for (final a in actions) if (a is String) a] : const [],
      reviewed: json['reviewed'] == true,
      createdAt: _date(json['createdAt']),
      updatedAt: _date(json['updatedAt']),
    );
  }
}
