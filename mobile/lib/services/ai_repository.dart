import 'package:dio/dio.dart';
import '../core/network/api_exception.dart';
import '../models/ai_suggestion.dart';
import 'api_client.dart';
import 'photo_picker.dart';

/// Asks the server what a device is. The server reads the photo only if the AI service is switched on; otherwise it reads the words.
class AiRepository {
  AiRepository(this._api);

  final ApiClient _api;

  Future<AiSuggestion> classify({String title = '', String description = '', PickedPhoto? photo}) => guard(() async {
        final form = FormData();
        if (title.trim().isNotEmpty) form.fields.add(MapEntry('title', title.trim()));
        if (description.trim().isNotEmpty) form.fields.add(MapEntry('description', description.trim()));
        if (photo != null) {
          form.files.add(MapEntry('photo', await MultipartFile.fromFile(photo.path, filename: photo.name, contentType: DioMediaType.parse(photo.mime))));
        }
        final res = await _api.dio.post<dynamic>('/ai/classify', data: form);
        return AiSuggestion.fromJson(((res.data as Map)['data'] as Map).cast<String, dynamic>());
      });
}