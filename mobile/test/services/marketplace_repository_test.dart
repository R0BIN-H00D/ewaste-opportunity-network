import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/services/api_client.dart';
import 'package:ewaste_opportunity/services/marketplace_repository.dart';
import 'package:ewaste_opportunity/services/request_repository.dart';
import 'package:flutter_test/flutter_test.dart';
import '../models/marketplace_models_test.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter(this.handler);

  final Future<ResponseBody> Function(RequestOptions options) handler;
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(RequestOptions options,
      Stream<Uint8List>? requestStream, Future<void>? cancelFuture) {
    requests.add(options);
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(int status, Object body) =>
    ResponseBody.fromString(jsonEncode(body), status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType]
    });

({ApiClient client, _Adapter api}) _rig(
    Future<ResponseBody> Function(RequestOptions) handler) {
  final adapter = _Adapter(handler);
  final client = ApiClient(
    store: MemoryKeyValueStore(),
    dio: Dio(BaseOptions(baseUrl: 'http://test/api'))
      ..httpClientAdapter = adapter,
    refreshDio: Dio(BaseOptions(baseUrl: 'http://test/api'))
      ..httpClientAdapter = _Adapter((_) async => _json(500, {})),
  );
  return (client: client, api: adapter);
}

Future<ResponseBody> _order(RequestOptions o) async =>
    _json(200, {'success': true, 'data': orderJson(status: 'confirmed')});

void main() {
  group('products', () {
    test(
        'list reads products and paging, and sends only the filters that are set',
        () async {
      final rig = _rig((o) async => _json(200, {
            'success': true,
            'data': [
              productJson(),
              productJson(id: 'p2', title: 'Refurbished Pixel')
            ],
            'meta': {'page': 1, 'pages': 2, 'total': 14},
          }));
      final page = await MarketplaceRepository(rig.client).products(
          const ProductQuery(
              q: ' pixel ', condition: 'good', sort: 'price_asc'));

      expect(page.items.map((p) => p.title),
          ['Refurbished ThinkPad', 'Refurbished Pixel']);
      expect(page.pages, 2);
      expect(page.total, 14);
      final sent = rig.api.requests.single;
      expect(sent.path, '/marketplace');
      expect(sent.queryParameters['q'], 'pixel');
      expect(sent.queryParameters['condition'], 'good');
      expect(sent.queryParameters['sort'], 'price_asc');
      expect(sent.queryParameters.containsKey('category'), isFalse);
    });

    test('the query counts its filters', () {
      expect(const ProductQuery().activeFilters, 0);
      expect(
          const ProductQuery(category: 'laptops', condition: 'good')
              .activeFilters,
          2);
    });

    test('one product, then a question for its seller', () async {
      final rig = _rig((o) async => _json(200, {
            'success': true,
            'data':
                o.method == 'GET' ? productJson(detail: true) : {'sent': true}
          }));
      final repo = MarketplaceRepository(rig.client);
      final p = await repo.product('p1');
      await repo.enquire('p1', '  Is the battery new?  ');

      expect(rig.api.requests[0].path, '/marketplace/p1');
      expect(p.specs, isNotEmpty);
      expect(rig.api.requests[1].method, 'POST');
      expect(rig.api.requests[1].path, '/marketplace/p1/enquiries');
      expect(rig.api.requests[1].data, {'message': 'Is the battery new?'});
    });
  });

  group('orders', () {
    test(
        'placing an order sends the quantity and payment, and leaves out empty text',
        () async {
      final rig =
          _rig((o) async => _json(201, {'success': true, 'data': orderJson()}));
      final order = await MarketplaceRepository(rig.client).placeOrder(
          productId: 'p1',
          quantity: 2,
          paymentMethod: 'offline',
          deliveryArea: ' Indiranagar ',
          deliveryCity: 'Bengaluru',
          deliveryPincode: '560038',
          notes: '');

      expect(order.id, 'o1');
      final sent = rig.api.requests.single;
      expect(sent.method, 'POST');
      expect(sent.path, '/orders');
      expect(sent.data, {
        'productId': 'p1',
        'quantity': 2,
        'paymentMethod': 'offline',
        'deliveryArea': 'Indiranagar',
        'deliveryCity': 'Bengaluru',
        'deliveryPincode': '560038'
      });
    });

    test(
        'list asks for the status and role it is given, and reads the short form',
        () async {
      final rig = _rig((o) async => _json(200, {
            'success': true,
            'data': [orderJson(detail: false)],
            'meta': {'page': 2, 'pages': 3, 'total': 25},
          }));
      final page = await MarketplaceRepository(rig.client)
          .orders(as: 'seller', status: 'placed', page: 2);

      final q = rig.api.requests.single.queryParameters;
      expect(q['as'], 'seller');
      expect(q['status'], 'placed');
      expect(q['page'], 2);
      expect(page.items.single.quantity, 2);
      expect(page.pages, 3);
    });

    test('list leaves out an empty status and an unset role', () async {
      final rig =
          _rig((o) async => _json(200, {'success': true, 'data': <Object>[]}));
      await MarketplaceRepository(rig.client).orders(status: '');
      expect(rig.api.requests.single.queryParameters.containsKey('status'),
          isFalse);
      expect(
          rig.api.requests.single.queryParameters.containsKey('as'), isFalse);
    });

    test('each step is a PUT with the status the server expects', () async {
      final rig = _rig(_order);
      final repo = MarketplaceRepository(rig.client);
      await repo.confirm('o1');
      await repo.markReady('o1');
      await repo.markDelivered('o1');
      await repo.complete('o1');

      expect(
          rig.api.requests
              .every((o) => o.method == 'PUT' && o.path == '/orders/o1/status'),
          isTrue);
      expect(rig.api.requests.map((o) => (o.data as Map)['status']),
          ['confirmed', 'ready', 'delivered', 'completed']);
    });

    test('cancel sends the reason only when there is one', () async {
      final rig = _rig(_order);
      final repo = MarketplaceRepository(rig.client);
      await repo.cancel('o1', reason: ' Changed my mind ');
      await repo.cancel('o1');
      expect(rig.api.requests[0].path, '/orders/o1/cancel');
      expect(rig.api.requests[0].data, {'reason': 'Changed my mind'});
      expect(rig.api.requests[1].data, <String, dynamic>{});
    });

    test('a review is posted for the order, then the order is read again',
        () async {
      final rig = _rig((o) async => _json(200, {
            'success': true,
            'data': o.method == 'POST'
                ? {'_id': 'rv1'}
                : orderJson(status: 'completed', reviewed: true)
          }));
      final order = await MarketplaceRepository(rig.client)
          .review('o1', const ReviewInput(rating: 5, comment: ' Great '));

      expect(rig.api.requests[0].method, 'POST');
      expect(rig.api.requests[0].path, '/reviews');
      expect(rig.api.requests[0].data, {
        'contextType': 'order',
        'contextId': 'o1',
        'rating': 5,
        'comment': 'Great'
      });
      expect(rig.api.requests[1].path, '/orders/o1');
      expect(order.reviewed, isTrue);
    });

    test('a refusal becomes an ApiException with the server code', () async {
      final rig = _rig((o) async => _json(409, {
            'success': false,
            'message': 'Only 1 left in stock',
            'code': 'OUT_OF_STOCK'
          }));
      await expectLater(
        MarketplaceRepository(rig.client).placeOrder(
            productId: 'p1',
            quantity: 5,
            deliveryArea: 'Indiranagar',
            deliveryCity: 'Bengaluru',
            deliveryPincode: '560038'),
        throwsA(isA<ApiException>()
            .having((e) => e.code, 'code', 'OUT_OF_STOCK')
            .having((e) => e.failure, 'failure', ApiFailure.conflict)),
      );
    });
  });
}
