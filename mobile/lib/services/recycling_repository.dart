import 'dart:convert';
import 'package:dio/dio.dart';
import '../core/network/api_exception.dart';
import '../models/page_result.dart';
import '../models/recycling.dart';
import '../models/recycling_report.dart';
import 'api_client.dart';
import 'photo_picker.dart';

/// What to ask `GET /api/recycling-centers` for. Empty values are left out, because the server refuses parameters it does not know (422).
class CenterQuery {
  const CenterQuery({this.q = '', this.category = '', this.page = 1, this.limit = 12});

  final String q;

  /// A category slug, or empty for any.
  final String category;
  final int page;
  final int limit;

  int get activeFilters => category.isEmpty ? 0 : 1;

  CenterQuery copyWith({String? q, String? category, int? page}) => CenterQuery(q: q ?? this.q, category: category ?? this.category, page: page ?? this.page, limit: limit);

  Map<String, dynamic> toParams() => {
        'page': page,
        'limit': limit,
        if (q.trim().isNotEmpty) 'q': q.trim(),
        if (category.isNotEmpty) 'category': category,
      };
}

/// Recycling centres and the requests people send them.
class RecyclingRepository {
  RecyclingRepository(this._api);

  final ApiClient _api;
  Dio get _dio => _api.dio;

  RecyclingRequest _one(Response<dynamic> res) => RecyclingRequest.fromJson(((res.data as Map)['data'] as Map).cast<String, dynamic>());

  PageResult<T> _page<T>(Response<dynamic> res, T Function(Map<String, dynamic>) read, int page) {
    final body = (res.data as Map).cast<String, dynamic>();
    final items = [for (final raw in body['data'] as List) read((raw as Map).cast<String, dynamic>())];
    final meta = body['meta'] is Map ? (body['meta'] as Map).cast<String, dynamic>() : const <String, dynamic>{};
    return PageResult(
      items: items,
      page: (meta['page'] as num?)?.toInt() ?? page,
      pages: (meta['pages'] as num?)?.toInt() ?? 1,
      total: (meta['total'] as num?)?.toInt() ?? items.length,
    );
  }

  /* ---------- the directory ---------- */

  Future<PageResult<RecyclingCenter>> centers(CenterQuery query) => guard(() async {
        final res = await _dio.get<dynamic>('/recycling-centers', queryParameters: query.toParams());
        return _page(res, RecyclingCenter.fromJson, query.page);
      });

  Future<RecyclingCenter> center(String id) => guard(() async {
        final res = await _dio.get<dynamic>('/recycling-centers/$id');
        return RecyclingCenter.fromJson(((res.data as Map)['data'] as Map).cast<String, dynamic>());
      });

  /* ---------- requests ---------- */

  /// Sends devices to a centre. The categories must all be ones the centre accepts; [listingId] holds one of the person's own listings (BR-03).
  Future<RecyclingRequest> create({
    required String centerId,
    required List<String> categoryIds,
    required int deviceCount,
    required String area,
    required String address,
    DateTime? preferredDate,
    String? notes,
    String? listingId,
    List<PickedPhoto> photos = const [],
  }) =>
      guard(() async {
        final form = FormData();
        void field(String key, String? value) {
          if (value != null && value.trim().isNotEmpty) form.fields.add(MapEntry(key, value.trim()));
        }

        field('centerId', centerId);
        form.fields.add(MapEntry('categories', jsonEncode(categoryIds)));
        form.fields.add(MapEntry('deviceCount', '$deviceCount'));
        field('pickupAddressArea', area);
        field('pickupAddress', address);
        field('preferredDate', preferredDate?.toUtc().toIso8601String());
        field('notes', notes);
        field('listingId', listingId);
        for (final photo in photos) {
          form.files.add(MapEntry('photos', await MultipartFile.fromFile(photo.path, filename: photo.name, contentType: DioMediaType.parse(photo.mime))));
        }
        return _one(await _dio.post<dynamic>('/recycling-requests', data: form));
      });

  /// The person's own requests, or the requests a centre received. [as] is `requester` or `center`; leave it out for the role's usual list.
  Future<PageResult<RecyclingRequest>> list({String? as, String? status, int page = 1}) => guard(() async {
        final res = await _dio.get<dynamic>('/recycling-requests', queryParameters: {
          'page': page,
          'limit': 10,
          if (as != null) 'as': as,
          if (status != null && status.isNotEmpty) 'status': status,
        });
        return _page(res, RecyclingRequest.fromJson, page);
      });

  Future<RecyclingRequest> get(String id) => guard(() async => _one(await _dio.get<dynamic>('/recycling-requests/$id')));

  /* ---------- the centre's steps ---------- */

  /// The centre's activity report. [from] and [to] are calendar days; leave them out for all time.
  Future<RecyclingReport> report({DateTime? from, DateTime? to, String? category}) => guard(() async {
        String day(DateTime d) => '${d.year.toString().padLeft(4, '0')}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';
        final res = await _dio.get<dynamic>('/recycling-requests/report', queryParameters: {
          if (from != null) 'from': day(from),
          // The server reads "to" as the start of that day, so ask for the end of it.
          if (to != null) 'to': '${day(to)}T23:59:59.999Z',
          if (category != null && category.isNotEmpty) 'category': category,
        });
        return RecyclingReport.fromJson(((res.data as Map)['data'] as Map).cast<String, dynamic>());
      });

  Future<RecyclingRequest> _status(String id, String status, {String? reason}) => guard(() async {
        final text = reason?.trim() ?? '';
        return _one(await _dio.put<dynamic>('/recycling-requests/$id/status', data: {'status': status, if (text.isNotEmpty) 'reason': text}));
      });

  Future<RecyclingRequest> accept(String id) => _status(id, 'accepted');
  Future<RecyclingRequest> reject(String id, String reason) => _status(id, 'rejected', reason: reason);
  Future<RecyclingRequest> markReceived(String id) => _status(id, 'received_at_center');
  Future<RecyclingRequest> markProcessed(String id) => _status(id, 'processed');
  Future<RecyclingRequest> complete(String id) => _status(id, 'completed');

  Future<RecyclingRequest> schedulePickup(String id, {required DateTime date, String? timeSlot, String? notes}) => guard(() async {
        final slot = timeSlot?.trim() ?? '';
        final note = notes?.trim() ?? '';
        final res = await _dio.post<dynamic>('/recycling-requests/$id/pickup', data: {
          'date': date.toUtc().toIso8601String(),
          if (slot.isNotEmpty) 'timeSlot': slot,
          if (note.isNotEmpty) 'notes': note,
        });
        return _one(res);
      });

  /// Either side confirms the devices changed hands. The sender must have ticked the data-protection checklist (BR-12).
  Future<RecyclingRequest> confirmHandover(String id, {bool acknowledgeChecklist = false}) => guard(() async {
        final res = await _dio.post<dynamic>('/recycling-requests/$id/confirm-handover', data: {if (acknowledgeChecklist) 'acknowledgeChecklist': true});
        return _one(res);
      });

  /// Replaces the recovered materials. Each row has an actual and/or an estimated weight, kept apart (BR-06).
  Future<RecyclingRequest> saveMaterials(String id, List<RecoveredMaterial> materials, {String? reportNotes}) => guard(() async {
        final notes = reportNotes?.trim();
        final res = await _dio.put<dynamic>('/recycling-requests/$id/materials', data: {
          'materials': [for (final m in materials) m.toJson()],
          if (notes != null) 'reportNotes': notes,
        });
        return _one(res);
      });

  Future<RecyclingRequest> cancel(String id, {String? reason}) => guard(() async {
        final text = reason?.trim() ?? '';
        return _one(await _dio.post<dynamic>('/recycling-requests/$id/cancel', data: {if (text.isNotEmpty) 'reason': text}));
      });
}
