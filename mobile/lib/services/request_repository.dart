import 'package:dio/dio.dart';
import '../core/network/api_exception.dart';
import '../models/page_result.dart';
import '../models/service_request.dart';
import 'api_client.dart';

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

  Future<PageResult<ServiceRequest>> list({bool activeOnly = false, int page = 1, int limit = 10}) => guard(() async {
        final res = await _dio.get<dynamic>('/service-requests', queryParameters: {
          'page': page,
          'limit': limit,
          'as': 'customer',
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
}
