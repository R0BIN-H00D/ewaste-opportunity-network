import 'package:dio/dio.dart';
import '../core/network/api_exception.dart';
import '../models/ai_result.dart';
import 'api_client.dart';
import 'photo_picker.dart';

/// Free AI help (Gemini on the server, plain rules when it is off) and the smart matches for a device.
/// Photos are sent only when the person presses the button.
class AiRepository {
  AiRepository(this._api);

  final ApiClient _api;
  Dio get _dio => _api.dio;

  /// Whether the server can read photos with AI. When it cannot, only the words are used.
  Future<bool> photoAiOn() => guard(() async {
        final res = await _dio.get<dynamic>('/ai/status');
        return (((res.data as Map)['data'] as Map)['photoAi']) == true;
      });

  Future<AiResult> analyzeDevice(List<PickedPhoto> photos, {String text = ''}) => guard(() async {
        final form = FormData();
        if (text.trim().isNotEmpty) form.fields.add(MapEntry('text', text.trim().length > 1000 ? text.trim().substring(0, 1000) : text.trim()));
        for (final photo in photos.take(2)) {
          form.files.add(MapEntry('photos', await MultipartFile.fromFile(photo.path, filename: photo.name, contentType: DioMediaType.parse(photo.mime))));
        }
        final res = await _dio.post<dynamic>('/ai/analyze-device', data: form, options: Options(receiveTimeout: const Duration(seconds: 60)));
        return AiResult.fromJson(((res.data as Map)['data'] as Map).cast<String, dynamic>());
      });

  /// Repair, reuse or recycle advice for one of my own listings.
  Future<AiResult> adviceFor(String listingId) => guard(() async {
        final res = await _dio.post<dynamic>('/ai/advice', data: {'listingId': listingId}, options: Options(receiveTimeout: const Duration(seconds: 60)));
        return AiResult.fromJson(((res.data as Map)['data'] as Map).cast<String, dynamic>());
      });

  /// `kind`: `technicians`, `refurbishers`, `recyclers` or `wanted`.
  Future<List<MatchItem>> matches(String listingId, String kind) => guard(() async {
        final res = kind == 'technicians'
            ? await _dio.get<dynamic>('/matching/recommendations', queryParameters: {'listingId': listingId})
            : await _dio.get<dynamic>('/matching/listing/$listingId/$kind');
        final data = (res.data as Map)['data'];
        return data is List ? [for (final e in data) if (e is Map) MatchItem.fromJson(e.cast<String, dynamic>())] : <MatchItem>[];
      });
}
