import 'package:dio/dio.dart';
import '../core/network/api_exception.dart';
import '../models/page_result.dart';
import '../models/pickup.dart';
import 'api_client.dart';

/// The person's pickups and the collection windows they can choose from.
class PickupRepository {
  PickupRepository(this._api);

  final ApiClient _api;
  Dio get _dio => _api.dio;

  Future<SlotCatalogue> slots() => guard(() async {
        final res = await _dio.get<dynamic>('/pickups/slots');
        return SlotCatalogue.fromJson(
            ((res.data as Map)['data'] as Map).cast<String, dynamic>());
      });

  /// Accepts a time the other side set or changed. Only the person who did not propose it can; the server says why if not.
  Future<void> confirm(String id) => guard(() async {
        await _dio.post<dynamic>('/pickups/$id/confirm');
      });

  /// [upcoming] false lists finished, cancelled and past ones.
  Future<PageResult<PickupItem>> list({bool upcoming = true, int page = 1}) =>
      guard(() async {
        final res = await _dio.get<dynamic>('/pickups', queryParameters: {
          'when': upcoming ? 'upcoming' : 'past',
          'page': page,
          'limit': 20
        });
        final body = res.data as Map;
        final data = body['data'];
        final items = [
          for (final j in (data is List ? data : const []))
            if (j is Map) PickupItem.fromJson(j.cast<String, dynamic>())
        ];
        final meta = body['meta'];
        final m = meta is Map
            ? meta.cast<String, dynamic>()
            : const <String, dynamic>{};
        return PageResult(
          items: items,
          page: (m['page'] as num?)?.toInt() ?? page,
          pages: (m['pages'] as num?)?.toInt() ?? 1,
          total: (m['total'] as num?)?.toInt() ?? items.length,
        );
      });
}
