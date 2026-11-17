import 'package:dio/dio.dart';
import '../core/network/api_exception.dart';
import '../models/article.dart';
import '../models/page_result.dart';
import 'api_client.dart';

/// The learning centre: published guides, read by anyone.
class ArticleRepository {
  ArticleRepository(this._api);

  final ApiClient _api;
  Dio get _dio => _api.dio;

  Future<PageResult<Article>> list({int page = 1}) => guard(() async {
        final res = await _dio.get<dynamic>('/education', queryParameters: {'page': page, 'limit': 20});
        final body = res.data as Map;
        final data = body['data'];
        final items = [for (final j in (data is List ? data : const [])) if (j is Map) Article.fromJson(j.cast<String, dynamic>())];
        final meta = body['meta'];
        final m = meta is Map ? meta.cast<String, dynamic>() : const <String, dynamic>{};
        return PageResult(items: items, page: (m['page'] as num?)?.toInt() ?? page, pages: (m['pages'] as num?)?.toInt() ?? 1, total: (m['total'] as num?)?.toInt() ?? items.length);
      });

  Future<Article> get(String slug) => guard(() async {
        final res = await _dio.get<dynamic>('/education/${Uri.encodeComponent(slug)}');
        return Article.fromJson(((res.data as Map)['data'] as Map).cast<String, dynamic>());
      });
}