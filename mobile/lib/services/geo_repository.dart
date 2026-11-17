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
}