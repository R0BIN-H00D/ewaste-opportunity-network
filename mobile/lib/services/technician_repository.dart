import 'package:dio/dio.dart';
import '../core/network/api_exception.dart';
import '../models/page_result.dart';
import '../models/technician.dart';
import 'api_client.dart';

/// What to ask `GET /api/technicians` for. Empty values are left out, because the server refuses parameters it does not know (422).
class TechnicianQuery {
  const TechnicianQuery({this.q = '', this.city = '', this.availableOnly = false, this.minRating = 0, this.sort = 'rating', this.page = 1, this.limit = 12});

  final String q;
  final String city;
  final bool availableOnly;

  /// 0 means any rating.
  final int minRating;
  final String sort;
  final int page;
  final int limit;

  int get activeFilters => [city.trim().isNotEmpty, availableOnly, minRating > 0].where((on) => on).length;

  TechnicianQuery copyWith({String? q, String? city, bool? availableOnly, int? minRating, String? sort, int? page}) => TechnicianQuery(
        q: q ?? this.q,
        city: city ?? this.city,
        availableOnly: availableOnly ?? this.availableOnly,
        minRating: minRating ?? this.minRating,
        sort: sort ?? this.sort,
        page: page ?? this.page,
        limit: limit,
      );

  Map<String, dynamic> toParams() => {
        'page': page,
        'limit': limit,
        'sort': sort,
        if (q.trim().isNotEmpty) 'q': q.trim(),
        if (city.trim().isNotEmpty) 'city': city.trim(),
        if (availableOnly) 'available': 'true',
        if (minRating > 0) 'minRating': minRating,
      };
}

/// The public directory of verified technicians.
class TechnicianRepository {
  TechnicianRepository(this._api);

  final ApiClient _api;
  Dio get _dio => _api.dio;

  Future<PageResult<Technician>> list(TechnicianQuery query) => guard(() async {
        final res = await _dio.get<dynamic>('/technicians', queryParameters: query.toParams());
        final body = (res.data as Map).cast<String, dynamic>();
        final items = [for (final raw in body['data'] as List) Technician.fromJson((raw as Map).cast<String, dynamic>())];
        final meta = body['meta'] is Map ? (body['meta'] as Map).cast<String, dynamic>() : const <String, dynamic>{};
        return PageResult(
          items: items,
          page: (meta['page'] as num?)?.toInt() ?? query.page,
          pages: (meta['pages'] as num?)?.toInt() ?? 1,
          total: (meta['total'] as num?)?.toInt() ?? items.length,
        );
      });

  Future<Technician> get(String id) => guard(() async {
        final res = await _dio.get<dynamic>('/technicians/$id');
        return Technician.fromJson(((res.data as Map)['data'] as Map).cast<String, dynamic>());
      });
}
