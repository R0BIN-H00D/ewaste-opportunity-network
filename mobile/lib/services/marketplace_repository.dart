import 'dart:convert';
import 'package:dio/dio.dart';
import '../core/network/api_exception.dart';
import '../models/marketplace.dart';
import '../models/page_result.dart';
import 'api_client.dart';
import 'photo_picker.dart';
import 'razorpay_checkout.dart' show PaymentProof, PaymentSession;
import 'request_repository.dart' show ReviewInput;

/// What to ask `GET /api/marketplace` for. Empty values are left out, because the server refuses parameters it does not know (422).
class ProductQuery {
  const ProductQuery(
      {this.q = '',
      this.category = '',
      this.condition = '',
      this.sort = 'newest',
      this.page = 1,
      this.limit = 12});

  final String q;

  /// A category slug, or empty for any.
  final String category;
  final String condition;
  final String sort;
  final int page;
  final int limit;

  int get activeFilters =>
      [category, condition].where((v) => v.isNotEmpty).length;

  ProductQuery copyWith(
          {String? q,
          String? category,
          String? condition,
          String? sort,
          int? page}) =>
      ProductQuery(
          q: q ?? this.q,
          category: category ?? this.category,
          condition: condition ?? this.condition,
          sort: sort ?? this.sort,
          page: page ?? this.page,
          limit: limit);

  Map<String, dynamic> toParams() => {
        'page': page,
        'limit': limit,
        'sort': sort,
        if (q.trim().isNotEmpty) 'q': q.trim(),
        if (category.isNotEmpty) 'category': category,
        if (condition.isNotEmpty) 'condition': condition,
      };
}

/// What a refurbisher sends to list or change a product. On an update only the fields that are set are sent.
class ProductInput {
  const ProductInput({
    this.title,
    this.category,
    this.brand,
    this.model,
    this.specs,
    this.condition,
    this.refurbishmentInfo,
    this.conditionDetails,
    this.conditionNote,
    this.price,
    this.stock,
    this.jobId,
    this.status,
    this.removePhotoIds = const [],
    this.photos = const [],
  });

  final String? title;

  /// A category id or slug.
  final String? category;
  final String? brand;
  final String? model;
  final Map<String, String>? specs;
  final String? condition;
  final String? refurbishmentInfo;

  /// How each part is doing. `null` sends nothing; an empty map on an update clears the old answers.
  final Map<String, String>? conditionDetails;

  /// The seller's own remarks. `null` sends nothing; an empty text on an update clears them.
  final String? conditionNote;
  final double? price;
  final int? stock;

  /// The refurbishment job this product was made from (create only).
  final String? jobId;

  /// `active` or `hidden` (update only).
  final String? status;
  final List<String> removePhotoIds;
  final List<PickedPhoto> photos;
}

/// The refurbished marketplace and the orders placed on it.
class MarketplaceRepository {
  MarketplaceRepository(this._api);

  final ApiClient _api;
  Dio get _dio => _api.dio;

  PageResult<T> _page<T>(
      Response<dynamic> res, T Function(Map<String, dynamic>) read, int page) {
    final body = (res.data as Map).cast<String, dynamic>();
    final items = [
      for (final raw in body['data'] as List)
        read((raw as Map).cast<String, dynamic>())
    ];
    final meta = body['meta'] is Map
        ? (body['meta'] as Map).cast<String, dynamic>()
        : const <String, dynamic>{};
    return PageResult(
      items: items,
      page: (meta['page'] as num?)?.toInt() ?? page,
      pages: (meta['pages'] as num?)?.toInt() ?? 1,
      total: (meta['total'] as num?)?.toInt() ?? items.length,
    );
  }

  Order _order(Response<dynamic> res) => Order.fromJson(
      ((res.data as Map)['data'] as Map).cast<String, dynamic>());

  /* ---------- products ---------- */

  Future<PageResult<Product>> products(ProductQuery query) => guard(() async {
        final res = await _dio.get<dynamic>('/marketplace',
            queryParameters: query.toParams());
        return _page(res, Product.fromJson, query.page);
      });

  Future<Product> product(String id) => guard(() async {
        final res = await _dio.get<dynamic>('/marketplace/$id');
        return Product.fromJson(
            ((res.data as Map)['data'] as Map).cast<String, dynamic>());
      });

  /// Sends the seller a question. They are notified; real-time chat arrives later.
  Future<void> enquire(String productId, String message) => guard(() async {
        await _dio.post<dynamic>('/marketplace/$productId/enquiries',
            data: {'message': message.trim()});
      });

  /* ---------- the seller's own products ---------- */

  Future<PageResult<Product>> mine({String? status, int page = 1}) =>
      guard(() async {
        final res =
            await _dio.get<dynamic>('/marketplace/mine', queryParameters: {
          'page': page,
          'limit': 10,
          if (status != null && status.isNotEmpty) 'status': status
        });
        return _page(res, Product.fromJson, page);
      });

  Future<FormData> _productForm(ProductInput input) async {
    final form = FormData();
    void field(String key, Object? value) {
      if (value == null) return;
      final text = '$value';
      // An empty brand or model is a real answer on an update (the person cleared it), so empty strings are sent.
      form.fields.add(MapEntry(key, text.trim()));
    }

    field('title', input.title);
    field('category', input.category);
    field('brand', input.brand);
    field('model', input.model);
    if (input.specs != null)
      form.fields.add(MapEntry('specs', jsonEncode(input.specs)));
    field('condition', input.condition);
    field('refurbishmentInfo', input.refurbishmentInfo);
    if (input.conditionDetails != null) {
      form.fields.add(MapEntry('conditionDetails', jsonEncode({for (final e in input.conditionDetails!.entries) if (e.value.isNotEmpty) e.key: e.value})));
    }
    field('conditionNote', input.conditionNote);
    field('price', input.price);
    field('stock', input.stock);
    field('jobId', input.jobId);
    field('status', input.status);
    if (input.removePhotoIds.isNotEmpty)
      form.fields
          .add(MapEntry('removePhotoIds', jsonEncode(input.removePhotoIds)));
    for (final photo in input.photos) {
      form.files.add(MapEntry(
          'photos',
          await MultipartFile.fromFile(photo.path,
              filename: photo.name,
              contentType: DioMediaType.parse(photo.mime))));
    }
    return form;
  }

  Future<Product> _product(Response<dynamic> res) async => Product.fromJson(
      ((res.data as Map)['data'] as Map).cast<String, dynamic>());

  /// Lists a refurbished product. With [ProductInput.jobId] it is made from a finished job and has a stock of 1.
  Future<Product> createProduct(ProductInput input) =>
      guard(() async => _product(await _dio.post<dynamic>('/marketplace',
          data: await _productForm(input))));

  Future<Product> updateProduct(String id, ProductInput input) =>
      guard(() async => _product(await _dio.put<dynamic>('/marketplace/$id',
          data: await _productForm(input))));

  /// Removes a product. Refused while it has open orders.
  Future<void> removeProduct(String id) => guard(() async {
        await _dio.delete<dynamic>('/marketplace/$id');
      });

  /* ---------- orders ---------- */

  /// Orders a product. Payment is cash on delivery or paid to the seller directly: the app never handles money (BR-10).
  Future<Order> placeOrder(
          {required String productId,
          int quantity = 1,
          String paymentMethod = 'cod',
          required String deliveryArea,
          required String deliveryCity,
          required String deliveryPincode,
          String? notes}) =>
      guard(() async {
        final note = notes?.trim() ?? '';
        final res = await _dio.post<dynamic>('/orders', data: {
          'productId': productId,
          'quantity': quantity,
          'paymentMethod': paymentMethod,
          'deliveryArea': deliveryArea.trim(),
          'deliveryCity': deliveryCity.trim(),
          'deliveryPincode': deliveryPincode.trim(),
          if (note.isNotEmpty) 'notes': note,
        });
        return _order(res);
      });

  /// The person's own orders, or the orders a seller received. [as] is `buyer` or `seller`; leave it out for the role's usual list.
  Future<PageResult<Order>> orders(
          {String? as, String? status, int page = 1}) =>
      guard(() async {
        final res = await _dio.get<dynamic>('/orders', queryParameters: {
          'page': page,
          'limit': 10,
          if (as != null) 'as': as,
          if (status != null && status.isNotEmpty) 'status': status,
        });
        return _page(res, Order.fromJson, page);
      });

  Future<Order> order(String id) =>
      guard(() async => _order(await _dio.get<dynamic>('/orders/$id')));

  /// Starts an online (Razorpay TEST mode) payment. The amount comes from the order on the server.
  Future<PaymentSession> startPayment(String id) => guard(() async {
        final res = await _dio.post<dynamic>('/orders/$id/payment');
        return PaymentSession.fromJson(((res.data as Map)['data'] as Map).cast<String, dynamic>());
      });

  /// Sends what the payment window returned; the server checks the signature before it marks the order paid.
  Future<Order> verifyPayment(String id, PaymentProof proof) => guard(() async =>
      _order(await _dio.post<dynamic>('/orders/$id/payment/verify', data: proof.toJson())));

  Future<Order> _status(String id, String status) => guard(() async => _order(
      await _dio.put<dynamic>('/orders/$id/status', data: {'status': status})));

  Future<Order> confirm(String id) => _status(id, 'confirmed');
  Future<Order> markReady(String id) => _status(id, 'ready');
  Future<Order> markDelivered(String id) => _status(id, 'delivered');

  /// The buyer confirms they received it. The seller's reuse is counted from here (BR-05).
  Future<Order> complete(String id) => _status(id, 'completed');

  Future<Order> cancel(String id, {String? reason}) => guard(() async {
        final text = reason?.trim() ?? '';
        return _order(await _dio.post<dynamic>('/orders/$id/cancel',
            data: {if (text.isNotEmpty) 'reason': text}));
      });

  /// Reviews the seller once the order is completed (one review per order, BR-04), then answers with the order again.
  Future<Order> review(String id, ReviewInput input) => guard(() async {
        await _dio.post<dynamic>('/reviews',
            data: {'contextType': 'order', 'contextId': id, ...input.toJson()});
        return _order(await _dio.get<dynamic>('/orders/$id'));
      });
}
