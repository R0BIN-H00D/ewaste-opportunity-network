import 'package:dio/dio.dart';
import '../core/network/api_exception.dart';
import '../models/listing.dart';
import '../models/listing_input.dart';
import 'photo_picker.dart';
import 'api_client.dart';

/// What to ask `GET /api/devices` for. Empty values are left out, because the server refuses parameters it does not know (422).
class ListingQuery {
  const ListingQuery({
    this.q = '',
    this.category = '',
    this.condition = '',
    this.service = '',
    this.city = '',
    this.sort = 'newest',
    this.status = '',
    this.mine = false,
    this.page = 1,
    this.limit = 12,
  });

  final String q;
  final String category;
  final String condition;
  final String service;
  final String city;
  final String sort;
  final String status;
  final bool mine;
  final int page;
  final int limit;

  /// How many filters are switched on (shown on the Filters button). Search text and sort order are not counted.
  int get activeFilters => [category, condition, city].where((v) => v.isNotEmpty).length;

  ListingQuery copyWith({
    String? q,
    String? category,
    String? condition,
    String? service,
    String? city,
    String? sort,
    String? status,
    int? page,
  }) =>
      ListingQuery(
        q: q ?? this.q,
        category: category ?? this.category,
        condition: condition ?? this.condition,
        service: service ?? this.service,
        city: city ?? this.city,
        sort: sort ?? this.sort,
        status: status ?? this.status,
        mine: mine,
        page: page ?? this.page,
        limit: limit,
      );

  Map<String, dynamic> toParams() => {
        'page': page,
        'limit': limit,
        'sort': sort,
        if (q.trim().isNotEmpty) 'q': q.trim(),
        if (category.isNotEmpty) 'category': category,
        if (condition.isNotEmpty) 'condition': condition,
        if (service.isNotEmpty) 'service': service,
        if (city.trim().isNotEmpty) 'city': city.trim(),
        if (mine) 'mine': 'true',
        if (mine && status.isNotEmpty) 'status': status,
      };
}

/// Device listings: browse, open, list my own and remove.
class DeviceRepository {
  DeviceRepository(this._api);

  final ApiClient _api;
  Dio get _dio => _api.dio;

  Future<ListingPage> list(ListingQuery query) => guard(() async {
        final res = await _dio.get<dynamic>('/devices', queryParameters: query.toParams());
        final body = (res.data as Map).cast<String, dynamic>();
        final items = [for (final raw in body['data'] as List) Listing.fromJson((raw as Map).cast<String, dynamic>())];
        final meta = body['meta'] is Map ? (body['meta'] as Map).cast<String, dynamic>() : const <String, dynamic>{};
        return ListingPage(
          items: items,
          page: (meta['page'] as num?)?.toInt() ?? query.page,
          pages: (meta['pages'] as num?)?.toInt() ?? 1,
          total: (meta['total'] as num?)?.toInt() ?? items.length,
        );
      });

  Future<Listing> get(String id) => guard(() async {
        final res = await _dio.get<dynamic>('/devices/$id');
        final data = ((res.data as Map)['data'] as Map).cast<String, dynamic>();
        return Listing.fromJson(data);
      });

  Future<List<Category>> categories() => guard(() async {
        final res = await _dio.get<dynamic>('/categories');
        final data = (res.data as Map)['data'] as List;
        return [for (final raw in data) Category.fromJson((raw as Map).cast<String, dynamic>())];
      });

  /// Lists a device. Photos go up in the same request as `photos` parts; [onProgress] gets 0.0 to 1.0 while they are sent.
  Future<Listing> create(ListingInput input, List<PickedPhoto> photos, {void Function(double progress)? onProgress}) => guard(() async {
        final form = FormData();
        input.toFields().forEach((key, value) => form.fields.add(MapEntry(key, value)));
        for (final photo in photos) {
          form.files.add(MapEntry(
            'photos',
            await MultipartFile.fromFile(photo.path, filename: photo.name, contentType: DioMediaType.parse(photo.mime)),
          ));
        }
        final res = await _dio.post<dynamic>(
          '/devices',
          data: form,
          onSendProgress: (sent, total) {
            if (total > 0) onProgress?.call(sent / total);
          },
        );
        final data = ((res.data as Map)['data'] as Map).cast<String, dynamic>();
        return Listing.fromJson(data);
      });

  /// Deletes a listing the person owns. The server refuses while it is part of a service (BR-03).
  Future<void> remove(String id) => guard(() async {
        await _dio.delete<dynamic>('/devices/$id');
      });
}
