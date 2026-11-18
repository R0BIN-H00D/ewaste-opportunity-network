import 'package:dio/dio.dart';
import '../core/network/api_exception.dart';
import '../models/impact.dart';
import 'api_client.dart';

/// The person's impact. Everything comes from recorded, verified
/// activity on the server; nothing here is worked out on the phone.
class ImpactRepository {
  ImpactRepository(this._api);

  final ApiClient _api;
  Dio get _dio => _api.dio;

  Map<String, dynamic> _data(Response<dynamic> res) =>
      ((res.data as Map)['data'] as Map).cast<String, dynamic>();

  Future<ImpactSummary> summary() => guard(() async => ImpactSummary.fromJson(
      _data(await _dio.get<dynamic>('/analytics/user-impact'))));

  /// The last [months] calendar months, oldest first, every month present.
  Future<List<MonthImpact>> monthly({int months = 12}) => guard(() async {
        final res = await _dio.get<dynamic>('/analytics/monthly',
            queryParameters: {'scope': 'me', 'months': months});
        final list = _data(res)['months'];
        return list is List
            ? [
                for (final m in list)
                  if (m is Map) MonthImpact.fromJson(m.cast<String, dynamic>())
              ]
            : const <MonthImpact>[];
      });

  /// The last [years] calendar years, oldest first, every year present.
  Future<List<BreakdownRow>> yearly({int years = 5}) => guard(() async {
        final res = await _dio.get<dynamic>('/analytics/yearly',
            queryParameters: {'scope': 'me', 'years': years});
        final list = _data(res)['years'];
        return list is List
            ? [
                for (final y in list)
                  if (y is Map) BreakdownRow.year(y.cast<String, dynamic>())
              ]
            : const <BreakdownRow>[];
      });

  /// Which kinds of device the person's confirmed activity was about, most devices first.
  Future<List<BreakdownRow>> byCategory() => guard(() async {
        final res = await _dio.get<dynamic>('/analytics/by-category',
            queryParameters: {'scope': 'me'});
        final list = _data(res)['categories'];
        return list is List
            ? [
                for (final c in list)
                  if (c is Map) BreakdownRow.category(c.cast<String, dynamic>())
              ]
            : const <BreakdownRow>[];
      });
}
