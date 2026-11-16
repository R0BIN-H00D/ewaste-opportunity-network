import 'package:dio/dio.dart';
import '../core/network/api_exception.dart';
import '../models/donation.dart';
import '../models/page_result.dart';
import 'api_client.dart';

/// What to ask `GET /api/donations` for. Empty values are left out, because the server refuses parameters it does not know (422).
class DonationQuery {
  const DonationQuery({this.q = '', this.category = '', this.condition = '', this.scope = '', this.page = 1, this.limit = 12});

  final String q;

  /// A category slug, or empty for any.
  final String category;
  final String condition;

  /// Empty for the open marketplace, `donor` for the person's own offers, `recipient` for what they asked for.
  final String scope;
  final int page;
  final int limit;

  int get activeFilters => [category, condition].where((v) => v.isNotEmpty).length;

  DonationQuery copyWith({String? q, String? category, String? condition, String? scope, int? page}) =>
      DonationQuery(q: q ?? this.q, category: category ?? this.category, condition: condition ?? this.condition, scope: scope ?? this.scope, page: page ?? this.page, limit: limit);

  Map<String, dynamic> toParams() => {
        'page': page,
        'limit': limit,
        if (q.trim().isNotEmpty) 'q': q.trim(),
        if (category.isNotEmpty) 'category': category,
        if (condition.isNotEmpty) 'condition': condition,
        if (scope.isNotEmpty) 'as': scope,
      };
}

/// Free devices: the marketplace, offering one, asking for one, and the handover between the two.
class DonationRepository {
  DonationRepository(this._api);

  final ApiClient _api;
  Dio get _dio => _api.dio;

  Donation _one(Response<dynamic> res) => Donation.fromJson(((res.data as Map)['data'] as Map).cast<String, dynamic>());

  Future<PageResult<Donation>> donations(DonationQuery query) => guard(() async {
        final res = await _dio.get<dynamic>('/donations', queryParameters: query.toParams());
        final body = (res.data as Map).cast<String, dynamic>();
        final items = [for (final raw in body['data'] as List) Donation.fromJson((raw as Map).cast<String, dynamic>())];
        final meta = body['meta'] is Map ? (body['meta'] as Map).cast<String, dynamic>() : const <String, dynamic>{};
        return PageResult(
          items: items,
          page: (meta['page'] as num?)?.toInt() ?? query.page,
          pages: (meta['pages'] as num?)?.toInt() ?? 1,
          total: (meta['total'] as num?)?.toInt() ?? items.length,
        );
      });

  Future<Donation> donation(String id) => guard(() async => _one(await _dio.get<dynamic>('/donations/$id')));

  /// Offers one of the person's own listings as a donation. The listing must be set to "Donation" and be working or repairable.
  Future<Donation> offer({required String listingId, String? description}) => guard(() async {
        final text = description?.trim() ?? '';
        return _one(await _dio.post<dynamic>('/donations', data: {'listingId': listingId, if (text.isNotEmpty) 'description': text}));
      });

  /// A verified recipient organisation asks for the device and says why.
  Future<Donation> request(String id, {required String justification, String? intendedUse}) => guard(() async {
        final use = intendedUse?.trim() ?? '';
        return _one(await _dio.post<dynamic>('/donations/$id/request', data: {'justification': justification.trim(), if (use.isNotEmpty) 'intendedUse': use}));
      });

  Future<Donation> withdraw(String id) => guard(() async => _one(await _dio.delete<dynamic>('/donations/$id/request')));

  /// The donor chooses one request (the rest are declined at once) or declines one.
  Future<Donation> decide(String id, String requestId, {required bool accept}) =>
      guard(() async => _one(await _dio.put<dynamic>('/donations/$id/requests/$requestId/decision', data: {'decision': accept ? 'accept' : 'reject'})));

  Future<Donation> scheduleHandover(String id, {required DateTime date, String? timeSlot, String? notes}) => guard(() async {
        final slot = timeSlot?.trim() ?? '';
        final note = notes?.trim() ?? '';
        return _one(await _dio.post<dynamic>('/donations/$id/handover', data: {
          'date': date.toUtc().toIso8601String(),
          if (slot.isNotEmpty) 'timeSlot': slot,
          if (note.isNotEmpty) 'notes': note,
        }));
      });

  /// Either side confirms the device changed hands. The donor must have ticked the data-protection checklist (BR-12).
  Future<Donation> confirmHandover(String id, {bool acknowledgeChecklist = false}) =>
      guard(() async => _one(await _dio.post<dynamic>('/donations/$id/confirm-handover', data: {if (acknowledgeChecklist) 'acknowledgeChecklist': true})));

  Future<Donation> cancel(String id, {String? reason}) => guard(() async {
        final text = reason?.trim() ?? '';
        return _one(await _dio.post<dynamic>('/donations/$id/cancel', data: {if (text.isNotEmpty) 'reason': text}));
      });

  Future<DonationConfirmation> confirmation(String id) =>
      guard(() async => DonationConfirmation.fromJson((((await _dio.get<dynamic>('/donations/$id/confirmation')).data as Map)['data'] as Map).cast<String, dynamic>()));

  Future<RecipientStatus> recipientStatus() =>
      guard(() async => RecipientStatus.fromJson((((await _dio.get<dynamic>('/donations/recipient')).data as Map)['data'] as Map).cast<String, dynamic>()));

  /// An organisation asks to be allowed to request donations. An administrator approves it.
  Future<RecipientStatus> applyAsRecipient({required String orgType, required String orgName, required String registrationNo}) => guard(() async {
        final res = await _dio.put<dynamic>('/donations/recipient', data: {'orgType': orgType, 'orgName': orgName.trim(), 'registrationNo': registrationNo.trim()});
        return RecipientStatus.fromJson(((res.data as Map)['data'] as Map).cast<String, dynamic>());
      });
}
