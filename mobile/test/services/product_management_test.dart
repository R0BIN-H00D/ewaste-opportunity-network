import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/services/api_client.dart';
import 'package:ewaste_opportunity/services/marketplace_repository.dart';
import 'package:ewaste_opportunity/services/photo_picker.dart';
import 'package:flutter_test/flutter_test.dart';
import '../models/marketplace_models_test.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter(this.handler);

  final Future<ResponseBody> Function(RequestOptions options) handler;
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) {
    requests.add(options);
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(int status, Object body) =>
    ResponseBody.fromString(jsonEncode(body), status, headers: {Headers.contentTypeHeader: [Headers.jsonContentType]});

({ApiClient client, _Adapter api}) _rig(Future<ResponseBody> Function(RequestOptions) handler) {
  final adapter = _Adapter(handler);
  final client = ApiClient(
    store: MemoryKeyValueStore(),
    dio: Dio(BaseOptions(baseUrl: 'http://test/api'))..httpClientAdapter = adapter,
    refreshDio: Dio(BaseOptions(baseUrl: 'http://test/api'))..httpClientAdapter = _Adapter((_) async => _json(500, {})),
  );
  return (client: client, api: adapter);
}



Map<String, String> _fields(RequestOptions o) => {for (final e in (o.data as FormData).fields) e.key: e.value};

void main() {
  test('my products ask for a status and read paging', () async {
    final rig = _rig((o) async => _json(200, {
          'success': true,
          'data': [productJson(isMine: true)],
          'meta': {'page': 1, 'pages': 2, 'total': 12},
        }));
    final page = await MarketplaceRepository(rig.client).mine(status: 'hidden');
    expect(page.items.single.isMine, isTrue);
    expect(page.pages, 2);
    expect(rig.api.requests.single.path, '/marketplace/mine');
    expect(rig.api.requests.single.queryParameters['status'], 'hidden');
  });

  test('listing a product sends a form with its fields and specs as JSON', () async {
    final rig = _rig((o) async => _json(201, {'success': true, 'data': productJson(id: 'p9', detail: true, isMine: true)}));
    final product = await MarketplaceRepository(rig.client).createProduct(const ProductInput(
      title: ' Refurbished ThinkPad ',
      category: 'laptops',
      brand: 'Lenovo',
      model: 'T480',
      specs: {'RAM': '8 GB'},
      condition: 'good',
      refurbishmentInfo: 'New battery fitted',
      price: 24999,
      stock: 2,
      jobId: 'j1',
    ));
    expect(product.id, 'p9');
    final sent = rig.api.requests.single;
    expect(sent.method, 'POST');
    expect(sent.path, '/marketplace');
    final f = _fields(sent);
    expect(f['title'], 'Refurbished ThinkPad');
    expect(f['category'], 'laptops');
    expect(f['specs'], '{"RAM":"8 GB"}');
    expect(f['price'], '24999.0');
    expect(f['stock'], '2');
    expect(f['jobId'], 'j1');
    expect(f.containsKey('status'), isFalse);
    expect(f.containsKey('removePhotoIds'), isFalse);
  });

  test('changing a product sends only what is set, and the photos to remove as a list', () async {
    final rig = _rig((o) async => _json(200, {'success': true, 'data': productJson(detail: true, isMine: true)}));
    await MarketplaceRepository(rig.client).updateProduct('p1', const ProductInput(price: 19999, status: 'hidden', removePhotoIds: ['a', 'b']));
    final sent = rig.api.requests.single;
    expect([sent.method, sent.path], ['PUT', '/marketplace/p1']);
    final f = _fields(sent);
    expect(f.keys.toSet(), {'price', 'status', 'removePhotoIds'});
    expect(f['removePhotoIds'], '["a","b"]');
  });

  test('removing a product and a refused removal', () async {
    var refuse = false;
    final rig = _rig((o) async => refuse ? _json(409, {'success': false, 'message': 'This product has open orders', 'code': 'HAS_OPEN_ORDERS'}) : _json(200, {'success': true, 'data': null}));
    final repo = MarketplaceRepository(rig.client);
    await repo.removeProduct('p1');
    expect([rig.api.requests.single.method, rig.api.requests.single.path], ['DELETE', '/marketplace/p1']);
    refuse = true;
    await expectLater(repo.removeProduct('p1'), throwsA(isA<ApiException>().having((e) => e.code, 'code', 'HAS_OPEN_ORDERS')));
  });

  test('PickedPhoto is the type the form sends', () {
    const photo = PickedPhoto(path: '/x.jpg', name: 'x.jpg', mime: 'image/jpeg', bytes: 10);
    expect(const ProductInput().photos, isEmpty);
    expect(const ProductInput(photos: [photo]).photos.single.name, 'x.jpg');
  });
}
