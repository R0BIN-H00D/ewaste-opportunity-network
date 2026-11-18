import '../core/network/api_exception.dart';
import '../models/wanted.dart';
import 'api_client.dart';

/// Wanted-device requests: what refurbishers are looking for, and who can help.
class WantedRepository {
  WantedRepository(this._api);

  final ApiClient _api;

  List<WantedRequest> _list(dynamic res) => [for (final j in ((res.data as Map)['data'] as List)) WantedRequest.fromJson((j as Map).cast<String, dynamic>())];

  /// Open requests from every refurbisher (for owners and technicians).
  Future<List<WantedRequest>> board() => guard(() async => _list(await _api.dio.get<dynamic>('/wanted-requests', queryParameters: {'as': 'board', 'limit': 50})));

  /// A refurbisher's own requests, open and closed.
  Future<List<WantedRequest>> mine() => guard(() async => _list(await _api.dio.get<dynamic>('/wanted-requests', queryParameters: {'as': 'mine', 'limit': 50})));

  Future<void> create({
    required String title,
    String? brand,
    String? minCondition,
    int quantity = 1,
    String? city,
    String? notes,
  }) =>
      guard(() async {
        String? clean(String? v) => (v ?? '').trim().isEmpty ? null : v!.trim();
        await _api.dio.post<dynamic>('/wanted-requests', data: {
          'title': title.trim(),
          'quantity': quantity,
          if (clean(brand) != null) 'brand': clean(brand),
          if (clean(minCondition) != null) 'minCondition': clean(minCondition),
          if (clean(city) != null) 'city': clean(city),
          if (clean(notes) != null) 'notes': clean(notes),
        });
      });

  Future<void> setStatus(String id, String status) => guard(() async {
        await _api.dio.put<dynamic>('/wanted-requests/$id/status', data: {'status': status});
      });

  Future<void> delete(String id) => guard(() async {
        await _api.dio.delete<dynamic>('/wanted-requests/$id');
      });

  /// An owner or technician says they can help. The refurbisher is told.
  Future<void> respond(String id, {String? message}) => guard(() async {
        final text = (message ?? '').trim();
        await _api.dio.post<dynamic>('/wanted-requests/$id/respond', data: {if (text.isNotEmpty) 'message': text});
      });

  /// Who accepted one of my requests.
  Future<List<WantedResponse>> responses(String id) => guard(() async {
        final res = await _api.dio.get<dynamic>('/wanted-requests/$id/responses');
        return [for (final j in ((res.data as Map)['data'] as List)) WantedResponse.fromJson((j as Map).cast<String, dynamic>())];
      });
}
