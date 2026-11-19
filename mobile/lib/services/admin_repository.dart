import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/network/api_exception.dart';
import '../providers/core_providers.dart';

typedef AdminRecord = Map<String, dynamic>;

AdminRecord adminRecord(Object? value) => value is Map ? Map<String, dynamic>.from(value) : const {};
List<AdminRecord> adminRecords(Object? value) =>
    value is List ? value.whereType<Map>().map(adminRecord).toList() : const [];

final adminRepositoryProvider = Provider<AdminRepository>((ref) => AdminRepository(ref.watch(apiClientProvider).dio));

class AdminPageData {
  const AdminPageData(this.items, this.meta);
  final List<AdminRecord> items;
  final AdminRecord meta;
}

class AdminFile {
  const AdminFile(this.bytes, this.mime, this.name, {this.rows, this.truncated = false});
  final Uint8List bytes;
  final String mime;
  final String name;
  final String? rows;
  final bool truncated;
}

class AdminRepository {
  AdminRepository(this._dio);
  final Dio _dio;

  Future<AdminRecord> record(String path, {AdminRecord query = const {}}) => guard(() async {
        final response = await _dio.get<dynamic>('/admin/$path', queryParameters: query);
        return adminRecord(adminRecord(response.data)['data']);
      });

  Future<AdminPageData> list(String path, {AdminRecord query = const {}, int page = 1}) => guard(() async {
        final response = await _dio.get<dynamic>('/admin/$path', queryParameters: {
          if (path != 'categories') ...{'page': page, 'limit': 15},
          ...query,
        });
        final body = adminRecord(response.data);
        return AdminPageData(adminRecords(body['data']), adminRecord(body['meta']));
      });

  Future<void> change(String method, String path, [AdminRecord? body]) => guard(() async {
        await _dio.request<dynamic>('/admin/$path', data: body, options: Options(method: method));
      });

  Future<AdminFile> verificationDocument(String viewUrl) {
    final match = RegExp(r'^/api/admin/verifications/documents/([a-fA-F0-9]{24})/file$').firstMatch(viewUrl);
    if (match == null) throw const ApiException('This document is unavailable.');
    return _file('verifications/documents/${match[1]}/file', const {}, 'document');
  }

  Future<AdminFile> export(String kind, AdminRecord filters) => _file('exports/$kind', filters, '$kind.csv');

  Future<AdminFile> _file(String path, AdminRecord query, String fallback) => guard(() async {
        final response = await _dio.get<List<int>>(
          '/admin/$path',
          queryParameters: query,
          options: Options(responseType: ResponseType.bytes),
        );
        final disposition = response.headers.value('content-disposition') ?? '';
        final name = RegExp(r'filename="?([^";]+)').firstMatch(disposition)?.group(1) ?? fallback;
        return AdminFile(
          Uint8List.fromList(response.data ?? const []),
          response.headers.value('content-type')?.split(';').first ?? 'application/octet-stream',
          name,
          rows: response.headers.value('x-export-rows'),
          truncated: response.headers.value('x-export-truncated') == 'true',
        );
      });
}
