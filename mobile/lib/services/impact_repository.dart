import 'package:dio/dio.dart';
import '../core/network/api_exception.dart';
import '../models/impact.dart';
import '../models/page_result.dart';
import 'api_client.dart';

/// The person's Green Score and impact, and the public rules behind them. Everything comes from recorded, verified
/// activity on the server; nothing here is worked out on the phone.
class ImpactRepository {
  ImpactRepository(this._api);

  final ApiClient _api;
  Dio get _dio => _api.dio;

  Map<String, dynamic> _data(Response<dynamic> res) => ((res.data as Map)['data'] as Map).cast<String, dynamic>();

  /// Score, level, badges, and one page of the history. [page] 1 carries everything; later pages matter only for `ledger`.
  Future<({GreenScore score, PageResult<LedgerEntry> ledger})> greenScore({int page = 1}) => guard(() async {
        final res = await _dio.get<dynamic>('/analytics/green-score', queryParameters: {'page': page, 'limit': 20});
        final score = GreenScore.fromJson(_data(res));
        final meta = (res.data as Map)['meta'];
        final m = meta is Map ? meta.cast<String, dynamic>() : const <String, dynamic>{};
        return (
          score: score,
          ledger: PageResult(
            items: score.ledger,
            page: (m['page'] as num?)?.toInt() ?? page,
            pages: (m['pages'] as num?)?.toInt() ?? 1,
            total: (m['total'] as num?)?.toInt() ?? score.ledger.length,
          ),
        );
      });

  Future<ImpactSummary> summary() => guard(() async => ImpactSummary.fromJson(_data(await _dio.get<dynamic>('/analytics/user-impact'))));

  /// The last [months] calendar months, oldest first, every month present.
  Future<List<MonthImpact>> monthly({int months = 12}) => guard(() async {
        final res = await _dio.get<dynamic>('/analytics/monthly', queryParameters: {'scope': 'me', 'months': months});
        final list = _data(res)['months'];
        return list is List ? [for (final m in list) if (m is Map) MonthImpact.fromJson(m.cast<String, dynamic>())] : const <MonthImpact>[];
      });

  Future<ScoringRules> rules() => guard(() async => ScoringRules.fromJson(_data(await _dio.get<dynamic>('/analytics/rules'))));
}
