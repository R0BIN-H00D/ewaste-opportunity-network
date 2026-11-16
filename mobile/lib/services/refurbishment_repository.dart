import 'package:dio/dio.dart';
import '../core/network/api_exception.dart';
import '../models/page_result.dart';
import '../models/refurbishment.dart';
import 'api_client.dart';
import 'photo_picker.dart';

/// What to ask `GET /api/refurbishment/opportunities` for. Empty values are left out, because the server refuses parameters it does not know (422).
class RefurbOpportunityQuery {
  const RefurbOpportunityQuery({this.q = '', this.category = '', this.condition = '', this.page = 1, this.limit = 12});

  final String q;

  /// A category slug, or empty for any.
  final String category;
  final String condition;
  final int page;
  final int limit;

  int get activeFilters => [category, condition].where((v) => v.isNotEmpty).length;

  RefurbOpportunityQuery copyWith({String? q, String? category, String? condition, int? page}) =>
      RefurbOpportunityQuery(q: q ?? this.q, category: category ?? this.category, condition: condition ?? this.condition, page: page ?? this.page, limit: limit);

  Map<String, dynamic> toParams() => {
        'page': page,
        'limit': limit,
        if (q.trim().isNotEmpty) 'q': q.trim(),
        if (category.isNotEmpty) 'category': category,
        if (condition.isNotEmpty) 'condition': condition,
      };
}

/// Refurbishment: the feed of devices owners want refurbished, offers on them, and the jobs that follow.
class RefurbishmentRepository {
  RefurbishmentRepository(this._api);

  final ApiClient _api;
  Dio get _dio => _api.dio;

  RefurbJob _job(Response<dynamic> res) => RefurbJob.fromJson(((res.data as Map)['data'] as Map).cast<String, dynamic>());

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

  Future<PageResult<RefurbOpportunity>> opportunities(RefurbOpportunityQuery query) => guard(() async {
        final res = await _dio.get<dynamic>('/refurbishment/opportunities', queryParameters: query.toParams());
        return _page(res, RefurbOpportunity.fromJson, query.page);
      });

  /// Offers to refurbish an owner's device. [amount] is what the refurbisher pays; empty or 0 means free collection.
  Future<RefurbJob> makeOffer({required String listingId, double? amount, String? message}) => guard(() async {
        final text = message?.trim() ?? '';
        return _job(await _dio.post<dynamic>('/refurbishment/offers', data: {
          'listingId': listingId,
          if (amount != null) 'amount': amount,
          if (text.isNotEmpty) 'message': text,
        }));
      });

  /// [as] is `owner` or `refurbisher`; leave it out for the role's usual list.
  Future<PageResult<RefurbJob>> jobs({String? as, String? status, int page = 1}) => guard(() async {
        final res = await _dio.get<dynamic>('/refurbishment/jobs', queryParameters: {
          'page': page,
          'limit': 10,
          if (as != null && as.isNotEmpty) 'as': as,
          if (status != null && status.isNotEmpty) 'status': status,
        });
        return _page(res, RefurbJob.fromJson, page);
      });

  Future<RefurbJob> job(String id) => guard(() async => _job(await _dio.get<dynamic>('/refurbishment/jobs/$id')));

  /// The owner accepts or declines the offer.
  Future<RefurbJob> decide(String id, {required bool accept}) =>
      guard(() async => _job(await _dio.put<dynamic>('/refurbishment/jobs/$id/offer-decision', data: {'decision': accept ? 'accept' : 'reject'})));

  Future<RefurbJob> withdraw(String id) => guard(() async => _job(await _dio.delete<dynamic>('/refurbishment/jobs/$id/offer')));

  Future<RefurbJob> scheduleHandover(String id, {required DateTime date, String? timeSlot, String? notes}) => guard(() async {
        final slot = timeSlot?.trim() ?? '';
        final note = notes?.trim() ?? '';
        return _job(await _dio.post<dynamic>('/refurbishment/jobs/$id/handover', data: {
          'date': date.toUtc().toIso8601String(),
          if (slot.isNotEmpty) 'timeSlot': slot,
          if (note.isNotEmpty) 'notes': note,
        }));
      });

  /// Either side confirms the device changed hands. The owner must have ticked the data-protection checklist (BR-12).
  Future<RefurbJob> confirmHandover(String id, {bool acknowledgeChecklist = false}) =>
      guard(() async => _job(await _dio.post<dynamic>('/refurbishment/jobs/$id/confirm-handover', data: {if (acknowledgeChecklist) 'acknowledgeChecklist': true})));

  /// The refurbisher moves the job to its next step, with an optional note for the work log.
  Future<RefurbJob> advance(String id, {required String status, String? note}) => guard(() async {
        final text = note?.trim() ?? '';
        return _job(await _dio.put<dynamic>('/refurbishment/jobs/$id/status', data: {'status': status, if (text.isNotEmpty) 'note': text}));
      });

  /// Adds "before" or "after" photos to the job.
  Future<RefurbJob> addPhotos(String id, {required String stage, required List<PickedPhoto> photos, String? note}) => guard(() async {
        final form = FormData();
        form.fields.add(MapEntry('stage', stage));
        final text = note?.trim() ?? '';
        if (text.isNotEmpty) form.fields.add(MapEntry('note', text));
        for (final photo in photos) {
          form.files.add(MapEntry('photos', await MultipartFile.fromFile(photo.path, filename: photo.name, contentType: DioMediaType.parse(photo.mime))));
        }
        return _job(await _dio.post<dynamic>('/refurbishment/jobs/$id/photos', data: form));
      });

  Future<RefurbJob> cancel(String id, {String? reason}) => guard(() async {
        final text = reason?.trim() ?? '';
        return _job(await _dio.post<dynamic>('/refurbishment/jobs/$id/cancel', data: {if (text.isNotEmpty) 'reason': text}));
      });
}
