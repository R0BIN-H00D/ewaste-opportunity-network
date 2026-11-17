import 'package:dio/dio.dart';
import '../core/network/api_exception.dart';
import '../models/geo_place.dart';
import 'api_client.dart';

/// Address lookups through the server (which keeps to the free service's usage policy). Always optional: when it fails the
/// person types the area and city, which always works.
class GeoRepository {
  GeoRepository(this._api);

  final ApiClient _api;

  /// The area and city for a point, or `null` when nothing is known there.
  Future<GeoPlace?> reverse(double lat, double lng) => guard(() async {
        try {
          final res = await _api.dio.get<dynamic>('/geo/reverse', queryParameters: {'lat': lat.toStringAsFixed(5), 'lng': lng.toStringAsFixed(5)});
          return GeoPlace.fromJson(((res.data as Map)['data'] as Map).cast<String, dynamic>());
        } on DioException catch (e) {
          if (e.response?.statusCode == 404) return null;
          rethrow;
        }
      });

  /// Places that match a typed address (at most five), or an empty list. Needs at least three characters.
  Future<List<GeoPlace>> search(String query) => guard(() async {
        final q = query.trim();
        if (q.length < 3) return const <GeoPlace>[];
        final res = await _api.dio.get<dynamic>('/geo/search', queryParameters: {'q': q});
        final list = (res.data as Map)['data'] as List;
        return [for (final j in list) GeoPlace.fromJson((j as Map).cast<String, dynamic>())];
      });
}
