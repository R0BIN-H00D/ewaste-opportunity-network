import 'listing.dart' show ListingPhoto;

DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v) : null;
Map<String, dynamic> _map(Object? v) => v is Map ? v.cast<String, dynamic>() : const <String, dynamic>{};

/// The device inside a donation. Only the public area and city arrive, never the exact address (BR-08).
class DonatedDevice {
  const DonatedDevice({required this.title, required this.condition, this.brand, this.model, this.categoryName, this.addressArea, this.city, this.description, this.photos = const []});

  final String title;
  final String condition;
  final String? brand;
  final String? model;
  final String? categoryName;
  final String? addressArea;
  final String? city;
  final String? description;
  final List<ListingPhoto> photos;

  String get place => [addressArea, city].where((p) => p != null && p.trim().isNotEmpty).join(', ');

  /// "Category · Brand · Model", skipping what is missing.
  String get subtitle => [categoryName, brand, model].where((p) => p != null && p.trim().isNotEmpty).join(' · ');

  factory DonatedDevice.fromJson(Map<String, dynamic> json) {
    final device = _map(json['device']);
    final photos = device['photos'];
    return DonatedDevice(
      title: (json['title'] as String?) ?? 'Device',
      condition: (json['condition'] as String?) ?? '',
      brand: json['brand'] as String?,
      model: json['model'] as String?,
      categoryName: _map(json['category'])['name'] as String?,
      addressArea: json['addressArea'] as String?,
      city: json['city'] as String?,
      description: json['description'] as String?,
      photos: photos is List ? [for (final p in photos) if (p is Map) ListingPhoto.fromJson(p.cast<String, dynamic>())] : const [],
    );
  }
}

/// A recipient's request, as the person who made it sees it (`myRequest`).
class MyDonationRequest {
  const MyDonationRequest({required this.id, required this.status, this.justification, this.intendedUse});

  final String id;
  final String status;
  final String? justification;
  final String? intendedUse;

  factory MyDonationRequest.fromJson(Map<String, dynamic> json) =>
      MyDonationRequest(id: (json['_id'] as String?) ?? '', status: (json['status'] as String?) ?? 'pending', justification: json['justification'] as String?, intendedUse: json['intendedUse'] as String?);
}

/// One request in the donor's list: who asked, which organisation they are, and why.
class DonationRequestRow {
  const DonationRequestRow({required this.id, required this.status, required this.requesterName, this.orgName, this.orgType, this.justification, this.intendedUse, this.createdAt});

  final String id;
  final String status;
  final String requesterName;
  final String? orgName;
  final String? orgType;
  final String? justification;
  final String? intendedUse;
  final DateTime? createdAt;

  bool get isPending => status == 'pending';

  /// The organisation name when there is one, otherwise the person's name.
  String get title => (orgName ?? '').trim().isNotEmpty ? orgName!.trim() : requesterName;

  factory DonationRequestRow.fromJson(Map<String, dynamic> json) {
    final who = _map(json['requester']);
    return DonationRequestRow(
      id: (json['_id'] as String?) ?? '',
      status: (json['status'] as String?) ?? 'pending',
      requesterName: (who['name'] as String?) ?? 'Recipient',
      orgName: who['orgName'] as String?,
      orgType: who['orgType'] as String?,
      justification: json['justification'] as String?,
      intendedUse: json['intendedUse'] as String?,
      createdAt: _date(json['createdAt']),
    );
  }
}

class DonationStep {
  const DonationStep({required this.status, this.at, this.note});

  final String status;
  final DateTime? at;
  final String? note;

  factory DonationStep.fromJson(Map<String, dynamic> json) => DonationStep(status: (json['status'] as String?) ?? '', at: _date(json['at']), note: json['note'] as String?);
}

class DonationHandover {
  const DonationHandover({this.date, this.timeSlot, this.notes, this.status});

  final DateTime? date;
  final String? timeSlot;
  final String? notes;
  final String? status;

  factory DonationHandover.fromJson(Map<String, dynamic> json) =>
      DonationHandover(date: _date(json['date']), timeSlot: json['timeSlot'] as String?, notes: json['notes'] as String?, status: json['status'] as String?);
}

/// A device offered for free. Lists carry the short form; one donation carries everything, including the `actions`
/// the signed-in person may take next. No money changes hands (BR-10).
class Donation {
  const Donation({
    required this.id,
    required this.status,
    required this.device,
    required this.viewerRole,
    this.description,
    this.donorName,
    this.myRequest,
    this.pendingRequests = 0,
    this.recipientName,
    this.recipientOrg,
    this.handover,
    this.donorConfirmed = false,
    this.recipientConfirmed = false,
    this.cancelReason,
    this.refNo,
    this.issuedAt,
    this.history = const [],
    this.requests = const [],
    this.actions = const [],
    this.createdAt,
  });

  final String id;
  final String status;
  final DonatedDevice device;

  /// `visitor`, `requester`, `donor`, `recipient` or `admin`.
  final String viewerRole;
  final String? description;
  final String? donorName;
  final MyDonationRequest? myRequest;

  /// Only the donor is told how many requests wait.
  final int pendingRequests;
  final String? recipientName;
  final String? recipientOrg;
  final DonationHandover? handover;
  final bool donorConfirmed;
  final bool recipientConfirmed;
  final String? cancelReason;
  final String? refNo;
  final DateTime? issuedAt;
  final List<DonationStep> history;
  final List<DonationRequestRow> requests;
  final List<String> actions;
  final DateTime? createdAt;

  bool get isDonorView => viewerRole == 'donor';
  bool get isRecipientView => viewerRole == 'recipient';
  bool get isFinished => status == 'completed' || status == 'cancelled';
  bool can(String action) => actions.contains(action);

  /// Whichever side the viewer is not.
  String? get otherSideName => isDonorView ? (recipientOrg ?? recipientName) : donorName;

  factory Donation.fromJson(Map<String, dynamic> json) {
    final donor = _map(json['donor']);
    final recipient = _map(json['recipient']);
    final pickup = json['pickup'];
    final confirmations = _map(json['confirmations']);
    final confirmation = _map(json['confirmation']);
    final history = json['history'];
    final requests = json['requests'];
    final actions = json['actions'];
    final org = recipient['orgName'];
    return Donation(
      id: json['_id'] as String,
      status: (json['status'] as String?) ?? 'open',
      device: DonatedDevice.fromJson(_map(json['listing'])),
      viewerRole: (json['viewerRole'] as String?) ?? 'visitor',
      description: json['description'] as String?,
      donorName: donor['name'] as String?,
      myRequest: json['myRequest'] is Map ? MyDonationRequest.fromJson(_map(json['myRequest'])) : null,
      pendingRequests: (json['pendingRequests'] as num?)?.toInt() ?? 0,
      recipientName: recipient['name'] as String?,
      recipientOrg: org is String && org.trim().isNotEmpty ? org : null,
      handover: pickup is Map ? DonationHandover.fromJson(pickup.cast<String, dynamic>()) : null,
      donorConfirmed: confirmations['donor'] == true,
      recipientConfirmed: confirmations['recipient'] == true,
      cancelReason: json['cancelReason'] as String?,
      refNo: confirmation['refNo'] as String?,
      issuedAt: _date(confirmation['issuedAt']),
      history: history is List ? [for (final h in history) if (h is Map) DonationStep.fromJson(h.cast<String, dynamic>())] : const [],
      requests: requests is List ? [for (final r in requests) if (r is Map) DonationRequestRow.fromJson(r.cast<String, dynamic>())] : const [],
      actions: actions is List ? [for (final a in actions) if (a is String) a] : const [],
      createdAt: _date(json['createdAt']),
    );
  }
}

/// The record of a completed donation (`GET /donations/:id/confirmation`). It states that no payment was made.
class DonationConfirmation {
  const DonationConfirmation({required this.refNo, required this.deviceTitle, required this.donorName, required this.recipientName, this.issuedAt, this.handoverDate, this.recipientOrg, this.statement});

  final String refNo;
  final String deviceTitle;
  final String donorName;
  final String recipientName;
  final String? recipientOrg;
  final DateTime? issuedAt;
  final DateTime? handoverDate;
  final String? statement;

  factory DonationConfirmation.fromJson(Map<String, dynamic> json) {
    final device = _map(json['device']);
    final recipient = _map(json['recipient']);
    final org = recipient['orgName'];
    return DonationConfirmation(
      refNo: (json['refNo'] as String?) ?? '',
      deviceTitle: (device['title'] as String?) ?? 'Device',
      donorName: (_map(json['donor'])['name'] as String?) ?? 'Donor',
      recipientName: (recipient['name'] as String?) ?? 'Recipient',
      recipientOrg: org is String && org.trim().isNotEmpty ? org : null,
      issuedAt: _date(json['issuedAt']),
      handoverDate: _date(json['handoverDate']),
      statement: json['statement'] as String?,
    );
  }
}

/// Where a person's application to receive donations as an organisation stands.
class RecipientStatus {
  const RecipientStatus({this.isOrg = false, this.orgType, this.orgName, this.registrationNo, this.status = 'not_submitted', this.reason});

  final bool isOrg;
  final String? orgType;
  final String? orgName;
  final String? registrationNo;

  /// `not_submitted`, `pending`, `approved`, `rejected` or `resubmission_required`.
  final String status;
  final String? reason;

  bool get isApproved => status == 'approved';
  bool get isPending => status == 'pending';

  factory RecipientStatus.fromJson(Map<String, dynamic> json) => RecipientStatus(
        isOrg: json['isOrg'] == true,
        orgType: json['orgType'] as String?,
        orgName: json['orgName'] as String?,
        registrationNo: json['registrationNo'] as String?,
        status: (json['status'] as String?) ?? 'not_submitted',
        reason: json['reason'] as String?,
      );
}
