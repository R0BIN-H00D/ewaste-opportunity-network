import 'package:dio/dio.dart';
import '../core/network/api_exception.dart';
import '../models/page_result.dart';
import '../models/service_request.dart';
import 'api_client.dart';
import 'photo_picker.dart';

/// Repair requests as the device owner sees them. Every action answers with the updated request.
class RequestRepository {
  RequestRepository(this._api);

  final ApiClient _api;
  Dio get _dio => _api.dio;

  ServiceRequest _one(Response<dynamic> res) => ServiceRequest.fromJson(((res.data as Map)['data'] as Map).cast<String, dynamic>());

  /// Sends a request for one of the person's own listings. Leave [technicianId] out to post an open request.
  Future<ServiceRequest> create({required String listingId, required String issue, String? technicianId, bool onSite = false}) => guard(() async {
        final res = await _dio.post<dynamic>('/service-requests', data: {
          'listingId': listingId,
          'issueDescription': issue.trim(),
          if (technicianId != null) 'technicianId': technicianId,
          if (onSite) 'onSite': true,
        });
        return _one(res);
      });

  /// [as] picks whose list it is: `customer` (the person's own requests), `technician` (jobs they took) or `board`
  /// (new requests a technician can take).
  Future<PageResult<ServiceRequest>> list({bool activeOnly = false, int page = 1, int limit = 10, String as = 'customer'}) => guard(() async {
        final res = await _dio.get<dynamic>('/service-requests', queryParameters: {
          'page': page,
          'limit': limit,
          'as': as,
          if (activeOnly) 'active': 'true',
        });
        final body = (res.data as Map).cast<String, dynamic>();
        final items = [for (final raw in body['data'] as List) ServiceRequest.fromJson((raw as Map).cast<String, dynamic>())];
        final meta = body['meta'] is Map ? (body['meta'] as Map).cast<String, dynamic>() : const <String, dynamic>{};
        return PageResult(
          items: items,
          page: (meta['page'] as num?)?.toInt() ?? page,
          pages: (meta['pages'] as num?)?.toInt() ?? 1,
          total: (meta['total'] as num?)?.toInt() ?? items.length,
        );
      });

  Future<ServiceRequest> get(String id) => guard(() async => _one(await _dio.get<dynamic>('/service-requests/$id')));

  /// Approve the quote (the repair starts) or decline it. Declining needs a short reason; [cancel] ends the request instead of asking for a new quote.
  Future<ServiceRequest> decideQuotation(String id, String quotationId, {required bool accept, String? reason, bool cancel = false}) => guard(() async {
        final res = await _dio.put<dynamic>('/service-requests/$id/quotation/$quotationId/decision', data: {
          'decision': accept ? 'accept' : 'reject',
          if (!accept && reason != null) 'reason': reason.trim(),
          if (!accept && cancel) 'cancel': true,
        });
        return _one(res);
      });

  Future<ServiceRequest> cancel(String id, {String? reason}) => guard(() async {
        final text = reason?.trim() ?? '';
        final res = await _dio.post<dynamic>('/service-requests/$id/cancel', data: {if (text.isNotEmpty) 'reason': text});
        return _one(res);
      });

  Future<ServiceRequest> schedulePickup(String id, {required DateTime date, String? timeSlot, String? notes}) => guard(() async {
        final slot = timeSlot?.trim() ?? '';
        final note = notes?.trim() ?? '';
        final res = await _dio.post<dynamic>('/service-requests/$id/pickup', data: {
          'date': date.toUtc().toIso8601String(),
          if (slot.isNotEmpty) 'timeSlot': slot,
          if (note.isNotEmpty) 'notes': note,
        });
        return _one(res);
      });

  /// Confirms the handover from the owner's side. Handing the device over needs the data-protection checklist ticked (BR-12).
  Future<ServiceRequest> confirmHandover(String id, {bool acknowledgeChecklist = false}) => guard(() async {
        final res = await _dio.post<dynamic>('/service-requests/$id/handover', data: {if (acknowledgeChecklist) 'acknowledgeChecklist': true});
        return _one(res);
      });

  Future<ServiceRequest> confirmCompletion(String id) => guard(() async => _one(await _dio.post<dynamic>('/service-requests/$id/confirm-completion')));

  /* ---------- the technician's side ---------- */

  Future<ServiceRequest> _status(String id, String status, {Map<String, Object?> fields = const {}, List<PickedPhoto> photos = const []}) => guard(() async {
        final Object body;
        if (photos.isEmpty) {
          body = {'status': status, for (final e in fields.entries) if (e.value != null) e.key: e.value};
        } else {
          final form = FormData()..fields.add(MapEntry('status', status));
          for (final e in fields.entries) {
            if (e.value != null) form.fields.add(MapEntry(e.key, '${e.value}'));
          }
          await _attach(form, photos);
          body = form;
        }
        return _one(await _dio.put<dynamic>('/service-requests/$id/status', data: body));
      });

  Future<void> _attach(FormData form, List<PickedPhoto> photos) async {
    for (final photo in photos) {
      form.files.add(MapEntry('photos', await MultipartFile.fromFile(photo.path, filename: photo.name, contentType: DioMediaType.parse(photo.mime))));
    }
  }

  /// Takes a request (the exact address is shared once accepted, BR-08).
  Future<ServiceRequest> accept(String id) => _status(id, 'technician_assigned');

  /// Declines a request that was sent to this technician. A reason is required; the owner sees it.
  Future<ServiceRequest> decline(String id, String reason) => _status(id, 'rejected', fields: {'note': reason.trim()});

  Future<ServiceRequest> startDiagnosis(String id) => _status(id, 'diagnosis_in_progress');

  /// Sends (or revises) the quote. Nothing starts until the owner approves it (BR-02).
  Future<ServiceRequest> submitQuotation(String id, QuotationInput input) =>
      guard(() async => _one(await _dio.post<dynamic>('/service-requests/$id/quotation', data: input.toJson())));

  /// A note and/or photos for the owner while checking or repairing.
  Future<ServiceRequest> addProgress(String id, {String? note, List<PickedPhoto> photos = const []}) => guard(() async {
        final text = note?.trim() ?? '';
        final form = FormData();
        if (text.isNotEmpty) form.fields.add(MapEntry('note', text));
        await _attach(form, photos);
        return _one(await _dio.post<dynamic>('/service-requests/$id/progress', data: form));
      });

  /// Marks the repair done. The server needs at least one photo of the repaired device.
  Future<ServiceRequest> completeRepair(String id, {String? note, required List<PickedPhoto> photos}) =>
      _status(id, 'repair_completed', fields: {'note': (note?.trim().isEmpty ?? true) ? null : note!.trim()}, photos: photos);

  /// Starts bringing the device back. [returnDate] and [returnSlot] tell the owner when to expect it.
  Future<ServiceRequest> startDelivery(String id, {DateTime? returnDate, String? returnSlot}) => _status(id, 'device_delivery_pending', fields: {
        'returnDate': returnDate?.toUtc().toIso8601String(),
        'returnSlot': (returnSlot?.trim().isEmpty ?? true) ? null : returnSlot!.trim(),
      });

  /// Reviews the technician once the service is completed (one review per request, BR-04), then answers with the
  /// request again so `reviewed` is up to date.
  Future<ServiceRequest> review(String id, ReviewInput input) => guard(() async {
        await _dio.post<dynamic>('/reviews', data: {'contextType': 'service', 'contextId': id, ...input.toJson()});
        return _one(await _dio.get<dynamic>('/service-requests/$id'));
      });
}

/// A technician's quote. The total must equal the lines when there are lines; it is valid for [validDays] days.
class QuotationInput {
  const QuotationInput({required this.amount, this.lines = const [], this.etaDays, this.validDays = 7, this.notes});

  final double amount;
  final List<({String label, double amount})> lines;
  final int? etaDays;
  final int validDays;
  final String? notes;

  Map<String, dynamic> toJson() {
    final text = notes?.trim() ?? '';
    return {
      'amount': amount,
      if (lines.isNotEmpty) 'breakdown': [for (final l in lines) {'label': l.label.trim(), 'amount': l.amount}],
      if (etaDays != null) 'etaDays': etaDays,
      'validUntil': DateTime.now().toUtc().add(Duration(days: validDays)).toIso8601String(),
      if (text.isNotEmpty) 'notes': text,
    };
  }
}

/// What the person rated: the overall stars are required, the three aspects and the comment are optional.
class ReviewInput {
  const ReviewInput({required this.rating, this.quality, this.communication, this.timeliness, this.comment});

  final int rating;
  final int? quality;
  final int? communication;
  final int? timeliness;
  final String? comment;

  Map<String, dynamic> toJson() {
    final text = comment?.trim() ?? '';
    return {
      'rating': rating,
      if (quality != null) 'quality': quality,
      if (communication != null) 'communication': communication,
      if (timeliness != null) 'timeliness': timeliness,
      if (text.isNotEmpty) 'comment': text,
    };
  }
}
