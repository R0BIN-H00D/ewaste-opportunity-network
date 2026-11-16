import 'package:dio/dio.dart';
import '../core/network/api_exception.dart';
import '../models/verification.dart';
import 'api_client.dart';
import 'photo_picker.dart';

/// A provider's verification documents. Only provider accounts may use these; others get a 403.
class VerificationRepository {
  VerificationRepository(this._api);

  final ApiClient _api;
  Dio get _dio => _api.dio;

  Future<VerificationStatus> status() => guard(() async {
        final res = await _dio.get<dynamic>('/verification/status');
        return VerificationStatus.fromJson(((res.data as Map)['data'] as Map).cast<String, dynamic>());
      });

  /// Sends one kind of document as one or more photos. [onProgress] gets 0.0 to 1.0 while they upload.
  Future<void> submit(String docType, List<PickedPhoto> photos, {void Function(double progress)? onProgress}) => guard(() async {
        final form = FormData();
        form.fields.add(MapEntry('docType', docType));
        for (final photo in photos) {
          form.files.add(MapEntry(
            'documents',
            await MultipartFile.fromFile(photo.path, filename: photo.name, contentType: DioMediaType.parse(photo.mime)),
          ));
        }
        await _dio.post<dynamic>(
          '/verification/documents',
          data: form,
          onSendProgress: (sent, total) {
            if (total > 0) onProgress?.call(sent / total);
          },
        );
      });

  /// Removes a document that has not been approved.
  Future<void> remove(String id) => guard(() async {
        await _dio.delete<dynamic>('/verification/documents/$id');
      });
}
